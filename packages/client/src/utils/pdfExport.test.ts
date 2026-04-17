/**
 * pdfExport tests — inject html2canvas/jsPDF mocks so we can exercise
 * both the single-page branch and the multi-page pagination branch
 * without depending on real canvas/jsdom rendering.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  buildReportFilename,
  exportLayerToPdf,
} from './pdfExport.js';

type AddImageArgs = [string, string, number, number, number, number];

function makePdfMock() {
  const addImage = vi.fn<(...args: AddImageArgs) => void>();
  const addPage = vi.fn<() => void>();
  const save = vi.fn<(name: string) => void>();
  const ctor = vi.fn().mockImplementation(function PDFStub() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const self = this as any;
    self.addImage = addImage;
    self.addPage = addPage;
    self.save = save;
  });
  return { ctor, addImage, addPage, save };
}

function makeCanvasMock(w: number, h: number) {
  return {
    width: w,
    height: h,
    toDataURL: () => 'data:image/png;base64,MOCK',
  };
}

describe('buildReportFilename', () => {
  it('joins candidate/suite/layer/iso-date with underscores', () => {
    const ts = Date.UTC(2026, 3, 18); // 2026-04-18
    const name = buildReportFilename({
      candidateName: '候选人 示例',
      suiteId: 'full_stack',
      layer: 'summary',
      timestamp: ts,
    });
    expect(name).toBe('候选人 示例_full_stack_summary_2026-04-18.pdf');
  });

  it('falls back to "candidate" when name is undefined', () => {
    const name = buildReportFilename({
      candidateName: undefined,
      suiteId: 'architect',
      layer: 'detail',
      timestamp: Date.UTC(2026, 3, 18),
    });
    expect(name).toBe('candidate_architect_detail_2026-04-18.pdf');
  });

  it('sanitises filesystem-unsafe characters but keeps CJK', () => {
    const name = buildReportFilename({
      candidateName: 'a/b\\c:d*e?f"g<h>i|j王',
      suiteId: 'full_stack',
      layer: 'summary',
      timestamp: Date.UTC(2026, 3, 18),
    });
    expect(name).toBe('a_b_c_d_e_f_g_h_i_j王_full_stack_summary_2026-04-18.pdf');
  });
});

describe('exportLayerToPdf', () => {
  function el(): HTMLElement {
    const div = document.createElement('div');
    div.innerHTML = '<p>report content</p>';
    return div;
  }

  it('renders a single page when image fits inside A4 height', async () => {
    // 800x1000 at 210mm width → 262.5mm tall → fits on one 297mm page.
    const html2canvasImpl = vi
      .fn()
      .mockResolvedValue(makeCanvasMock(800, 1000));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdf = makePdfMock() as any;

    await exportLayerToPdf({
      layer: 'summary',
      element: el(),
      filename: 'a.pdf',
      html2canvasImpl,
      jsPDFCtor: pdf.ctor,
    });

    expect(html2canvasImpl).toHaveBeenCalledTimes(1);
    expect(pdf.ctor).toHaveBeenCalledTimes(1);
    expect(pdf.addImage).toHaveBeenCalledTimes(1);
    expect(pdf.addPage).not.toHaveBeenCalled();
    expect(pdf.save).toHaveBeenCalledWith('a.pdf');

    // addImage(dataURL, 'PNG', x=0, y=0, w=210, h≈262.5)
    const [, fmt, x, y, w, h] = pdf.addImage.mock.calls[0];
    expect(fmt).toBe('PNG');
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(w).toBe(210);
    expect(h).toBeCloseTo(262.5, 1);
  });

  it('adds pages for tall canvases and moves image upward each page', async () => {
    // 800x4000 at 210mm width → 1050mm tall → spills to 4 pages of 297mm each.
    const html2canvasImpl = vi
      .fn()
      .mockResolvedValue(makeCanvasMock(800, 4000));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdf = makePdfMock() as any;

    await exportLayerToPdf({
      layer: 'detail',
      element: el(),
      filename: 'b.pdf',
      html2canvasImpl,
      jsPDFCtor: pdf.ctor,
    });

    // 1050 / 297 → ceil 4 pages = 4 addImage, 3 addPage
    expect(pdf.addImage).toHaveBeenCalledTimes(4);
    expect(pdf.addPage).toHaveBeenCalledTimes(3);
    expect(pdf.save).toHaveBeenCalledWith('b.pdf');

    // Y position decreases by 297mm on each subsequent page.
    const ys = pdf.addImage.mock.calls.map((c: AddImageArgs) => c[3]);
    expect(ys[0]).toBe(0);
    expect(ys[1]).toBeCloseTo(-297, 1);
    expect(ys[2]).toBeCloseTo(-594, 1);
    expect(ys[3]).toBeCloseTo(-891, 1);
  });

  it('rejects if html2canvas returns an empty canvas', async () => {
    const html2canvasImpl = vi
      .fn()
      .mockResolvedValue(makeCanvasMock(0, 0));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdf = makePdfMock() as any;

    await expect(
      exportLayerToPdf({
        layer: 'summary',
        element: el(),
        filename: 'x.pdf',
        html2canvasImpl,
        jsPDFCtor: pdf.ctor,
      }),
    ).rejects.toThrow(/empty canvas/);

    expect(pdf.ctor).not.toHaveBeenCalled();
    expect(pdf.save).not.toHaveBeenCalled();
  });
});
