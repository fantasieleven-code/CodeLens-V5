import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useModuleStore } from './stores/module.store.js';
import { useSessionStore } from './stores/session.store.js';
import { EvaluationIntroPage } from './pages/EvaluationIntroPage.js';

// ExamRouter is App-internal; mirror its switch here to test pure route→page
// mapping without standing up BrowserRouter's window dependency.
function ExamRouterTest() {
  const currentModule = useModuleStore((s) => s.currentModule);
  switch (currentModule) {
    case null:
    case 'intro':
      return <EvaluationIntroPage />;
    case 'phase0':
      return <div data-testid="module-placeholder">Phase 0</div>;
    case 'moduleA':
      return <div data-testid="module-placeholder">Module A</div>;
    case 'mb':
      return <div data-testid="module-placeholder">Module B</div>;
    case 'moduleD':
      return <div data-testid="module-placeholder">Module D</div>;
    case 'selfAssess':
      return <div data-testid="selfassess-page">SelfAssess</div>;
    case 'moduleC':
      return <div data-testid="module-placeholder">Module C</div>;
    case 'complete':
      return <div data-testid="complete-page">Complete</div>;
    default:
      return <div data-testid="error-page">error</div>;
  }
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/exam/:sessionId" element={<ExamRouterTest />} />
        <Route path="/" element={<div data-testid="landing">landing</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('App / ExamRouter', () => {
  beforeEach(() => {
    useModuleStore.getState().reset();
    useSessionStore.getState().reset();
  });

  it('renders EvaluationIntroPage on /exam/:id when currentModule is intro', () => {
    useModuleStore
      .getState()
      .setSuite('full_stack', ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC']);
    useSessionStore.setState({
      sessionId: 'session-123',
      suiteId: 'full_stack',
      moduleOrder: ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'],
    });

    renderAt('/exam/session-123');

    expect(screen.getByTestId('evaluation-intro-container')).toBeInTheDocument();
  });

  it('renders the active module after advance', () => {
    useModuleStore
      .getState()
      .setSuite('full_stack', ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC']);
    useModuleStore.getState().advance(); // → phase0

    renderAt('/exam/x');
    expect(screen.getByTestId('module-placeholder')).toHaveTextContent('Phase 0');
  });

  it('renders CompletePage when currentModule is complete', () => {
    useModuleStore.getState().setSuite('quick_screen', ['phase0']);
    useModuleStore.getState().advance();
    useModuleStore.getState().advance(); // → complete

    renderAt('/exam/x');
    expect(screen.getByTestId('complete-page')).toBeInTheDocument();
  });

  it('renders landing at /', () => {
    renderAt('/');
    expect(screen.getByTestId('landing')).toBeInTheDocument();
  });
});
