/**
 * V5 mc-voice-chat.ts — VERTC Custom LLM endpoint for Module C (Emma).
 *
 * Receives VERTC-forwarded ASR transcriptions, builds a fresh signal snapshot
 * + probe decision per turn, and streams Emma's reply back as SSE. After
 * round 5 completes the signal catalog's sBeliefUpdateMagnitude (Round 3
 * Part 3 调整 3) is computed and persisted to session.metadata.signalResults
 * so downstream scoring can pick it up without another pass.
 *
 * Protocol: VERTC Custom LLM standard (OpenAI-compatible SSE).
 *
 * Differences from V4 (archive/v4/routes/mc-voice-chat.ts):
 *   - V5Submissions live at `session.metadata` directly (no `metadata.v4`
 *     wrapper). Round answers are pushed to `metadata.moduleC` as
 *     V5ModuleCAnswer shape.
 *   - `buildSignalSnapshot` is async in V5 and reads only
 *     `metadata.signalResults` (no raw-submission heuristics).
 *   - `analyzeSignalsForProbing` is async in V5 and takes (sessionId, snapshot,
 *     round, previousProbes); it fetches strategy templates from PromptRegistry
 *     and appends to promptGuidance before returning.
 *   - gps.service / turn-evaluator.service are V4-only and not ported to V5:
 *     dimension-coverage cadence is now handled by probe strategy templates,
 *     and turn-level signal writeback is out of scope for Task 11 (reserved
 *     for Task 13 when Module C signals other than sBeliefUpdateMagnitude land).
 *   - Socket / EventBus event topics use `v5:modulec:*` prefix.
 */

import crypto from 'crypto';
import { Router, type Response as ExpressResponse } from 'express';
import OpenAI from 'openai';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import {
  analyzeSignalsForProbing,
  buildSignalSnapshot,
  type ProbeDecision,
} from '../services/mc-probe-engine.js';
import { eventBus } from '../services/event-bus.service.js';
import {
  GPS_META_INSTRUCTION,
  CANDIDATE_QA_BOUNDARY,
} from '../services/voice-chat.service.js';
import { computeBeliefUpdateMagnitude } from '../signals/mc/s-belief-update-magnitude.js';
import type { SignalInput, SuiteId, V5MBEditorBehavior, V5Submissions } from '@codelens-v5/shared';
import type { Prisma } from '@prisma/client';

export const mcVoiceChatRouter = Router();

// ─── LLM clients: Ark primary, DashScope fallback ────────────────────────
//
// Ark is preferred for MC voice because (1) same VPC as VERTC → 30-80 ms
// lower RTT and (2) ~48 ms first-token latency vs Qwen3-Coder-Plus ~1-2 s.
// <think>…</think> reasoning tags are stripped in-stream below regardless
// of provider, so DashScope fallback produces TTS-safe output too.
const arkClient = env.ARK_API_KEY
  ? new OpenAI({ apiKey: env.ARK_API_KEY, baseURL: env.ARK_BASE_URL })
  : null;
const dashscopeClient = env.DASHSCOPE_API_KEY
  ? new OpenAI({ apiKey: env.DASHSCOPE_API_KEY, baseURL: env.DASHSCOPE_BASE_URL })
  : null;

const llmClient = arkClient || dashscopeClient;
const VOICE_MODEL = arkClient
  ? env.ARK_MODEL_LITE || env.ARK_MODEL_PRO || ''
  : env.DASHSCOPE_MODEL || 'qwen3-coder-plus';
const LLM_PROVIDER = arkClient ? 'ark' : dashscopeClient ? 'dashscope' : 'none';

// Per-session transient state — VERTC does not track this for us. Cleared
// on process restart; the lifetime of a Module C session (≈10 min) is well
// under the typical server uptime.
const sessionRoundMap = new Map<string, number>();
const pendingEmmaQuestion = new Map<string, string>();
const sessionLastInvocation = new Map<string, number>();

// Echo gate: drop candidate turns that look like VERTC ASR re-capturing
// Emma's TTS playback (same heuristics as V4 — conservative on purpose).
const ECHO_GAP_MS = 3000;
const ECHO_MAX_LEN = 50;
const ECHO_SUBSTR_LEN = 4;

function isLikelyEcho(candidate: string, lastEmma: string, gapMs: number): boolean {
  const c = candidate.trim();
  if (c.length === 0) return true;
  if (gapMs >= ECHO_GAP_MS) return false;
  if (c.length >= ECHO_MAX_LEN) return false;
  if (!lastEmma) return false;
  for (let i = 0; i + ECHO_SUBSTR_LEN <= c.length; i++) {
    if (lastEmma.includes(c.slice(i, i + ECHO_SUBSTR_LEN))) return true;
  }
  return false;
}

