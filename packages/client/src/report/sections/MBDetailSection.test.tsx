import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MBDetailSection } from './MBDetailSection.js';
import {
  aFullStackBoundaryFixture,
  sPlusArchitectFixture,
} from '../__fixtures__/index.js';
import type { ReportViewModel } from '../types.js';

describe('<MBDetailSection />', () => {
  it('renders pass-rate + planning + finalFiles when MB is submitted', () => {
    render(<MBDetailSection viewModel={aFullStackBoundaryFixture} />);
    const root = screen.getByTestId('mb-detail-section');
    expect(root).toHaveTextContent('模块 B · Cursor 交付');
    expect(root).toHaveTextContent('92%'); // finalTestPassRate 0.92
    expect(screen.getByTestId('mb-planning')).toHaveTextContent('先补回调幂等');
    expect(screen.getByTestId('mb-final-files')).toHaveTextContent(
      'src/oauth/callback.ts',
    );
  });

  it('returns null when MB submission is missing (e.g. architect suite)', () => {
    // sPlus-architect has no mb submission.
    const vm: ReportViewModel = {
      ...sPlusArchitectFixture,
      submissions: { ...sPlusArchitectFixture.submissions, mb: undefined },
    };
    const { container } = render(<MBDetailSection viewModel={vm} />);
    expect(container.firstChild).toBeNull();
  });
});
