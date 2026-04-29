import React, { useState } from 'react';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../lib/tokens.js';
import { ReportRenderer } from '../ReportRenderer.js';
import { registerAllSections } from '../sections/index.js';
import { REPORT_FIXTURES, REPORT_FIXTURE_IDS } from '../__fixtures__/index.js';
import type { ReportLayer } from '../types.js';

/**
 * 手工预览页面(代替 Storybook):fixture 选择器 + layer 切换 + section 隔离视图。
 * 访问 /__preview/report 查看。Task 15 真实 API 就位后可保留此页作 e2e 冷启动工具。
 */

registerAllSections();

type Mode = 'full' | 'isolated';

export function ReportPreviewPage(): React.ReactElement {
  const [fixtureId, setFixtureId] = useState<keyof typeof REPORT_FIXTURES>(
    REPORT_FIXTURE_IDS[0],
  );
  const [layer, setLayer] = useState<ReportLayer>('summary');
  const [mode, setMode] = useState<Mode>('full');

  const viewModel = REPORT_FIXTURES[fixtureId];

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: colors.mantle,
        color: colors.text,
        padding: spacing.xl,
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1
          style={{
            margin: 0,
            marginBottom: spacing.md,
            fontSize: fontSizes.xxl,
            fontWeight: fontWeights.semibold,
          }}
        >
          CodeLens V5 · 报告预览(Task 2 开发用)
        </h1>

        <Toolbar>
          <SelectGroup label="Fixture">
            {REPORT_FIXTURE_IDS.map((id) => (
              <ToggleButton
                key={id}
                active={fixtureId === id}
                onClick={() => setFixtureId(id)}
              >
                {id}
              </ToggleButton>
            ))}
          </SelectGroup>

          <SelectGroup label="Layer">
            <ToggleButton
              active={layer === 'summary'}
              onClick={() => setLayer('summary')}
            >
              summary
            </ToggleButton>
            <ToggleButton active={layer === 'detail'} onClick={() => setLayer('detail')}>
              detail
            </ToggleButton>
          </SelectGroup>

          <SelectGroup label="Mode">
            <ToggleButton active={mode === 'full'} onClick={() => setMode('full')}>
              full report
            </ToggleButton>
            <ToggleButton active={mode === 'isolated'} onClick={() => setMode('isolated')}>
              all fixtures side-by-side
            </ToggleButton>
          </SelectGroup>
        </Toolbar>

        {mode === 'full' ? (
          <ReportRenderer viewModel={viewModel} layer={layer} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xxl }}>
            {REPORT_FIXTURE_IDS.map((id) => (
              <div key={id}>
                <div
                  style={{
                    fontSize: fontSizes.md,
                    fontWeight: fontWeights.semibold,
                    color: colors.subtext0,
                    marginBottom: spacing.sm,
                  }}
                >
                  fixture · {id}
                </div>
                <ReportRenderer viewModel={REPORT_FIXTURES[id]} layer={layer} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Toolbar({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        gap: spacing.xl,
        flexWrap: 'wrap',
        padding: spacing.md,
        backgroundColor: colors.surface0,
        borderRadius: radii.md,
        marginBottom: spacing.xl,
      }}
    >
      {children}
    </div>
  );
}

function SelectGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
      <span
        style={{
          fontSize: fontSizes.xs,
          color: colors.overlay2,
          fontWeight: fontWeights.medium,
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        backgroundColor: active ? colors.blue : colors.surface1,
        color: active ? colors.crust : colors.text,
        border: 'none',
        borderRadius: radii.sm,
        padding: `${spacing.xs} ${spacing.md}`,
        fontSize: fontSizes.sm,
        fontWeight: fontWeights.medium,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
