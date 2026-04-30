/**
 * CompletePage tests — verifies the summary the candidate sees at the
 * terminal page reflects actual submissions + timer + moduleOrder:
 *   - hero + root testid present
 *   - per-module rows rendered in moduleOrder with correct done/未参加 badge
 *   - MB detail shows pass-rate when MB submitted
 *   - session id short tag renders
 *   - timer elapsed converts to minutes (floor to 1 min)
 *   - no full-report CTA is exposed to candidates
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { V5MBSubmission, V5SelfAssessSubmission } from '@codelens-v5/shared';
import { CompletePage } from './CompletePage.js';
import { useModuleStore } from '../stores/module.store.js';
import { useSessionStore } from '../stores/session.store.js';

const ORDER = ['phase0', 'moduleA', 'mb', 'moduleD', 'selfAssess', 'moduleC'] as const;

const MB_SUB: V5MBSubmission = {
  editorBehavior: {
    aiCompletionEvents: [],
    chatEvents: [],
    diffEvents: [],
    fileNavigationHistory: [],
    editSessions: [],
    testRuns: [],
  },
  finalFiles: [],
  finalTestPassRate: 0.85,
};

const SELF_SUB: V5SelfAssessSubmission = { confidence: 70, reasoning: 'ok' };

function seed() {
  useModuleStore.getState().reset();
  useSessionStore.getState().reset();
  useModuleStore.getState().setSuite('full_stack', [...ORDER]);
}

function renderCompletePage() {
  return render(
    <MemoryRouter>
      <CompletePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  seed();
});

afterEach(() => cleanup());

describe('<CompletePage />', () => {
  it('renders the hero + root testid', () => {
    renderCompletePage();
    expect(screen.getByTestId('complete-root')).toBeInTheDocument();
    expect(screen.getByText('评估已完成')).toBeInTheDocument();
  });

  it('renders one row per module in moduleOrder with correct badge states', () => {
    useSessionStore.getState().setModuleSubmissionLocal('moduleA', {
      round1: {
        schemeId: 'A',
        reasoning: 'x',
        structuredForm: { scenario: 'x', tradeoff: 'x', decision: 'x', verification: 'x' },
        challengeResponse: 'x',
      },
      round2: { markedDefects: [] },
      round3: { correctVersionChoice: 'success', diffAnalysis: 'x', diagnosisText: 'x' },
      round4: { response: 'x', submittedAt: 0, timeSpentSec: 0 },
    });
    useSessionStore.getState().setModuleSubmissionLocal('selfAssess', SELF_SUB);

    renderCompletePage();

    for (const m of ORDER) {
      expect(screen.getByTestId(`complete-module-${m}`)).toBeInTheDocument();
    }

    expect(screen.getByTestId('complete-module-moduleA-badge').textContent).toBe('已完成');
    expect(screen.getByTestId('complete-module-selfAssess-badge').textContent).toBe('已完成');
    expect(screen.getByTestId('complete-module-mb-badge').textContent).toBe('未参加');
    expect(screen.getByTestId('complete-module-moduleD-badge').textContent).toBe('未参加');
  });

  it('shows MB pass-rate detail when MB submission exists', () => {
    useSessionStore.getState().setModuleSubmissionLocal('mb', MB_SUB);
    renderCompletePage();
    const row = screen.getByTestId('complete-module-mb');
    expect(row.textContent).toContain('通过率 85%');
  });

  it('omits MB detail when MB is not submitted', () => {
    renderCompletePage();
    const row = screen.getByTestId('complete-module-mb');
    expect(row.textContent).not.toContain('通过率');
  });

  it('renders short session id tag when sessionId is set', () => {
    useSessionStore.setState({ sessionId: 'abcdef1234567890' });
    renderCompletePage();
    expect(screen.getByText('Session abcdef12')).toBeInTheDocument();
  });

  it('falls back to -------- session id when sessionId is null', () => {
    renderCompletePage();
    expect(screen.getByText(/Session --------/)).toBeInTheDocument();
  });

  it('does not expose a full-report CTA when sessionId exists', () => {
    useSessionStore.setState({ sessionId: 'abcdef1234567890' });
    renderCompletePage();
    expect(screen.queryByTestId('complete-view-report-btn')).not.toBeInTheDocument();
    expect(screen.getByTestId('complete-self-view-note')).toHaveTextContent(
      'private self-view',
    );
  });

  it('does not expose a full-report CTA when sessionId is null', () => {
    renderCompletePage();
    expect(screen.queryByTestId('complete-view-report-btn')).not.toBeInTheDocument();
  });

  it('converts timer elapsedMs to rounded minutes (min 1)', () => {
    useSessionStore.setState({
      timer: { elapsedMs: 15 * 60_000 + 20_000, state: 'running', startedAt: 0 } as never,
    });
    renderCompletePage();
    // Expect "15" to appear as stat number (15m 20s → 15 min rounded).
    const statRow = screen.getAllByText('15');
    expect(statRow.length).toBeGreaterThan(0);
  });

  it('shows at least 1 minute even when elapsed is 0', () => {
    renderCompletePage();
    // Default timer=null → elapsedMs=0 → formatDuration clamps to 1.
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
