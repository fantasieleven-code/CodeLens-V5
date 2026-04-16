import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressIndicator } from './ProgressIndicator.js';
import { useModuleStore } from '../stores/module.store.js';

const FULL_STACK_ORDER = ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'] as const;

describe('<ProgressIndicator />', () => {
  beforeEach(() => {
    useModuleStore.getState().reset();
  });

  it('renders nothing when moduleOrder is empty', () => {
    const { container } = render(<ProgressIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one dot per module with correct state classes', () => {
    useModuleStore.getState().setSuite('full_stack', [...FULL_STACK_ORDER]);
    useModuleStore.getState().advance(); // → phase0 (active)
    useModuleStore.getState().advance(); // → moduleA (active, phase0 done)

    render(<ProgressIndicator />);

    expect(screen.getByTestId('progress-indicator-container')).toBeInTheDocument();
    expect(screen.getByTestId('progress-module-phase0')).toHaveAttribute(
      'data-state',
      'done',
    );
    expect(screen.getByTestId('progress-module-moduleA')).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByTestId('progress-module-mb')).toHaveAttribute(
      'data-state',
      'pending',
    );
    expect(screen.getByTestId('progress-module-selfAssess')).toHaveAttribute(
      'data-state',
      'pending',
    );
    expect(screen.getByTestId('progress-module-moduleC')).toHaveAttribute(
      'data-state',
      'pending',
    );
  });

  it('shows completed count and remaining minutes', () => {
    useModuleStore.getState().setSuite('full_stack', [...FULL_STACK_ORDER]);
    useModuleStore.getState().advance(); // phase0
    useModuleStore.getState().advance(); // moduleA — 1 completed

    render(<ProgressIndicator />);
    expect(screen.getByTestId('progress-completed-count')).toHaveTextContent(
      '已完成 1/5 模块',
    );
    // remaining = (5 - 1) * (60 / 5) = 48
    expect(screen.getByTestId('progress-remaining-minutes')).toHaveTextContent(
      '剩余约 48 分钟',
    );
  });

  it('hides minutes when showMinutes=false', () => {
    useModuleStore.getState().setSuite('full_stack', [...FULL_STACK_ORDER]);
    useModuleStore.getState().advance();
    render(<ProgressIndicator showMinutes={false} />);
    expect(screen.queryByTestId('progress-remaining-minutes')).toBeNull();
  });

  it('marks all dots done when complete', () => {
    useModuleStore.getState().setSuite('quick_screen', ['phase0']);
    useModuleStore.getState().advance();
    useModuleStore.getState().advance(); // → complete
    render(<ProgressIndicator />);
    expect(screen.getByTestId('progress-module-phase0')).toHaveAttribute(
      'data-state',
      'done',
    );
  });
});