// ─── Authentication ──────────────────────────────────────────────────────

function authenticateRequest(authHeader?: string): boolean {
  if (!authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const expected = env.RTC_CALLBACK_SECRET || env.JWT_SECRET;
  return token === expected;
}

// ─── Main endpoint ───────────────────────────────────────────────────────

mcVoiceChatRouter.post('/voice-chat', async (req, res) => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    if (!authenticateRequest(req.headers.authorization)) {
      logger.warn('[mc-voice-chat-v5] Unauthorized request');
      res.status(401).json({ Error: { Code: 'AuthenticationError', Message: 'Invalid API key' } });
      return;
    }

    const { messages, custom, temperature, max_tokens } = req.body as {
      messages?: Array<{ role: string; content: string }>;
      custom?: string;
      model?: string;
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
    };

    // sessionId comes from the custom blob set at voice /start time; fall back
    // to query param, then to the most recently updated schemaVersion=5
    // IN_PROGRESS session so a reconnect without customData still works.
    let sessionId: string | null = null;
    try {
      const customData = JSON.parse(custom || '{}') as Record<string, unknown>;
      sessionId = typeof customData.sessionId === 'string' ? customData.sessionId : null;
    } catch {
      sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : null;
    }
    if (!sessionId) {
      const active = await prisma.session.findFirst({
        where: { status: 'IN_PROGRESS', schemaVersion: 5 },
        orderBy: { updatedAt: 'desc' },
      });
      sessionId = active?.id || null;
    }

    if (!sessionId) {
      logger.error('[mc-voice-chat-v5] No sessionId found');
      sendErrorSSE(res, requestId, '无法识别评估会话，请重新连接。');
      return;
    }

    const userMessages = (messages || []).filter((m) => m.role === 'user');
    const candidateAnswer = userMessages[userMessages.length - 1]?.content || '';

    // Echo gate: drop suspected echoes BEFORE incrementing the round counter
    // so a false trigger doesn't burn a probe slot.
    {
      const now = Date.now();
      const lastTs = sessionLastInvocation.get(sessionId) || 0;
      const gapMs = lastTs > 0 ? now - lastTs : Number.POSITIVE_INFINITY;
      const lastEmma = pendingEmmaQuestion.get(sessionId) || '';
      if (isLikelyEcho(candidateAnswer, lastEmma, gapMs)) {
        logger.warn(
          `[mc-voice-chat-v5] DROP suspected echo: session=${sessionId} gap=${gapMs}ms ` +
            `userLen=${candidateAnswer.trim().length} ` +
            `userMsg="${candidateAnswer.trim().slice(0, 60)}" ` +
            `lastEmma="${lastEmma.slice(0, 60)}"`,
        );
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        writeSSEStop(res, requestId);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      sessionLastInvocation.set(sessionId, now);
    }

    const currentRound = (sessionRoundMap.get(sessionId) || 0) + 1;
    sessionRoundMap.set(sessionId, currentRound);

    logger.info(
      `[mc-voice-chat-v5] session=${sessionId} round=${currentRound} ` +
        `userMsg=${candidateAnswer.length}chars messages=${(messages || []).length}`,
    );

    // Non-blocking: persist this round's candidate answer paired with the
    // previous Emma question (VERTC Custom LLM does not route our SSE output
    // through any subtitle callback, so we pair them ourselves).
    const prevEmmaQuestion = pendingEmmaQuestion.get(sessionId) || '';

    // 1. Signal snapshot (reads session.metadata.signalResults only).
    const snapshot = await buildSignalSnapshot(sessionId);

    // 2. Previously-executed probes for dedup.
    const probeHistory = await loadProbeHistory(sessionId);

    // 3. Probe decision (async — fetches strategy template from PromptRegistry).
    const probeDecision = await analyzeSignalsForProbing(
      sessionId,
      snapshot,
      currentRound,
      probeHistory,
    );

    logger.info(
      `[mc-voice-chat-v5] probe: round=${currentRound} type=${probeDecision.probeType} ` +
        `dim=${probeDecision.targetDimension} reason=${probeDecision.reason}`,
    );

    saveRoundAnswer(sessionId, currentRound, candidateAnswer, prevEmmaQuestion, probeDecision.strategyKey).catch(
      () => {},
    );
    saveProbeDecision(sessionId, probeDecision).catch(() => {});

    // 4. Dynamic system prompt from live V5Submissions.
    const sessionContext = await getSessionContext(sessionId);
    const systemPrompt = buildDynamicSystemPrompt(probeDecision, currentRound, sessionContext);

    const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...(messages || [])
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ];

    // 5. SSE response.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullResponse = '';

    if (llmClient) {
      const completion = await llmClient.chat.completions.create({
        model: VOICE_MODEL,
        messages: llmMessages,
        temperature: temperature ?? 0.35,
        max_tokens: max_tokens ?? 400,
        stream: true,
      });

      // Strip <think>...</think> blocks in-stream.
      let insideThink = false;
      let buffer = '';
      let firstChunk = true;

      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content;
        if (!delta) continue;

        buffer += delta;
        while (buffer.length > 0) {
          if (insideThink) {
            const closeIdx = buffer.indexOf('</think>');
            if (closeIdx === -1) {
              buffer = '';
              break;
            }
            buffer = buffer.slice(closeIdx + 8);
            insideThink = false;
          } else {
            const openIdx = buffer.indexOf('<think>');
            if (openIdx === -1) {
              const clean = buffer;
              buffer = '';
              if (clean) {
                writeSSEChunk(res, requestId, clean, firstChunk);
                fullResponse += clean;
                firstChunk = false;
              }
            } else if (openIdx > 0) {
              const before = buffer.slice(0, openIdx);
              buffer = buffer.slice(openIdx);
              writeSSEChunk(res, requestId, before, firstChunk);
              fullResponse += before;
              firstChunk = false;
            } else {
              buffer = buffer.slice(7);
              insideThink = true;
            }
          }
        }
      }
    } else {
      const fallback = getFallbackResponse(currentRound);
      writeSSEChunk(res, requestId, fallback, true);
      fullResponse = fallback;
    }

    writeSSEStop(res, requestId);
    res.write('data: [DONE]\n\n');
    res.end();

    const latency = Date.now() - startTime;
    logger.info(
      `[mc-voice-chat-v5] Done in ${latency}ms, ${fullResponse.length} chars, ` +
        `provider=${LLM_PROVIDER} model=${VOICE_MODEL}`,
    );

    if (fullResponse) pendingEmmaQuestion.set(sessionId, fullResponse);

    // Emit v5:modulec:probe_decision. Non-blocking (swallow emit failures).
    eventBus
      .emit(sessionId, 'AI', 'v5:modulec:probe_decision', {
        round: currentRound,
        probeType: probeDecision.probeType,
        strategyKey: probeDecision.strategyKey,
        targetDimension: probeDecision.targetDimension,
        reason: probeDecision.reason,
        latencyMs: latency,
      })
      .catch(() => {});

    // After round 5 completes, compute & persist sBeliefUpdateMagnitude so
    // downstream scoring doesn't need a second pass. Non-blocking — if
    // compute throws we still return a clean SSE response to VERTC.
    if (currentRound >= 5) {
      persistBeliefUpdateSignal(sessionId).catch((err) => {
        logger.warn('[mc-voice-chat-v5] persistBeliefUpdateSignal failed:', err);
      });
    }
  } catch (error) {
    logger.error('[mc-voice-chat-v5] Error:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
    }
    sendErrorSSE(res, requestId, '请再说一遍，我没有完全听清。');
  }
});

