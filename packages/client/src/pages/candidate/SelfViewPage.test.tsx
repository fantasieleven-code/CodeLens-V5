import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { V5CandidateSelfView } from '@codelens-v5/shared';
import { SelfViewPage } from './SelfViewPage.js';
import { ProfileGuard } from './ProfileGuard.js';
import { CandidateApiError } from '../../services/candidateApi.js';
import * as candidateApi from '../../services/candidateApi.js';

const VALID_VIEW: V5CandidateSelfView = {
  sessionId: 'sess-sv',
  completedAt: '2026-04-20T10:00:00.000Z',
  capabilityProfiles: [
    {
      id: 'independent_delivery',
      nameZh: '独立交付能力',
      nameEn: 'Independent Delivery',
      label: '自主',
      description: '能独立交付中等复杂度任务。',
    },
    {
      id: 'ai_collaboration',
      nameZh: 'AI 协作能力',
      nameEn: 'AI Collaboration',
      label: '熟练',
      description: '能熟练与 AI 协作推进交付。',
    },
    {
      id: 'system_thinking',
      nameZh: '系统思维',
      nameEn: 'System Thinking',
      label: '有潜力',
      description: '系统设计思维有成长空间。',
    },
    {
      id: 'learning_agility',
      nameZh: '学习敏捷度',
      nameEn: 'Learning Agility',
      label: '待发展',
      description: '面对新技术的学习曲线可进一步优化。',
    },
  ],
  dimensionRadar: [
    {
      id: 'technicalJudgment',
      nameZh: '技术判断',
      nameEn: 'Technical Judgment',
      relativeStrength: 'strong',
    },
    {
      id: 'aiEngineering',
      nameZh: 'AI 协作成熟度',
      nameEn: 'AI Collaboration',
      relativeStrength: 'medium',
    },
    { id: 'systemDesign', nameZh: '系统设计', nameEn: 'System Design', relativeStrength: 'strong' },
    { id: 'codeQuality', nameZh: '代码质量', nameEn: 'Code Quality', relativeStrength: 'weak' },
    { id: 'communication', nameZh: '沟通', nameEn: 'Communication', relativeStrength: 'medium' },
    { id: 'metacognition', nameZh: '元认知', nameEn: 'Metacognition', relativeStrength: 'strong' },
  ],
};

