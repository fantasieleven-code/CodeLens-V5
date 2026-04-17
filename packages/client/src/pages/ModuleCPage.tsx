/**
 * Module C — 语音追问环节 (voice interview UI).
 *
 * 4-state machine: IDLE → LISTENING → AI_THINKING → AI_SPEAKING → IDLE
 * Dual mode: Voice (VERTC SDK) with text fallback tab.
 * Reads real-time subtitles from voice.store (fed by webhook voice:subtitle).
 * Voice state driven by voice:status events from the server webhook.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { V5ModuleCAnswer } from '@codelens-v5/shared';
import { getSocket } from '../lib/socket.js';
import { useSessionStore } from '../stores/session.store.js';
import { useModuleStore } from '../stores/module.store.js';
import { useVoiceStore, type VoiceState as StoreVoiceState } from '../stores/voice.store.js';
import { useVoiceRTC } from '../hooks/useVoiceRTC.js';
import { useBehaviorTracker } from '../hooks/useBehaviorTracker.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';

// ─── Types ───────────────────────────────────────────────────────────────

type MCStatus = 'IDLE' | 'LISTENING' | 'AI_THINKING' | 'AI_SPEAKING';
type TabMode = 'voice' | 'text';

interface ChatMessage {
  id: string;
  role: 'ai' | 'user';
  content: string;
  timestamp: number;
}

// ─── Constants ───────────────────────────────────────────────────────────

const ROUND_LABELS = [
  'Module A · 选型',
  'Module A · 缺陷',
  'Module B1 · AI 指挥',
  'Module B2 · 约束设计',
  '跨领域迁移',
];

const PROBE_PROMPTS = [
  '先用一段话自述：在 Module A 里你为什么选了那个方案？说说你的判断链路。',
  '给出第 1 轮回答里某一个判断的一个真实场景例子。例子越具体越好。',
  '如果 AI 给你的实现看起来正确但里面藏了一个不明显的 bug，你一般用什么方式最先发现它？',
  '你在 RULES.md 里写的约束，哪一条是你最看重的？解释一下这条约束防住了哪类 AI 错误。',
  '现在回到第 1 轮的选型问题：如果让你重新做一次，你会改变决策吗？',
];

const TOTAL_ROUNDS = 5;
const ROUND_TIME_LIMIT = 120; // 2 min per round

// ─── Status mapping ──────────────────────────────────────────────────────

function mapVoiceState(s: StoreVoiceState): MCStatus {
  switch (s) {
    case 'thinking':
      return 'AI_THINKING';
    case 'speaking':
      return 'AI_SPEAKING';
    case 'listening':
      return 'LISTENING';
    default:
      return 'IDLE';
  }
}

// ─── CSS Keyframes (injected once) ───────────────────────────────────────

const STYLE_ID = 'mc-voice-keyframes';
function ensureKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes mc-ripple {
      0% { transform: scale(1); opacity: 0.5; }
      100% { transform: scale(1.8); opacity: 0; }
    }
    @keyframes mc-wave {
      0%, 100% { height: 6px; }
      50% { height: 22px; }
    }
    @keyframes mc-dot-bounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }
    @keyframes mc-fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

// ─── Main Component ──────────────────────────────────────────────────────

export const ModuleCPage: React.FC = () => {
  const token = useSessionStore((s) => s.token);
  const sessionId = useSessionStore((s) => s.sessionId);
  const advance = useModuleStore((s) => s.advance);
  const behavior = useBehaviorTracker('moduleC');

  // Preflight gate — user must confirm headphones + mic test before RTC starts.
  // This prevents the "Tencent Meeting screen share" echo loop where Emma's own
  // TTS coming out of speakers is re-recognized by VERTC ASR as candidate speech.
  const [preflightPassed, setPreflightPassed] = useState(false);

  // Voice RTC hook — gated on preflight
  useVoiceRTC({
    enabled: Boolean(token && sessionId && preflightPassed),
    startEndpoint: '/api/voice/v4/start',
  });

  const voiceStoreState = useVoiceStore((s) => s.state);
  const voiceError = useVoiceStore((s) => s.errorMessage);
  const subtitles = useVoiceStore((s) => s.subtitles);

  const [mode, setMode] = useState<TabMode>('voice');
  const [currentRound, setCurrentRound] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [finished, setFinished] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Text fallback state
  const [textAnswer, setTextAnswer] = useState('');
  const [textSubmitting, setTextSubmitting] = useState(false);
  const [textAnswers, setTextAnswers] = useState<string[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevSubtitleCountRef = useRef(0);

  const status: MCStatus = mapVoiceState(voiceStoreState);
  const isVoiceConnected = !['idle', 'error', 'degraded', 'requesting_mic', 'connecting'].includes(voiceStoreState);

  // ── Behavior tracking refs ───────────────────────────────────────────────
  // Per-round: emmaFinishedAt (when the AI prompt is shown / TTS ends),
  // candidateStartedAt (first user input or LISTENING transition), and
  // speechDuration (accumulated LISTENING ms for voice mode).
  // Global: tabSwitches[] (Page Visibility events), voiceTotalDuration
  // (sum of intervals while voice was connected).
  const mcBehaviorRef = useRef<{
    roundStates: Array<{
      emmaFinishedAt: number | null;
      candidateStartedAt: number | null;
      speechDuration: number;
      flushed: boolean;
    }>;
    tabSwitches: { leftAt: number; returnedAt: number; durationMs: number }[];
    tabHiddenAt: number | null;
    voiceConnectedAt: number | null;
    voiceTotalDuration: number;
    listeningStartedAt: number | null;
    pageEnteredAt: number;
  }>({
    roundStates: Array.from({ length: TOTAL_ROUNDS }, () => ({
      emmaFinishedAt: null,
      candidateStartedAt: null,
      speechDuration: 0,
      flushed: false,
    })),
    tabSwitches: [],
    tabHiddenAt: null,
    voiceConnectedAt: null,
    voiceTotalDuration: 0,
    listeningStartedAt: null,
    pageEnteredAt: Date.now(),
  });

  // Stamp the current round's emmaFinishedAt the first time the prompt appears.
  // For text mode this is "round became active"; for voice mode it's
  // "AI_SPEAKING transitioned out".
  useEffect(() => {
    const rs = mcBehaviorRef.current.roundStates[currentRound];
    if (rs && rs.emmaFinishedAt === null) {
      rs.emmaFinishedAt = Date.now();
    }
  }, [currentRound]);

  // Voice state transitions: track LISTENING segments for speechDuration and
  // accumulate voice connect time.
  useEffect(() => {
    const ref = mcBehaviorRef.current;
    const now = Date.now();
    if (status === 'LISTENING') {
      if (ref.listeningStartedAt === null) ref.listeningStartedAt = now;
      const rs = ref.roundStates[currentRound];
      if (rs && rs.candidateStartedAt === null) rs.candidateStartedAt = now;
    } else {
      // LISTENING ended — fold accumulated duration into the active round.
      if (ref.listeningStartedAt !== null) {
        const dur = now - ref.listeningStartedAt;
        const rs = ref.roundStates[currentRound];
        if (rs) rs.speechDuration += dur;
        ref.listeningStartedAt = null;
      }
    }
    // Voice connection accounting (any non-disconnected state counts).
    if (isVoiceConnected) {
      if (ref.voiceConnectedAt === null) ref.voiceConnectedAt = now;
    } else if (ref.voiceConnectedAt !== null) {
      ref.voiceTotalDuration += now - ref.voiceConnectedAt;
      ref.voiceConnectedAt = null;
    }
  }, [status, isVoiceConnected, currentRound]);

  // Page Visibility: record tab leave/return durations.
  useEffect(() => {
    const onVisibility = () => {
      const ref = mcBehaviorRef.current;
      const now = Date.now();
      if (document.hidden) {
        ref.tabHiddenAt = now;
      } else if (ref.tabHiddenAt !== null) {
        ref.tabSwitches.push({
          leftAt: ref.tabHiddenAt,
          returnedAt: now,
          durationMs: now - ref.tabHiddenAt,
        });
        ref.tabHiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Helper: emit per-round flush idempotently. Both submitTextRound and skip
  // can call it; the second call short-circuits via `flushed`.
  const flushRoundBehavior = useCallback(
    (roundIdx: number, opts: { textModeUsed: boolean }) => {
      const rs = mcBehaviorRef.current.roundStates[roundIdx];
      if (!rs || rs.flushed) return;
      rs.flushed = true;
      const responseLatency =
        rs.emmaFinishedAt !== null && rs.candidateStartedAt !== null
          ? rs.candidateStartedAt - rs.emmaFinishedAt
          : null;
      behavior.flush(roundIdx + 1, {
        responseLatency,
        textModeUsed: opts.textModeUsed,
        speechDuration: rs.speechDuration,
      });
    },
    [behavior],
  );

  // Auto-degrade to text tab if voice fails
  useEffect(() => {
    if (voiceStoreState === 'degraded' || voiceStoreState === 'error') {
      setMode('text');
    }
  }, [voiceStoreState]);

  // Inject CSS keyframes
  useEffect(() => { ensureKeyframes(); }, []);

  // Timer
  useEffect(() => {
    if (finished) return;
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [finished]);

  // Convert subtitle events → chat messages
  useEffect(() => {
    if (subtitles.length <= prevSubtitleCountRef.current) return;
    const newSubs = subtitles.slice(prevSubtitleCountRef.current);
    prevSubtitleCountRef.current = subtitles.length;

    for (const sub of newSubs) {
      const role: 'ai' | 'user' = sub.speaker.startsWith('AI_') ? 'ai' : 'user';
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-${Math.random()}`, role, content: sub.text, timestamp: sub.timestamp },
      ]);
    }
  }, [subtitles]);

  // Auto-scroll chat (guard for JSDOM which lacks scrollIntoView)
  useEffect(() => {
    chatEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, status]);

  // Text mode submit
  const submitTextRound = useCallback(() => {
    if (textSubmitting || textAnswer.trim().length < 10) return;
    setTextSubmitting(true);
    const socket = getSocket();
    const prompt = PROBE_PROMPTS[currentRound];
    const payload: V5ModuleCAnswer = {
      round: currentRound + 1,
      question: prompt,
      answer: textAnswer.trim(),
    };
    socket.emit(
      'v5:modulec:answer',
      payload,
      (ok: boolean) => {
        setTextSubmitting(false);
        if (!ok) return;
        flushRoundBehavior(currentRound, { textModeUsed: true });
        setTextAnswers((prev) => [...prev, textAnswer.trim()]);
        setTextAnswer('');
        // Add to chat display
        setMessages((prev) => [
          ...prev,
          { id: `text-q-${currentRound}`, role: 'ai', content: prompt, timestamp: Date.now() },
          { id: `text-a-${currentRound}`, role: 'user', content: textAnswer.trim(), timestamp: Date.now() },
        ]);
        if (currentRound + 1 >= TOTAL_ROUNDS) {
          setFinished(true);
        } else {
          setCurrentRound((r) => r + 1);
        }
      },
    );
  }, [textAnswer, textSubmitting, currentRound, flushRoundBehavior]);

  const skipRound = useCallback(() => {
    flushRoundBehavior(currentRound, { textModeUsed: mode === 'text' });
    if (currentRound + 1 >= TOTAL_ROUNDS) {
      setFinished(true);
    } else {
      setCurrentRound((r) => r + 1);
      setElapsed(0);
    }
  }, [currentRound, mode, flushRoundBehavior]);

  const endInterview = useCallback(() => {
    setFinished(true);
  }, []);

  const finishAndAdvance = useCallback(() => {
    // Flush the current round (in case end was hit mid-question) and the
    // global MC summary before sending the interview-end event.
    const ref = mcBehaviorRef.current;
    flushRoundBehavior(currentRound, { textModeUsed: mode === 'text' });

    // Close out any open voice/listening intervals.
    const now = Date.now();
    if (ref.listeningStartedAt !== null) {
      const rs = ref.roundStates[currentRound];
      if (rs) rs.speechDuration += now - ref.listeningStartedAt;
      ref.listeningStartedAt = null;
    }
    if (ref.voiceConnectedAt !== null) {
      ref.voiceTotalDuration += now - ref.voiceConnectedAt;
      ref.voiceConnectedAt = null;
    }
    behavior.flush(undefined, {
      tabSwitchDuringMC: ref.tabSwitches.length,
      tabSwitchEvents: ref.tabSwitches,
      totalVoiceDuration: ref.voiceTotalDuration,
      mcDuration: now - ref.pageEnteredAt,
    });

    // Notify server to mark session COMPLETED + trigger final scoring
    const socket = getSocket();
    socket.emit('session:end', () => {});
    advance();
  }, [advance, currentRound, mode, flushRoundBehavior, behavior]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // ─── Finished screen ────────────────────────────────────────────────────

  if (finished) {
    return (
      <div style={S.page} data-testid="module-c-page">
        <div style={S.container}>
          <div style={S.doneCard} data-testid="modulec-done">
            <div style={S.doneIcon}>&#10003;</div>
            <div style={S.doneTitle}>追问环节完成</div>
            <p style={S.doneBody}>
              所有回答已提交。系统会结合前面各模块的决策一起生成最终报告。
            </p>
            <button type="button" style={S.primaryBtn} onClick={finishAndAdvance} data-testid="modulec-finish">
              结束面试
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Preflight screen ───────────────────────────────────────────────────

  if (!preflightPassed) {
    return (
      <div style={S.page} data-testid="module-c-page">
        <div style={S.container}>
          <MicPreflight onPass={() => setPreflightPassed(true)} />
        </div>
      </div>
    );
  }

  // ─── Main UI ────────────────────────────────────────────────────────────

  const voiceStatusState = mode === 'text' ? 'text_fallback' : isVoiceConnected ? 'connected' : voiceStoreState;

  return (
    <div style={S.page} data-testid="module-c-page">
      <div
        data-testid="modulec-voice-status"
        data-state={voiceStatusState}
        style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      />
      <div style={S.container}>
        {/* Header */}
        <RoundBadge round={currentRound} />
        <div style={S.headphoneHint} data-testid="modulec-headphone-hint">
          <span aria-hidden="true">🎧</span>
          <span>建议全程佩戴耳机，避免 AI 声音被麦克风二次采集</span>
        </div>
        <h1 style={S.heading}>Module C — voice interview</h1>
        <p style={S.subheading}>AI interviewer probes your earlier decisions</p>
        <ProgressPips current={currentRound} total={TOTAL_ROUNDS} />

        {/* Mode tabs */}
        <ModeTabs active={mode} onSwitch={setMode} voiceAvailable={isVoiceConnected} />

        {mode === 'voice' ? (
          <>
            {/* Chat area */}
            <div style={S.chatArea} data-testid="modulec-chat">
              {messages.length === 0 && (
                <div style={S.chatEmpty}>
                  {isVoiceConnected
                    ? '语音已连接，AI 面试官将开始提问...'
                    : voiceError
                      ? `语音连接失败（${voiceError}），请切换到文字模式`
                      : '正在连接语音...'}
                </div>
              )}
              {messages.map((msg) => (
                <ChatBubble key={msg.id} msg={msg} />
              ))}
              {status === 'AI_THINKING' && <ThinkingDots />}
              <div ref={chatEndRef} />
            </div>

            {/* Voice controls */}
            <div style={S.controlsArea}>
              {status === 'LISTENING' && <AudioWaveform />}
              <MicButton status={status} />
              <StatusLabel status={status} />
              <div style={S.timerRow}>
                <span style={S.timer}>{formatTime(elapsed)} / {formatTime(ROUND_TIME_LIMIT)}</span>
              </div>
              <div style={S.actionRow}>
                <button type="button" style={S.outlineBtn} onClick={skipRound}>Skip round</button>
                <button type="button" style={S.outlineBtn} onClick={endInterview}>End interview</button>
              </div>
            </div>
          </>
        ) : (
          /* Text fallback */
          <TextFallback
            round={currentRound}
            answer={textAnswer}
            onAnswerChange={(v) => {
              const rs = mcBehaviorRef.current.roundStates[currentRound];
              if (rs && rs.candidateStartedAt === null && v.length > 0) {
                rs.candidateStartedAt = Date.now();
              }
              if (v.length > textAnswer.length) behavior.trackKeystroke();
              setTextAnswer(v);
            }}
            onSubmit={submitTextRound}
            submitting={textSubmitting}
            answers={textAnswers}
          />
        )}
      </div>
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────

