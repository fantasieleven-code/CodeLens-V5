import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MBCursorBehaviorSection } from './MBCursorBehaviorSection.js';
import {
  aFullStackBoundaryFixture,
  bFullStackDangerFixture,
} from '../__fixtures__/index.js';
import type { ReportViewModel } from '../types.js';

describe('<MBCursorBehaviorSection />', () => {
  it('renders completion/chat/diff metrics for the A fixture', () => {
    render(<MBCursorBehaviorSection viewModel={aFullStackBoundaryFixture} />);
    const root = screen.getByTestId('mb-cursor-behavior-section');
    expect(root).toHaveTextContent('MB Cursor 行为数据');
    expect(root).toHaveTextContent('Completion 接受率');
    // A fixture has 2 completions, 1 accepted → 50%.
    expect(root).toHaveTextContent('50%');
    expect(screen.getByTestId('mb-completion-events')).toBeInTheDocument();
  });

  it('renders a 100% acceptance rate for the B fixture (all 4 accepted)', () => {
    render(<MBCursorBehaviorSection viewModel={bFullStackDangerFixture} />);
    expect(screen.getByTestId('mb-cursor-behavior-section')).toHaveTextContent('100%');
  });

  it('returns null when MB submission is missing', () => {
    const vm: ReportViewModel = {
      ...aFullStackBoundaryFixture,
      submissions: { ...aFullStackBoundaryFixture.submissions, mb: undefined },
    };
    const { container } = render(<MBCursorBehaviorSection viewModel={vm} />);
    expect(container.firstChild).toBeNull();
  });
});
