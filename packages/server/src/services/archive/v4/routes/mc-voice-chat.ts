/**
 * mc-voice-chat.ts — VERTC Custom LLM endpoint for v4 Module C
 *
 * Receives VERTC-forwarded ASR transcriptions, analyzes signals in real-time,
 * generates targeted probing questions via LLM, and returns SSE stream.
 *
 * Protocol: VERTC Custom LLM standard (OpenAI-compatible SSE)
 *   Request:  POST with { messages, stream, model, custom, temperature, max_tokens, ... }
 *   Response: SSE with data: { choices: [{ delta: { content }, index }] } ending with data: [DONE]
 *
 * Flow:
 *   VERTC ASR → POST /api/v4/mc/voice-chat → signal snapshot → probe decision
 *   → LLM (Qwen) with dynamic system prompt → SSE stream → VERTC TTS → candidate hears
 */

import crypto from 'crypto';
import { Router } from 'express';
import OpenAI from 'openai';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { prisma } from '../config/db.js';
import { analyzeSignalsForProbing, buildSignalSnapshot, type ProbeDecision } from '../services/mc-probe-engine.js';
import { gpsService } from '../services/gps.service.js';
import { turnEvaluator } from '../services/turn-evaluator.service.js';
import { eventBus } from '../services/event-bus.service.js';
import { GPS_META_INSTRUCTION, CANDIDATE_QA_BOUNDARY } from '../services/voice-chat.service.js';

export const mcVoiceChatRouter = Router();

// LLM clients — Ark primary, DashScope fallback.
// Ark ARK_MODEL_LITE/PRO endpoints currently resolve to deepseek-v3-2 on
// 火山方舟; first-byte ~48ms measured, total ~600ms for short replies.
// Ark is preferred for MC voice because:
//   1. Same VPC as VERTC (火山 RTC) → 30-80ms lower network RTT per call
//   2. ~48ms first-token vs Qwen3-Coder-Plus ~1-2s
//   3. <think>...</think> reasoning tags are stripped for both providers.
const arkClient = env.ARK_API_KEY
  ? new OpenAI({ apiKey: env.ARK_API_KEY, baseURL: env.ARK_BASE_URL })
  : null;
const dashscopeClient = env.DASHSCOPE_API_KEY
  ? new OpenAI({ apiKey: env.DASHSCOPE_API_KEY, baseURL: env.DASHSCOPE_BASE_URL })
  : null;

const llmClient = arkClient || dashscopeClient;
const VOICE_MODEL = arkClient
  ? (env.ARK_MODEL_LITE || env.ARK_MODEL_PRO || '')
  : (env.DASHSCOPE_MODEL || 'qwen3-coder-plus');
const LLM_PROVIDER = arkClient ? 'ark' : dashscopeClient ? 'dashscope' : 'none';

// Per-session round counter (VERTC doesn't track this for us)
const sessionRoundMap = new Map<string, number>();

// Last Emma question per session — saved as emmaQuestion on the NEXT candidate turn.
// VERTC Custom LLM mode does not route our SSE output through the subtitle callback,
// so the webhook-side subtitle writer never sees our generated probes.
const pendingEmmaQuestion = new Map<string, string>();

// Per-session timestamp of the last successful invocation. Used by the echo
// gate below to detect VERTC ASR re-capturing Emma's TTS playback.
const sessionLastInvocation = new Map<string, number>();

// Echo gate parameters. We drop a candidate turn as "likely echo" when ALL hold:
//   - It arrives within ECHO_GAP_MS of the previous turn (rapid-fire)
//   - The user message is shorter than ECHO_MAX_LEN (echo fragments are short)
//   - It shares a ≥ECHO_SUBSTR_LEN-char substring with the last Emma response
// These conditions are conservative — better to let one real quick reply through
// than to silently swallow legitimate candidate speech.
const ECHO_GAP_MS = 3000;
const ECHO_MAX_LEN = 50;
const ECHO_SUBSTR_LEN = 4;

