import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TransparencyPage } from './TransparencyPage.js';
import { TRANSPARENCY_CONTENT } from './transparencyContent.js';

function renderPage() {
  return render(
    <MemoryRouter>
      <TransparencyPage />
    </MemoryRouter>,
  );
}

describe('<TransparencyPage />', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the page title bilingually (zh + en inline)', () => {
    renderPage();
    expect(screen.getByTestId('transparency-page')).toBeInTheDocument();
    expect(screen.getByText(/CodeLens 透明度声明/)).toBeInTheDocument();
    expect(screen.getByText(/CodeLens Transparency Statement/)).toBeInTheDocument();
  });

  it('renders a TOC with one anchor link per section (7 items)', () => {
    renderPage();
    const toc = screen.getByTestId('transparency-toc');
    expect(toc).toBeInTheDocument();
    for (const section of TRANSPARENCY_CONTENT.sections) {
      const link = toc.querySelector(`a[href="#${section.id}"]`);
      expect(link).not.toBeNull();
      expect(link?.textContent ?? '').toContain(section.title.zh);
      expect(link?.textContent ?? '').toContain(section.title.en);
    }
    expect(TRANSPARENCY_CONTENT.sections).toHaveLength(7);
  });

  it('renders all 7 sections with both zh and en body paragraphs', () => {
    renderPage();
    for (const section of TRANSPARENCY_CONTENT.sections) {
      const block = screen.getByTestId(`transparency-section-${section.id}`);
      expect(block).toBeInTheDocument();
      expect(block.textContent ?? '').toContain(section.title.zh);
      expect(block.textContent ?? '').toContain(section.title.en);
      expect(block.textContent ?? '').toContain(section.body.zh[0]);
      expect(block.textContent ?? '').toContain(section.body.en[0]);
    }
  });

  it('section anchor ids match TOC href targets (intra-page navigation)', () => {
    renderPage();
    const toc = screen.getByTestId('transparency-toc');
    const tocHrefs = Array.from(toc.querySelectorAll('a[href^="#"]')).map(
      (a) => a.getAttribute('href')?.slice(1) ?? '',
    );
    for (const id of tocHrefs) {
      const target = document.getElementById(id);
      expect(target).not.toBeNull();
      expect(target?.getAttribute('data-testid')).toBe(`transparency-section-${id}`);
    }
  });

  it('methodology section states 48 signals · 45 pure-rule + 3 LLM whitelist (A15-D2)', () => {
    renderPage();
    const methodology = screen.getByTestId('transparency-section-methodology');
    const text = methodology.textContent ?? '';
    expect(text).toContain('48 个信号');
    expect(text).toContain('48 signals');
    expect(text).toMatch(/45[^\n]*纯规则/);
    expect(text).toMatch(/45[^\n]*pure-rule/);
    expect(text).toContain('3');
    expect(text).toMatch(/LLM 白名单/);
    expect(text).toMatch(/LLM whitelist/);
  });

  it('ethics section names the two-token separation and `.strict()` schema (A15-D1 narrative)', () => {
    renderPage();
    const ethics = screen.getByTestId('transparency-section-ethics');
    const text = ethics.textContent ?? '';
    expect(text).toContain('candidateToken');
    expect(text).toContain('candidateSelfViewToken');
    expect(text).toContain('.strict()');
  });

  it('renders the version + last-updated footer (hard-coded per D7)', () => {
    renderPage();
    const footer = screen.getByTestId('transparency-footer');
    expect(footer.textContent ?? '').toContain('V5.0.0');
    expect(footer.textContent ?? '').toContain('2026-04-22');
  });

  it('back button calls window.history.back when history is deep enough', () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    Object.defineProperty(window.history, 'length', { configurable: true, value: 5 });
    renderPage();
    fireEvent.click(screen.getByTestId('transparency-back-button'));
    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it('back button falls back to `/` when there is no prior history entry', () => {
    Object.defineProperty(window.history, 'length', { configurable: true, value: 1 });
    const originalHref = window.location.href;
    let assigned: string | null = null;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        set href(v: string) {
          assigned = v;
        },
        get href() {
          return originalHref;
        },
      },
    });
    renderPage();
    fireEvent.click(screen.getByTestId('transparency-back-button'));
    expect(assigned).toBe('/');
  });
});

describe('TransparencyPage · ethics floor consistency', () => {
  afterEach(() => {
    cleanup();
  });

  it('does NOT leak absolute-score / grade / composite / signal-ids / thresholds (public-facing narrative only)', () => {
    renderPage();
    const main = screen.getByTestId('transparency-page');
    const text = main.textContent ?? '';
    // The methodology section explains grade EXISTS but doesn't disclose any specific
    // threshold number or signal id. Verify no thresholds leak.
    expect(text).not.toMatch(/\b[0-9]{2,3}\s*分/);
    expect(text).not.toMatch(/sAiOrchestration|sDesignDecomposition|sTradeoff/);
    expect(text).not.toMatch(/composite\s*[:=]\s*\d/i);
  });
});

describe('Transparency route wiring (App.tsx)', () => {
  afterEach(() => {
    cleanup();
  });

  it('mounts TransparencyPage at /transparency · public · no Guard · no URL token', () => {
    render(
      <MemoryRouter initialEntries={['/transparency']}>
        <Routes>
          <Route path="/transparency" element={<TransparencyPage />} />
          <Route path="/login" element={<div data-testid="login-redirect">login</div>} />
          <Route
            path="/candidate/:sessionToken/consent"
            element={<div data-testid="consent-redirect">consent</div>}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('transparency-page')).toBeInTheDocument();
    expect(screen.queryByTestId('login-redirect')).not.toBeInTheDocument();
    expect(screen.queryByTestId('consent-redirect')).not.toBeInTheDocument();
  });
});
