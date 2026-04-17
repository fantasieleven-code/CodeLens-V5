/**
 * EditorTabs — MB Cursor-mode top tab bar.
 *
 * Pure tab strip: one button per open file, active tab highlighted, click
 * emits onFileSelect. Intentionally separate from FileTree so either side
 * can trigger file switching (FileTree for initial open, Tabs for quick
 * cycling between already-open files — same UX as VS Code / Cursor).
 */

import React from 'react';
import { colors, spacing, fontSizes, fontWeights } from '../../lib/tokens.js';

export interface EditorTab {
  path: string;
}

export interface EditorTabsProps {
  files: EditorTab[];
  activeFilePath: string;
  onFileSelect: (path: string) => void;
}

export const EditorTabs: React.FC<EditorTabsProps> = ({ files, activeFilePath, onFileSelect }) => {
  return (
    <div style={styles.container} data-testid="mb-editor-tabs-container" role="tablist">
      {files.map((f) => {
        const active = f.path === activeFilePath;
        return (
          <button
            key={f.path}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onFileSelect(f.path)}
            style={{
              ...styles.tab,
              ...(active ? styles.tabActive : {}),
            }}
            data-testid={`mb-editor-tab-${f.path}`}
          >
            {basename(f.path)}
          </button>
        );
      })}
    </div>
  );
};

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'stretch',
    backgroundColor: colors.crust,
    borderBottom: `1px solid ${colors.surface0}`,
    gap: 1,
    overflowX: 'auto',
  },
  tab: {
    padding: `${spacing.sm} ${spacing.md}`,
    background: 'transparent',
    border: 'none',
    borderRight: `1px solid ${colors.surface0}`,
    color: colors.overlay1,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.normal,
    fontFamily: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  tabActive: {
    backgroundColor: colors.base,
    color: colors.text,
    fontWeight: fontWeights.medium,
  },
};
