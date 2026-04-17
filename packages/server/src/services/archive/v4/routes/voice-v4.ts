/**
 * v4 Voice Routes — Module C ("Voice Follow-up") for schemaVersion=4
 *
 * Parallel to v3's routes/voice.ts. The v3 `/api/voice/start` reads probe
 * questions from CheckpointResult[4], which v4 does not populate — so v4
 * needs its own start endpoint that sources Module C probing context from
 * the ExamInstance v4 Json fields instead.
 *
 * Shared infrastructure (safe to reuse across v3/v4):
 *   - voiceChatService          — Volcano RTC API client (schema-agnostic)
 *   - generateRtcToken          — RTC token binary packer (schema-agnostic)
 *   - POST /api/voice/token     — in voice.ts, schema-agnostic, reused as-is
 *   - POST /api/voice/stop      — in voice.ts, reads metadata, reused as-is
 *
 * What's v4-specific (this file):
 *   - POST /api/voice/v4/start  — builds Module C system prompt from
 *                                 ExamInstance.schemes / defectsInBest /
 *                                 failureScenario / harnessReference instead of
 *                                 from CP4 CheckpointResult probeQuestions
 *   - buildModuleCV4Prompt()    — v4 probing prompt builder
 *
 * Target Module C signals (see plan ch.3, C6):
 *   - sBoundaryAwareness   ← boundary_awareness_score from voice turn evaluator
 *   - sCommunicationClarity ← (sResponseStructure + sTechnicalVocabulary) / 2
 *   - sReflectionDepth     ← Round 5 sFollowUpImprovement
 *
 * NOTE: The candidate-specific submission data (actual scheme choice, defects
 * marked, MB1 prompts) is not yet available in Week 1 — MA/MB1/MB2 frontend
 * pages land Week 3. This prompt references the EXAM's ground-truth artifacts
 * and tells the AI interviewer to probe the candidate's reasoning. Once Week 3
 * ships, a follow-up edit should also inject behavior-event summaries here.
 */

import { Router } from 'express';
import { requireCandidate } from '../middleware/auth.js';
import { voiceChatService } from '../services/voice-chat.service.js';
import { gpsService } from '../services/gps.service.js';
import { initSilenceMeta } from './webhook.js';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { AppError, NotFoundError } from '../middleware/errorHandler.js';

export const voiceV4Router = Router();