// ─── SSE helpers (identical shape to V4; VERTC parses this verbatim) ─────

function writeSSEChunk(
  res: ExpressResponse,
  id: string,
  content: string,
  isFirst: boolean,
): void {
  const data = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'codelens-interviewer',
    choices: [
      {
        index: 0,
        delta: { ...(isFirst ? { role: 'assistant' } : {}), content },
        finish_reason: null,
      },
    ],
  };
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeSSEStop(res: ExpressResponse, id: string): void {
  const data = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'codelens-interviewer',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sendErrorSSE(res: ExpressResponse, id: string, message: string): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  writeSSEChunk(res, id, message, true);
  writeSSEStop(res, id);
  res.write('data: [DONE]\n\n');
  res.end();
}

function getFallbackResponse(round: number): string {
  const prompts = [
    '你在做方案选型时，有没有某个点让你特别犹豫？',
    '能具体说一个例子吗？',
    '那如果 AI 给你一个看似正确但实际有问题的方案，你一般怎么识别？',
    '如果让你给自己今天的表现打分，你觉得哪里做得最好？',
    '回头看你最开始的判断，现在有什么想修正的吗？',
  ];
  return prompts[Math.min(round - 1, prompts.length - 1)];
}

// ─── V5 persistence helpers ──────────────────────────────────────────────

