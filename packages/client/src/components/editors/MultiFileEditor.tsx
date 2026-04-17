/**
 * MultiFileEditor — MB Cursor-mode multi-file Monaco wrapper.
 *
 * Pure-UI component. Parent owns all state (files, activeFilePath, diffs,
 * inline completions); MultiFileEditor just renders and forwards user input.
 * Socket emission (v5:mb:file_change / chat_generate / completion_*) lives
 * in Task 7.2/7.3/7.6 consumers so this component stays testable in jsdom
 * without a live WebSocket.
 *
 * Per-file model state (cursor, selection, undo stack) is preserved across
 * tab switches via @monaco-editor/react's built-in path→model cache:
 * passing a unique `path` prop makes the library create and keep a dedicated
 * ITextModel per file, so switching activeFilePath swaps models instead of
 * re-creating the editor.
 *
 * inlineCompletion here is a preview chip only — the real Monaco
 * registerInlineCompletionsProvider integration is Task 7.3 scope.
 */

import React, { useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { FileTree } from './FileTree.js';
import { EditorTabs } from './EditorTabs.js';
import { DiffOverlay } from './DiffOverlay.js';
import { colors, spacing, fontSizes, radii } from '../../lib/tokens.js';

export interface MultiFileEditorFile {
  path: string;
  content: string;
  language: string;
}

export interface MultiFileEditorProps {
  files: MultiFileEditorFile[];
  activeFilePath: string;
  readOnly?: boolean;
  onFileChange: (path: string, content: string) => void;
  onFileSelect: (path: string) => void;
  onCursorChange?: (path: string, line: number, column: number) => void;
  pendingDiff?: { path: string; oldContent: string; newContent: string };
  onAcceptDiff?: () => void;
  onRejectDiff?: () => void;
  inlineCompletion?: { line: number; column: number; text: string };
  onAcceptCompletion?: () => void;
  onRejectCompletion?: () => void;
}

export const MultiFileEditor: React.FC<MultiFileEditorProps> = ({
  files,
  activeFilePath,
  readOnly = false,
  onFileChange,
  onFileSelect,
  onCursorChange,
  pendingDiff,
  onAcceptDiff,
  onRejectDiff,
  inlineCompletion,
  onAcceptCompletion,
  onRejectCompletion,
}) => {
  const activeFile = files.find((f) => f.path === activeFilePath) ?? files[0];

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!activeFile) return;
      onFileChange(activeFile.path, value ?? '');
    },
    [activeFile, onFileChange],
  );

  const handleMount: OnMount = useCallback(
    (editor) => {
      if (!onCursorChange || !activeFile) return;
      editor.onDidChangeCursorPosition((e) => {
        onCursorChange(activeFile.path, e.position.lineNumber, e.position.column);
      });
    },
    [activeFile, onCursorChange],
  );

  return (
    <div style={styles.root} data-testid="mb-editor-root">
      <FileTree files={files} activeFilePath={activeFilePath} onFileSelect={onFileSelect} />
      <div style={styles.main}>
        <EditorTabs files={files} activeFilePath={activeFilePath} onFileSelect={onFileSelect} />
        <div style={styles.body}>
          {pendingDiff ? (
            <DiffOverlay
              path={pendingDiff.path}
              oldContent={pendingDiff.oldContent}
              newContent={pendingDiff.newContent}
              onAccept={onAcceptDiff ?? noop}
              onReject={onRejectDiff ?? noop}
            />
          ) : activeFile ? (
            <div
              style={styles.editorWrap}
              data-testid={`mb-editor-file-${extensionOf(activeFile.path)}`}
            >
              <Editor
                path={activeFile.path}
                value={activeFile.content}
                language={activeFile.language}
                theme="vs-dark"
                onChange={handleEditorChange}
                onMount={handleMount}
                options={{
                  readOnly,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  wordWrap: 'on',
                  tabSize: 2,
                  padding: { top: 8 },
                }}
                height="100%"
              />
            </div>
          ) : (
            <div style={styles.empty}>No files</div>
          )}

          {inlineCompletion && !pendingDiff ? (
            <InlineCompletionHint
              line={inlineCompletion.line}
              column={inlineCompletion.column}
              text={inlineCompletion.text}
              onAccept={onAcceptCompletion}
              onReject={onRejectCompletion}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

const InlineCompletionHint: React.FC<{
  line: number;
  column: number;
  text: string;
  onAccept?: () => void;
  onReject?: () => void;
}> = ({ line, column, text, onAccept, onReject }) => (
  <div style={styles.inlineHint} data-testid="mb-inline-completion-hint">
    <span style={styles.inlinePos}>
      L{line}:{column}
    </span>
    <span style={styles.inlineText}>{text}</span>
    <div style={styles.inlineActions}>
      <button
        type="button"
        onClick={onReject}
        style={styles.inlineBtn}
        data-testid="mb-inline-completion-reject"
      >
        Esc
      </button>
      <button
        type="button"
        onClick={onAccept}
        style={{ ...styles.inlineBtn, ...styles.inlineAcceptBtn }}
        data-testid="mb-inline-completion-accept"
      >
        Tab
      </button>
    </div>
  </div>
);

function noop(): void {}

function extensionOf(path: string): string {
  const idx = path.lastIndexOf('.');
  if (idx < 0) return 'plain';
  return path.slice(idx + 1).toLowerCase();
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100%',
    minHeight: 480,
    backgroundColor: colors.base,
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
  },
  body: {
    position: 'relative',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  editorWrap: {
    flex: 1,
    minHeight: 0,
  },
  empty: {
    padding: spacing.lg,
    color: colors.overlay1,
    fontSize: fontSizes.sm,
  },
  inlineHint: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    maxWidth: 320,
    fontSize: fontSizes.xs,
    color: colors.subtext0,
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
  },
  inlinePos: {
    color: colors.overlay1,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },
  inlineText: {
    color: colors.overlay2,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
  inlineActions: {
    display: 'flex',
    gap: spacing.xs,
  },
  inlineBtn: {
    padding: `2px ${spacing.xs}`,
    background: 'transparent',
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    color: colors.subtext0,
    fontSize: fontSizes.xs,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  inlineAcceptBtn: {
    backgroundColor: colors.surface0,
    color: colors.text,
  },
};
