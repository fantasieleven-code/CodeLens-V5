import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProfileSetup, profileStorageKey } from './ProfileSetup.js';
import { PROFILE_CONTENT } from './profileContent.js';

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/candidate/:sessionToken/profile"
          element={<ProfileSetup />}
        />
        <Route
          path="/exam/:sessionId"
          element={<div data-testid="exam-landed">exam</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function fillValidProfile(overrides: Partial<{
  yearsOfExperience: string;
  techStack: string[];
}> = {}): void {
  const years = overrides.yearsOfExperience ?? '3';
  const stack = overrides.techStack ?? ['typescript', 'react'];

  fireEvent.change(screen.getByTestId('field-yearsOfExperience'), {
    target: { value: years },
  });
  fireEvent.change(screen.getByTestId('field-currentRole'), {
    target: { value: 'fullstack' },
  });
  const techInput = screen.getByTestId('field-primaryTechStack-input');
  for (const item of stack) {
    fireEvent.change(techInput, { target: { value: item } });
    fireEvent.click(screen.getByTestId('field-primaryTechStack-add'));
  }
  fireEvent.change(screen.getByTestId('field-companySize'), {
    target: { value: 'medium' },
  });
  fireEvent.change(screen.getByTestId('field-aiToolYears'), {
    target: { value: '1' },
  });
  fireEvent.change(screen.getByTestId('field-primaryAiTool'), {
    target: { value: 'claude_code' },
  });
  fireEvent.change(screen.getByTestId('field-dailyAiUsageHours'), {
    target: { value: '1_3' },
  });
}

describe('<ProfileSetup />', () => {
  beforeEach(() => {
    localStorage.clear();
    (import.meta.env as Record<string, string | undefined>).VITE_API_URL =
      'http://api.test';
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = ORIGINAL_FETCH;
    delete (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
    vi.restoreAllMocks();
  });

  it('renders all 7 fields with bilingual labels and GDPR helps', () => {
    renderAt('/candidate/sess-abc/profile');
    const fieldNames = [
      'yearsOfExperience',
      'currentRole',
      'primaryTechStack',
      'companySize',
      'aiToolYears',
      'primaryAiTool',
      'dailyAiUsageHours',
    ] as const;
    for (const name of fieldNames) {
      const shell = screen.getByTestId(`field-shell-${name}`);
      expect(shell).toBeInTheDocument();
      expect(shell.textContent).toContain(PROFILE_CONTENT.fieldLabels[name].zh);
      expect(shell.textContent).toContain(PROFILE_CONTENT.fieldLabels[name].en);
      const help = screen.getByTestId(`field-help-${name}`);
      expect(help.textContent).toContain(PROFILE_CONTENT.fieldHelps[name].zh);
      expect(help.textContent).toContain(PROFILE_CONTENT.fieldHelps[name].en);
    }
  });

  it('renders all 7 GDPR help nodes (zh + en = 14 strings)', () => {
    renderAt('/candidate/sess-abc/profile');
    const helps = screen.getAllByTestId(/^field-help-/);
    expect(helps).toHaveLength(7);
    const joined = helps.map((el) => el.textContent ?? '').join('\n');
    const fieldNames = Object.keys(PROFILE_CONTENT.fieldHelps) as Array<
      keyof typeof PROFILE_CONTENT.fieldHelps
    >;
    for (const n of fieldNames) {
      expect(joined).toContain(PROFILE_CONTENT.fieldHelps[n].zh);
      expect(joined).toContain(PROFILE_CONTENT.fieldHelps[n].en);
    }
  });

  it('renders enum dropdown options for currentRole and primaryAiTool from shared schema', () => {
    renderAt('/candidate/sess-abc/profile');
    const role = screen.getByTestId('field-currentRole') as HTMLSelectElement;
    const roleVals = Array.from(role.options).map((o) => o.value);
    expect(roleVals).toEqual([
      '',
      'frontend',
      'backend',
      'fullstack',
      'mobile',
      'data',
      'devops',
      'engineering_manager',
    ]);

    const tool = screen.getByTestId('field-primaryAiTool') as HTMLSelectElement;
    const toolVals = Array.from(tool.options).map((o) => o.value);
    expect(toolVals).toEqual([
      '',
      'claude_code',
      'cursor',
      'copilot',
      'chatgpt',
      'gemini',
      'deepseek',
      'qwen',
      'tongyi_lingma',
      'other',
    ]);
  });

  it('rejects yearsOfExperience out of 0-50 range with VALIDATION_ERROR (no POST)', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    renderAt('/candidate/sess-abc/profile');
    fillValidProfile({ yearsOfExperience: '51' });
    fireEvent.click(screen.getByTestId('profile-submit'));

    const errEl = await screen.findByTestId('profile-error');
    expect(errEl.getAttribute('data-error-code')).toBe('VALIDATION_ERROR');
    expect(errEl.textContent).toContain(
      PROFILE_CONTENT.errors.VALIDATION_ERROR.zh,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem(profileStorageKey('sess-abc'))).toBeNull();
  });

  it('rejects primaryTechStack with only 1 item via VALIDATION_ERROR (no POST)', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    renderAt('/candidate/sess-abc/profile');
    fillValidProfile({ techStack: ['typescript'] });
    fireEvent.click(screen.getByTestId('profile-submit'));

    const errEl = await screen.findByTestId('profile-error');
    expect(errEl.getAttribute('data-error-code')).toBe('VALIDATION_ERROR');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('disables submit while submitting and re-enables after 200 only via navigation', async () => {
    let resolveFetch: ((r: Response) => void) | null = null;
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;

    renderAt('/candidate/sess-abc/profile');
    fillValidProfile();
    const submit = screen.getByTestId('profile-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);
    await waitFor(() => {
      expect(
        (screen.getByTestId('profile-submit') as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    resolveFetch!(
      jsonResponse(200, {
        ok: true,
        sessionId: 'sess-abc',
        profile: null,
        consentAcceptedAt: null,
      }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('exam-landed')).toBeInTheDocument();
    });
  });

  it('on 200 sets the per-session localStorage flag and navigates to /exam/:sessionToken', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    globalThis.fetch = vi.fn(async (url, init) => {
      captured = { url: String(url), init: init ?? {} };
      return jsonResponse(200, {
        ok: true,
        sessionId: 'sess-abc',
        profile: null,
        consentAcceptedAt: null,
      });
    }) as typeof fetch;

    renderAt('/candidate/sess-abc/profile');
    fillValidProfile();
    fireEvent.click(screen.getByTestId('profile-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('exam-landed')).toBeInTheDocument();
    });
    expect(localStorage.getItem(profileStorageKey('sess-abc'))).toBe('1');
    expect(captured).not.toBeNull();
    // Brief #13 C5 · candidateApi uses relative URLs (vite proxy /api → :4000).
    expect(captured!.url).toBe('/api/candidate/profile/submit');
    const body = JSON.parse(String(captured!.init.body));
    expect(body.sessionToken).toBe('sess-abc');
    expect(body.profile).toEqual({
      yearsOfExperience: 3,
      currentRole: 'fullstack',
      primaryTechStack: ['typescript', 'react'],
      companySize: 'medium',
      aiToolYears: 1,
      primaryAiTool: 'claude_code',
      dailyAiUsageHours: '1_3',
    });
  });

  it('on 401 flat legacy envelope surfaces AUTH_REQUIRED bilingual copy and skips localStorage', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, { error: 'Authentication required' }),
    ) as typeof fetch;

    renderAt('/candidate/sess-bad/profile');
    fillValidProfile();
    fireEvent.click(screen.getByTestId('profile-submit'));

    const errEl = await screen.findByTestId('profile-error');
    expect(errEl.getAttribute('data-error-code')).toBe('AUTH_REQUIRED');
    expect(errEl.textContent).toContain(
      PROFILE_CONTENT.errors.AUTH_REQUIRED.zh,
    );
    expect(errEl.textContent).toContain(
      PROFILE_CONTENT.errors.AUTH_REQUIRED.en,
    );
    expect(localStorage.getItem(profileStorageKey('sess-bad'))).toBeNull();
    expect(screen.queryByTestId('exam-landed')).not.toBeInTheDocument();
  });

  it('on 422 VALIDATION_ERROR from Backend surfaces the profile-specific bilingual copy', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(422, {
        error: { code: 'VALIDATION_ERROR', message: 'Invalid profile' },
      }),
    ) as typeof fetch;

    renderAt('/candidate/sess-abc/profile');
    fillValidProfile();
    fireEvent.click(screen.getByTestId('profile-submit'));

    const errEl = await screen.findByTestId('profile-error');
    expect(errEl.getAttribute('data-error-code')).toBe('VALIDATION_ERROR');
    expect(errEl.textContent).toContain(
      PROFILE_CONTENT.errors.VALIDATION_ERROR.zh,
    );
    expect(localStorage.getItem(profileStorageKey('sess-abc'))).toBeNull();
  });
});