function isLikelyEcho(candidate: string, lastEmma: string, gapMs: number): boolean {
  const c = candidate.trim();
  if (c.length === 0) return true; // never run LLM on empty input
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
    // Auth check
    if (!authenticateRequest(req.headers.authorization)) {
      logger.warn('[mc-voice-chat] Unauthorized request');
      res.status(401).json({ Error: { Code: 'AuthenticationError', Message: 'Invalid API key' } });
      return;
    }

    const { messages, custom, model, temperature, max_tokens } = req.body as {
      messages?: Array<{ role: string; content: string }>;
      custom?: string;
      model?: string;
      temperature?: number;
      max_tokens?: number;
      stream?: boolean;
      'X-Biz-Trace-Info'?: string;
    };

    // Parse custom data (sessionId, currentRound from StartVoiceChat config)
    let sessionId: string | null = null;
    let configRound = 0;
    try {
      const customData = JSON.parse(custom || '{}');
      sessionId = customData.sessionId || null;
      configRound = customData.currentRound || 0;
    } catch {
      // Try query params fallback
      sessionId = (req.query.sessionId as string) || null;
    }

    if (!sessionId) {
      // Fallback: find active v4 MC session
      const active = await prisma.session.findFirst({
        where: { status: 'IN_PROGRESS', schemaVersion: 4 },
        orderBy: { updatedAt: 'desc' },
      });
      sessionId = active?.id || null;
    }

    if (!sessionId) {
      logger.error('[mc-voice-chat] No sessionId found');
      sendErrorSSE(res, requestId, '无法识别评估会话，请重新连接。');
      return;
    }

    // Extract candidate's latest message
    const userMessages = (messages || []).filter(m => m.role === 'user');
    const candidateAnswer = userMessages[userMessages.length - 1]?.content || '';

    // ── Echo gate ─────────────────────────────────────────────────────────
    // Drop suspected echo turns BEFORE incrementing the round counter so a
    // false trigger doesn't burn a probe slot. Empty SSE response (just stop +
    // [DONE]) tells VERTC the assistant has nothing to say this turn.
    {
      const now = Date.now();
      const lastTs = sessionLastInvocation.get(sessionId) || 0;
      const gapMs = lastTs > 0 ? now - lastTs : Number.POSITIVE_INFINITY;
      const lastEmma = pendingEmmaQuestion.get(sessionId) || '';
      if (isLikelyEcho(candidateAnswer, lastEmma, gapMs)) {
        logger.warn(
          `[mc-voice-chat] DROP suspected echo: session=${sessionId} gap=${gapMs}ms ` +
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

    // Track round number (increment on each user message)
    const currentRound = (sessionRoundMap.get(sessionId) || 0) + 1;
    sessionRoundMap.set(sessionId, currentRound);

    logger.info(
      `[mc-voice-chat] session=${sessionId} round=${currentRound} ` +
      `userMsg=${candidateAnswer.length}chars messages=${(messages || []).length}`,
    );

    // Non-blocking: save candidate answer (with the Emma question from the previous call as emmaQuestion)
    const prevEmmaQuestion = pendingEmmaQuestion.get(sessionId) || '';
    saveRoundAnswer(sessionId, currentRound, candidateAnswer, prevEmmaQuestion).catch(() => {});

    // 1. Build signal snapshot (lightweight, from cached scoring or raw submissions)
    const snapshot = await buildSignalSnapshot(sessionId, prisma);

    // 2. Load previous probe history from session metadata
    const probeHistory = await loadProbeHistory(sessionId);

    // 3. Analyze signals → decide what to probe (with dedup via history)
    const probeDecision = analyzeSignalsForProbing(snapshot, currentRound, probeHistory);

    logger.info(
      `[mc-voice-chat] probe: round=${currentRound} type=${probeDecision.probeType} ` +
      `dim=${probeDecision.targetDimension} reason=${probeDecision.reason}`,
    );

    // Non-blocking: persist this probe decision to metadata
    saveProbeDecision(sessionId, probeDecision).catch(() => {});

    // 3. Build dynamic system prompt
    const sessionContext = await getSessionContext(sessionId);
    const systemPrompt = buildDynamicSystemPrompt(probeDecision, currentRound, sessionContext);

    // 4. Prepare messages for LLM
    const llmMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...(messages || []).filter(m => m.role !== 'system').map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // 5. SSE response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 6. Stream LLM response
    let fullResponse = '';

    if (llmClient) {
      const completion = await llmClient.chat.completions.create({
        model: VOICE_MODEL,
        messages: llmMessages,
        temperature: temperature ?? 0.35,
        max_tokens: max_tokens ?? 400,
        stream: true,
      });

      // Strip <think>...</think> blocks (Qwen reasoning tags → garbled TTS)
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
            if (closeIdx === -1) { buffer = ''; break; }
            buffer = buffer.slice(closeIdx + 8);
            insideThink = false;
          } else {
            const openIdx = buffer.indexOf('<think>');
            if (openIdx === -1) {
              // No think tag — emit whole buffer
              const clean = buffer;
              buffer = '';
              if (clean) {
                writeSSEChunk(res, requestId, clean, firstChunk);
                fullResponse += clean;
                firstChunk = false;
              }
            } else if (openIdx > 0) {
              // Text before <think>
              const before = buffer.slice(0, openIdx);
              buffer = buffer.slice(openIdx);
              writeSSEChunk(res, requestId, before, firstChunk);
              fullResponse += before;
              firstChunk = false;
            } else {
              // Starts with <think>
              buffer = buffer.slice(7);
              insideThink = true;
            }
          }
        }
      }
    } else {
      // Neither Ark nor DashScope configured — return graceful fallback
      const fallback = getFallbackResponse(currentRound);
      writeSSEChunk(res, requestId, fallback, true);
      fullResponse = fallback;
    }

    // 7. Stop signal + DONE
    writeSSEStop(res, requestId);
    res.write('data: [DONE]\n\n');
    res.end();

    const latency = Date.now() - startTime;
    logger.info(`[mc-voice-chat] Done in ${latency}ms, ${fullResponse.length} chars, provider=${LLM_PROVIDER} model=${VOICE_MODEL}`);

    // Remember this probe — next candidate turn will persist it as that round's emmaQuestion
    if (fullResponse) pendingEmmaQuestion.set(sessionId, fullResponse);

    // 8. Non-blocking: analyze response for signal writeback
    if (candidateAnswer) {
      analyzeAndWritebackSignals(sessionId, candidateAnswer, fullResponse).catch(() => {});
    }

    // 9. Non-blocking: log probe decision
    eventBus.emit(sessionId, 'AI', 'mc:probe:decision', {
      round: currentRound,
      probeType: probeDecision.probeType,
      targetDimension: probeDecision.targetDimension,
      reason: probeDecision.reason,
      latencyMs: latency,
    }).catch(() => {});

  } catch (error) {
    logger.error('[mc-voice-chat] Error:', error);
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
    }
    sendErrorSSE(res, requestId, '请再说一遍，我没有完全听清。');
  }
});

