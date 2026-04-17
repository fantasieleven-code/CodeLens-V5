/**
 * PDF export for Layer 1 / Layer 2 reports.
 *
 * Pipeline:
 *   element → html2canvas (2x scale for retina sharpness)
 *           → jsPDF A4 portrait
 *           → if rendered image taller than one page, slice the canvas
 *             into page-sized chunks and stack them across PDF pages.
 *
 * Why this shape: ReportRenderer's root is a plain flex column, no
 * fixed heights — so the captured image can be arbitrarily tall,
 * and we need multi-page handling out of the box. For Layer 1 the
 * image is usually under one page; Layer 2 spills into 3-6 pages.
 *
 * This module is intentionally thin — pagination math + call sites
 * live together so tests can mock html2canvas / jsPDF once and cover
 * both the single-page and multi-page branches.
 */

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

import type { ReportLayer } from '../report/types.js';

/** A4 portrait in mm. */
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** html2canvas pixel-density multiplier. 2x keeps text crisp on retina. */
const CAPTURE_SCALE = 2;

export interface ExportLayerToPdfOptions {
  /** Layer being exported — baked into the default filename. */
  layer: ReportLayer;
  /** DOM element captured via html2canvas. */
  element: HTMLElement;
  /** Output filename. Caller is responsible for extension (`.pdf`). */
  filename: string;
  /**
   * Optional override for the html2canvas function. Tests inject a stub
   * here instead of loading the real canvas / DOM path.
   */
  html2canvasImpl?: typeof html2canvas;
  /**
   * Optional override for the jsPDF constructor. Tests inject a mock
   * class that records `addImage` / `addPage` / `save` calls.
   */
  jsPDFCtor?: typeof jsPDF;
}

/**
 * Build `{candidateName}_{suiteId}_{layer}_{timestamp}.pdf` safely.
 *
 * `candidateName` may contain spaces / CJK — we only strip characters
 * that browsers / filesystems actually choke on (slashes, colons,
 * wildcards), keeping CJK so the filename remains meaningful.
 */
export function buildReportFilename(input: {
  candidateName: string | undefined;
  suiteId: string;
  layer: ReportLayer;
  timestamp?: number;
}): string {
  const ts = input.timestamp ?? Date.now();
  const iso = new Date(ts).toISOString().slice(0, 10); // YYYY-MM-DD
  const candidate = (input.candidateName ?? 'candidate').replace(
    /[\\/:*?"<>|]/g,
    '_',
  );
  return `${candidate}_${input.suiteId}_${input.layer}_${iso}.pdf`;
}

/**
 * Capture `element` and emit a PDF. Handles multi-page pagination.
 *
 * Contract:
 *   - Resolves after `pdf.save()` — the browser download has been
 *     triggered; actual file-write is a no-op in JSDOM.
 *   - On any error (html2canvas throws, canvas is 0-sized), the
 *     promise rejects; callers should catch and surface a toast.
 */
export async function exportLayerToPdf(
  options: ExportLayerToPdfOptions,
): Promise<void> {
  const h2c = options.html2canvasImpl ?? html2canvas;
  const PDFCtor = options.jsPDFCtor ?? jsPDF;

  const canvas = await h2c(options.element, {
    scale: CAPTURE_SCALE,
    backgroundColor: '#1e1e2e', // Catppuccin Mocha `base`
    useCORS: true,
    logging: false,
  });

  if (!canvas.width || !canvas.height) {
    throw new Error('pdfExport: html2canvas produced an empty canvas');
  }

  const pdf = new PDFCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  // Fit the canvas to the page width; compute how tall it will be when
  // rendered at that width. If that height exceeds one page, slice.
  const imgWidthMm = A4_WIDTH_MM;
  const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

  const imgData = canvas.toDataURL('image/png');

  if (imgHeightMm <= A4_HEIGHT_MM) {
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidthMm, imgHeightMm);
  } else {
    // Multi-page: each page shows a vertical slice of the same image.
    // We achieve this by placing the full image offset upward and
    // letting jsPDF's clipping to page bounds handle the rest — simpler
    // than manually cropping canvas tiles, and jsPDF handles it natively.
    let heightLeft = imgHeightMm;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidthMm, imgHeightMm);
    heightLeft -= A4_HEIGHT_MM;
    while (heightLeft > 0) {
      position -= A4_HEIGHT_MM;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidthMm, imgHeightMm);
      heightLeft -= A4_HEIGHT_MM;
    }
  }

  pdf.save(options.filename);
}
