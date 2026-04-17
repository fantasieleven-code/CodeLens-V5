/**
 * /__preview/phase0 — Phase0Page dev harness.
 *
 * Task 4 dev tool: the page needs a candidate session to advance/submit in
 * real use, but during development we want to exercise the full P0 UI
 * without wiring up a session. This preview route renders <Phase0Page />
 * in `bare` mode (no ModuleShell), seeds the module store with a
 * phase0-aware flow, and shows the constructed V5Phase0Submission JSON on
 * submit so you can eyeball the inputBehavior.aiClaimVerification bridge.
 */

import React, { useEffect, useState } from 'react';
import type { V5Phase0Submission } from '@codelens-v5/shared';
import { Phase0Page } from '../Phase0Page.js';
import { P0_MOCK_FIXTURE } from './mock.js';
import { useModuleStore } from '../../stores/module.store.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../lib/tokens.js';

const FIXTURE_ORDER: Array<'phase0' | 'moduleA' | 'mb' | 'selfAssess' | 'moduleC'> = [
  'phase0',
  'moduleA',
  'mb',
  'selfAssess',
  'moduleC',
];

export const Phase0PreviewPage: React.FC = () => {
  const [submission, setSubmission] = useState<V5Phase0Submission | null>(null);

  useEffect(() => {
    const store = useModuleStore.getState();
    store.reset();
    store.setSuite('full_stack', FIXTURE_ORDER);
    store.advance(); // → phase0
  }, []);

  return (
    <div style={styles.wrap}>
      <div style={styles.inner}>
        <header style={styles.header}>
          <h1 style={styles.title}>Phase 0 · 预览</h1>
          <p style={styles.subtitle}>
            Task 4 开发用视图。页面不走 ModuleShell,不触发真实 advance()。
            提交后本页捕获 V5Phase0Submission 并展示 JSON,便于校对 shape 与
            <code style={styles.code}> inputBehavior.aiClaimVerification </code>
            桥接。
          </p>
          <p style={styles.subtitle}>
            Mock fixture: 订单处理场景 · deceptivePoint =
            <code style={styles.code}> WATCH/MULTI 乐观锁</code>
          </p>
        </header>

        <Phase0Page
          bare
          module={P0_MOCK_FIXTURE}
          onSubmit={(s) => setSubmission(s)}
        />

        {submission && (
          <section style={styles.receipt} data-testid="phase0-preview-receipt">
            <h2 style={styles.receiptTitle}>提交结果 (V5Phase0Submission)</h2>
            <pre style={styles.receiptPre}>
              {JSON.stringify(submission, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    backgroundColor: colors.base,
    padding: `${spacing.xl} ${spacing.lg}`,
  },
  inner: {
    maxWidth: 1024,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface0}`,
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  subtitle: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    margin: 0,
    lineHeight: 1.6,
  },
  code: {
    padding: '2px 6px',
    margin: '0 4px',
    backgroundColor: colors.surface0,
    borderRadius: radii.sm,
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontSize: fontSizes.xs,
  },
  receipt: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.green}55`,
  },
  receiptTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.green,
    margin: 0,
  },
  receiptPre: {
    margin: 0,
    padding: spacing.md,
    backgroundColor: colors.crust,
    borderRadius: radii.md,
    fontSize: 12,
    fontFamily: 'ui-monospace, Menlo, monospace',
    color: colors.text,
    overflowX: 'auto' as const,
    lineHeight: 1.5,
  },
};
