import React from 'react';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../lib/tokens.js';
import { registerAllSections } from '../sections/index.js';
import { listRegisteredSections } from '../section-registry.js';
import { REPORT_FIXTURES, REPORT_FIXTURE_IDS } from '../__fixtures__/index.js';
import type { ReportViewModel } from '../types.js';

/**
 * Section Gallery:每个 section × 3 fixture,并排展示。
 * 相当于 Storybook 的 "Stories" 页:验证各 section 在 S+ / A boundary / B dangerFlag 下的视觉差异。
 */

registerAllSections();

export function SectionGalleryPage(): React.ReactElement {
  const sections = listRegisteredSections();
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: colors.mantle,
        color: colors.text,
        padding: spacing.xl,
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <h1
          style={{
            margin: 0,
            marginBottom: spacing.md,
            fontSize: fontSizes.xxl,
            fontWeight: fontWeights.semibold,
          }}
        >
          Section Gallery · {sections.length} sections × {REPORT_FIXTURE_IDS.length} fixtures
        </h1>
        <p style={{ color: colors.subtext1, fontSize: fontSizes.sm, marginBottom: spacing.xl }}>
          每个 section 3 个故事(S+ architect / A full_stack boundary / B dangerFlag)。
          Storybook 未安装,改用此预览页保证视觉回归可查。
        </p>

        {sections.map((def) => (
          <SectionStories key={def.id} sectionId={def.id}>
            {REPORT_FIXTURE_IDS.map((fixtureId) => {
              const vm = REPORT_FIXTURES[fixtureId];
              const matches = vm.suite.reportSections.includes(def.id);
              const guardOk = def.guard ? def.guard(vm) : true;
              const shouldRender = matches && guardOk;
              return (
                <StoryCell key={fixtureId} title={fixtureId} active={shouldRender}>
                  {shouldRender ? (
                    <def.component viewModel={vm as ReportViewModel} />
                  ) : (
                    <EmptyCell reason={matches ? 'guard 过滤' : 'suite 不含该 section'} />
                  )}
                </StoryCell>
              );
            })}
          </SectionStories>
        ))}
      </div>
    </div>
  );
}

function SectionStories({
  sectionId,
  children,
}: {
  sectionId: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div style={{ marginBottom: spacing.xxl }}>
      <div
        style={{
          fontSize: fontSizes.lg,
          fontWeight: fontWeights.semibold,
          color: colors.subtext0,
          marginBottom: spacing.sm,
          borderBottom: `1px solid ${colors.surface1}`,
          paddingBottom: spacing.xs,
        }}
      >
        {sectionId}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: spacing.md,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function StoryCell({
  title,
  active,
  children,
}: {
  title: string;
  active: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      style={{
        padding: spacing.sm,
        border: `1px solid ${active ? colors.surface2 : colors.surface1}`,
        borderRadius: radii.md,
      }}
    >
      <div
        style={{
          fontSize: fontSizes.xs,
          color: active ? colors.subtext1 : colors.overlay1,
          fontWeight: fontWeights.medium,
          marginBottom: spacing.xs,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function EmptyCell({ reason }: { reason: string }): React.ReactElement {
  return (
    <div
      style={{
        padding: spacing.xl,
        textAlign: 'center',
        color: colors.overlay1,
        fontSize: fontSizes.xs,
        backgroundColor: colors.surface0,
        borderRadius: radii.sm,
      }}
    >
      —（{reason}）
    </div>
  );
}