interface V5ProbeHistoryRecord {
  round: number;
  targetDimension: string;
  probeType: string;
  strategyKey: string;
  reason: string;
  savedAt: string;
}

async function saveRoundAnswer(
  sessionId: string,
  round: number,
  answer: string,
  emmaQuestion: string,
  strategyKey: string,
): Promise<void> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });
    if (!session) return;

    const meta = (session.metadata || {}) as Record<string, unknown>;
    const existing = Array.isArray(meta.moduleC)
      ? (meta.moduleC as Array<Record<string, unknown>>)
      : [];

    const filtered = existing.filter((r) => r.round !== round);
    filtered.push({
      round,
      question: emmaQuestion,
      answer,
      probeStrategy: strategyKey,
    });

    await prisma.session.update({
      where: { id: sessionId },
      data: { metadata: { ...meta, moduleC: filtered } as unknown as Prisma.InputJsonValue },
    });
  } catch (err) {
    logger.warn('[mc-voice-chat-v5] Failed to save round answer:', err);
  }
}

async function loadProbeHistory(sessionId: string): Promise<ProbeDecision[]> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });
    if (!session) return [];
    const meta = (session.metadata || {}) as Record<string, unknown>;
    const raw = meta.v5McProbeHistory;
    if (!Array.isArray(raw)) return [];
    return raw.map((h) => {
      const r = h as Record<string, unknown>;
      return {
        round: typeof r.round === 'number' ? r.round : 0,
        targetDimension: typeof r.targetDimension === 'string' ? r.targetDimension : '',
        probeType: (typeof r.probeType === 'string' ? r.probeType : 'weakness') as ProbeDecision['probeType'],
        strategyKey: (typeof r.strategyKey === 'string' ? r.strategyKey : 'weakness') as ProbeDecision['strategyKey'],
        reason: typeof r.reason === 'string' ? r.reason : '',
        promptGuidance: '',
      };
    });
  } catch (err) {
    logger.warn('[mc-voice-chat-v5] Failed to load probe history:', err);
    return [];
  }
}

async function saveProbeDecision(sessionId: string, probe: ProbeDecision): Promise<void> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });
    if (!session) return;

    const meta = (session.metadata || {}) as Record<string, unknown>;
    const history = Array.isArray(meta.v5McProbeHistory)
      ? (meta.v5McProbeHistory as V5ProbeHistoryRecord[])
      : [];

    history.push({
      round: probe.round,
      targetDimension: probe.targetDimension,
      probeType: probe.probeType,
      strategyKey: probe.strategyKey,
      reason: probe.reason,
      savedAt: new Date().toISOString(),
    });

    await prisma.session.update({
      where: { id: sessionId },
      data: { metadata: { ...meta, v5McProbeHistory: history } as unknown as Prisma.InputJsonValue },
    });
  } catch (err) {
    logger.warn('[mc-voice-chat-v5] Failed to save probe decision:', err);
  }
}

/**
 * Build the V5 session context string. Each candidate artifact is truncated
 * to 200 chars because this gets pasted into every Emma system prompt and
 * VERTC streams are latency-sensitive.
 *
 * Unlike V4's exam-artifact-centric context (schemes / defects / failure
 * scenario), V5 reads only the CANDIDATE's own submissions. Rationale: the
 * live probe strategies cite "what the candidate said" for challenge /
 * contradiction prompts, and exam artifacts are already baked into the
 * signal snapshot via sSchemeJudgment / sDiagnosisAccuracy / sPromptQuality.
 */
