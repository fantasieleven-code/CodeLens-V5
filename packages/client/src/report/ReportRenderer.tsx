import React from 'react';
import { colors, spacing } from '../lib/tokens.js';
import { resolveSectionsForLayer } from './section-registry.js';
import type { ReportLayer, ReportViewModel } from './types.js';

interface ReportRendererProps {
  viewModel: ReportViewModel;
  layer: ReportLayer;
}

/**
 * 单一渲染入口:按 suite.reportSections 的顺序 + layer 过滤 + guard 过滤后
 * 串起对应的 section 组件。新增 section 无需改此组件,只需 registerSection。
 */
export function ReportRenderer({ viewModel, layer }: ReportRendererProps): React.ReactElement {
  const sections = resolveSectionsForLayer(viewModel, layer);
  return (
    <div
      data-testid={`report-renderer-${layer}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xl,
        color: colors.text,
      }}
    >
      {sections.map((def) => {
        const SectionComponent = def.component;
        return (
          <section
            key={def.id}
            data-section-id={def.id}
            data-section-layer={def.layer}
          >
            <SectionComponent viewModel={viewModel} />
          </section>
        );
      })}
    </div>
  );
}
