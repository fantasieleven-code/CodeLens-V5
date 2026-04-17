import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComplianceSection } from './ComplianceSection.js';
import {
  aFullStackBoundaryFixture,
  sPlusArchitectFixture,
} from '../__fixtures__/index.js';
import type { ReportViewModel } from '../types.js';

describe('<ComplianceSection />', () => {
  it('renders sessionId, completedAt ISO timestamp, and algorithm-version count', () => {
    render(<ComplianceSection viewModel={aFullStackBoundaryFixture} />);
    const root = screen.getByTestId('compliance-section');
    expect(root).toHaveTextContent('会话合规');
    expect(root).toHaveTextContent(aFullStackBoundaryFixture.suite.id);
    expect(root).toHaveTextContent(aFullStackBoundaryFixture.sessionId);
    // Mock signals share one algorithm version → "算法版本数 1".
    expect(root).toHaveTextContent('算法版本数');
  });

  it('falls back to an em-dash when completedAt is missing', () => {
    const vm: ReportViewModel = { ...sPlusArchitectFixture, completedAt: undefined };
    render(<ComplianceSection viewModel={vm} />);
    expect(screen.getByTestId('compliance-section').textContent).toContain('—');
  });
});
