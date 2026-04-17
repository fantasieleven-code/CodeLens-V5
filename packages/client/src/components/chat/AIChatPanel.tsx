/**
 * AIChatPanel — MB Cursor-mode AI chat surface.
 *
 * Responsibilities (Task 7.2 scope):
 *   - chat history + prompt input + "@" file-reference selector
 *   - wire v5:mb:chat_generate emit and v5:mb:chat_stream/chat_complete
 *     consumption via the shared getSocket() typed channel
 *   - parse chat_complete's unified-diff string into MultiFileEditor's
 *     pendingDiff shape and surface through onDiffReady so the parent
 *     (Task 7.6 ModuleBPage) can drive the editor overlay
 *   - visibility tracking for Round 2 Part 3 调整 4 — diff shown/responded
 *     ms accounting flows into behavior batches consumers can aggregate
 *     server-side
 *
 * Deliberately not in scope:
 *   - integrating MultiFileEditor (Task 7.6)
 *   - inline completion (Task 7.3)
 *   - standards / audit / planning panels (Task 7.4 / 7.5)
 *   - @functions / @tests selectors (V5.1)
 *
 * Contract departure from the brief: onDiffReady is typed as the parsed
 * object shape instead of the raw string. MultiFileEditor.pendingDiff
 * expects `{path, oldContent, newContent}` and the panel already has to
 * parse for error-surface reasons — passing the parsed object through
 * avoids double-parsing in the parent.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSocket } from '../../lib/socket.js';
import { parseUnifiedDiff, type ParsedDiff } from '../../utils/diff-parser.js';
import {
  startVisibilityTracker,
  type VisibilityTrackerHandle,
} from '../../utils/chat-visibility-tracker.js';
import type { UseBehaviorTrackerReturn } from '../../hooks/useBehaviorTracker.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../lib/tokens.js';

export type ChatState = 'idle' | 'generating' | 'diff_pending' | 'error';

export interface ChatFile {
  path: string;
  content: string;
  language: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

export interface AIChatPanelProps {
  sessionId: string;
  files: ChatFile[];
  onDiffReady: (diff: ParsedDiff) => void;
  onChatStateChange?: (state: ChatState) => void;
  disabled?: boolean;
  /**
   * Optional behavior tracker so the parent (Task 7.6 ModuleBPage) can share
   * a single module-scoped buffer across panels. When omitted, visibility
   * events are silently dropped — useful for unit tests and earlier tasks
   * that don't yet wire behavior flushing.
   */
  behaviorTracker?: Pick<UseBehaviorTrackerReturn, 'track'>;
}

