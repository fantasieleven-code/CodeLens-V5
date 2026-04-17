import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MADetailSection } from './MADetailSection.js';
import {
  aFullStackBoundaryFixture,
  bFullStackDangerFixture,
} from '../__fixtures__/index.js';
import type { ReportViewModel } from '../types.js';

describe('<MADetailSection />', () => {
  it('renders all three rounds when moduleA submission is present', () => {
    render(<MADetailSection viewModel={aFullStackBoundaryFixture} />);
    expect(screen.getByTestId('ma-round1')).toHaveTextContent('R1 方案选择 · A');
    expect(screen.getByTestId('ma-round1')).toHaveTextContent('OAuth 回调失败率 2%');
    expect(screen.getByTestId('ma-round2')).toHaveTextContent('R2 代码评审标注');
    expect(screen.getByTestId('ma-round3')).toHaveTextContent('R3 诊断');
    expect(screen.getByTestId('ma-round3')).toHaveTextContent('选择:成功版本');
  });

  it('shows the failed-version label when R3 chose the wrong version', () => {
    render(<MADetailSection viewModel={bFullStackDangerFixture} />);
    expect(screen.getByTestId('ma-round3')).toHaveTextContent('选择:失败版本');
  });

  it('returns null when moduleA submission is missing', () => {
    const vm: ReportViewModel = {
      ...aFullStackBoundaryFixture,
      submissions: { ...aFullStackBoundaryFixture.submissions, moduleA: undefined },
    };
    const { container } = render(<MADetailSection viewModel={vm} />);
    expect(container.firstChild).toBeNull();
  });
});
