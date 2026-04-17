/**
 * FileTree — MB Cursor-mode left sidebar file list.
 *
 * Flat list (no nested folders) — Task 7.1 scope only needs the 3-5 task
 * files MB session ships with. Active file is highlighted; click emits
 * onFileSelect. Tree/folder grouping is a later Task 7.x concern if needed.
 */

import React from 'react';
import { colors, spacing, fontSizes, radii } from '../../lib/tokens.js';

export interface FileTreeItem {
  path: string;
}

export interface FileTreeProps {
  files: FileTreeItem[];
  activeFilePath: string;
  onFileSelect: (path: string) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({ files, activeFilePath, onFileSelect }) => {
  return (
    <div style={styles.container} data-testid="mb-filetree">
      {files.map((f) => {
        const active = f.path === activeFilePath;
        return (
          <button
            key={f.path}
            type="button"
            onClick={() => onFileSelect(f.path)}
            style={{
              ...styles.item,
              ...(active ? styles.itemActive : {}),
            }}
            data-testid={`mb-filetree-item-${f.path}`}
            aria-current={active ? 'true' : undefined}
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
    flexDirection: 'column',
    backgroundColor: colors.mantle,
    borderRight: `1px solid ${colors.surface0}`,
    padding: spacing.xs,
    gap: 2,
    minWidth: 180,
    overflowY: 'auto',
  },
  item: {
    textAlign: 'left',
    padding: `${spacing.xs} ${spacing.sm}`,
    background: 'transparent',
    border: 'none',
    color: colors.subtext0,
    fontSize: fontSizes.sm,
    fontFamily: 'inherit',
    borderRadius: radii.sm,
    cursor: 'pointer',
  },
  itemActive: {
    backgroundColor: colors.surface0,
    color: colors.text,
  },
};
