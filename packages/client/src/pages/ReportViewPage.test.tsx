import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as PdfExportModule from '../utils/pdfExport.js';

const exportLayerToPdf = vi.fn<
  (opts: { layer: string; filename: string; element: HTMLElement }) => Promise<void>
>();

vi.mock('../utils/pdfExport.js', async () => {
  const actual = await vi.importActual<typeof PdfExportModule>(
    '../utils/pdfExport.js',
  );
  return {
    ...actual,
    exportLayerToPdf: (opts: Parameters<typeof exportLayerToPdf>[0]) =>
      exportLayerToPdf(opts),
  };
});

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

beforeEach(() => {
  exportLayerToPdf.mockReset();
  exportLayerToPdf.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

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

describe('<ReportViewPage /> PDF export', () => {
  it('exposes both export buttons when a fixture loads', () => {
    renderAt('/report/demo-a');
    expect(screen.getByTestId('report-view-export-summary')).toBeInTheDocument();
    expect(screen.getByTestId('report-view-export-detail')).toBeInTheDocument();
  });

  it('omits the export buttons when the placeholder is shown', () => {
    renderAt('/report/unknown');
    expect(screen.queryByTestId('report-view-export-summary')).toBeNull();
    expect(screen.queryByTestId('report-view-export-detail')).toBeNull();
  });

  it('invokes exportLayerToPdf with a summary filename on summary export', async () => {
    renderAt('/report/demo-a');
    await act(async () => {
      fireEvent.click(screen.getByTestId('report-view-export-summary'));
    });
    await waitFor(() => expect(exportLayerToPdf).toHaveBeenCalledTimes(1));
    const call = exportLayerToPdf.mock.calls[0][0];
    expect(call.layer).toBe('summary');
    expect(call.filename).toMatch(/_full_stack_summary_.+\.pdf$/);
    expect(call.element).toBeInstanceOf(HTMLElement);
  });

  it('switches to detail layer during detail export and restores the previous layer afterwards', async () => {
    renderAt('/report/demo-a');
    expect(screen.getByTestId('report-renderer-summary')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('report-view-export-detail'));
    });
    await waitFor(() => expect(exportLayerToPdf).toHaveBeenCalledTimes(1));
    expect(exportLayerToPdf.mock.calls[0][0].layer).toBe('detail');
    // After export completes, layer restored to summary.
    await waitFor(() =>
      expect(screen.getByTestId('report-renderer-summary')).toBeInTheDocument(),
    );
  });

  it('surfaces an error banner when exportLayerToPdf rejects', async () => {
    exportLayerToPdf.mockRejectedValueOnce(new Error('canvas empty'));
    renderAt('/report/demo-a');
    await act(async () => {
      fireEvent.click(screen.getByTestId('report-view-export-summary'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('report-view-export-error')).toHaveTextContent(
        /canvas empty/,
      ),
    );
  });
});
