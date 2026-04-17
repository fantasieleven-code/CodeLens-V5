/**
 * DiffOverlay — inline diff preview for MB Cursor-mode AI chat.
 *
 * Shown when the chat panel produces a pending patch; candidate previews old
 * vs new and clicks Accept/Reject. Task 7.1 keeps the renderer dumb (unified
 * line-diff, no Monaco DiffEditor) so it works cleanly in jsdom tests. Task
 * 7.2 AIChatPanel wires the actual socket emission of v5:mb:file_change
 * (source='ai_chat') when Accept is clicked.
 */

import React, { useMemo } from 'react';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../lib/tokens.js';

export interface DiffOverlayProps {
  path: string;
  oldContent: string;
  newContent: string;
  onAccept: () => void;
  onReject: () => void;
}

interface DiffLine {
  kind: 'context' | 'add' | 'remove';
  text: string;
}

export const DiffOverlay: React.FC<DiffOverlayProps> = ({
  path,
  oldContent,
  newContent,
  onAccept,
  onReject,
}) => {
  const lines = useMemo(() => computeLineDiff(oldContent, newContent), [oldContent, newContent]);

  return (
    <div style={styles.container} data-testid="mb-diff-overlay">
      <div style={styles.header}>
        <span style={styles.path}>{path}</span>
        <div style={styles.actions}>
          <button
            type="button"
            onClick={onReject}
            style={{ ...styles.btn, ...styles.rejectBtn }}
            data-testid="mb-diff-reject-btn"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onAccept}
            style={{ ...styles.btn, ...styles.acceptBtn }}
            data-testid="mb-diff-accept-btn"
          >
            Accept
          </button>
        </div>
      </div>
      <pre style={styles.diff}>
        {lines.map((l, i) => (
          <div
            key={i}
            style={{
              ...styles.line,
              ...(l.kind === 'add' ? styles.lineAdd : {}),
              ...(l.kind === 'remove' ? styles.lineRemove : {}),
            }}
          >
            <span style={styles.marker}>
              {l.kind === 'add' ? '+' : l.kind === 'remove' ? '−' : ' '}
            </span>
            <span>{l.text}</span>
          </div>
        ))}
      </pre>
    </div>
  );
};

/**
 * Unified diff via naive longest-common-subsequence — fine for a few hundred
 * lines of candidate code. O(n*m) in lines; not for giant files but MB task
 * files are always <500 lines per the task-generator budget.
 */
function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'context', text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'remove', text: a[i] });
      i += 1;
    } else {
      out.push({ kind: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ kind: 'remove', text: a[i] });
    i += 1;
  }
  while (j < m) {
    out.push({ kind: 'add', text: b[j] });
    j += 1;
  }
  return out;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    backgroundColor: colors.base,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${spacing.sm} ${spacing.md}`,
    backgroundColor: colors.mantle,
    borderBottom: `1px solid ${colors.surface0}`,
  },
  path: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },
  actions: {
    display: 'flex',
    gap: spacing.xs,
  },
  btn: {
    padding: `${spacing.xs} ${spacing.md}`,
    border: 'none',
    borderRadius: radii.sm,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  acceptBtn: {
    backgroundColor: colors.green,
    color: colors.crust,
  },
  rejectBtn: {
    backgroundColor: colors.surface1,
    color: colors.text,
  },
  diff: {
    margin: 0,
    padding: spacing.sm,
    overflow: 'auto',
    fontSize: fontSizes.sm,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    lineHeight: 1.5,
    color: colors.subtext1,
    maxHeight: 480,
  },
  line: {
    display: 'flex',
    gap: spacing.sm,
    padding: `0 ${spacing.xs}`,
  },
  lineAdd: {
    backgroundColor: 'rgba(166, 227, 161, 0.12)',
    color: colors.green,
  },
  lineRemove: {
    backgroundColor: 'rgba(243, 139, 168, 0.12)',
    color: colors.red,
  },
  marker: {
    display: 'inline-block',
    width: '1ch',
    color: colors.overlay1,
  },
};
