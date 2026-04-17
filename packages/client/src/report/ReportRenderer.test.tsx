import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportRenderer } from './ReportRenderer.js';
import { registerAllSections } from './sections/index.js';
import {
  sPlusArchitectFixture,
  aFullStackBoundaryFixture,
  bFullStackDangerFixture,
} from './__fixtures__/index.js';
import type { ReportViewModel } from './types.js';

describe('<ReportRenderer />', () => {
  beforeEach(() => {
    registerAllSections();
  });
  const cases: Array<[string, ReportViewModel, string[], string[]]> = [
    [
      'S+ architect',
      sPlusArchitectFixture,
      ['hero', 'capability-profiles', 'recommendation'],
      ['radar', 'ma-detail', 'md-hero', 'mc-transcript', 'dimensions', 'signal-bars', 'compliance'],
    ],
    [
      'A full_stack boundary',
      aFullStackBoundaryFixture,
      // 顺序跟随 SUITES.full_stack.reportSections 的 layer 过滤结果;
      // cursor-behavior-label 在 suite 的列表里位于 mb-detail 之后,所以进入 summary 层时在 recommendation 之后。
      ['hero', 'capability-profiles', 'recommendation', 'cursor-behavior-label'],
      [
        'radar',
        'ma-detail',
        'mb-detail',
        'mb-cursor-behavior',
        'mc-transcript',
        'dimensions',
        'signal-bars',
        'compliance',
      ],
    ],
    [
      'B dangerFlag',
      bFullStackDangerFixture,
      ['hero', 'capability-profiles', 'recommendation', 'cursor-behavior-label'],
      [
        'radar',
        'ma-detail',
        'mb-detail',
        'mb-cursor-behavior',
        'mc-transcript',
        'dimensions',
        'signal-bars',
        'compliance',
      ],
    ],
  ];

  it.each(cases)('renders summary layer for %s', (_label, vm, summary) => {
    render(<ReportRenderer viewModel={vm} layer="summary" />);
    const container = screen.getByTestId('report-renderer-summary');
    const sectionEls = container.querySelectorAll('[data-section-id]');
    const ids = Array.from(sectionEls).map((el) => el.getAttribute('data-section-id'));
    expect(ids).toEqual(summary);
  });

  it.each(cases)('renders detail layer for %s', (_label, vm, _summary, detail) => {
    render(<ReportRenderer viewModel={vm} layer="detail" />);
    const container = screen.getByTestId('report-renderer-detail');
    const sectionEls = container.querySelectorAll('[data-section-id]');
    const ids = Array.from(sectionEls).map((el) => el.getAttribute('data-section-id'));
    expect(ids).toEqual(detail);
  });
});

describe('ReportRenderer snapshot stability', () => {
  beforeAll(() => {
    registerAllSections();
  });

  it('matches snapshot for S+ summary layer', () => {
    const { container } = render(
      <ReportRenderer viewModel={sPlusArchitectFixture} layer="summary" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for B dangerFlag summary layer', () => {
    const { container } = render(
      <ReportRenderer viewModel={bFullStackDangerFixture} layer="summary" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
