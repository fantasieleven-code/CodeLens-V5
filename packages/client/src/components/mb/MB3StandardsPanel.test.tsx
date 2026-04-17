import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { MB3StandardsPanel } from './MB3StandardsPanel.js';

afterEach(() => {
  cleanup();
});

describe('MB3StandardsPanel', () => {
  it('mounts with both textareas and the submit button', () => {
    render(<MB3StandardsPanel sessionId="s1" onSubmit={vi.fn()} />);
    expect(screen.getByTestId('mb-standards-root')).toBeInTheDocument();
    expect(screen.getByTestId('mb-standards-rules')).toBeInTheDocument();
    expect(screen.getByTestId('mb-standards-agent')).toBeInTheDocument();
    expect(screen.getByTestId('mb-standards-submit')).toBeInTheDocument();
  });

  it('submit is disabled when RULES.md is empty and enables once content arrives', () => {
    render(<MB3StandardsPanel sessionId="s1" onSubmit={vi.fn()} />);
    const submit = screen.getByTestId('mb-standards-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect(screen.getByTestId('mb-standards-warn')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mb-standards-rules'), {
      target: { value: '- 纯函数' },
    });
    expect(submit.disabled).toBe(false);
    expect(screen.queryByTestId('mb-standards-warn')).not.toBeInTheDocument();

    // Whitespace-only does not satisfy the gate.
    fireEvent.change(screen.getByTestId('mb-standards-rules'), {
      target: { value: '   \n\t' },
    });
    expect(submit.disabled).toBe(true);
  });

  it('AGENT.md is optional — rules-only submit succeeds without agentContent', () => {
    const onSubmit = vi.fn();
    render(<MB3StandardsPanel sessionId="s1" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId('mb-standards-rules'), {
      target: { value: '- 规则一' },
    });
    fireEvent.click(screen.getByTestId('mb-standards-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ rulesContent: '- 规则一' });
  });

  it('non-empty AGENT.md is included in the submit payload', () => {
    const onSubmit = vi.fn();
    render(<MB3StandardsPanel sessionId="s1" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId('mb-standards-rules'), {
      target: { value: '- rule A\n- rule B' },
    });
    fireEvent.change(screen.getByTestId('mb-standards-agent'), {
      target: { value: '偏好中文输出\n禁止 emoji' },
    });
    fireEvent.click(screen.getByTestId('mb-standards-submit'));
    expect(onSubmit).toHaveBeenCalledWith({
      rulesContent: '- rule A\n- rule B',
      agentContent: '偏好中文输出\n禁止 emoji',
    });
  });

  it('whitespace-only AGENT.md is omitted (not passed as empty string)', () => {
    const onSubmit = vi.fn();
    render(<MB3StandardsPanel sessionId="s1" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId('mb-standards-rules'), {
      target: { value: '- rule' },
    });
    fireEvent.change(screen.getByTestId('mb-standards-agent'), {
      target: { value: '   \n   ' },
    });
    fireEvent.click(screen.getByTestId('mb-standards-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ rulesContent: '- rule' });
  });

  it('disabled prop locks all inputs and the submit', () => {
    const onSubmit = vi.fn();
    render(<MB3StandardsPanel sessionId="s1" onSubmit={onSubmit} disabled />);
    expect((screen.getByTestId('mb-standards-rules') as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByTestId('mb-standards-agent') as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByTestId('mb-standards-submit') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('mb-standards-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
