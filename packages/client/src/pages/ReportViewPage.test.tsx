import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ReportViewPage } from './ReportViewPage.js';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/report/:sessionId" element={<ReportViewPage />} />
        <Route path="/" element={<div data-testid="landing">landing</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('<ReportViewPage />', () => {
  it('renders the placeholder for an unknown sessionId', () => {
    renderAt('/report/real-session-abc');
    expect(screen.getByTestId('report-view-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('report-view-page')).not.toBeInTheDocument();
  });

  it('routes demo-s-plus to the sPlus fixture', () => {
    renderAt('/report/demo-s-plus');
    expect(screen.getByTestId('report-view-page')).toBeInTheDocument();
    // ReportRenderer marks itself with layer — summary is the default.
    expect(screen.getByTestId('report-renderer-summary')).toBeInTheDocument();
  });

  it('routes demo-a and demo-b to their respective fixtures', () => {
    renderAt('/report/demo-a');
    expect(screen.getByTestId('report-view-page')).toBeInTheDocument();

    // Re-render for the second fixture in a fresh tree.
    renderAt('/report/demo-b');
    const pages = screen.getAllByTestId('report-view-page');
    expect(pages.length).toBeGreaterThanOrEqual(1);
  });

  it('toggles between summary and detail layers', () => {
    renderAt('/report/demo-s-plus');
    expect(screen.getByTestId('report-renderer-summary')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('report-view-layer-detail'));
    expect(screen.getByTestId('report-renderer-detail')).toBeInTheDocument();
    expect(screen.queryByTestId('report-renderer-summary')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('report-view-layer-summary'));
    expect(screen.getByTestId('report-renderer-summary')).toBeInTheDocument();
  });

  it('placeholder home button navigates back to /', () => {
    renderAt('/report/no-such-session');
    fireEvent.click(screen.getByTestId('report-view-home-btn'));
    expect(screen.getByTestId('landing')).toBeInTheDocument();
  });
});
