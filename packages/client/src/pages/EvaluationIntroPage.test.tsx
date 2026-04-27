import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { EvaluationIntroPage } from './EvaluationIntroPage.js';
import { useModuleStore } from '../stores/module.store.js';
import { useSessionStore } from '../stores/session.store.js';

const ORIGINAL_FETCH = globalThis.fetch;

describe('<EvaluationIntroPage />', () => {
  beforeEach(() => {
    useModuleStore.getState().reset();
    useSessionStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
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

  it('shows a loading state while loadStatus = loading and no suite resolved', () => {
    useSessionStore.setState({ loadStatus: 'loading' });
    render(<EvaluationIntroPage />);
    expect(screen.getByTestId('evaluation-intro-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('evaluation-intro-container')).toBeNull();
  });

  it('renders error UX when loadStatus = error', () => {
    useSessionStore.setState({ loadStatus: 'error', loadError: '未找到会话 bad-id' });
    render(<EvaluationIntroPage />);
    const err = screen.getByTestId('evaluation-intro-error');
    expect(err).toBeInTheDocument();
    expect(err).toHaveTextContent('无法加载评估');
    expect(err).toHaveTextContent('bad-id');
  });

  it('falls back to a default error copy when loadError is null', () => {
    useSessionStore.setState({ loadStatus: 'error', loadError: null });
    render(<EvaluationIntroPage />);
    expect(screen.getByTestId('evaluation-intro-error')).toHaveTextContent(
      /链接无效|过期/,
    );
  });

  it('renders the intro after loadSession resolves a real session id', async () => {
    // Brief #13 D17 · loadSession is now Layer 2 (real fetch via
    // /api/v5/session/:id). Mock fetch to assert the page hydrates from the
    // backend response shape.
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 'sess-uuid-1',
          candidate: { id: 'cand-1', name: 'Liam', email: 'liam@test' },
          suiteId: 'full_stack',
          examInstanceId: 'e0000000-0000-0000-0000-000000000001',
          status: 'CREATED',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as typeof fetch;

    await useSessionStore.getState().loadSession('sess-uuid-1');
    render(<EvaluationIntroPage />);
    // full_stack suite → 5 modules, 60 minutes
    expect(screen.getByTestId('evaluation-intro-container')).toBeInTheDocument();
    expect(screen.getByTestId('evaluation-intro-suite-name')).toHaveTextContent(
      '全面评估',
    );
    const list = screen.getByTestId('evaluation-intro-module-list');
    expect(list.querySelectorAll('li')).toHaveLength(5);
  });
});
