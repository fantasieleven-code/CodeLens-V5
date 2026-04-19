import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroSection } from './HeroSection.js';
import {
  sPlusArchitectFixture,
  aFullStackBoundaryFixture,
  bFullStackDangerFixture,
} from '../__fixtures__/index.js';
import type { ReportViewModel } from '../types.js';

describe('<HeroSection />', () => {
  it('renders S+ high-confidence state', () => {
    render(<HeroSection viewModel={sPlusArchitectFixture} />);
    expect(screen.getByTestId('hero-grade-badge')).toHaveTextContent('S+');
    expect(screen.getByTestId('hero-confidence-badge')).toHaveTextContent('高置信');
    expect(screen.getByTestId('hero-composite')).toHaveTextContent('综合 96.0');
    expect(screen.getByTestId('hero-reasoning')).toHaveTextContent(
      /composite 96\.0 稳定落在 S\+ 区间/,
    );
    expect(screen.queryByTestId('hero-danger-flag')).toBeNull();
    // S+ 到了 gradeCap,没有 nearestUpperGrade,应不出现 distance-upper。
    expect(screen.queryByTestId('hero-distance-upper')).toBeNull();
  });

  it('Pattern H: renders "—" when composite is nullish without crashing', () => {
    const vm: ReportViewModel = {
      ...aFullStackBoundaryFixture,
      gradeDecision: {
        ...aFullStackBoundaryFixture.gradeDecision,
        composite: undefined as unknown as number,
      },
    };
    render(<HeroSection viewModel={vm} />);
    expect(screen.getByTestId('hero-composite')).toHaveTextContent('综合 —');
  });

  it('Pattern H: renders "—" when distanceToUpper is nullish but nearestUpperGrade truthy', () => {
    const vm: ReportViewModel = {
      ...aFullStackBoundaryFixture,
      gradeDecision: {
        ...aFullStackBoundaryFixture.gradeDecision,
        boundaryAnalysis: {
          ...aFullStackBoundaryFixture.gradeDecision.boundaryAnalysis,
          distanceToUpper: undefined as unknown as number,
        },
      },
    };
    render(<HeroSection viewModel={vm} />);
    // Outer guard checks !== null; undefined passes, inner ?. returns undefined, ?? '—' kicks in.
    expect(screen.getByTestId('hero-distance-upper')).toHaveTextContent('距 S 差 —');
  });

  it('renders A low-confidence boundary state', () => {
    render(<HeroSection viewModel={aFullStackBoundaryFixture} />);
    expect(screen.getByTestId('hero-grade-badge')).toHaveTextContent('A');
    expect(screen.getByTestId('hero-confidence-badge')).toHaveTextContent(
      '低置信 · 边界候选人',
    );
    expect(screen.getByTestId('hero-composite')).toHaveTextContent('综合 83.8');
    expect(screen.getByTestId('hero-distance-upper')).toHaveTextContent('距 S 差 1.2');
    expect(screen.queryByTestId('hero-danger-flag')).toBeNull();
  });

  it('renders B state with dangerFlag', () => {
    render(<HeroSection viewModel={bFullStackDangerFixture} />);
    expect(screen.getByTestId('hero-grade-badge')).toHaveTextContent('B');
    expect(screen.getByTestId('hero-danger-flag')).toBeInTheDocument();
    expect(screen.getByTestId('hero-danger-flag')).toHaveTextContent(
      /技术判断 48 与代码质量 66/,
    );
    expect(screen.getByTestId('hero-danger-flag')).toHaveTextContent('支撑信号 4 条');
  });
});