const RoundBadge: React.FC<{ round: number }> = ({ round }) => (
  <div style={S.roundBadge} data-testid="modulec-progress">
    Round {round + 1} / {TOTAL_ROUNDS} — {ROUND_LABELS[round]}
  </div>
);

// ─── Mic Preflight ───────────────────────────────────────────────────────
//
// Gate screen shown before RTC starts. Forces candidate to:
//   1. Confirm they're wearing headphones (blocks the echo-loop scenario
//      where speaker output is re-captured by the mic).
//   2. See a live mic level meter so they can confirm the mic works.
//   3. Acknowledge they're not in a screen-share/meeting.
//
// "Start interview" button is enabled once headphones are confirmed AND mic
// permission is granted. Mic level is shown as visual feedback but does not
// gate the button (JSDOM has no AudioContext, so gating on level would break
// tests).
//
// A "skip to text mode" escape hatch lets users proceed even if mic fails.

interface MicPreflightProps {
  onPass: () => void;
}

const MIC_LEVEL_BARS = 12;

const MicPreflight: React.FC<MicPreflightProps> = ({ onPass }) => {
  const [headphonesChecked, setHeadphonesChecked] = useState(false);
  const [quietChecked, setQuietChecked] = useState(false);
  const [noShareChecked, setNoShareChecked] = useState(false);
  const [micState, setMicState] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [micError, setMicError] = useState<string | null>(null);
  const [level, setLevel] = useState(0); // 0..1
  const [peakSeen, setPeakSeen] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const requestMic = useCallback(async () => {
    setMicState('requesting');
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      setMicState('granted');

      // Set up analyser for live level meter. If AudioContext isn't available
      // (e.g. JSDOM), we still count mic as "granted" — we just skip the meter.
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        const normalized = Math.min(1, (sum / buf.length) / 128);
        setLevel(normalized);
        if (normalized > 0.12) setPeakSeen(true);
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '麦克风权限被拒绝';
      setMicError(msg);
      setMicState('denied');
    }
  }, []);

  const canStart = headphonesChecked && micState === 'granted';

  const handleStart = () => {
    cleanup();
    onPass();
  };

  const activeBars = Math.round(level * MIC_LEVEL_BARS);

  return (
    <div style={S.preflight} data-testid="modulec-preflight">
      <div style={S.preflightHeader}>
        <div style={S.preflightBadge}>Module C · 语音面试准备</div>
        <h1 style={S.preflightTitle}>开始前的 3 个检查</h1>
        <p style={S.preflightSub}>
          为了让 AI 面试官准确识别你的回答，请在开始前完成下面的检查。
        </p>
      </div>

      <div style={S.preflightSection}>
        <label style={S.checkRow}>
          <input
            type="checkbox"
            checked={headphonesChecked}
            onChange={(e) => setHeadphonesChecked(e.target.checked)}
            data-testid="modulec-preflight-headphones"
            style={S.checkbox}
          />
          <div>
            <div style={S.checkLabel}>我已佩戴耳机 <span style={S.required}>(必选)</span></div>
            <div style={S.checkHint}>
              不戴耳机时，扬声器的 AI 声音会被麦克风二次采集，导致 AI 误以为你在说话、跳过问题。
            </div>
          </div>
        </label>

        <label style={S.checkRow}>
          <input
            type="checkbox"
            checked={quietChecked}
            onChange={(e) => setQuietChecked(e.target.checked)}
            data-testid="modulec-preflight-quiet"
            style={S.checkbox}
          />
          <div>
            <div style={S.checkLabel}>我在相对安静的环境</div>
            <div style={S.checkHint}>背景人声、键盘声会被 AI 误识别为你的回答。</div>
          </div>
        </label>

        <label style={S.checkRow}>
          <input
            type="checkbox"
            checked={noShareChecked}
            onChange={(e) => setNoShareChecked(e.target.checked)}
            data-testid="modulec-preflight-noshare"
            style={S.checkbox}
          />
          <div>
            <div style={S.checkLabel}>我没有在屏幕共享或在线会议中</div>
            <div style={S.checkHint}>腾讯会议/Zoom 共享屏幕会让多路音频混入，建议关掉会议。</div>
          </div>
        </label>
      </div>

      <div style={S.preflightSection}>
        <div style={S.checkLabel}>麦克风测试</div>
        {micState === 'idle' && (
          <>
            <div style={S.checkHint}>点击下方按钮授权麦克风，然后试着说一句话，确认电平条有反应。</div>
            <button
              type="button"
              onClick={requestMic}
              style={S.secondaryBtn}
              data-testid="modulec-preflight-requestmic"
            >
              授权麦克风并测试
            </button>
          </>
        )}
        {micState === 'requesting' && <div style={S.checkHint}>等待授权...</div>}
        {micState === 'granted' && (
          <>
            <div style={S.checkHint}>
              {peakSeen
                ? '✓ 麦克风工作正常，随时可以开始。'
                : '试着说一句话，观察下方电平。'}
            </div>
            <div style={S.levelMeter} data-testid="modulec-preflight-level">
              {Array.from({ length: MIC_LEVEL_BARS }, (_, i) => (
                <div
                  key={i}
                  style={{
                    ...S.levelBar,
                    backgroundColor:
                      i < activeBars ? (i >= MIC_LEVEL_BARS - 3 ? '#E38F8F' : ACCENT) : colors.surface1,
                    opacity: i < activeBars ? 1 : 0.35,
                  }}
                />
              ))}
            </div>
          </>
        )}
        {micState === 'denied' && (
          <div style={S.errorBox}>
            麦克风授权失败：{micError || '未知错误'}。请检查浏览器地址栏的麦克风图标，或切换到文字模式。
          </div>
        )}
      </div>

      <div style={S.preflightActions}>
        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart}
          style={{ ...S.primaryBtn, ...(canStart ? {} : S.btnDisabled) }}
          data-testid="modulec-preflight-start"
        >
          开始语音面试
        </button>
        <button
          type="button"
          onClick={handleStart}
          style={S.linkBtn}
          data-testid="modulec-preflight-skip"
        >
          跳过测试，直接使用文字模式
        </button>
      </div>
    </div>
  );
};

