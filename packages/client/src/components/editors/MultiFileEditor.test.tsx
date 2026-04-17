import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * @monaco-editor/react is jsdom-hostile (web workers, dynamic imports). Stub
 * it with a textarea that forwards onChange so the wrapper's change/cursor
 * plumbing is testable without booting real Monaco. The `path` prop is
 * exposed as a data-attribute so tests can confirm file switching swaps
 * Monaco's underlying model identity.
 */
vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({
    value,
    path,
    language,
    onChange,
  }: {
    value?: string;
    path?: string;
    language?: string;
    onChange?: (val: string | undefined) => void;
  }) => (
    <textarea
      data-testid="monaco-stub"
      data-path={path}
      data-language={language}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

import { MultiFileEditor, type MultiFileEditorFile } from './MultiFileEditor.js';

const FILES: MultiFileEditorFile[] = [
  { path: 'src/main.ts', content: 'const x = 1;', language: 'typescript' },
  { path: 'src/util.py', content: 'def f(): pass', language: 'python' },
  { path: 'README.md', content: '# Hello', language: 'markdown' },
];

describe('MultiFileEditor', () => {
  it('mounts and renders FileTree + EditorTabs + active file', () => {
    render(
      <MultiFileEditor
        files={FILES}
        activeFilePath="src/main.ts"
        onFileChange={vi.fn()}
        onFileSelect={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mb-editor-root')).toBeInTheDocument();
    expect(screen.getByTestId('mb-filetree')).toBeInTheDocument();
    expect(screen.getByTestId('mb-editor-tabs-container')).toBeInTheDocument();
    expect(screen.getByTestId('mb-editor-file-ts')).toBeInTheDocument();
    expect(screen.getByTestId('monaco-stub')).toHaveValue('const x = 1;');
  });

  it('renders one tab + filetree item per file', () => {
    render(
      <MultiFileEditor
        files={FILES}
        activeFilePath="src/main.ts"
        onFileChange={vi.fn()}
        onFileSelect={vi.fn()}
      />,
    );
    for (const f of FILES) {
      expect(screen.getByTestId(`mb-editor-tab-${f.path}`)).toBeInTheDocument();
      expect(screen.getByTestId(`mb-filetree-item-${f.path}`)).toBeInTheDocument();
    }
  });

  it('calls onFileSelect when an EditorTabs tab is clicked', () => {
    const onFileSelect = vi.fn();
    render(
      <MultiFileEditor
        files={FILES}
        activeFilePath="src/main.ts"
        onFileChange={vi.fn()}
        onFileSelect={onFileSelect}
      />,
    );
    fireEvent.click(screen.getByTestId('mb-editor-tab-src/util.py'));
    expect(onFileSelect).toHaveBeenCalledWith('src/util.py');
  });

  it('calls onFileSelect when a FileTree item is clicked', () => {
    const onFileSelect = vi.fn();
    render(
      <MultiFileEditor
        files={FILES}
        activeFilePath="src/main.ts"
        onFileChange={vi.fn()}
        onFileSelect={onFileSelect}
      />,
    );
    fireEvent.click(screen.getByTestId('mb-filetree-item-README.md'));
    expect(onFileSelect).toHaveBeenCalledWith('README.md');
  });

  it('calls onFileChange with the active file path when the editor emits input', () => {
    const onFileChange = vi.fn();
    render(
      <MultiFileEditor
        files={FILES}
        activeFilePath="src/util.py"
        onFileChange={onFileChange}
        onFileSelect={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('monaco-stub'), {
      target: { value: 'def f(): return 42' },
    });
    expect(onFileChange).toHaveBeenCalledWith('src/util.py', 'def f(): return 42');
  });

  it('passes the Monaco path + language props through for per-file model identity', () => {
    render(
      <MultiFileEditor
        files={FILES}
        activeFilePath="src/util.py"
        onFileChange={vi.fn()}
        onFileSelect={vi.fn()}
      />,
    );
    const stub = screen.getByTestId('monaco-stub');
    expect(stub.getAttribute('data-path')).toBe('src/util.py');
    expect(stub.getAttribute('data-language')).toBe('python');
  });

  it('renders DiffOverlay (and hides the editor) when pendingDiff is set', () => {
    render(
      <MultiFileEditor
        files={FILES}
        activeFilePath="src/main.ts"
        onFileChange={vi.fn()}
        onFileSelect={vi.fn()}
        pendingDiff={{
          path: 'src/main.ts',
          oldContent: 'const x = 1;',
          newContent: 'const x = 2;',
        }}
      />,
    );
    expect(screen.getByTestId('mb-diff-overlay')).toBeInTheDocument();
    expect(screen.queryByTestId('monaco-stub')).not.toBeInTheDocument();
  });

  it('fires onAcceptDiff when the accept button is clicked', () => {
    const onAcceptDiff = vi.fn();
    render(
      <MultiFileEditor
        files={FILES}
        activeFilePath="src/main.ts"
        onFileChange={vi.fn()}
        onFileSelect={vi.fn()}
        pendingDiff={{
          path: 'src/main.ts',
          oldContent: 'const x = 1;',
          newContent: 'const x = 2;',
        }}
        onAcceptDiff={onAcceptDiff}
        onRejectDiff={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('mb-diff-accept-btn'));
    expect(onAcceptDiff).toHaveBeenCalledOnce();
  });

  it('fires onRejectDiff when the reject button is clicked', () => {
    const onRejectDiff = vi.fn();
    render(
      <MultiFileEditor
        files={FILES}
        activeFilePath="src/main.ts"
        onFileChange={vi.fn()}
        onFileSelect={vi.fn()}
        pendingDiff={{
          path: 'src/main.ts',
          oldContent: 'const x = 1;',
          newContent: 'const x = 2;',
        }}
        onAcceptDiff={vi.fn()}
        onRejectDiff={onRejectDiff}
      />,
    );
    fireEvent.click(screen.getByTestId('mb-diff-reject-btn'));
    expect(onRejectDiff).toHaveBeenCalledOnce();
  });

  it('renders the inlineCompletion hint when the prop is set (and no pendingDiff)', () => {
    render(
      <MultiFileEditor
        files={FILES}
        activeFilePath="src/main.ts"
        onFileChange={vi.fn()}
        onFileSelect={vi.fn()}
        inlineCompletion={{ line: 5, column: 12, text: 'return result;' }}
      />,
    );
    const hint = screen.getByTestId('mb-inline-completion-hint');
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveTextContent('L5:12');
    expect(hint).toHaveTextContent('return result;');
  });

  it('does not render the inline hint while a pendingDiff is showing', () => {
    render(
      <MultiFileEditor
        files={FILES}
        activeFilePath="src/main.ts"
        onFileChange={vi.fn()}
        onFileSelect={vi.fn()}
        pendingDiff={{
          path: 'src/main.ts',
          oldContent: 'const x = 1;',
          newContent: 'const x = 2;',
        }}
        inlineCompletion={{ line: 5, column: 12, text: 'return result;' }}
      />,
    );
    expect(screen.queryByTestId('mb-inline-completion-hint')).not.toBeInTheDocument();
  });

  it('shows an empty state when files=[]', () => {
    render(
      <MultiFileEditor
        files={[]}
        activeFilePath=""
        onFileChange={vi.fn()}
        onFileSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/no files/i)).toBeInTheDocument();
  });
});