function renderAt(path = '/candidate/self-view/sess-sv/tok-abc') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/candidate/self-view/:sessionId/:privateToken" element={<SelfViewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<SelfViewPage />', () => {
  beforeEach(() => {
    vi.spyOn(candidateApi, 'fetchCandidateSelfView').mockImplementation(
      () => new Promise(() => undefined),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders the loading state while the fetch is pending', () => {
    renderAt();
    expect(screen.getByTestId('self-view-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('self-view-page')).not.toBeInTheDocument();
  });

  it('renders all 4 capability profile cards with label + description', async () => {
    vi.spyOn(candidateApi, 'fetchCandidateSelfView').mockResolvedValue(VALID_VIEW);
    renderAt();
    await waitFor(() => {
      expect(screen.getByTestId('self-view-page')).toBeInTheDocument();
    });
    const cards = screen.getAllByTestId('self-view-profile-card');
    expect(cards).toHaveLength(4);
    expect(screen.getByText('独立交付能力')).toBeInTheDocument();
    expect(screen.getByText('AI 协作能力')).toBeInTheDocument();
    expect(screen.getByText('系统思维')).toBeInTheDocument();
    expect(screen.getByText('学习敏捷度')).toBeInTheDocument();
    expect(screen.getByText('自主')).toBeInTheDocument();
    expect(screen.getByText('熟练')).toBeInTheDocument();
    expect(screen.getByText('有潜力')).toBeInTheDocument();
    expect(screen.getByText('待发展')).toBeInTheDocument();
    expect(screen.getByText('能独立交付中等复杂度任务。')).toBeInTheDocument();
  });

  it('renders all 6 dimension bars with bilingual strength labels', async () => {
    vi.spyOn(candidateApi, 'fetchCandidateSelfView').mockResolvedValue(VALID_VIEW);
    renderAt();
    await waitFor(() => {
      expect(screen.getByTestId('self-view-radar-section')).toBeInTheDocument();
    });
    const bars = screen.getAllByTestId('self-view-dim-bar');
    expect(bars).toHaveLength(6);
    expect(screen.getAllByText('强').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\/\s*Strong/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('中').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\/\s*Medium/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('弱').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\/\s*Weak/).length).toBeGreaterThan(0);
  });

  it('hides abs score / grade / dangerFlag / signal-id fields (ethics floor DOM assertion)', async () => {
    vi.spyOn(candidateApi, 'fetchCandidateSelfView').mockResolvedValue(VALID_VIEW);
    const { container } = renderAt();
    await waitFor(() => {
      expect(screen.getByTestId('self-view-page')).toBeInTheDocument();
    });
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/grade/i);
    expect(text).not.toMatch(/composite/i);
    expect(text).not.toMatch(/dangerFlag/i);
    expect(text).not.toMatch(/\bscore\b/i);
    expect(text).not.toMatch(/sAiOrchestration|sDesignDecomposition|sTradeoff/);
    expect(text).not.toMatch(/\b[0-9]{2,3}\s*(分|\/\s*100|points?)\b/);
  });

  it('does not link candidates to the company-facing report or admin surfaces', async () => {
    vi.spyOn(candidateApi, 'fetchCandidateSelfView').mockResolvedValue(VALID_VIEW);
    const { container } = renderAt();
    await waitFor(() => {
      expect(screen.getByTestId('self-view-page')).toBeInTheDocument();
    });

    expect(container.querySelector('a[href*="/report"]')).toBeNull();
    expect(container.querySelector('a[href*="/admin"]')).toBeNull();
  });

  it('shows the NOT_FOUND error message on a 404 from the API', async () => {
    vi.spyOn(candidateApi, 'fetchCandidateSelfView').mockRejectedValue(
      new CandidateApiError('NOT_FOUND', 404, 'Session not found'),
    );
    renderAt();
    await waitFor(() => {
      expect(screen.getByTestId('self-view-error-NOT_FOUND')).toBeInTheDocument();
    });
    expect(screen.getByText(/链接无效或已过期/)).toBeInTheDocument();
    expect(screen.getByText(/Link invalid or expired/)).toBeInTheDocument();
    expect(screen.queryByTestId('self-view-page')).not.toBeInTheDocument();
  });

  it('shows the SESSION_INCOMPLETE error message on a 400 with the new code', async () => {
    vi.spyOn(candidateApi, 'fetchCandidateSelfView').mockRejectedValue(
      new CandidateApiError('SESSION_INCOMPLETE', 400, 'Session not yet completed'),
    );
    renderAt();
    await waitFor(() => {
      expect(screen.getByTestId('self-view-error-SESSION_INCOMPLETE')).toBeInTheDocument();
    });
    expect(screen.getByText(/考试尚未完成/)).toBeInTheDocument();
  });

  it('falls back to INTERNAL_ERROR on an unknown error', async () => {
    vi.spyOn(candidateApi, 'fetchCandidateSelfView').mockRejectedValue(new Error('boom'));
    renderAt();
    await waitFor(() => {
      expect(screen.getByTestId('self-view-error-INTERNAL_ERROR')).toBeInTheDocument();
    });
    expect(screen.getByText(/服务端暂时无法处理请求/)).toBeInTheDocument();
  });

  it('renders the ethics note + private-link footer (narrative closure)', async () => {
    vi.spyOn(candidateApi, 'fetchCandidateSelfView').mockResolvedValue(VALID_VIEW);
    renderAt();
    await waitFor(() => {
      expect(screen.getByTestId('self-view-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('self-view-ethics-note')).toBeInTheDocument();
    expect(screen.getByText(/此页仅你本人可见/)).toBeInTheDocument();
    expect(screen.getByText(/This page is private to you/)).toBeInTheDocument();
    expect(screen.getByTestId('self-view-footer')).toBeInTheDocument();
    expect(screen.getByText(/请妥善保存此链接 · 不可通过公司后台重新获取/)).toBeInTheDocument();
  });
});

describe('SelfView route wiring (App.tsx)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(candidateApi, 'fetchCandidateSelfView').mockResolvedValue(VALID_VIEW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('mounts SelfViewPage at /candidate/self-view/:sessionId/:privateToken (4-segment path · does not match /candidate/:sessionToken/profile)', async () => {
    render(
      <MemoryRouter initialEntries={['/candidate/self-view/sess-r1/tok-r1']}>
        <Routes>
          <Route
            path="/candidate/:sessionToken/profile"
            element={
              <ProfileGuard>
                <div data-testid="profile-landed">profile</div>
              </ProfileGuard>
            }
          />
          <Route path="/candidate/self-view/:sessionId/:privateToken" element={<SelfViewPage />} />
          <Route
            path="/candidate/:sessionToken/consent"
            element={<div data-testid="consent-landed">consent</div>}
          />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('self-view-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('profile-landed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('consent-landed')).not.toBeInTheDocument();
  });

  it('renders without any consent / profile localStorage flag set (URL-as-auth · no Guard redirect)', async () => {
    expect(localStorage.getItem('codelens_candidate_consent:sess-r2')).toBeNull();
    expect(localStorage.getItem('codelens_candidate_profile_submitted:sess-r2')).toBeNull();

    render(
      <MemoryRouter initialEntries={['/candidate/self-view/sess-r2/tok-r2']}>
        <Routes>
          <Route path="/candidate/self-view/:sessionId/:privateToken" element={<SelfViewPage />} />
          <Route
            path="/candidate/:sessionToken/consent"
            element={<div data-testid="consent-redirect">consent</div>}
          />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('self-view-page')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('consent-redirect')).not.toBeInTheDocument();
  });
});
