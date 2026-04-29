import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransparencyStatement } from './TransparencyStatement.js';

describe('<TransparencyStatement />', () => {
  it('renders the transparency root with the four brief-mandated sections', () => {
    render(<TransparencyStatement />);
    expect(screen.getByTestId('transparency-statement')).toBeInTheDocument();
    expect(screen.getByTestId('transparency-grade')).toBeInTheDocument();
    expect(screen.getByTestId('transparency-signals')).toBeInTheDocument();
    expect(screen.getByTestId('transparency-limitations')).toBeInTheDocument();
    expect(screen.getByTestId('transparency-data')).toBeInTheDocument();
  });

  it('renders zh + en copy inline per section (no language switcher)', () => {
    render(<TransparencyStatement />);
    const root = screen.getByTestId('transparency-statement');
    // zh anchors per section — these are the brief's 4-outline keywords.
    expect(root).toHaveTextContent('等级的含义');
    expect(root).toHaveTextContent('我们观察了什么');
    expect(root).toHaveTextContent('已知的局限');
    expect(root).toHaveTextContent('数据如何被处理');
    // en mirrors follow zh inline, not behind a toggle.
    expect(root).toHaveTextContent('What your grade means');
    expect(root).toHaveTextContent("What we measure (and what we don't)");
    expect(root).toHaveTextContent('Known limitations');
    expect(root).toHaveTextContent('How your data is handled');
  });

  it('uses the "设计目标 / 持续校准" register — not "validated / proven"', () => {
    // Brief tone guard: keep it candidate-sympathetic, avoid over-claiming.
    render(<TransparencyStatement />);
    const text = screen.getByTestId('transparency-statement').textContent ?? '';
    expect(text).toContain('设计目标');
    expect(text).toContain('持续校准');
    expect(text).not.toMatch(/validated|proven/i);
  });

  it('discloses the 48-signal coverage + explicit "what we do not measure" list', () => {
    render(<TransparencyStatement />);
    const signalsCard = screen.getByTestId('transparency-signals');
    expect(signalsCard.textContent).toContain('48 个信号');
    expect(signalsCard.textContent).toContain('我们没有测量的东西');
    expect(signalsCard.textContent).toContain('48 signals');
  });
});