const ProgressPips: React.FC<{ current: number; total: number }> = ({ current, total }) => (
  <div style={S.pipsRow}>
    {Array.from({ length: total }, (_, i) => (
      <div
        key={i}
        style={{
          ...S.pip,
          backgroundColor: i < current ? colors.mauve : i === current ? colors.mauve : colors.surface1,
          opacity: i <= current ? 1 : 0.4,
          flex: i === current ? 2 : 1,
        }}
      />
    ))}
  </div>
);

const ModeTabs: React.FC<{ active: TabMode; onSwitch: (m: TabMode) => void; voiceAvailable: boolean }> = ({
  active,
  onSwitch,
  voiceAvailable,
}) => (
  <div style={S.tabRow}>
    <button
      type="button"
      data-testid="modulec-mode-voice"
      style={{ ...S.tab, ...(active === 'voice' ? S.tabActive : {}) }}
      onClick={() => onSwitch('voice')}
    >
      Voice mode
    </button>
    <button
      type="button"
      data-testid="modulec-mode-text"
      style={{ ...S.tab, ...(active === 'text' ? S.tabActive : {}) }}
      onClick={() => onSwitch('text')}
    >
      Text fallback
    </button>
  </div>
);

const ChatBubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
  const isAI = msg.role === 'ai';
  return (
    <div style={{ ...S.bubbleWrap, alignItems: isAI ? 'flex-start' : 'flex-end', animation: 'mc-fade-in 0.3s ease' }}>
      <div style={S.bubbleLabel}>{isAI ? 'AI interviewer' : 'You (transcribed)'}</div>
      <div style={isAI ? S.bubbleAI : S.bubbleUser}>{msg.content}</div>
    </div>
  );
};

