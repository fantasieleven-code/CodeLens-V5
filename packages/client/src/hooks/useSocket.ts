// TODO V5: Change all "v4:" event prefixes to "v5:" (8 occurrences)
// TODO V5: Update event payload types to V5 structures (from @codelens-v5/shared)
// TODO V5: Keep connection management and reconnection logic unchanged
// TODO V5: Add new V5 events for Cursor mode:
//   - v5:mb:chat_generate, v5:mb:completion_request, v5:mb:diff_apply
// Original V4 path: packages/client/src/hooks/useSocket.ts
//

import { useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket, type TypedSocket } from '../lib/socket.js';
import { useSessionStore } from '../stores/session.store.js';
import { useCheckpointStore } from '../stores/checkpoint.store.js';
import { useEditorStore } from '../stores/editor.store.js';
import { useAIStore } from '../stores/ai.store.js';
import { useVoiceStore } from '../stores/voice.store.js';
import { useModuleStore } from '../stores/module.store.js';
import { useIssueStore } from '../stores/issue.store.js';
import { useBaselineStore } from '../stores/baseline.store.js';
import type { BaselineQuestion } from '../stores/baseline.store.js';

export function useSocket() {
  const socketRef = useRef<TypedSocket | null>(null);
  const token = useSessionStore((s) => s.token);
  const setWsStatus = useSessionStore((s) => s.setWsStatus);
  const setTimer = useSessionStore((s) => s.setTimer);
  const setSessionStatus = useSessionStore((s) => s.setSessionStatus);
  const setWarning = useSessionStore((s) => s.setWarning);

  const setCheckpoints = useCheckpointStore((s) => s.setCheckpoints);
  const setCurrent = useCheckpointStore((s) => s.setCurrent);
  const setTransition = useCheckpointStore((s) => s.setTransition);
  const updateCheckpoint = useCheckpointStore((s) => s.updateCheckpoint);

  const setFiles = useEditorStore((s) => s.setFiles);
  const externalFileChange = useEditorStore((s) => s.externalFileChange);
  const markSaved = useEditorStore((s) => s.markSaved);
  const resolveConflict = useEditorStore((s) => s.resolveConflict);

  const appendStreamChunk = useAIStore((s) => s.appendStreamChunk);
  const finalizeStream = useAIStore((s) => s.finalizeStream);
  const setError = useAIStore((s) => s.setError);

  useEffect(() => {
    if (!token) return;

    setWsStatus('connecting');
    const socket = connectSocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      setWsStatus('connected');
    });

    socket.on('disconnect', () => {
      setWsStatus('disconnected');
    });

    socket.io.on('reconnect_attempt', () => {
      setWsStatus('reconnecting');
    });

    socket.io.on('reconnect', () => {
      setWsStatus('connected');
      setWarning('Connection restored — your work has been synced');
    });

    // Timer sync
    socket.on('timer:sync', (data) => {
      setTimer(data);
      setCheckpoints(data.checkpoints);
      setCurrent(data.currentCheckpoint);
    });

    socket.on('timer:warning', (data) => {
      setWarning(data.message);
    });

    socket.on('session:expired', () => {
      setSessionStatus('EXPIRED');
      setWarning('Interview time has expired');
    });

    // Checkpoint events
    socket.on('checkpoint:changed', (data) => {
      updateCheckpoint(data);
    });

    socket.on('checkpoint:transition', (data) => {
      setTransition(data);
    });

    // File events
    socket.on('file:init', (data) => {
      setFiles(data.files);
    });

    socket.on('file:saved', (data) => {
      markSaved(data.path, data.version);
    });

    socket.on('file:external_change', (data) => {
      externalFileChange(data);
    });

    // AR-2: Handle version conflict — server wins, update local state
    socket.on('file:conflict', (data) => {
      resolveConflict(data.path, data.serverVersion, data.serverContent);
    });

    // AI events
    socket.on('ai:chunk', (data) => {
      const channel = data.channel || 'assistant';
      if (data.done) {
        // M2-1: Emit AI response signal with accumulated length before finalizing
        const streamLen = useAIStore.getState().channels[channel]?.streamingContent?.length || 0;
        finalizeStream(channel);
        // Signal emitted via vanilla Zustand access — no React re-render
        window.dispatchEvent(new CustomEvent('ai:response-signal', {
          detail: { channel, responseLength: streamLen },
        }));
      } else {
        appendStreamChunk(channel, data.content);
      }
    });

    socket.on('ai:error', (data) => {
      setError(data.message);
    });

    // Checkpoint overtime — CP time expired, UI can show notification
    socket.on('checkpoint:overtime', (data) => {
      setWarning(`Checkpoint ${data.index} time is up`);
    });

    // Voice subtitles — feed into VoiceStore for real-time display
    socket.on('voice:subtitle', (data) => {
      if (data.definite) {
        useVoiceStore.getState().addSubtitle(data.speaker, data.text);
      }
    });

    // Voice status updates
    socket.on('voice:status', (data) => {
      useVoiceStore.getState().setState(data.state);
      useVoiceStore.getState().setMode(data.mode);
    });

    // V3: Module transition events
    socket.on('module:transition' as any, (data: {
      from: string | null;
      to: string;
      tier?: string;
      modules?: Array<{ id: string; status: string; startedAt: string | null; completedAt: string | null }>;
    }) => {
      const moduleStore = useModuleStore.getState();
      if (data.tier && data.modules) {
        moduleStore.hydrateFromServer({
          tier: data.tier as any,
          modules: data.modules as any,
          currentModuleId: data.to as any,
        });
      } else {
        if (data.from) moduleStore.completeModule(data.from as any);
        moduleStore.startModule(data.to as any);
      }
    });

    // V3: All tests passed — auto-mark Module A issues as done
    socket.on('test:all-passed' as any, () => {
      const issueStore = useIssueStore.getState();
      const issues = issueStore.issues;
      for (const issue of issues) {
        if (issue.status !== 'done') {
          issueStore.updateStatus(issue.id, 'done');
        }
      }
      const total = issues.length;
      useModuleStore.getState().setIssueProgress(total, total);
    });

    // V3: Issue status updates (Module A)
    socket.on('issue:status-update' as any, (data: {
      issues?: Array<{ id: string; priority: string; title: string; description: string; reproSteps?: string; status: string }>;
      issueId?: string;
      newStatus?: string;
    }) => {
      const issueStore = useIssueStore.getState();
      if (data.issues) {
        issueStore.setIssues(data.issues as any);
      }
      if (data.issueId && data.newStatus) {
        issueStore.updateStatus(data.issueId, data.newStatus as any);
      }
      // Update module store issue progress
      const issues = useIssueStore.getState().issues;
      const completed = issues.filter((i) => i.status === 'done').length;
      useModuleStore.getState().setIssueProgress(completed, issues.length);
    });

    // V3: Requirement init (Module B)
    socket.on('requirement:init' as any, (data: { title: string; instructions: string }) => {
      useModuleStore.getState().setRequirement({
        title: data.title,
        coreRequirement: data.instructions,
      });
    });

    // V3: File injection (Module B scaffold files)
    socket.on('file:inject' as any, (data: { files: Array<{ path: string; content: string }> }) => {
      const editorStore = useEditorStore.getState();
      for (const f of data.files) {
        editorStore.addFile(f.path, f.content);
      }
    });

    // V3: Micro-verify trigger
    socket.on('micro-verify:trigger' as any, (data: unknown) => {
      window.dispatchEvent(new CustomEvent('micro-verify:trigger', { detail: data }));
    });

    // V3: Self-assessment trigger
    socket.on('self-assess:trigger' as any, (data: unknown) => {
      window.dispatchEvent(new CustomEvent('self-assess:trigger', { detail: data }));
    });

    // V3: Baseline (Phase 0) events
    // NOTE: baseline:trigger may arrive BEFORE IDELayout/BaselineOverlay mounts (race condition).
    // Write directly into Zustand store so BaselineOverlay can hydrate on mount.
    socket.on('baseline:trigger' as any, (data: unknown) => {
      const detail = data as { questions?: unknown[] } | null;
      if (detail?.questions && detail.questions.length > 0) {
        useBaselineStore.getState().load(detail.questions as BaselineQuestion[]);
        useBaselineStore.getState().setPending(true);
      }
      window.dispatchEvent(new CustomEvent('baseline:trigger', { detail: data }));
    });
    socket.on('baseline:complete' as any, () => {
      window.dispatchEvent(new CustomEvent('baseline:complete'));
    });

    // V3: Preview panel update (frontend template esbuild output)
    socket.on('preview:update' as any, (data: { html: string; status: string }) => {
      window.dispatchEvent(new CustomEvent('preview:update', { detail: data }));
    });

    // Session status — handle degraded flag + schemaVersion
    socket.on('session:status', (data) => {
      setSessionStatus(data.status);
      if ('degraded' in data && (data as Record<string, unknown>).degraded) {
        useSessionStore.getState().setDegraded(true);
      }
      if ('schemaVersion' in data) {
        useSessionStore.getState().setSchemaVersion((data as Record<string, unknown>).schemaVersion as number);
      }
      // V3: Hydrate tier from initial session:status (before session:start)
      const tierFromStatus = (data as Record<string, unknown>).tier as string | undefined;
      if (tierFromStatus && useModuleStore.getState().modules.length === 0) {
        useModuleStore.getState().initModules(tierFromStatus as any);
      }
    });

    // Schema version (sent on connection, separate from status to avoid overriding sessionStatus)
    socket.on('session:schema' as any, (data: { schemaVersion: number }) => {
      useSessionStore.getState().setSchemaVersion(data.schemaVersion);
    });

    // Reconnect state — AR-8: full state recovery from server bundle
    socket.on('reconnect:state', (data) => {
      // Hydrate files without triggering save events
      useEditorStore.getState().hydrateFiles(data.files);
      // Hydrate checkpoint state
      useCheckpointStore.getState().hydrateFromServer(data.currentCheckpoint);
      setSessionStatus(data.sessionStatus);

      // AR-8: Restore timer state if available
      if (data.timer) {
        setTimer(data.timer);
        setCheckpoints(data.timer.checkpoints);
      }

      // AR-8: Restore degraded mode
      if (data.degraded) {
        useSessionStore.getState().setDegraded(true);
      }

      // V3: Restore schemaVersion + module state
      if ((data as any).schemaVersion) {
        useSessionStore.getState().setSchemaVersion((data as any).schemaVersion);
      }
      if ((data as any).v3Modules) {
        useModuleStore.getState().hydrateFromServer({
          tier: (data as any).v3Tier || 'quick',
          modules: (data as any).v3Modules,
          currentModuleId: (data as any).v3Modules.find((m: any) => m.status === 'active')?.id || null,
        });
      }

      // AR-8: Restore AI conversation history
      if (data.aiHistory) {
        const aiStore = useAIStore.getState();
        for (const msg of data.aiHistory.interviewer) {
          aiStore.addMessage('interviewer', { role: msg.role, content: msg.content });
        }
        for (const msg of data.aiHistory.assistant) {
          aiStore.addMessage('assistant', { role: msg.role, content: msg.content });
        }
      }

      // PTY buffer replay — dispatch to Terminal component via custom window event
      if (data.ptyBuffer) {
        window.dispatchEvent(new CustomEvent('pty:reconnect', { detail: data.ptyBuffer }));
      }
    });

    return () => {
      disconnectSocket();
      socketRef.current = null;
    };
  }, [token]);

  return socketRef;
}
