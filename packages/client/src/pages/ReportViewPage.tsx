/**
 * ReportViewPage — /report/:sessionId
 *
 * Candidate / recruiter entry-point into a finished report.
 *
 * Task 3 scope: we don't yet have a backend, so sessionId maps to one of
 * three demo fixtures. Non-demo sessionIds show a "real pipeline pending"
 * placeholder. Task 9+ will swap the fixture map for a real fetch.
 *
 * - demo-s-plus → sPlus-architect fixture
 * - demo-a      → a-fullstack-boundary fixture
 * - demo-b      → b-fullstack-danger fixture
 * - anything else → placeholder
 *
 * Offers a summary / detail layer toggle so the recruiter can expand the
 * double-layer structure introduced in Task 2.
 */

import React, { useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ReportRenderer } from '../report/ReportRenderer.js';
import { registerAllSections, TransparencyStatement } from '../report/sections/index.js';
import { REPORT_FIXTURES } from '../report/__fixtures__/index.js';
import type { ReportLayer, ReportViewModel } from '../report/types.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';
import { buildReportFilename, exportLayerToPdf } from '../utils/pdfExport.js';

registerAllSections();

const DEMO_FIXTURE_BY_SESSION_ID: Record<string, keyof typeof REPORT_FIXTURES> = {
  'demo-s-plus': 'sPlus-architect',
  'demo-a': 'a-fullstack-boundary',
  'demo-b': 'b-fullstack-danger',
};

function resolveFixture(sessionId: string | undefined): ReportViewModel | null {
  if (!sessionId) return null;
  const fixtureId = DEMO_FIXTURE_BY_SESSION_ID[sessionId];
  if (!fixtureId) return null;
  return REPORT_FIXTURES[fixtureId] ?? null;
}

export const ReportViewPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [layer, setLayer] = useState<ReportLayer>('summary');
  const [exporting, setExporting] = useState<ReportLayer | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const viewModel = resolveFixture(sessionId);

  const handleExport = async (exportLayer: ReportLayer) => {
    const node = reportRef.current;
    if (!node || !viewModel) return;
    setExporting(exportLayer);
    setExportError(null);
    // Temporarily render the target layer into the DOM so html2canvas
    // captures the correct content — then restore the user's selection.
    const previousLayer = layer;
    try {
      if (exportLayer !== previousLayer) setLayer(exportLayer);
      // Wait a tick so React commits the layer switch before capture.
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      await exportLayerToPdf({
        layer: exportLayer,
        element: node,
        filename: buildReportFilename({
          candidateName: viewModel.candidateName,
          suiteId: viewModel.suite.id,
          layer: exportLayer,
        }),
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(null);
      if (exportLayer !== previousLayer) setLayer(previousLayer);
    }
  };

  if (!viewModel) {
    return (
      <div style={styles.container} data-testid="report-view-placeholder">
        <div style={styles.placeholderCard}>
          <h1 style={styles.placeholderTitle}>报告暂未生成</h1>
          <p style={styles.placeholderBody}>
            此 session 尚未与后端对接。正式的评分管道完成后(Task 9+),本页会展示真实报告。
          </p>
          <p style={styles.placeholderBody}>
            开发期可访问 demo 报告:<code>/report/demo-s-plus</code> ·{' '}
            <code>/report/demo-a</code> · <code>/report/demo-b</code>
          </p>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={styles.homeBtn}
            data-testid="report-view-home-btn"
          >
            返回首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container} data-testid="report-view-page">
      <div style={styles.inner}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>评估报告</h1>
            <p style={styles.sessionLabel}>Session · {sessionId}</p>
          </div>
          <div style={styles.headerActions}>
            <div style={styles.exportGroup}>
              <button
                type="button"
                disabled={exporting !== null}
                onClick={() => handleExport('summary')}
                style={{
                  ...styles.exportBtn,
                  ...(exporting !== null ? styles.exportBtnDisabled : {}),
                }}
                data-testid="report-view-export-summary"
              >
                {exporting === 'summary' ? '导出中…' : '导出摘要 PDF'}
              </button>
              <button
                type="button"
                disabled={exporting !== null}
                onClick={() => handleExport('detail')}
                style={{
                  ...styles.exportBtn,
                  ...(exporting !== null ? styles.exportBtnDisabled : {}),
                }}
                data-testid="report-view-export-detail"
              >
                {exporting === 'detail' ? '导出中…' : '导出完整 PDF'}
              </button>
            </div>
            <div style={styles.layerToggle} role="tablist" aria-label="report-layer">
              <button
                type="button"
                role="tab"
                aria-selected={layer === 'summary'}
                data-testid="report-view-layer-summary"
                onClick={() => setLayer('summary')}
                style={{
                  ...styles.toggleBtn,
                  ...(layer === 'summary' ? styles.toggleBtnActive : {}),
                }}
              >
                摘要
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={layer === 'detail'}
                data-testid="report-view-layer-detail"
                onClick={() => setLayer('detail')}
                style={{
                  ...styles.toggleBtn,
                  ...(layer === 'detail' ? styles.toggleBtnActive : {}),
                }}
              >
                完整
              </button>
            </div>
          </div>
        </header>

        {exportError && (
          <div style={styles.error} data-testid="report-view-export-error">
            导出失败:{exportError}
          </div>
        )}

        <div ref={reportRef} data-testid="report-view-capture-root">
          <ReportRenderer viewModel={viewModel} layer={layer} />
          <div style={styles.transparencyTrailer}>
            <TransparencyStatement />
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: colors.base,
    color: colors.text,
    padding: `${spacing.xxl} ${spacing.lg}`,
    display: 'flex',
    justifyContent: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: 1024,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  sessionLabel: {
    fontSize: fontSizes.sm,
    color: colors.overlay1,
    margin: `${spacing.xs} 0 0`,
    fontFamily: 'monospace',
  },
  headerActions: {
    display: 'flex',
    gap: spacing.md,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  exportGroup: {
    display: 'flex',
    gap: spacing.xs,
  },
  exportBtn: {
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: colors.mauve,
    border: 'none',
    borderRadius: radii.sm,
    color: colors.base,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  exportBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  error: {
    padding: spacing.md,
    backgroundColor: 'rgba(243, 139, 168, 0.12)',
    border: `1px solid ${colors.red}`,
    borderRadius: radii.sm,
    color: colors.red,
    fontSize: fontSizes.sm,
  },
  layerToggle: {
    display: 'flex',
    gap: spacing.xs,
    backgroundColor: colors.surface0,
    borderRadius: radii.md,
    padding: spacing.xs,
  },
  toggleBtn: {
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: 'transparent',
    color: colors.subtext0,
    border: 'none',
    borderRadius: radii.sm,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  toggleBtnActive: {
    backgroundColor: colors.blue,
    color: colors.base,
  },
  placeholderCard: {
    maxWidth: 520,
    padding: spacing.xxl,
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface0}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    alignSelf: 'center',
    margin: 'auto',
  },
  placeholderTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  placeholderBody: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    lineHeight: 1.6,
    margin: 0,
  },
  transparencyTrailer: {
    marginTop: spacing.xl,
  },
  homeBtn: {
    padding: `${spacing.sm} ${spacing.xl}`,
    backgroundColor: colors.blue,
    border: 'none',
    borderRadius: radii.md,
    color: colors.base,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
};
