import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EvaluationIntroPage } from './EvaluationIntroPage.js';
import { useModuleStore } from '../stores/module.store.js';
import { useSessionStore } from '../stores/session.store.js';

describe('<EvaluationIntroPage />', () => {
  beforeEach(() => {
    useModuleStore.getState().reset();
    useSessionStore.getState().reset();
  });

  it('renders suite name, estimated minutes, and module list', () => {
    useModuleStore
      .getState()
      .setSuite('full_stack', ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC']);
    // Mirror to session store for the intro-time branch.
    useSessionStore.setState({
      suiteId: 'full_stack',
      moduleOrder: ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'],
    });

    render(<EvaluationIntroPage />);

    expect(screen.getByTestId('evaluation-intro-container')).toBeInTheDocument();
    expect(screen.getByTestId('evaluation-intro-suite-name')).toHaveTextContent(
      '全面评估',
    );
    expect(
      screen.getByTestId('evaluation-intro-estimated-minutes'),
    ).toHaveTextContent('60');
    const list = screen.getByTestId('evaluation-intro-module-list');
    expect(list.querySelectorAll('li')).toHaveLength(5);
  });

  it('start button advances from intro to the first module', () => {
    useModuleStore
      .getState()
      .setSuite('quick_screen', ['phase0', 'moduleA', 'mb', 'selfAssess']);
    useSessionStore.setState({
      suiteId: 'quick_screen',
      moduleOrder: ['phase0', 'moduleA', 'mb', 'selfAssess'],
    });

    render(<EvaluationIntroPage />);
    expect(useModuleStore.getState().currentModule).toBe('intro');

    fireEvent.click(screen.getByTestId('evaluation-intro-start-button'));
    expect(useModuleStore.getState().currentModule).toBe('phase0');
  });

  it('disables the start button when no suite is loaded', () => {
    render(<EvaluationIntroPage />);
    const btn = screen.getByTestId(
      'evaluation-intro-start-button',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