export const AIChatPanel: React.FC<AIChatPanelProps> = ({
  sessionId,
  files,
  onDiffReady,
  onChatStateChange,
  disabled = false,
  behaviorTracker,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [chatState, setChatStateLocal] = useState<ChatState>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [atSelectorOpen, setAtSelectorOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const visibilityRef = useRef<VisibilityTrackerHandle | null>(null);
  const streamingIndexRef = useRef<number | null>(null);

  const setChatState = useCallback(
    (next: ChatState) => {
      setChatStateLocal(next);
      onChatStateChange?.(next);
    },
    [onChatStateChange],
  );

  // ─── Socket subscriptions ───
  useEffect(() => {
    const socket = getSocket();

    const onStream = ({ content, done }: { content: string; done: boolean }) => {
      if (!content && !done) return;
      setMessages((prev) => {
        const next = [...prev];
        const idx = streamingIndexRef.current;
        if (idx !== null && next[idx]) {
          next[idx] = {
            ...next[idx],
            content: next[idx].content + content,
            streaming: !done,
          };
        }
        return next;
      });
    };

    const onComplete = ({ diff }: { diff: string }) => {
      // Close the streaming message.
      setMessages((prev) => {
        const next = [...prev];
        const idx = streamingIndexRef.current;
        if (idx !== null && next[idx]) {
          next[idx] = { ...next[idx], streaming: false };
        }
        return next;
      });

      const parsed = parseUnifiedDiff(diff, files);
      if (!parsed.ok) {
        setErrorText(`Diff parse failed: ${parsed.error}`);
        setChatState('error');
        streamingIndexRef.current = null;
        return;
      }

      visibilityRef.current = startVisibilityTracker();
      onDiffReady(parsed.diff);
      setChatState('diff_pending');
      streamingIndexRef.current = null;
    };

    socket.on('v5:mb:chat_stream', onStream);
    socket.on('v5:mb:chat_complete', onComplete);
    return () => {
      socket.off('v5:mb:chat_stream', onStream);
      socket.off('v5:mb:chat_complete', onComplete);
    };
  }, [files, onDiffReady, setChatState]);

  // ─── External disabled→enabled flip signals diff was accepted/rejected by parent ───
  // Parent sets disabled=true while MultiFileEditor.pendingDiff is showing,
  // then flips back to false once the candidate accepts or rejects in the
  // DiffOverlay. That trailing edge is our signal to finish visibility
  // tracking and return to idle.
  const prevDisabledRef = useRef(disabled);
  useEffect(() => {
    const wasDisabled = prevDisabledRef.current;
    prevDisabledRef.current = disabled;
    if (wasDisabled && !disabled && chatState === 'diff_pending') {
      const handle = visibilityRef.current;
      if (handle) {
        try {
          const result = handle.responded();
          behaviorTracker?.track('diff_responded', {
            shownAt: result.shownAt,
            respondedAt: result.respondedAt,
            documentVisibleMs: result.documentVisibleMs,
          });
        } catch {
          // responded() throws if called twice; safe to ignore.
        }
        visibilityRef.current = null;
      }
      setChatState('idle');
    }
  }, [disabled, chatState, behaviorTracker, setChatState]);

  // ─── Auto-scroll history to bottom on new messages ───
  useEffect(() => {
    const el = historyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ─── Send prompt ───
  const canSend =
    !disabled && chatState !== 'generating' && chatState !== 'diff_pending' && prompt.trim().length > 0;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    const filesContext = buildFilesContext(files);
    const userMsg: ChatMessage = { role: 'user', content: prompt };
    const assistantMsg: ChatMessage = { role: 'assistant', content: '', streaming: true };
    setMessages((prev) => {
      const next = [...prev, userMsg, assistantMsg];
      streamingIndexRef.current = next.length - 1;
      return next;
    });
    setErrorText(null);
    setChatState('generating');
    getSocket().emit('v5:mb:chat_generate', { sessionId, prompt, filesContext });
    behaviorTracker?.track('chat_prompt_sent', { promptLength: prompt.length });
    setPrompt('');
  }, [canSend, files, prompt, sessionId, behaviorTracker, setChatState]);

  // ─── @ selector open/close wiring ───
  const handlePromptChange = useCallback((value: string) => {
    setPrompt(value);
    // Open the picker when the last non-whitespace token is a bare "@".
    const tail = value.slice(Math.max(0, value.length - 40));
    setAtSelectorOpen(/(^|\s)@$/.test(tail));
  }, []);

  const insertFileReference = useCallback(
    (file: ChatFile) => {
      setPrompt((prev) => {
        // Replace the trailing "@" with a fenced reference block.
        const trimmedAt = prev.replace(/@$/, '');
        const fence = '```';
        return `${trimmedAt}${fence}${file.language} ${file.path}\n${file.content}\n${fence}\n`;
      });
      setAtSelectorOpen(false);
      behaviorTracker?.track('chat_file_referenced', { path: file.path });
      textareaRef.current?.focus();
    },
    [behaviorTracker],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      } else if (e.key === 'Escape' && atSelectorOpen) {
        setAtSelectorOpen(false);
      }
    },
    [handleSend, atSelectorOpen],
  );

  // ─── Derived ───
  const streamingActive = chatState === 'generating';
  const inputDisabled = disabled || chatState === 'generating' || chatState === 'diff_pending';
  const atFiles = useMemo(() => files, [files]);

  return (
    <div style={styles.root} data-testid="mb-chat-root">
      <div style={styles.history} ref={historyRef} data-testid="mb-chat-history">
        {messages.length === 0 ? (
          <div style={styles.empty}>Ask the assistant for changes — use @ to reference a file.</div>
        ) : null}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              ...styles.message,
              ...(m.role === 'user' ? styles.userMessage : styles.assistantMessage),
            }}
            data-testid={`mb-chat-message-${i}`}
            data-role={m.role}
          >
            <span style={styles.role}>{m.role === 'user' ? 'You' : 'Assistant'}</span>
            <pre style={styles.content}>{m.content || (m.streaming ? '…' : '')}</pre>
          </div>
        ))}
        {streamingActive ? (
          <div style={styles.streamIndicator} data-testid="mb-chat-stream-active">
            Generating…
          </div>
        ) : null}
      </div>

      {errorText ? (
        <div style={styles.error} data-testid="mb-chat-error">
          {errorText}
        </div>
      ) : null}

      <div style={styles.inputWrap}>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => handlePromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={inputDisabled}
          placeholder={inputDisabled ? 'Resolve the pending diff to continue' : 'Ask for a change, @ to reference a file, ⌘/Ctrl+Enter to send'}
          style={styles.input}
          data-testid="mb-chat-input"
          rows={3}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          style={{
            ...styles.sendBtn,
            ...(canSend ? {} : styles.sendBtnDisabled),
          }}
          data-testid="mb-chat-send"
        >
          Send
        </button>

        {atSelectorOpen ? (
          <div style={styles.atPopover} data-testid="mb-at-selector">
            <div style={styles.atHeader}>@files</div>
            <div style={styles.atList} data-testid="mb-at-files-list">
              {atFiles.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => insertFileReference(f)}
                  style={styles.atItem}
                  data-testid={`mb-at-file-item-${f.path}`}
                >
                  {f.path}
                </button>
              ))}
            </div>
            {/*
              TODO (V5.1): @functions (parse current file's top-level defs)
              and @tests (walk tests/ directory). V5.0 @files-only scope per
              frontend-agent-tasks.md Task 7.2.
            */}
          </div>
        ) : null}
      </div>
    </div>
  );
};

