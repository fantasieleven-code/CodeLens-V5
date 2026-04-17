/**
 * Minimal unified-diff parser for MB Cursor-mode AI chat.
 *
 * Parses `v5:mb:chat_complete.diff` (raw LLM stream — qwen3-coder-instruct
 * is prompted to emit a unified diff) into the `{path, oldContent, newContent}`
 * shape MultiFileEditor.pendingDiff consumes. oldContent is read from the
 * current `files` list passed in (the canonical version at the moment chat
 * completed); newContent is produced by applying hunks to that base.
 *
 * Why hand-rolled and not a library: the chat output is short (≤500 lines
 * per file per task-generator budget), we only need single-file patches for
 * V5.0, and the parser has to return a *typed failure* so the chat panel
 * can keep the AI output visible while surfacing a parse error UI. Library
 * parsers usually throw, which is harder to integrate with React state.
 *
 * Scope for V5.0:
 * - Single-file patches (first +++ header wins; rest ignored)
 * - Standard unified diff (--- / +++ / @@ -x,y +u,v @@)
 * - Optional leading `a/` / `b/` path prefixes (git-style) are stripped
 * - LF line endings (CRLF is normalized)
 *
 * Out of scope for V5.0 (future Task 7.x if needed):
 * - Binary patches, rename/copy-from headers, multi-file patches
 */

export interface ParsedDiff {
  path: string;
  oldContent: string;
  newContent: string;
}

export type ParseResult =
  | { ok: true; diff: ParsedDiff }
  | { ok: false; error: string };

interface Hunk {
  oldStart: number;
  oldLines: number;
  lines: Array<{ kind: 'context' | 'add' | 'remove'; text: string }>;
}

export function parseUnifiedDiff(
  diffText: string,
  files: Array<{ path: string; content: string }>,
): ParseResult {
  if (!diffText || !diffText.trim()) {
    return { ok: false, error: 'Empty diff' };
  }

  const lines = diffText.replace(/\r\n/g, '\n').split('\n');

  const path = extractPath(lines);
  if (!path) {
    return { ok: false, error: 'No +++ header found — not a unified diff' };
  }

  const target = files.find((f) => f.path === path);
  if (!target) {
    return { ok: false, error: `Target file not found in editor: ${path}` };
  }

  const hunks = extractHunks(lines);
  if (hunks.length === 0) {
    return { ok: false, error: 'No hunks (@@ markers) found in diff' };
  }

  try {
    const newContent = applyHunks(target.content, hunks);
    return {
      ok: true,
      diff: { path, oldContent: target.content, newContent },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to apply hunks',
    };
  }
}

function extractPath(lines: string[]): string | null {
  for (const line of lines) {
    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).trim();
      if (!raw || raw === '/dev/null') return null;
      // Strip git-style "b/" prefix; also strip tab-separated timestamp.
      const withoutTs = raw.split('\t')[0].trim();
      return withoutTs.startsWith('b/') ? withoutTs.slice(2) : withoutTs;
    }
  }
  return null;
}

function extractHunks(lines: string[]): Hunk[] {
  const hunks: Hunk[] = [];
  let i = 0;
  while (i < lines.length) {
    const header = lines[i];
    const match = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(header);
    if (!match) {
      i += 1;
      continue;
    }
    const oldStart = Number(match[1]);
    const oldLines = match[2] !== undefined ? Number(match[2]) : 1;
    i += 1;
    const hunkLines: Hunk['lines'] = [];
    while (i < lines.length && !lines[i].startsWith('@@ ') && !lines[i].startsWith('--- ')) {
      const l = lines[i];
      if (l.startsWith('+')) hunkLines.push({ kind: 'add', text: l.slice(1) });
      else if (l.startsWith('-')) hunkLines.push({ kind: 'remove', text: l.slice(1) });
      else if (l.startsWith(' ')) hunkLines.push({ kind: 'context', text: l.slice(1) });
      else if (l === '') hunkLines.push({ kind: 'context', text: '' });
      // Non-conforming line (e.g. "\ No newline at end of file") — skip.
      i += 1;
    }
    hunks.push({ oldStart, oldLines, lines: hunkLines });
  }
  return hunks;
}

function applyHunks(original: string, hunks: Hunk[]): string {
  const source = original.split('\n');
  const out: string[] = [];
  // 0-indexed cursor into source; start at beginning, move through each hunk in order.
  let srcIdx = 0;

  for (const hunk of hunks) {
    const hunkStartIdx = hunk.oldStart - 1; // convert 1-indexed to 0-indexed
    if (hunkStartIdx < srcIdx) {
      throw new Error(`Hunk at line ${hunk.oldStart} overlaps earlier hunk`);
    }
    // Copy source lines up to the hunk start.
    while (srcIdx < hunkStartIdx && srcIdx < source.length) {
      out.push(source[srcIdx]);
      srcIdx += 1;
    }
    // Process hunk lines.
    for (const l of hunk.lines) {
      if (l.kind === 'context') {
        if (srcIdx >= source.length) {
          throw new Error(`Context line beyond EOF: "${l.text}"`);
        }
        if (source[srcIdx] !== l.text) {
          throw new Error(
            `Context mismatch at line ${srcIdx + 1}: expected "${l.text}", got "${source[srcIdx]}"`,
          );
        }
        out.push(source[srcIdx]);
        srcIdx += 1;
      } else if (l.kind === 'remove') {
        if (srcIdx >= source.length) {
          throw new Error(`Remove line beyond EOF: "${l.text}"`);
        }
        if (source[srcIdx] !== l.text) {
          throw new Error(
            `Remove mismatch at line ${srcIdx + 1}: expected "${l.text}", got "${source[srcIdx]}"`,
          );
        }
        srcIdx += 1;
      } else {
        out.push(l.text);
      }
    }
  }
  // Copy remaining source lines after the last hunk.
  while (srcIdx < source.length) {
    out.push(source[srcIdx]);
    srcIdx += 1;
  }
  return out.join('\n');
}
