/**
 * DecisionSummary tests — pure presentational component, driven entirely by
 * the `summary` prop. Tests cover:
 *   - all three cards render when ma/mb/md present
 *   - missing module's card hidden
 *   - empty summary → empty-state hint
 *   - reasoning truncation at 80 chars with ellipsis
 *   - submodule / constraint counts render as-is (0 OK)
 */

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DecisionSummary } from './DecisionSummary.js';

afterEach(() => cleanup());

describe('<DecisionSummary />', () => {
  it('renders all three module cards when summary is fully populated', () => {
    render(
      <DecisionSummary
        summary={{
          ma: { schemeId: 'C', reasoning: '令牌桶把串行化从 lock 转到 LPOP 上' },
          mb: { decomposition: '第一步:拆出 filter_orders 纯函数签名' },
          md: { subModuleCount: 4, constraintCount: 3 },
        }}
      />,
    );

    expect(screen.getByTestId('decision-summary-root')).toBeInTheDocument();
    expect(screen.getByTestId('decision-summary-ma')).toBeInTheDocument();
    expect(screen.getByTestId('decision-summary-mb')).toBeInTheDocument();
    expect(screen.getByTestId('decision-summary-md')).toBeInTheDocument();
  });

  it('omits an individual card when that module is absent', () => {
    render(
      <DecisionSummary
        summary={{
          ma: { schemeId: 'A', reasoning: 'x' },
          // mb + md absent (e.g. quick_screen suite with only phase0 + moduleA)
        }}
      />,
    );

    expect(screen.getByTestId('decision-summary-ma')).toBeInTheDocument();
    expect(screen.queryByTestId('decision-summary-mb')).not.toBeInTheDocument();
    expect(screen.queryByTestId('decision-summary-md')).not.toBeInTheDocument();
  });

  it('renders empty-state hint when no prior modules are present', () => {
    render(<DecisionSummary summary={{}} />);

    expect(screen.getByTestId('decision-summary-root')).toBeInTheDocument();
    expect(screen.queryByTestId('decision-summary-ma')).not.toBeInTheDocument();
    expect(screen.queryByTestId('decision-summary-mb')).not.toBeInTheDocument();
    expect(screen.queryByTestId('decision-summary-md')).not.toBeInTheDocument();
    expect(screen.getByText(/本套件没有前序决策模块/)).toBeInTheDocument();
  });

  it('truncates MA reasoning past 80 chars with an ellipsis', () => {
    const longReasoning =
      '这是一段非常非常长的理由文本 '.repeat(20); // >> 80 chars
    render(
      <DecisionSummary
        summary={{ ma: { schemeId: 'B', reasoning: longReasoning } }}
      />,
    );

    const card = screen.getByTestId('decision-summary-ma');
    expect(card.textContent).toContain('…');
    // Truncation trims the preview; full reasoning must not appear verbatim.
    expect(card.textContent).not.toContain(longReasoning.trim());
  });

  it('leaves short MA reasoning intact (no ellipsis)', () => {
    render(
      <DecisionSummary
        summary={{ ma: { schemeId: 'A', reasoning: 'short reason' } }}
      />,
    );
    const card = screen.getByTestId('decision-summary-ma');
    expect(card.textContent).toContain('short reason');
    expect(card.textContent).not.toContain('…');
  });

  it('renders MD counts including zero values without crashing', () => {
    render(
      <DecisionSummary
        summary={{ md: { subModuleCount: 0, constraintCount: 0 } }}
      />,
    );
    const card = screen.getByTestId('decision-summary-md');
    expect(card.textContent).toContain('0 个模块');
    expect(card.textContent).toContain('0 类关键约束');
  });

  it('shows a "（未填写）" placeholder for empty MB decomposition', () => {
    render(<DecisionSummary summary={{ mb: { decomposition: '   ' } }} />);
    const card = screen.getByTestId('decision-summary-mb');
    expect(card.textContent).toContain('（未填写）');
  });
});