export async function getSessionContext(sessionId: string): Promise<string> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });
    if (!session?.metadata) return '';

    const subs = session.metadata as V5Submissions & Record<string, unknown>;
    const parts: string[] = [];

    if (subs.moduleA) {
      parts.push(`【Module A】`);
      const r1 = subs.moduleA.round1;
      if (r1) {
        parts.push(`R1 方案: ${r1.schemeId}`);
        if (r1.reasoning) parts.push(`R1 理由原文: "${truncate(r1.reasoning, 200)}"`);
        if (r1.structuredForm) {
          const sf = r1.structuredForm;
          if (sf.scenario) parts.push(`R1 场景: "${truncate(sf.scenario, 200)}"`);
          if (sf.tradeoff) parts.push(`R1 权衡: "${truncate(sf.tradeoff, 200)}"`);
          if (sf.decision) parts.push(`R1 决策: "${truncate(sf.decision, 200)}"`);
          if (sf.verification) parts.push(`R1 验证: "${truncate(sf.verification, 200)}"`);
        }
        if (r1.challengeResponse)
          parts.push(`R1 对抗回应: "${truncate(r1.challengeResponse, 200)}"`);
      }
      const r2 = subs.moduleA.round2;
      if (r2?.markedDefects?.length) {
        const ids = r2.markedDefects.map((d) => d.defectId).join(', ');
        parts.push(`R2 标记缺陷: [${ids}]`);
        const firstComment = r2.markedDefects[0]?.comment;
        if (firstComment) parts.push(`R2 首条评论: "${truncate(firstComment, 200)}"`);
      }
      const r3 = subs.moduleA.round3;
      if (r3) {
        if (r3.correctVersionChoice) parts.push(`R3 正确版本: ${r3.correctVersionChoice}`);
        if (r3.diffAnalysis) parts.push(`R3 Diff 分析: "${truncate(r3.diffAnalysis, 200)}"`);
        if (r3.diagnosisText) parts.push(`R3 诊断原文: "${truncate(r3.diagnosisText, 200)}"`);
      }
      const r4 = subs.moduleA.round4;
      if (r4?.response) {
        parts.push(`R4 迁移验证: "${truncate(r4.response, 200)}"`);
      }
    }

    if (subs.mb) {
      parts.push(`【Module B】`);
      if (subs.mb.planning) {
        const p = subs.mb.planning;
        if (p.decomposition) parts.push(`MB 拆解: "${truncate(p.decomposition, 200)}"`);
        if (p.dependencies) parts.push(`MB 依赖: "${truncate(p.dependencies, 200)}"`);
        if (p.fallbackStrategy) parts.push(`MB Fallback: "${truncate(p.fallbackStrategy, 200)}"`);
      }
      if (typeof subs.mb.finalTestPassRate === 'number') {
        parts.push(`MB 测试通过率: ${Math.round(subs.mb.finalTestPassRate * 100)}%`);
      }
      const behaviorSummary = summarizeEditorBehavior(subs.mb.editorBehavior ?? null);
      if (behaviorSummary) parts.push(`MB 行为摘要: ${behaviorSummary}`);
      if (subs.mb.standards?.rulesContent) {
        parts.push(`MB RULES.md: "${truncate(subs.mb.standards.rulesContent, 200)}"`);
      }
    }

    if (subs.moduleD) {
      parts.push(`【Module D】`);
      if (subs.moduleD.subModules?.length) {
        const names = subs.moduleD.subModules.map((m) => m.name).join(', ');
        parts.push(`MD 子模块: [${names}]`);
      }
      if (subs.moduleD.tradeoffText) {
        parts.push(`MD 权衡原文: "${truncate(subs.moduleD.tradeoffText, 200)}"`);
      }
      if (subs.moduleD.aiOrchestrationPrompts?.length) {
        parts.push(
          `MD 编排首条: "${truncate(subs.moduleD.aiOrchestrationPrompts[0], 200)}"`,
        );
      }
    }

    if (subs.selfAssess) {
      parts.push(`【自评】`);
      if (typeof subs.selfAssess.confidence === 'number') {
        parts.push(`自评信心: ${subs.selfAssess.confidence}/100`);
      }
      if (subs.selfAssess.reasoning) {
        parts.push(`自评原文: "${truncate(subs.selfAssess.reasoning, 200)}"`);
      }
      if (subs.selfAssess.reviewedDecisions?.length) {
        parts.push(`回顾的决策: [${subs.selfAssess.reviewedDecisions.join(', ')}]`);
      }
    }

    if (subs.phase0) {
      parts.push(`【Phase 0】`);
      const cr = subs.phase0.codeReading;
      if (cr?.l1Answer) parts.push(`P0 L1: "${truncate(cr.l1Answer, 200)}"`);
      if (cr?.l3Answer) parts.push(`P0 L3: "${truncate(cr.l3Answer, 200)}"`);
      if (typeof cr?.confidence === 'number') {
        parts.push(`P0 信心: ${cr.confidence}`);
      }
      if (subs.phase0.decision?.reasoning) {
        parts.push(`P0 决策原文: "${truncate(subs.phase0.decision.reasoning, 200)}"`);
      }
    }

    return parts.join('\n');
  } catch (err) {
    logger.warn('[mc-voice-chat-v5] getSessionContext failed:', err);
    return '';
  }
}

