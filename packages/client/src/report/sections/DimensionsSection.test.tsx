import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DimensionsSection } from './DimensionsSection.js';
import { aFullStackBoundaryFixture } from '../__fixtures__/index.js';

describe('<DimensionsSection />', () => {
  it('renders all six dimensions with suite weight annotations', () => {
    render(<DimensionsSection viewModel={aFullStackBoundaryFixture} />);
    const root = screen.getByTestId('dimensions-section');
    expect(root).toHaveTextContent('六维度分数');
    for (const label of [
      '技术判断力',
      'AI 工程力',
      '系统设计',
      '代码质量',
      '沟通',
      '元认知',
    ]) {
      expect(root).toHaveTextContent(label);
    }
    // full_stack weights: TJ 25%, AI 25%, CQ 20%, CM 15%, MC 10%, SD 5%.
    expect(root).toHaveTextContent('权重 25%');
    expect(root).toHaveTextContent('权重 20%');
    expect(root).toHaveTextContent('权重 5%');
  });

  it('renders zero-weight dimensions (e.g. systemDesign in full_stack) without crashing', () => {
    render(<DimensionsSection viewModel={aFullStackBoundaryFixture} />);
    expect(screen.getByTestId('dimensions-section')).toHaveTextContent('系统设计');
  });
});