function buildFilesContext(files: ChatFile[]): string {
  // Compact representation; backend appends this under a `Files context:` system line.
  return files
    .map((f) => `# ${f.path}\n${f.content}`)
    .join('\n\n---\n\n');
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 320,
    backgroundColor: colors.mantle,
    borderLeft: `1px solid ${colors.surface0}`,
  },
  history: {
    flex: 1,
    overflowY: 'auto',
    padding: spacing.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  empty: {
    color: colors.overlay1,
    fontSize: fontSizes.sm,
    padding: spacing.md,
    textAlign: 'center',
  },
  message: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: spacing.sm,
    borderRadius: radii.sm,
    border: `1px solid ${colors.surface0}`,
  },
  userMessage: {
    backgroundColor: colors.base,
    alignSelf: 'flex-end',
    maxWidth: '88%',
  },
  assistantMessage: {
    backgroundColor: colors.crust,
    alignSelf: 'flex-start',
    maxWidth: '88%',
  },
  role: {
    fontSize: fontSizes.xs,
    color: colors.overlay1,
    fontWeight: fontWeights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    margin: 0,
    fontSize: fontSizes.sm,
    color: colors.subtext1,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  streamIndicator: {
    fontSize: fontSizes.xs,
    color: colors.mauve,
    alignSelf: 'center',
    padding: spacing.xs,
  },
  error: {
    padding: `${spacing.sm} ${spacing.md}`,
    backgroundColor: 'rgba(243, 139, 168, 0.12)',
    color: colors.red,
    fontSize: fontSizes.sm,
    borderTop: `1px solid ${colors.surface0}`,
  },
  inputWrap: {
    position: 'relative',
    display: 'flex',
    gap: spacing.sm,
    padding: spacing.sm,
    borderTop: `1px solid ${colors.surface0}`,
    backgroundColor: colors.crust,
  },
  input: {
    flex: 1,
    minHeight: 60,
    resize: 'vertical',
    backgroundColor: colors.base,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.sm,
    padding: spacing.sm,
    color: colors.text,
    fontSize: fontSizes.sm,
    fontFamily: 'inherit',
  },
  sendBtn: {
    alignSelf: 'stretch',
    padding: `${spacing.sm} ${spacing.lg}`,
    backgroundColor: colors.mauve,
    border: 'none',
    borderRadius: radii.sm,
    color: colors.crust,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  sendBtnDisabled: {
    backgroundColor: colors.surface1,
    color: colors.overlay1,
    cursor: 'not-allowed',
  },
  atPopover: {
    position: 'absolute',
    bottom: 'calc(100% + 4px)',
    left: spacing.sm,
    right: spacing.sm,
    maxHeight: 220,
    overflowY: 'auto',
    backgroundColor: colors.base,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
    zIndex: 2,
  },
  atHeader: {
    padding: `${spacing.xs} ${spacing.sm}`,
    fontSize: fontSizes.xs,
    color: colors.overlay1,
    fontWeight: fontWeights.semibold,
    borderBottom: `1px solid ${colors.surface0}`,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  atList: {
    display: 'flex',
    flexDirection: 'column',
  },
  atItem: {
    textAlign: 'left',
    padding: `${spacing.xs} ${spacing.sm}`,
    background: 'transparent',
    border: 'none',
    color: colors.subtext0,
    fontSize: fontSizes.sm,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    cursor: 'pointer',
  },
};