const ThinkingDots: React.FC = () => (
  <div style={S.thinkingWrap}>
    <div style={S.bubbleLabel}>AI interviewer</div>
    <div style={S.thinkingRow}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            ...S.thinkingDot,
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
      <span style={S.thinkingText}>AI thinking...</span>
    </div>
  </div>
);

const AudioWaveform: React.FC = () => (
  <div style={S.waveformRow}>
    {[0, 1, 2, 3, 4].map((i) => (
      <div
        key={i}
        style={{
          ...S.waveBar,
          animationDelay: `${i * 0.12}s`,
        }}
      />
    ))}
  </div>
);

const MicButton: React.FC<{ status: MCStatus }> = ({ status }) => {
  const isActive = status === 'LISTENING';
  const isDisabled = status === 'AI_THINKING' || status === 'AI_SPEAKING';
  return (
    <div style={S.micWrap}>
      {isActive && (
        <>
          <div style={{ ...S.ripple, animationDelay: '0s' }} />
          <div style={{ ...S.ripple, animationDelay: '0.4s' }} />
        </>
      )}
      <div
        style={{
          ...S.micBtn,
          backgroundColor: isActive ? '#534AB7' : 'transparent',
          borderColor: isActive ? '#534AB7' : isDisabled ? colors.surface1 : colors.overlay1,
          opacity: isDisabled ? 0.4 : 1,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={isActive ? '#fff' : colors.overlay1} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10a7 7 0 0 0 14 0" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      </div>
    </div>
  );
};

const StatusLabel: React.FC<{ status: MCStatus }> = ({ status }) => {
  const labels: Record<MCStatus, string> = {
    IDLE: 'Tap to start speaking',
    LISTENING: 'Listening... tap to pause',
    AI_THINKING: 'AI is thinking...',
    AI_SPEAKING: 'AI is speaking...',
  };
  const statusColors: Record<MCStatus, string> = {
    IDLE: colors.overlay1,
    LISTENING: '#534AB7',
    AI_THINKING: colors.overlay1,
    AI_SPEAKING: '#534AB7',
  };
  return <div style={{ ...S.statusLabel, color: statusColors[status] }}>{labels[status]}</div>;
};

const TextFallback: React.FC<{
  round: number;
  answer: string;
  onAnswerChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  answers: string[];
}> = ({ round, answer, onAnswerChange, onSubmit, submitting, answers }) => {
  const prompt = PROBE_PROMPTS[round];
  const canSubmit = !submitting && answer.trim().length >= 10;
  return (
    <div style={S.textFallback}>
      <div style={S.questionCard}>
        <div style={S.questionLabel}>Round {round + 1} question</div>
        <div style={S.questionText}>{prompt}</div>
      </div>
      <textarea
        data-testid="modulec-answer-input"
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder="Write your answer here (min 10 chars, recommend 80+ for depth)"
        rows={6}
        disabled={submitting}
        style={S.textarea}
      />
      <div style={S.textMetaRow}>
        <span style={S.charCount}>
          {answer.trim().length} chars {answer.trim().length < 10 && '(min 10)'}
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{ ...S.primaryBtn, ...(canSubmit ? {} : S.btnDisabled) }}
          data-testid="modulec-submit"
        >
          {submitting ? 'Submitting...' : round + 1 >= TOTAL_ROUNDS ? 'Submit final round' : 'Next round'}
        </button>
      </div>
      {answers.length > 0 && (
        <details style={S.historyWrap}>
          <summary style={S.historySummary}>Completed rounds ({answers.length})</summary>
          <ol style={S.historyList}>
            {answers.map((a, i) => (
              <li key={i} style={S.historyItem}>
                <div style={S.historyRound}>R{i + 1} · {ROUND_LABELS[i]}</div>
                <div style={S.historyBody}>{a}</div>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────

const ACCENT = '#534AB7';

const S: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    justifyContent: 'center',
    minHeight: '100%',
    padding: spacing.lg,
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    width: '100%',
    maxWidth: 560,
  },

  // Header
  roundBadge: {
    alignSelf: 'center',
    padding: `${spacing.xs} ${spacing.lg}`,
    backgroundColor: `${ACCENT}22`,
    color: ACCENT,
    borderRadius: radii.full,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    letterSpacing: 0.5,
  },
  headphoneHint: {
    alignSelf: 'center',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: radii.sm,
    fontSize: '11px',
    color: colors.subtext0,
  },

  // Preflight
  preflight: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
    padding: spacing.xl,
    backgroundColor: colors.mantle,
    borderRadius: radii.md,
    border: `1px solid ${colors.surface0}`,
    marginTop: spacing.xl,
  },
  preflightHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    alignItems: 'center' as const,
    textAlign: 'center' as const,
  },
  preflightBadge: {
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: `${ACCENT}22`,
    color: ACCENT,
    borderRadius: radii.full,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    letterSpacing: 0.5,
  },
  preflightTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  preflightSub: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    margin: 0,
    lineHeight: 1.6,
  },
  preflightSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.base,
    borderRadius: radii.sm,
    border: `1px solid ${colors.surface0}`,
  },
  checkRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing.md,
    cursor: 'pointer',
  },
  checkbox: {
    marginTop: 4,
    width: 16,
    height: 16,
    cursor: 'pointer',
    accentColor: ACCENT,
    flexShrink: 0,
  },
  checkLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    marginBottom: 4,
  },
  required: {
    color: '#E38F8F',
    fontSize: '11px',
    fontWeight: fontWeights.medium,
    marginLeft: 4,
  },
  checkHint: {
    fontSize: fontSizes.xs,
    color: colors.overlay1,
    lineHeight: 1.5,
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    padding: `${spacing.sm} ${spacing.lg}`,
    backgroundColor: colors.surface0,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: spacing.xs,
  },
  levelMeter: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 3,
    height: 32,
    padding: `${spacing.xs} 0`,
  },
  levelBar: {
    flex: 1,
    height: '100%',
    borderRadius: 2,
    transition: 'opacity 0.08s linear, background-color 0.2s linear',
  },
  errorBox: {
    padding: spacing.md,
    backgroundColor: 'rgba(227,143,143,0.08)',
    border: '1px solid rgba(227,143,143,0.3)',
    borderRadius: radii.sm,
    color: '#E38F8F',
    fontSize: fontSizes.sm,
    lineHeight: 1.5,
  },
  preflightActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    alignItems: 'center',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: colors.overlay1,
    fontSize: fontSizes.xs,
    cursor: 'pointer',
    fontFamily: 'inherit',
    padding: spacing.xs,
    textDecoration: 'underline',
  },
  heading: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
    textAlign: 'center' as const,
  },
  subheading: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    margin: 0,
    textAlign: 'center' as const,
  },

  // Progress pips
  pipsRow: {
    display: 'flex',
    gap: 4,
    height: 4,
  },
  pip: {
    borderRadius: 2,
    transition: 'all 0.3s ease',
  },

  // Tabs
  tabRow: {
    display: 'flex',
    gap: 0,
    borderBottom: `1px solid ${colors.surface1}`,
  },
  tab: {
    flex: 1,
    padding: `${spacing.sm} 0`,
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: colors.overlay1,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: colors.text,
    borderBottomColor: ACCENT,
  },

  // Chat area
  chatArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    minHeight: 240,
    maxHeight: 380,
    overflowY: 'auto' as const,
    padding: spacing.sm,
    scrollBehavior: 'smooth' as const,
  },
  chatEmpty: {
    textAlign: 'center' as const,
    color: colors.overlay1,
    fontSize: fontSizes.sm,
    padding: spacing.xl,
  },

  // Chat bubbles
  bubbleWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    maxWidth: '85%',
  },
  bubbleLabel: {
    fontSize: '11px',
    color: colors.overlay1,
    marginBottom: 2,
  },
  bubbleAI: {
    padding: `${spacing.md} ${spacing.lg}`,
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    color: colors.text,
    fontSize: fontSizes.md,
    lineHeight: 1.6,
  },
  bubbleUser: {
    padding: `${spacing.md} ${spacing.lg}`,
    backgroundColor: ACCENT,
    borderRadius: '12px',
    color: '#fff',
    fontSize: fontSizes.md,
    lineHeight: 1.6,
  },

  // Thinking dots
  thinkingWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    maxWidth: '85%',
  },
  thinkingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: `${spacing.sm} ${spacing.lg}`,
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
  },
  thinkingDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: colors.overlay1,
    animation: 'mc-dot-bounce 1s ease-in-out infinite',
  },
  thinkingText: {
    fontSize: fontSizes.sm,
    color: colors.overlay1,
    marginLeft: 4,
  },

  // Controls
  controlsArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTop: `1px solid ${colors.surface0}`,
  },

  // Waveform
  waveformRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    height: 28,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: ACCENT,
    animation: 'mc-wave 0.8s ease-in-out infinite',
  },

  // Mic button
  micWrap: {
    position: 'relative' as const,
    width: 72,
    height: 72,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtn: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.3s',
    zIndex: 1,
  },
  ripple: {
    position: 'absolute' as const,
    width: 72,
    height: 72,
    borderRadius: '50%',
    border: `2px solid ${ACCENT}`,
    animation: 'mc-ripple 1.5s ease-out infinite',
    zIndex: 0,
  },

  // Status
  statusLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    textAlign: 'center' as const,
  },
  timerRow: {
    display: 'flex',
    justifyContent: 'center',
  },
  timer: {
    fontFamily: 'monospace',
    fontSize: fontSizes.sm,
    color: colors.overlay1,
  },
  actionRow: {
    display: 'flex',
    gap: spacing.md,
  },
  outlineBtn: {
    padding: `${spacing.sm} ${spacing.lg}`,
    background: 'none',
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.md,
    color: colors.subtext0,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  },

  // Text fallback
  textFallback: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  questionCard: {
    padding: spacing.lg,
    backgroundColor: colors.mantle,
    borderRadius: radii.md,
    border: `1px solid ${colors.surface0}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  questionLabel: {
    fontSize: fontSizes.xs,
    color: colors.overlay1,
    textTransform: 'uppercase' as const,
  },
  questionText: {
    fontSize: fontSizes.md,
    color: colors.text,
    lineHeight: 1.6,
  },
  textarea: {
    width: '100%',
    padding: spacing.md,
    backgroundColor: colors.surface0,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontSize: fontSizes.sm,
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
    lineHeight: 1.6,
  },
  textMetaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  charCount: {
    fontSize: fontSizes.xs,
    color: colors.overlay1,
  },

  // Buttons
  primaryBtn: {
    padding: `${spacing.md} ${spacing.xl}`,
    backgroundColor: ACCENT,
    border: 'none',
    borderRadius: radii.md,
    color: '#fff',
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },

  // History
  historyWrap: { marginTop: spacing.md },
  historySummary: { fontSize: fontSizes.xs, color: colors.subtext0, cursor: 'pointer' },
  historyList: {
    margin: `${spacing.sm} 0 0 0`,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  historyItem: {
    padding: spacing.sm,
    backgroundColor: colors.mantle,
    borderRadius: radii.sm,
    border: `1px solid ${colors.surface0}`,
  },
  historyRound: { fontSize: fontSizes.xs, color: colors.overlay1, marginBottom: spacing.xs },
  historyBody: { fontSize: fontSizes.sm, color: colors.subtext0, lineHeight: 1.5, whiteSpace: 'pre-wrap' as const },

  // Done
  doneCard: {
    padding: spacing.xl,
    backgroundColor: colors.mantle,
    borderRadius: radii.md,
    border: `1px solid ${colors.green}`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.md,
    textAlign: 'center' as const,
  },
  doneIcon: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    backgroundColor: `${colors.green}22`,
    color: colors.green,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
  },
  doneTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.green,
  },
  doneBody: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    lineHeight: 1.6,
    margin: 0,
  },
};