function summarizeEditorBehavior(eb: V5MBEditorBehavior | null | undefined): string {
  if (!eb) return '';
  const completions = eb.aiCompletionEvents?.length ?? 0;
  const acceptedCompletions = eb.aiCompletionEvents?.filter((e) => e.accepted).length ?? 0;
  const chats = eb.chatEvents?.length ?? 0;
  const diffs = eb.diffEvents?.length ?? 0;
  const acceptedDiffs = eb.diffEvents?.filter((e) => e.accepted).length ?? 0;
  const tests = eb.testRuns?.length ?? 0;
  return `补全 ${completions}(采纳 ${acceptedCompletions}) | 对话 ${chats} | Diff ${diffs}(采纳 ${acceptedDiffs}) | 测试运行 ${tests}`;
}

// ─── Dynamic prompt builder ──────────────────────────────────────────────

function buildDynamicSystemPrompt(
  probe: ProbeDecision,
  round: number,
  sessionContext: string,
): string {
  return `你是 Emma，CodeLens 的 AI 面试官。你正在进行第 ${round} 轮语音追问（共 5 轮）。

## 你的身份
- 名字：Emma
- 角色：资深技术面试官
- 语气：专业但亲切，像一个有经验的技术 leader 在和候选人聊天
- 回答长度：每次 2-3 句话（这是语音对话，不是文字）
- 禁止输出 markdown 格式、代码块、列表符号，只用纯文本口语

## 本轮追问策略
类型: ${probe.probeType}
策略键: ${probe.strategyKey}
目标维度: ${probe.targetDimension}
原因: ${probe.reason}

${probe.promptGuidance}

## 候选人已提交的数据（用于追问参考，不要重复问已回答的内容）
${sessionContext || '(暂无数据)'}

## 重要规则
- 每轮只问一个明确的问题，追问必须以一个问号结尾。
- 控制在 2-3 句话，不要长篇大论
- 不要透露正确答案、完整缺陷列表、或评分信息
- 当候选人说"忘了""不记得""没印象"时，直接引用他的原始回答帮他回忆，比如"你当时写的是..."、"你选的方案是..."。
- 候选人回答"不知道"或"没想过"时，不要强追——自然过渡到下一个维度
- 不要输出任何特殊格式

## 追问技巧（引导高信号密度回答）
- 如果候选人回答笼统，追问"能展开说说吗？"
- 如果候选人只说结论不说过程，追问"能聊聊你的思考过程吗？"
- 如果候选人说了方案但没说权衡，追问"这个方案放弃了什么？什么情况下会失败？"

## 追问节奏控制
- 候选人回答 < 20 字：追问更具体的细节，给一个具体场景引导他展开
- 候选人回答 20-100 字：正常追问下一个方向
- 候选人回答 > 200 字：简短肯定后直接转下一个维度
${round >= 5 ? '- 这是最后一轮，追问完后说"好的，我们今天的交流就到这里，感谢你的时间，辛苦了"' : ''}
${GPS_META_INSTRUCTION}
${CANDIDATE_QA_BOUNDARY}`;
}

// ─── Signal persistence (sBeliefUpdateMagnitude after round 5) ───────────

async function persistBeliefUpdateSignal(sessionId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { metadata: true },
  });
  if (!session) return;

  const meta = (session.metadata || {}) as Record<string, unknown>;
  const submissions = meta as V5Submissions;

  // Minimal SignalInput — sBeliefUpdateMagnitude only reads submissions.moduleC
  // + submissions.selfAssess?.reasoning + submissions.moduleA?.round1?.reasoning.
  // suiteId / examData / participatingModules are unused by this signal so
  // we pass safe placeholders; a full SignalInput is assembled by Task 12+
  // when scoring.service runs computeAll.
  const input: SignalInput = {
    sessionId,
    suiteId: 'full_stack' satisfies SuiteId,
    submissions,
    examData: {},
    participatingModules: [],
  };

  const result = await computeBeliefUpdateMagnitude(input);

  const existingSignalResults =
    (meta.signalResults as Record<string, unknown> | undefined) || {};

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      metadata: {
        ...meta,
        signalResults: {
          ...existingSignalResults,
          sBeliefUpdateMagnitude: result,
        },
      } as unknown as Prisma.InputJsonValue,
    },
  });

  logger.info(
    `[mc-voice-chat-v5] persisted sBeliefUpdateMagnitude session=${sessionId} value=${result.value}`,
  );
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
