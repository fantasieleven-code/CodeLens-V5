import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from './diff-parser.js';

describe('parseUnifiedDiff', () => {
  const files = [
    {
      path: 'src/main.ts',
      content: ['const x = 1;', 'const y = 2;', 'console.log(x + y);'].join('\n'),
    },
  ];

  it('parses a single-hunk unified diff into {path, oldContent, newContent}', () => {
    const diff = [
      '--- a/src/main.ts',
      '+++ b/src/main.ts',
      '@@ -1,3 +1,3 @@',
      '-const x = 1;',
      '+const x = 10;',
      ' const y = 2;',
      ' console.log(x + y);',
    ].join('\n');
    const result = parseUnifiedDiff(diff, files);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diff.path).toBe('src/main.ts');
    expect(result.diff.oldContent).toBe(files[0].content);
    expect(result.diff.newContent).toBe('const x = 10;\nconst y = 2;\nconsole.log(x + y);');
  });

  it('parses a multi-hunk diff and applies hunks in order', () => {
    const base = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
    const diff = [
      '--- a/src/main.ts',
      '+++ b/src/main.ts',
      '@@ -2,2 +2,2 @@',
      '-line 2',
      '+LINE 2',
      ' line 3',
      '@@ -7,2 +7,3 @@',
      ' line 7',
      '+INSERTED',
      ' line 8',
    ].join('\n');
    const result = parseUnifiedDiff(diff, [{ path: 'src/main.ts', content: base }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = [
      'line 1',
      'LINE 2',
      'line 3',
      'line 4',
      'line 5',
      'line 6',
      'line 7',
      'INSERTED',
      'line 8',
      'line 9',
      'line 10',
    ].join('\n');
    expect(result.diff.newContent).toBe(expected);
  });

  it('returns error on empty diff', () => {
    const result = parseUnifiedDiff('', files);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/empty/i);
  });

  it('returns error when no +++ header is present', () => {
    const result = parseUnifiedDiff('just some text\nno diff markers', files);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/\+\+\+/);
  });

  it('returns error when target file is not in the editor', () => {
    const diff = [
      '--- a/other.ts',
      '+++ b/other.ts',
      '@@ -1,1 +1,1 @@',
      '-x',
      '+y',
    ].join('\n');
    const result = parseUnifiedDiff(diff, files);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not found/i);
  });

  it('returns error when a context line does not match the original', () => {
    const diff = [
      '--- a/src/main.ts',
      '+++ b/src/main.ts',
      '@@ -1,3 +1,3 @@',
      ' WRONG CONTEXT',
      '-const y = 2;',
      '+const y = 20;',
      ' console.log(x + y);',
    ].join('\n');
    const result = parseUnifiedDiff(diff, files);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/context/i);
  });

  it('strips git-style b/ prefix from +++ header path', () => {
    const diff = [
      '--- a/src/main.ts',
      '+++ b/src/main.ts\t2026-01-01 00:00:00',
      '@@ -1,1 +1,1 @@',
      '-const x = 1;',
      '+const x = 2;',
    ].join('\n');
    const result = parseUnifiedDiff(diff, [{ path: 'src/main.ts', content: 'const x = 1;' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diff.path).toBe('src/main.ts');
  });

  it('normalizes CRLF input to LF before parsing', () => {
    const diff = [
      '--- a/src/main.ts',
      '+++ b/src/main.ts',
      '@@ -1,1 +1,1 @@',
      '-const x = 1;',
      '+const x = 99;',
    ].join('\r\n');
    const result = parseUnifiedDiff(diff, [{ path: 'src/main.ts', content: 'const x = 1;' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.diff.newContent).toBe('const x = 99;');
  });
});
