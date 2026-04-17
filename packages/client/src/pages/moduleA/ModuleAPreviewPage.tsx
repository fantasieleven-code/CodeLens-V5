/**
 * /__preview/moduleA — ModuleAPage dev harness.
 *
 * Task 5 dev tool: exercises the 4-round flow end-to-end without a real
 * session. Renders <ModuleAPage /> in `bare` mode, seeds a phase0-aware
 * module flow, and shows the final V5ModuleASubmission JSON (including the
 * canonical `round4` field per Round 3 Part 3 调整 2 L358-372).
 */

import React, { useEffect, useState } from 'react';
import type { V5ModuleASubmission } from '@codelens-v5/shared';
import { ModuleAPage } from '../ModuleAPage.js';
import { MA_MOCK_FIXTURE } from './mock.js';
import { useModuleStore } from '../../stores/module.store.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../lib/tokens.js';

const FIXTURE_ORDER: Array<'phase0' | 'moduleA' | 'mb' | 'selfAssess' | 'moduleC'> = [
  'phase0',
  'moduleA',
  'mb',
  'selfAssess',
  'moduleC',
];

export const ModuleAPreviewPage: React.FC = () => {
  const [submission, setSubmission] = useState<V5ModuleASubmission | null>(null);

  useEffect(() => {
    const store = useModuleStore.getState();
    store.reset();
    store.setSuite('full_stack', FIXTURE_ORDER);
    store.advance(); // → phase0
    store.advance(); // → moduleA
  }, []);

  return (
    <div style={styles.wrap}>
      <div style={styles.inner}>
        <header style={styles.header}>
          <h1 style={styles.title}>Module A · 预览</h1>
          <p style={styles.subtitle}>
            Task 5 开发用视图。4 轮流程:R1 方案判断 (4 步) → R2 代码审查 → R3 版本对比 → R4 迁移验证。
            提交后捕获 V5ModuleASubmission JSON,便于校对 shape 与
            <code style={styles.code}>round4</code>
            字段(canonical 字段,non-bridge,per Round 3 Part 3 调整 2 L358-372)。
          </p>
          <p style={styles.subtitle}>
            Mock fixture: 秒杀下单库存预扣 (R1) · 方案 A 实现审查 (R2) · success/failed 对照 (R3) · 红包抢购削峰 (R4)
          </p>
        </header>

        <ModuleAPage
          bare
          module={MA_MOCK_FIXTURE}
          onSubmit={(s) => setSubmission(s)}
        />

        {submission && (
          <section style={styles.receipt} data-testid="moduleA-preview-receipt">
            <h2 style={styles.receiptTitle}>提交结果 (V5ModuleASubmission)</h2>
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
