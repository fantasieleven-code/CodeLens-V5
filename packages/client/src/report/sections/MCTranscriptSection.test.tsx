import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MCTranscriptSection } from './MCTranscriptSection.js';
import {
  aFullStackBoundaryFixture,
  sPlusArchitectFixture,
} from '../__fixtures__/index.js';
import type { ReportViewModel } from '../types.js';

describe('<MCTranscriptSection />', () => {
  it('renders one card per moduleC turn with round + strategy badges', () => {
    render(<MCTranscriptSection viewModel={aFullStackBoundaryFixture} />);
    expect(screen.getByTestId('mc-turn-1')).toHaveTextContent('Round 1');
    expect(screen.getByTestId('mc-turn-1')).toHaveTextContent('baseline');
    expect(screen.getByTestId('mc-turn-2')).toHaveTextContent('Round 2');
    expect(screen.getByTestId('mc-turn-2')).toHaveTextContent('contradiction');
  });

  it('returns null when moduleC is empty or missing', () => {
    const vm: ReportViewModel = {
      ...sPlusArchitectFixture,
      submissions: { ...sPlusArchitectFixture.submissions, moduleC: [] },
    };
    const { container } = render(<MCTranscriptSection viewModel={vm} />);
    expect(container.firstChild).toBeNull();
  });
});
