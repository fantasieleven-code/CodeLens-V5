import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CursorBehaviorLabelSection } from './CursorBehaviorLabelSection.js';
import {
  aFullStackBoundaryFixture,
  bFullStackDangerFixture,
  sPlusArchitectFixture,
} from '../__fixtures__/index.js';
import type { ReportViewModel } from '../types.js';

describe('<CursorBehaviorLabelSection />', () => {
  it('renders the 熟练接受型 label and signal-count summary for the A fixture', () => {
    render(<CursorBehaviorLabelSection viewModel={aFullStackBoundaryFixture} />);
    const root = screen.getByTestId('cursor-behavior-label-section');
    expect(root).toHaveTextContent('熟练接受型');
    expect(root).toHaveTextContent('3 条信号支撑');
    expect(root).toHaveTextContent(/AI Completion 接受率 68%/);
  });

  it('renders the 快速粘贴型 label for the B fixture', () => {
    render(<CursorBehaviorLabelSection viewModel={bFullStackDangerFixture} />);
    expect(screen.getByTestId('cursor-behavior-label-section')).toHaveTextContent(
      '快速粘贴型',
    );
  });

  it('returns null when viewModel.cursorBehaviorLabel is undefined', () => {
    const vm: ReportViewModel = {
      ...sPlusArchitectFixture,
      cursorBehaviorLabel: undefined,
    };
    const { container } = render(<CursorBehaviorLabelSection viewModel={vm} />);
    expect(container.firstChild).toBeNull();
  });
});
