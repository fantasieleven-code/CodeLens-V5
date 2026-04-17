/**
 * Voice API Routes
 *
 * Provides RTC token generation and voice chat lifecycle management
 * for CP4 voice interview mode.
 *
 * Enhanced: reads probeQuestions from CP4 CheckpointResult,
 * builds GPS context, constructs CP4-specific system prompt.
 */

import { Router } from 'express';
import { requireCandidate } from '../middleware/auth.js';
import { generateRtcToken } from '../services/rtc-token.service.js';
import { voiceChatService } from '../services/voice-chat.service.js';
import { gpsService } from '../services/gps.service.js';
import { initSilenceMeta, cleanupWebhookState } from './webhook.js';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { AppError, NotFoundError } from '../middleware/errorHandler.js';
import type { ProbeQuestion } from '../services/probing-generator.service.js';

export const voiceRouter = Router();

/** Get RTC join token for candidate */
voiceRouter.post('/token', requireCandidate, async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    if (!voiceChatService.isAvailable()) {
      throw new AppError(503, 'Voice chat not available (RTC credentials not configured)', 'VOICE_UNAVAILABLE');
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { candidate: true },
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const roomId = `interview_${sessionId}`;
    const userId = `candidate_${session.candidateId}`;
    const token = generateRtcToken(roomId, userId);

    res.json({
      token,
      roomId,
      userId,
      appId: env.VOLC_RTC_APP_ID,
    });
  } catch (error) {
    next(error);
  }
});

/** Start AI voice agent for a session (triggered at CP4 transition) */
voiceRouter.post('/start', requireCandidate, async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    if (!voiceChatService.isAvailable()) {
      throw new AppError(503, 'Voice chat not available', 'VOICE_UNAVAILABLE');
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        candidate: true,
        template: { include: { plantedBugs: true } },
      },
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    // 1. Read probeQuestions from CP4 CheckpointResult
    const cp4Result = await prisma.checkpointResult.findFirst({
      where: { sessionId, checkpointIndex: 4 },
    });
    const cp4Data = (cp4Result?.data || {}) as Record<string, unknown>;
    const probeQuestions = (cp4Data.probeQuestions || []) as ProbeQuestion[];

    // 2. Get GPS context for dimension coverage
    gpsService.initialize(sessionId, 20 * 60 * 1000); // 20min CP4 duration
    const gpsContext = gpsService.buildGpsContext(sessionId);

    // 3. Get code snapshot for reference
    const latestCp = await prisma.checkpointResult.findFirst({
      where: { sessionId, checkpointIndex: { lte: 3 } },
      orderBy: { checkpointIndex: 'desc' },
    });
    const latestData = (latestCp?.data || {}) as Record<string, unknown>;
    const codeSnapshot = latestData.codeSnapshot as Record<string, string> | undefined;

    // 4. Build CP4 system prompt
    const systemPrompt = buildCP4SystemPrompt({
      candidateName: session.candidate?.name || '候选人',
      probeQuestions,
      gpsContext,
      codeSnapshot,
      plantedBugs: session.template?.plantedBugs || [],
    });

    const roomId = `interview_${sessionId}`;
    const taskId = `task_${sessionId}_cp4`;
    const targetUserId = `candidate_${session.candidateId}`;
    const candidateName = session.candidate?.name || '候选人';

    const result = await voiceChatService.startVoiceChat({
      roomId,
      taskId,
      targetUserId,
      systemPrompt,
      welcomeMessage: `${candidateName}你好，接下来我们进入语音追问环节。我会就你之前的代码和回答进行一些深入提问。`,
      candidateName,
      tools: env.CP4_LLM_MODE === 'ark' ? [voiceChatService.isAvailable() ? { type: 'function', function: { name: 'check_interview_progress', description: '查询面试进度', parameters: { type: 'object', properties: {}, required: [] } } } : undefined].filter(Boolean) as object[] : undefined,
    });

    // Store taskId for this session
    await prisma.session.update({
      where: { id: sessionId },
      data: { metadata: { ...(session.metadata as object || {}), voiceTaskId: taskId, voiceRoomId: roomId } as Record<string, string> },
    });

    // Initialize silence timer meta for GPS-A (HireFlow)
    initSilenceMeta(sessionId, taskId, roomId, candidateName);

    logger.info(`[voice] Started CP4 voice agent for session=${sessionId}, ${probeQuestions.length} probes loaded`);
    res.json({ taskId, roomId, mode: env.CP4_LLM_MODE, probeCount: probeQuestions.length });
  } catch (error) {
    next(error);
  }
});