// ─── SSE helpers ─────────────────────────────────────────────────────────

function writeSSEChunk(res: any, id: string, content: string, isFirst: boolean): void {
  const data = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'codelens-interviewer',
    choices: [{
      index: 0,
      delta: { ...(isFirst ? { role: 'assistant' } : {}), content },
      finish_reason: null,
    }],
  };
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeSSEStop(res: any, id: string): void {
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

function sendErrorSSE(res: any, id: string, message: string): void {
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

// ─── Context helpers ─────────────────────────────────────────────────────

async function saveRoundAnswer(
  sessionId: string,
  round: number,
  answer: string,
  emmaQuestion: string,
): Promise<void> {
  try {
    const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { metadata: true } });
    if (!session) return;

    const meta = (session.metadata || {}) as Record<string, any>;
    const v4 = meta.v4 || {};
    const subs = v4.submissions || {};
    const mc = subs.modulec || { rounds: [] };
    const rounds = Array.isArray(mc.rounds) ? mc.rounds : [];

    // Append this round
    rounds.push({
      round,
      emmaQuestion,
      answer,
      submittedAt: new Date().toISOString(),
      source: 'voice',
    });

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        metadata: {
          ...meta,
          v4: {
            ...v4,
            submissions: {
              ...subs,
              modulec: { ...mc, rounds },
            },
          },
        } as any,
      },
    });
  } catch (err) {
    logger.warn('[mc-voice-chat] Failed to save round answer:', err);
  }
}

async function loadProbeHistory(sessionId: string): Promise<ProbeDecision[]> {
  try {
    const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { metadata: true } });
    if (!session) return [];
    const meta = (session.metadata || {}) as Record<string, any>;
    const history = meta.v4?.submissions?.modulec?.probeHistory;
    return Array.isArray(history) ? history : [];
  } catch (err) {
    logger.warn('[mc-voice-chat] Failed to load probe history:', err);
    return [];
  }
}

