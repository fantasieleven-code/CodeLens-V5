import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SignalBarsSection } from './SignalBarsSection.js';
import { sPlusArchitectFixture } from '../__fixtures__/index.js';

describe('<SignalBarsSection />', () => {
  it('groups signals by dimension and shows N/A summary', () => {
    render(<SignalBarsSection viewModel={sPlusArchitectFixture} />);
    // sPlus-architect 无 MB(aiEngineering 有若干 null)+ 无 sModifyQuality / sEditPatternQuality。
    expect(screen.getByTestId('signal-group-technicalJudgment')).toBeInTheDocument();
    expect(screen.getByTestId('signal-group-systemDesign')).toBeInTheDocument();
    expect(screen.getByTestId('signal-na-row')).toBeInTheDocument();
  });

  it('expands evidence on toggle click', () => {
    render(<SignalBarsSection viewModel={sPlusArchitectFixture} />);

    const signalId = 'sSchemeJudgment';
    expect(screen.queryByTestId(`signal-evidence-${signalId}`)).toBeNull();

    const toggle = screen.getByTestId(`signal-toggle-${signalId}`);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const evidence = screen.getByTestId(`signal-evidence-${signalId}`);
    expect(evidence).toBeInTheDocument();
    // Mock signals 都带 3 条 evidence,检查渲染了 algorithmVersion 和 triggeredRule。
    expect(evidence).toHaveTextContent('算法版本');
    expect(evidence).toHaveTextContent('mock_rule_primary');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId(`signal-evidence-${signalId}`)).toBeNull();
  });
});