/** Stop AI voice agent */
voiceRouter.post('/stop', requireCandidate, async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const metadata = (session.metadata as Record<string, string>) || {};
    const roomId = metadata.voiceRoomId;
    const taskId = metadata.voiceTaskId;

    if (roomId && taskId) {
      await voiceChatService.stopVoiceChat(roomId, taskId);
    }

    // Cleanup GPS state + webhook timers/buffers
    gpsService.cleanup(sessionId);
    cleanupWebhookState(sessionId);

    res.json({ stopped: true });
  } catch (error) {
    next(error);
  }
});

/** Check voice chat availability */
voiceRouter.get('/status', (_req, res) => {
  res.json({
    available: voiceChatService.isAvailable(),
    mode: env.CP4_LLM_MODE,
  });
});

// ─── Helpers ───

interface CP4PromptInput {
  candidateName: string;
  probeQuestions: ProbeQuestion[];
  gpsContext: string;
  codeSnapshot?: Record<string, string>;
  plantedBugs: Array<{ name: string; description: string; file: string }>;
}

function buildCP4SystemPrompt(input: CP4PromptInput): string {
  const parts: string[] = [];

  // Role definition
  parts.push(`你是一位资深技术面试官，正在对候选人"${input.candidateName}"进行CP4追问环节（20分钟语音面试）。

## 角色要求
- 专业、友善但有深度，像真实的技术面试官
- 基于候选人之前的编码表现进行针对性追问
- 不要直接告诉候选人答案，用引导性问题挖掘真实能力
- 根据回答质量动态调整追问深度（浅→深）
- 用中文进行面试，但技术术语可以用英文

## 追问策略
- 对弱项(verification)：先确认基础理解，再逐步深入
- 对模糊项(clarification)：要求具体例子和trade-off分析
- 对强项(ceiling)：挑战规模化思维和架构判断`);

  // Probe questions
  if (input.probeQuestions.length > 0) {
    parts.push(`\n## 追问列表（按优先级排序，请依次覆盖）`);
    for (const probe of input.probeQuestions) {
      parts.push(
        `\n### [${probe.priority}] ${probe.dimension} — ${probe.category}` +
        `\n问题：${probe.question}` +
        `\n目标：${probe.probeGoal}` +
        `\n期望话题：${probe.expectedTopics.join(', ')}` +
        `\n回答弱时追问：${probe.followupIfWeak}` +
        `\n回答强时追问：${probe.followupIfStrong}`,
      );
    }
  }

  // Code snapshot summary
  if (input.codeSnapshot) {
    parts.push(`\n## 候选人代码摘要`);
    for (const [file, content] of Object.entries(input.codeSnapshot)) {
      // Truncate each file to keep prompt manageable
      parts.push(`\nFile: ${file}\n\`\`\`\n${content.slice(0, 1500)}\n\`\`\``);
    }
  }

  // Planted bugs reference (for probing if candidate's fix was AI-assisted)
  if (input.plantedBugs.length > 0) {
    parts.push(`\n## 技术参考点（用于追问，不要直接告知候选人）`);
    for (const bug of input.plantedBugs) {
      parts.push(
        `- ${bug.name}：${bug.description}（在${bug.file}中）` +
        `\n  如果候选人提到这个区域，追问其理解深度。如果候选人声称AI建议了修复方案，追问其对修复原理的理解。`,
      );
    }
  }

  // GPS context
  parts.push(`\n${input.gpsContext}`);

  parts.push(`\n## 重要规则
- 每个问题等待候选人回答后再追问，不要连续发问
- 注意时间管理，确保覆盖多个维度
- 当GPS提示FORCE_MOVE时，礼貌地切换到未覆盖维度
- 当GPS提示WRAP_UP时，感谢候选人并结束面试`);

  return parts.join('\n');
}