async function saveProbeDecision(sessionId: string, probe: ProbeDecision): Promise<void> {
  try {
    const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { metadata: true } });
    if (!session) return;

    const meta = (session.metadata || {}) as Record<string, any>;
    const v4 = meta.v4 || {};
    const subs = v4.submissions || {};
    const mc = subs.modulec || {};
    const history = Array.isArray(mc.probeHistory) ? mc.probeHistory : [];

    history.push({
      round: probe.round,
      targetDimension: probe.targetDimension,
      probeType: probe.probeType,
      reason: probe.reason,
      savedAt: new Date().toISOString(),
    });

    await prisma.session.update({
      where: { id: sessionId },
      data: {
        metadata: {
          ...meta,
          v4: {
            ...v4,
            submissions: {
              ...subs,
              modulec: { ...mc, probeHistory: history },
            },
          },
        } as any,
      },
    });
  } catch (err) {
    logger.warn('[mc-voice-chat] Failed to save probe decision:', err);
  }
}

async function getSessionContext(sessionId: string): Promise<string> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });
    if (!session?.metadata) return '';

    const meta = session.metadata as Record<string, any>;
    const v4 = meta.v4 as Record<string, any> | undefined;
    const subs = v4?.submissions as Record<string, any> | undefined;
    if (!subs) return '';

    const parts: string[] = [];

    // MA submission context — include specific candidate text for citation
    if (subs.moduleA) {
      const ma = subs.moduleA as Record<string, any>;
      parts.push(`【候选人 Module A 表现】`);
      if (ma.round1) {
        const r1 = ma.round1 as Record<string, any>;
        parts.push(`选型: 方案 ${r1.schemeId || r1.choice || '?'}`);
        if (r1.reasoning) parts.push(`候选人原文理由: "${String(r1.reasoning).slice(0, 300)}"`);
        if (r1.structuredForm) {
          const sf = r1.structuredForm as Record<string, string>;
          if (sf.assumptions) parts.push(`假设: "${String(sf.assumptions).slice(0, 150)}"`);
          if (sf.tradeoffs) parts.push(`权衡: "${String(sf.tradeoffs).slice(0, 150)}"`);
          if (sf.risks) parts.push(`风险: "${String(sf.risks).slice(0, 150)}"`);
        }
      }
      if (ma.round2) {
        const r2 = ma.round2 as Record<string, any>;
        if (r2.markedDefectIds) {
          const ids = r2.markedDefectIds as string[];
          parts.push(`标记缺陷: [${ids.join(', ')}]`);
        }
        if (r2.defectReasoning) parts.push(`缺陷推理原文: "${String(r2.defectReasoning).slice(0, 200)}"`);
      }
      if (ma.round3?.diagnosisText) {
        parts.push(`失败诊断原文: "${String(ma.round3.diagnosisText).slice(0, 200)}"`);
      }
    }

    // MB1 submission context — include prompt text for citation
    if (subs.mb1?.rounds) {
      const rounds = subs.mb1.rounds as any[];
      // Detect scaffold reset: find last round with round=1 or repeated initial prompt
      let effectiveStart = 0;
      if (rounds.length > 1) {
        const firstPrompt = String(rounds[0]?.prompt || '').trim();
        for (let i = 1; i < rounds.length; i++) {
          if (rounds[i].round === 1) effectiveStart = i;
          else if (firstPrompt.length > 20 && String(rounds[i]?.prompt || '').trim() === firstPrompt) effectiveStart = i;
        }
      }
      const effectiveRounds = rounds.slice(effectiveStart);
      parts.push(`【候选人 MB1 表现】`);
      parts.push(`有效轮次: ${effectiveRounds.length}`);
      if (subs.mb1.finalTestPassRate != null) {
        parts.push(`最终测试通过率: ${Math.round(Number(subs.mb1.finalTestPassRate) * 100)}%`);
      }
      if (effectiveRounds[0]?.prompt) {
        parts.push(`首轮 prompt 原文: "${String(effectiveRounds[0].prompt).slice(0, 300)}"`);
      }
      if (effectiveRounds.length > 1 && effectiveRounds[1]?.prompt) {
        parts.push(`第二轮 prompt 原文: "${String(effectiveRounds[1].prompt).slice(0, 200)}"`);
      }
    }

    // MB2 submission context
    if (subs.mb2?.rulesContent) {
      parts.push(`【候选人 MB2 RULES.md 摘要】`);
      parts.push(String(subs.mb2.rulesContent).slice(0, 400));
    }

    // Self-assessment — include exact score + text for contradiction detection
    if (subs.selfAssess) {
      const se = subs.selfAssess as Record<string, any>;
      parts.push(`【候选人自评】`);
      if (se.confidence != null) parts.push(`自评信心: ${se.confidence}/100`);
      if (se.selfRating != null) parts.push(`自评分: ${se.selfRating}`);
      if (se.reasoning) parts.push(`自评原文: "${String(se.reasoning).slice(0, 300)}"`);
    }

    // GPS context
    const gpsContext = gpsService.buildGpsContext(sessionId);
    if (gpsContext) parts.push(gpsContext);

    return parts.join('\n');
  } catch {
    return '';
  }
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
目标维度: ${probe.targetDimension}
原因: ${probe.reason}