/** Start v4 Module C voice agent. Only valid for schemaVersion=4 sessions. */
voiceV4Router.post('/start', requireCandidate, async (req, res, next) => {
  try {
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) {
      throw new AppError(400, 'sessionId required', 'BAD_REQUEST');
    }

    if (!voiceChatService.isAvailable()) {
      throw new AppError(
        503,
        'Voice chat not available (RTC credentials not configured)',
        'VOICE_UNAVAILABLE',
      );
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { candidate: true },
    });
    if (!session) throw new NotFoundError('Session not found');

    if (session.schemaVersion !== 4) {
      throw new AppError(
        400,
        `voice/v4/start requires schemaVersion=4 (got ${session.schemaVersion}). Use /api/voice/start for v3 sessions.`,
        'WRONG_SCHEMA',
      );
    }

    // v4 exam artifacts live on the ExamInstance tied to this session.
    // v4 ExamInstances may not have sessionId set (linked via metadata.v4.examInstanceId instead).
    const v4Meta = (session.metadata as Record<string, any>)?.v4 as Record<string, any> | undefined;
    const examInstanceId = v4Meta?.examInstanceId as string | undefined;
    const examInstance = examInstanceId
      ? await prisma.examInstance.findUnique({ where: { id: examInstanceId } })
      : await prisma.examInstance.findFirst({ where: { sessionId }, orderBy: { generatedAt: 'desc' } });
    if (!examInstance) {
      throw new NotFoundError('ExamInstance not found for v4 session — exam generation may not have completed');
    }

    const candidateName = session.candidate?.name || '候选人';
    const roomId = `interview_${sessionId}`;
    const taskId = `task_${sessionId}_mc_v4`;
    const targetUserId = `candidate_${session.candidateId}`;

    // GPS context: v4 Module C is ~10min (standard) or 15min (deep), so scale
    // the GPS window to match. 10min default keeps the GPS forcing cadence
    // compatible with the 5-round probing target.
    gpsService.initialize(sessionId, 10 * 60 * 1000);
    const gpsContext = gpsService.buildGpsContext(sessionId);

    // Strip hiddenMisdirection (anti-cheat honeypot) before feeding to LLM —
    // the misdirection text is only for poisoning external copy-paste, not for
    // our own models which would be confused by it.
    const cleanDefects = Array.isArray(examInstance.defectsInBest)
      ? (examInstance.defectsInBest as Array<Record<string, unknown>>).map(
          ({ hiddenMisdirection, ...rest }) => rest,
        )
      : examInstance.defectsInBest;

    const systemPrompt = buildModuleCV4Prompt({
      candidateName,
      schemes: examInstance.schemes,
      defectsInBest: cleanDefects,
      failureScenario: examInstance.failureScenario,
      harnessReference: examInstance.harnessReference,
      v4Requirement: examInstance.v4Requirement,
      gpsContext,
    });

    // Build Custom LLM URL for v4 signal-driven probing endpoint.
    // VERTC will POST to this URL with ASR transcriptions; our endpoint
    // analyzes signals in real-time and generates dynamic probing questions.
    // Derive base from CUSTOM_LLM_URL (e.g. http://localhost:4000/chat-stream → http://localhost:4000)
    // or fall back to production domain.
    const serverBase = env.CUSTOM_LLM_URL
      ? env.CUSTOM_LLM_URL.replace(/\/chat-stream.*$/, '')
      : 'https://codelens.recruitagent.cc';
    const v4CustomLlmUrl = `${serverBase}/api/v4/mc/voice-chat`;

    await voiceChatService.startVoiceChat({
      roomId,
      taskId,
      targetUserId,
      systemPrompt,
      welcomeMessage: `${candidateName}你好，我是你的 AI 面试官 Emma。今天我们进入最后的语音追问环节，我会针对你刚才在方案选型、AI 指挥和约束设计这几个模块里的表现，做大约 5 轮深入交流。不用紧张，像聊天一样就好——准备好了我们就开始。`,
      candidateName,
      // v4: use dedicated Custom LLM endpoint with signal-driven probing
      customLlmUrl: env.CP4_LLM_MODE === 'custom' ? v4CustomLlmUrl : undefined,
      customData: env.CP4_LLM_MODE === 'custom' ? {
        sessionId,
        currentRound: 1,
        candidateName,
      } : undefined,
      tools: env.CP4_LLM_MODE === 'ark'
        ? [
            {
              type: 'function',
              function: {
                name: 'check_interview_progress',
                description: '查询当前面试进度，用于决定是否进入下一轮',
                parameters: { type: 'object', properties: {}, required: [] },
              },
            },
          ]
        : undefined,
    });

    // Persist room/task ids so /api/voice/stop (shared with v3) can tear down cleanly.
    // Cast to Record<string, string> to match the v3 metadata shape Prisma expects.
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        metadata: {
          ...((session.metadata as object) || {}),
          voiceTaskId: taskId,
          voiceRoomId: roomId,
          voiceSchemaVersion: '4',
        } as Record<string, string>,
      },
    });

    initSilenceMeta(sessionId, taskId, roomId, candidateName);

    logger.info(
      `[voice-v4] Started Module C voice agent session=${sessionId} examInstance=${examInstance.id} mode=${env.CP4_LLM_MODE}`,
    );
    res.json({
      taskId,
      roomId,
      mode: env.CP4_LLM_MODE,
      started: true,
    });
  } catch (error) {
    next(error);
  }
});

// ─── Prompt builder ────────────────────────────────────────────────────────

interface ModuleCV4PromptInput {
  candidateName: string;
  schemes: unknown;           // ExamInstance.schemes (JSON)
  defectsInBest: unknown;     // ExamInstance.defectsInBest (JSON)
  failureScenario: unknown;   // ExamInstance.failureScenario (JSON)
  harnessReference: unknown;  // ExamInstance.harnessReference (JSON)
  v4Requirement: unknown;     // ExamInstance.v4Requirement (JSON)
  gpsContext: string;
}

