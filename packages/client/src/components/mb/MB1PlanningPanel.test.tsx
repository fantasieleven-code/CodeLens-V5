import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { MB1PlanningPanel } from './MB1PlanningPanel.js';

const FEATURE = {
  description:
    '实现一个带有批量导出功能的用户表管理页面，支持筛选和分页。',
  acceptanceCriteria: [
    'a. 支持按姓名和邮箱筛选',
    'b. 支持分页（每页 20 条）',
    'c. 支持批量导出为 CSV',
    'd. 删除操作需要二次确认',
    'e. 页面需在 500ms 内响应用户操作',
  ],
};

afterEach(() => {
  cleanup();
});

describe('MB1PlanningPanel', () => {
  it('mounts with featureRequirement and all three textareas', () => {
    render(
      <MB1PlanningPanel
        sessionId="s1"
        featureRequirement={FEATURE}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mb-planning-root')).toBeInTheDocument();
    expect(screen.getByTestId('mb-planning-feature-description')).toHaveTextContent(
      FEATURE.description,
    );
    expect(screen.getByTestId('mb-planning-decomposition')).toBeInTheDocument();
    expect(screen.getByTestId('mb-planning-dependencies')).toBeInTheDocument();
    expect(screen.getByTestId('mb-planning-fallback')).toBeInTheDocument();
  });

  it('renders all 5 acceptanceCriteria as list items', () => {
    render(
      <MB1PlanningPanel
        sessionId="s1"
        featureRequirement={FEATURE}
        onSubmit={vi.fn()}
      />,
    );
    for (let i = 0; i < FEATURE.acceptanceCriteria.length; i++) {
      const item = screen.getByTestId(`mb-planning-feature-criterion-${i}`);
      expect(item).toHaveTextContent(FEATURE.acceptanceCriteria[i]);
    }
  });

  it('submit button is disabled when all textareas are empty, enabled once one has content', () => {
    render(
      <MB1PlanningPanel
        sessionId="s1"
        featureRequirement={FEATURE}
        onSubmit={vi.fn()}
      />,
    );
    const submit = screen.getByTestId('mb-planning-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('mb-planning-decomposition'), {
      target: { value: '1. step one' },
    });
    expect(submit.disabled).toBe(false);

    // Clearing still leaves the other two empty — button disables again.
    fireEvent.change(screen.getByTestId('mb-planning-decomposition'), {
      target: { value: '   ' },
    });
    expect(submit.disabled).toBe(true);
  });

  it('textarea onChange reflects typed value in state', () => {
    render(
      <MB1PlanningPanel
        sessionId="s1"
        featureRequirement={FEATURE}
        onSubmit={vi.fn()}
      />,
    );
    const deps = screen.getByTestId('mb-planning-dependencies') as HTMLTextAreaElement;
    fireEvent.change(deps, { target: { value: 'fn foo(x: T): U' } });
    expect(deps.value).toBe('fn foo(x: T): U');

    const fallback = screen.getByTestId('mb-planning-fallback') as HTMLTextAreaElement;
    fireEvent.change(fallback, { target: { value: 'cache fallback' } });
    expect(fallback.value).toBe('cache fallback');
  });

  it('calls onSubmit with skipped:false and textarea values when submit is clicked', () => {
    const onSubmit = vi.fn();
    const now = 1700000000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <MB1PlanningPanel
        sessionId="s1"
        featureRequirement={FEATURE}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByTestId('mb-planning-decomposition'), {
      target: { value: '1. parse\n2. validate\n3. persist' },
    });
    fireEvent.change(screen.getByTestId('mb-planning-dependencies'), {
      target: { value: 'parseInput(raw) → ParsedRow' },
    });
    fireEvent.change(screen.getByTestId('mb-planning-fallback'), {
      target: { value: 'on parse fail → skip row + log' },
    });

    fireEvent.click(screen.getByTestId('mb-planning-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      decomposition: '1. parse\n2. validate\n3. persist',
      dependencies: 'parseInput(raw) → ParsedRow',
      fallbackStrategy: 'on parse fail → skip row + log',
      submittedAt: now,
      skipped: false,
    });
  });

  it('skip → confirm calls onSubmit with empty strings and skipped:true', () => {
    const onSubmit = vi.fn();
    const now = 1700000000500;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    render(
      <MB1PlanningPanel
        sessionId="s1"
        featureRequirement={FEATURE}
        onSubmit={onSubmit}
      />,
    );

    // Typing in one textarea should not leak into the skip payload.
    fireEvent.change(screen.getByTestId('mb-planning-decomposition'), {
      target: { value: 'scratch text that should be ignored on skip' },
    });

    fireEvent.click(screen.getByTestId('mb-planning-skip'));
    expect(screen.getByTestId('mb-planning-skip-confirm-row')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('mb-planning-skip-confirm'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      decomposition: '',
      dependencies: '',
      fallbackStrategy: '',
      submittedAt: now,
      skipped: true,
    });
  });

  it('skip cancel returns to the normal state without calling onSubmit', () => {
    const onSubmit = vi.fn();
    render(
      <MB1PlanningPanel
        sessionId="s1"
        featureRequirement={FEATURE}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByTestId('mb-planning-skip'));
    expect(screen.getByTestId('mb-planning-skip-confirm-row')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mb-planning-skip-cancel'));
    expect(screen.queryByTestId('mb-planning-skip-confirm-row')).not.toBeInTheDocument();
    // Skip trigger is back.
    expect(screen.getByTestId('mb-planning-skip')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disabled prop locks textareas, submit, and skip', () => {
    const onSubmit = vi.fn();
    render(
      <MB1PlanningPanel
        sessionId="s1"
        featureRequirement={FEATURE}
        onSubmit={onSubmit}
        disabled
      />,
    );

    expect((screen.getByTestId('mb-planning-decomposition') as HTMLTextAreaElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId('mb-planning-dependencies') as HTMLTextAreaElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId('mb-planning-fallback') as HTMLTextAreaElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId('mb-planning-submit') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('mb-planning-skip') as HTMLButtonElement).disabled).toBe(true);

    // Clicking the (disabled) submit does nothing.
    fireEvent.click(screen.getByTestId('mb-planning-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