${probe.promptGuidance}

## 候选人已提交的数据（用于追问参考，不要重复问已回答的内容）
${sessionContext || '(暂无数据)'}

## 重要规则
- 每轮只问一个明确的问题。不要在一个回合里问两个不相关的问题。追问必须以一个问号结尾。
- 控制在 2-3 句话，不要长篇大论
- 不要透露正确答案、完整缺陷列表、或评分信息
- 当候选人说"忘了""不记得""没印象"时，直接引用他的原始回答帮他回忆，比如"你当时写的是..."、"你选的方案是..."。你手里有他所有的提交数据，不要让候选人自己去回忆。
- 候选人回答"不知道"或"没想过"时，不要强追——自然过渡到下一个维度
- 不要输出任何特殊格式

## 追问技巧（引导高信号密度回答）
- 如果候选人回答笼统，追问"能展开说说吗？"
- 如果候选人只说结论不说过程，追问"能聊聊你的思考过程吗？"
- 如果候选人说了方案但没说权衡，追问"这个方案放弃了什么？什么情况下会失败？"
- 目标：引导候选人说出因果链、权衡分析、边界条件、失败场景
- 不要在追问中暗示候选人应该说什么类型的内容。

## 追问节奏控制
- 候选人回答 < 20 字：追问更具体的细节，给一个具体场景引导他展开
- 候选人回答 20-100 字：正常追问下一个方向
- 候选人回答 > 200 字：简短肯定后直接转下一个维度，不要在同一个话题上继续
${round >= 5 ? '- 这是最后一轮，追问完后说"好的，我们今天的交流就到这里，感谢你的时间，辛苦了"' : ''}
${GPS_META_INSTRUCTION}
${CANDIDATE_QA_BOUNDARY}`;
}

// ─── Signal writeback (non-blocking) ─────────────────────────────────────

async function analyzeAndWritebackSignals(
  sessionId: string,
  candidateMessage: string,
  aiResponse: string,
): Promise<void> {
  try {
    const signal = await turnEvaluator.evaluateTurn(sessionId, aiResponse, candidateMessage);
    logger.info(
      `[mc-voice-chat] Turn signal: ${signal.mappedDimension} ${signal.depthLevel} conf=${signal.confidence}`,
    );
    gpsService.updateFromTurnSignal(sessionId, signal);
  } catch {
    // Heuristic fallback
    const signals: Array<{ type: string; value: number; context?: Record<string, unknown> }> = [];
    if (candidateMessage.length > 200) {
      signals.push({ type: 'V4_VERBOSE_RESPONSE', value: 1, context: { length: candidateMessage.length } });
    }
    const tradeoffKw = ['权衡', '另一方面', '但是', 'however', 'tradeoff', '而不是'];
    if (tradeoffKw.some(kw => candidateMessage.toLowerCase().includes(kw))) {
      signals.push({ type: 'V4_TRADEOFF_ANALYSIS', value: 1 });
    }
    if (signals.length > 0) {
      await eventBus.emitSignals(sessionId, signals);
    }
  }
}