/**
 * Build the Module C v4 system prompt. Focused on probing candidate
 * reasoning across the 3 target signals (sBoundaryAwareness,
 * sCommunicationClarity, sReflectionDepth) using the exam's ground-truth
 * artifacts as the reference corpus.
 *
 * Exported for unit testing.
 */
export function buildModuleCV4Prompt(input: ModuleCV4PromptInput): string {
  const parts: string[] = [];

  parts.push(
    `你是 Emma，CodeLens 的 AI 面试官。你正在对候选人"${input.candidateName}"进行语音追问环节（5 轮左右，约 10 分钟）。

## 你的身份
- 名字：Emma
- 角色：资深技术面试官
- 语气：专业但亲切，像一个有经验的技术 leader 在和候选人聊天
- 回答长度：每次回复控制在 2-4 句话，不要长篇大论（这是语音对话，不是文字）
- 禁止输出任何 markdown 格式（如 **粗体**、# 标题、- 列表）、代码块、特殊符号，只用纯文本口语

## 评估模式
候选人刚刚完成了以下模块（你已经有他们的提交数据，不要重复问他们已经回答过的内容）：
- Module A: 从 3 个 AI 方案中选"最优"，找缺陷并排序，诊断 AI 失败根因
- Module B1: 用自然语言指挥 AI 实现需求，审阅并选择性采纳 AI 改动
- Module B2: 写 RULES.md 让 AI 按约束自主完成任务
- 自评: 候选人对自己表现的评估

你的任务：基于候选人已经提交的内容做**深挖追问**，不要问他们已经回答过的问题。重点评估"判断力、沟通清晰度、反思深度"。

## 3 个目标信号（务必覆盖）
1. **边界意识 (sBoundaryAwareness)**：候选人是否清楚 AI 能做什么、不能做什么、什么时候不该信 AI
   - 追问模式："如果 AI 给你一个看似正确但实际有隐患的方案，你怎么识别？"
2. **沟通清晰度 (sCommunicationClarity)**：回答是否结构化、术语是否准确、例子是否具体
   - 评估维度：回答有没有 "场景 → 权衡 → 决策 → 验证" 的结构
3. **反思深度 (sReflectionDepth)**：候选人能不能从第 1 轮到第 5 轮逐步深入、修正自己的初始判断
   - 第 5 轮结束时，回头对比第 1 轮的回答，看是否有实质性改进`,
  );

  // Schemes — ground truth for probing MA reasoning
  const schemes = asObject(input.schemes);
  if (schemes) {
    parts.push(`\n## Module A 方案对比（参考事实，用于追问候选人为什么选 X）`);
    for (const key of ['A', 'B', 'C']) {
      const s = asObject(schemes[key]);
      if (!s) continue;
      const name = asString(s.name) || key;
      const archetype = asString(s.archetype) || '';
      const pros = asStringArray(s.pros);
      const cons = asStringArray(s.cons);
      parts.push(
        `- 方案 ${key} (${name}) [${archetype}]\n  优点: ${pros.join('; ') || '(无)'}\n  缺点: ${cons.join('; ') || '(无)'}`,
      );
    }
    const bestId = asString(schemes.bestSchemeId);
    if (bestId) {
      parts.push(`**正确答案**：方案 ${bestId} 是最优方案（不要直接告诉候选人）`);
    }
  }

  // Defects — ground truth for probing MA defect-detection reasoning
  const defects = asArray(input.defectsInBest);
  if (defects && defects.length > 0) {
    parts.push(`\n## Module A 植入的缺陷（参考事实）`);
    for (const d of defects) {
      const dObj = asObject(d);
      if (!dObj) continue;
      const title = asString(dObj.title) || '(无标题)';
      const severity = asString(dObj.severity) || '?';
      const category = asString(dObj.category) || '?';
      parts.push(`- [${severity}/${category}] ${title}`);
    }
    parts.push(
      `追问方向：如果候选人找到了所有缺陷，追问他如何确认缺陷严重性排序；如果漏了，追问他漏掉的那个是不是"AI 盲区"（候选人没看懂 AI 生成的那部分代码）。`,
    );
  }

  // Failure scenario — MB1 / Round 3 context
  const failure = asObject(input.failureScenario);
  if (failure) {
    const prompt = asString(failure.initialPrompt);
    const symptom = asString(failure.failureSymptom);
    const cause = asString(failure.expectedRootCause);
    if (prompt || symptom || cause) {
      parts.push(`\n## Module A Round 3: AI 失败场景（参考事实）`);
      if (prompt) parts.push(`初始 Prompt: ${truncate(prompt, 300)}`);
      if (symptom) parts.push(`失败现象: ${truncate(symptom, 300)}`);
      if (cause) parts.push(`真实根因: ${truncate(cause, 300)}`);
      parts.push(
        `追问方向：问候选人"你当时判断根因是什么？你给 AI 的上下文里包含了什么关键信息？"`,
      );
    }
  }

  // Harness — MB2 reference (only if defined)
  const harness = asObject(input.harnessReference);
  if (harness) {
    const cats = asStringArray(harness.constraintCategories);
    const keys = asStringArray(harness.keyConstraints);
    if (cats.length > 0 || keys.length > 0) {
      parts.push(`\n## Module B2 Harness 参考约束`);
      if (cats.length > 0) parts.push(`约束类别: ${cats.join(', ')}`);
      if (keys.length > 0) parts.push(`关键约束: ${keys.slice(0, 5).join('; ')}`);
      parts.push(
        `追问方向：候选人写的 RULES.md 里，哪些约束是"抽象防御"（如'避免魔法数字'），哪些是"针对本题的硬边界"（如'batch 必须持锁'）？他是否意识到两者的区别？`,
      );
    }
  }

  // Requirement — v4Requirement for MB1 context
  const req = asObject(input.v4Requirement);
  if (req) {
    const title = asString(req.title);
    const desc = asString(req.description);
    if (title || desc) {
      parts.push(`\n## Module B1 需求（参考）`);
      if (title) parts.push(`标题: ${title}`);
      if (desc) parts.push(`描述: ${truncate(desc, 400)}`);
    }
  }

  // Structured probing strategy
  parts.push(`\n## 5 轮追问策略（依次执行）
第 1 轮：开放问题，让候选人自述 Module A 的选型理由。但不要直接问"你为什么选了方案 X"——候选人在前面的模块里已经写过理由了。换一个角度追问，比如"你在做选型的时候，最让你纠结的一个点是什么？"
第 2 轮：针对第 1 轮回答中最薄弱的地方追问一个具体例子。评估他能不能把抽象判断落到具体场景。
第 3 轮：切换到 MB1 话题，问"如果 AI 给你的实现看起来正确但里面藏了一个不明显的 bug，你一般怎么最先发现？"评估边界意识。
第 4 轮：跨领域探测。从题目的主要技术栈之外挑一个领域（例如分布式一致性、性能调优、安全审计、可观测性），让候选人展示他面对不熟悉领域时怎么拆解问题和提出假设。评分重点是推理路径，不是答案正确性。
第 5 轮：回到第 1 轮的回答，问"如果现在让你重新选方案，你会改变决策吗？为什么？"评估反思深度。

## 重要规则
- 这是语音对话，每次只问一个问题，等候选人答完再追问
- 每次回复 2-4 句话，不要长篇大论
- 不要输出任何特殊格式（markdown、代码块、列表符号），只用口语化的纯文本
- 候选人回答很短时，追问"能展开说说吗"一次；仍然短就自然过渡到下一轮
- 不要透露正确答案是哪个方案，不要透露完整缺陷列表
- 不要重复候选人在前面模块里已经回答过的问题——你的目标是深挖新信息
- 当 GPS 提示 FORCE_MOVE 时，礼貌切换话题
- 当 GPS 提示 WRAP_UP 时，说"好的，我们时间差不多了，感谢你今天的回答，辛苦了"并结束`);

  parts.push(`\n${input.gpsContext}`);

  return parts.join('\n');
}

// ─── JSON helpers (defensive — exam fields are Json? and could be malformed) ───

function asObject(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function asArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
