/**
 * CursorModeLayout — MB Stage 2 three-pane shell.
 *
 * Task 7.6 support component per frontend-agent-tasks.md Section 7.6 L770
 * (主布局: 编辑器 · AI Chat · 终端) + design-reference-full.md Section 15 Stage 2
 * 三流内循环 (chat / inline / test).
 *
 * Layout:
 *   ┌────────────────────────────┬─────────────────┐
 *   │     MultiFileEditor        │                 │
 *   │  (tabs + tree + Monaco)    │   AIChatPanel   │
 *   │                            │  (chat history  │
 *   ├────────────────────────────┤  + input)       │
 *   │     MBTerminalPanel        │                 │
 *   │    (pytest output)         │                 │
 *   └────────────────────────────┴─────────────────┘
 *
 *   Horizontal PanelGroup (editor-stack | chat) with a vertical PanelGroup
 *   nesting (editor / terminal) on the left. All three panels are
 *   resizable via `react-resizable-panels` drag handles.
 *
 * State ownership:
 *   - files state lives in the parent (ModuleBPage) so it can emit
 *     `v5:mb:file_change` and persist into MBModuleSpecific.finalFiles on
 *     stage transition. We forward `onFileChange` verbatim.
 *   - activeFilePath is layout-local — a UI concern, not a submission one.
 *   - pendingDiff is layout-local and bridges AIChatPanel.onDiffReady →
 *     MultiFileEditor.pendingDiff. Parent doesn't care which file has a
 *     pending diff, only the final accepted content (via onFileChange).
 *
 * Inline completion registration:
 *   The InlineCompletionProvider needs the monaco instance, which is only
 *   available after @monaco-editor/react loads its worker. We use
 *   `useMonaco()` which returns `null` until ready; InlineCompletionProvider
 *   only mounts once the instance resolves. Because MultiFileEditor mounts
 *   Monaco eagerly, the gap is < 1 frame in practice.
 *
 * Readonly while diff is pending:
 *   MultiFileEditor enters readOnly so the candidate can't edit "around" a
 *   pending AI diff — accept/reject is a single decision point. The inline
 *   completion provider is also disabled in this state (diff and inline
 *   completion can't coexist; the candidate has to resolve the diff first).
 *
 * Not in scope:
 *   - Document visibility listener (ModuleBPage wires `visibilitychange` →
 *     `v5:mb:visibility_change` once at the module level).
 *   - File-tree drag-and-drop / creating new files (V5.1).
 *   - Split-editor / side-by-side diff view (V5.1).
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useMonaco } from '@monaco-editor/react';
import { MultiFileEditor, type MultiFileEditorFile } from '../editors/MultiFileEditor.js';
import { InlineCompletionProvider } from '../editors/InlineCompletionProvider.js';
import { AIChatPanel } from '../chat/AIChatPanel.js';
import { MBTerminalPanel } from './MBTerminalPanel.js';
import type { ParsedDiff } from '../../utils/diff-parser.js';
import type { UseBehaviorTrackerReturn } from '../../hooks/useBehaviorTracker.js';
import type { getSocket } from '../../lib/socket.js';
import { colors } from '../../lib/tokens.js';

export interface CursorModeLayoutProps {
  sessionId: string;
  files: MultiFileEditorFile[];
  onFileChange: (path: string, content: string) => void;
  disabled?: boolean;
  behaviorTracker?: Pick<UseBehaviorTrackerReturn, 'track'>;
  /** Injectable socket for tests (defaults to getSocket() inside children). */
  socket?: ReturnType<typeof getSocket>;
}

export const CursorModeLayout: React.FC<CursorModeLayoutProps> = ({
  sessionId,
  files,
  onFileChange,
  disabled = false,
  behaviorTracker,
  socket,
}) => {
  const firstPath = files[0]?.path ?? '';
  const [activeFilePath, setActiveFilePath] = useState(firstPath);
  const [pendingDiff, setPendingDiff] = useState<ParsedDiff | null>(null);

  const monaco = useMonaco();

  const languageIds = useMemo(
    () => Array.from(new Set(files.map((f) => f.language))),
    [files],
  );

  const handleFileSelect = useCallback((path: string) => {
    setActiveFilePath(path);
  }, []);

  const handleDiffReady = useCallback((diff: ParsedDiff) => {
    setPendingDiff(diff);
    setActiveFilePath(diff.path);
  }, []);

  const handleAcceptDiff = useCallback(() => {
    if (!pendingDiff) return;
    onFileChange(pendingDiff.path, pendingDiff.newContent);
    setPendingDiff(null);
  }, [pendingDiff, onFileChange]);

  const handleRejectDiff = useCallback(() => {
    setPendingDiff(null);
  }, []);

  const getCurrentFilePath = useCallback(() => activeFilePath, [activeFilePath]);

  const editorReadOnly = disabled || pendingDiff !== null;
  const inlineCompletionEnabled = !editorReadOnly;

  return (
    <div style={styles.root} data-testid="mb-cursor-layout">
      {monaco && inlineCompletionEnabled ? (
        <InlineCompletionProvider
          sessionId={sessionId}
          monacoInstance={monaco}
          languageIds={languageIds}
          getCurrentFilePath={getCurrentFilePath}
          enabled={inlineCompletionEnabled}
          behaviorTracker={behaviorTracker}
          socket={socket}
        />
      ) : null}

      <Group orientation="horizontal" style={styles.panelGroup}>
        <Panel id="mb-main" defaultSize={62} minSize={30} data-testid="mb-layout-main-panel">
          <Group orientation="vertical" style={styles.panelGroup}>
            <Panel
              id="mb-editor"
              defaultSize={68}
              minSize={30}
              data-testid="mb-layout-editor-panel"
            >
              <div style={styles.paneFill}>
                <MultiFileEditor
                  files={files}
                  activeFilePath={activeFilePath}
                  onFileSelect={handleFileSelect}
                  onFileChange={onFileChange}
                  readOnly={editorReadOnly}
                  pendingDiff={pendingDiff ?? undefined}
                  onAcceptDiff={handleAcceptDiff}
                  onRejectDiff={handleRejectDiff}
                />
              </div>
            </Panel>
            <Separator style={styles.hResize} data-testid="mb-layout-resize-vert" />
            <Panel
              id="mb-terminal"
              defaultSize={32}
              minSize={15}
              data-testid="mb-layout-terminal-panel"
            >
              <div style={styles.paneFill}>
                <MBTerminalPanel
                  sessionId={sessionId}
                  disabled={disabled}
                  socket={socket}
                  behaviorTracker={behaviorTracker}
                />
              </div>
            </Panel>
          </Group>
        </Panel>
        <Separator style={styles.vResize} data-testid="mb-layout-resize-horz" />
        <Panel id="mb-chat" defaultSize={38} minSize={20} data-testid="mb-layout-chat-panel">
          <div style={styles.paneFill}>
            <AIChatPanel
              sessionId={sessionId}
              files={files}
              onDiffReady={handleDiffReady}
              disabled={disabled || pendingDiff !== null}
              behaviorTracker={behaviorTracker}
            />
          </div>
        </Panel>
      </Group>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    backgroundColor: colors.base,
  },
  panelGroup: {
    flex: 1,
    minHeight: 0,
  },
  paneFill: {
    height: '100%',
    width: '100%',
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  vResize: {
    width: 4,
    backgroundColor: colors.surface0,
    cursor: 'col-resize',
  },
  hResize: {
    height: 4,
    backgroundColor: colors.surface0,
    cursor: 'row-resize',
  },
};
