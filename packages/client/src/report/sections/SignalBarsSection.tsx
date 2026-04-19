import React, { useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import { ScoreBar } from '../../components/charts/ScoreBar.js';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
} from '../../lib/tokens.js';
import { V5_DIMENSION_LABELS_ZH } from '../dimension-labels.js';
import type { SectionProps } from '../section-registry.js';
import type { SignalViewMeta } from '../types.js';
import type { SignalResult, V5Dimension } from '@codelens-v5/shared';

/**
 * Layer 2 · 信号条(Round 3 重构 1 Evidence Trace)。
 *
 * 每条信号渲染 ScoreBar + 行内展开按钮;展开后显示 source / excerpt / contribution / triggeredRule。
 * value=null 的信号(N/A——未参与模块)被折叠到一行 "N/A 信号 (N 条)"。
 */
export function SignalBarsSection({ viewModel }: SectionProps): React.ReactElement {
  const { signalResults, signalDefinitions } = viewModel;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { grouped, naCount } = useMemo(() => {
    const byDim = new Map<V5Dimension, SignalViewMeta[]>();
    let na = 0;
    for (const def of signalDefinitions) {
      const result = signalResults[def.id];
      if (!result || result.value == null) {
        na++;
        continue;
      }
      const list = byDim.get(def.dimension) ?? [];
      list.push(def);
      byDim.set(def.dimension, list);
    }
    return { grouped: byDim, naCount: na };
  }, [signalResults, signalDefinitions]);

  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const dimensionOrder: V5Dimension[] = [
    'technicalJudgment' as V5Dimension,
    'aiEngineering' as V5Dimension,
    'systemDesign' as V5Dimension,
    'codeQuality' as V5Dimension,
    'communication' as V5Dimension,
    'metacognition' as V5Dimension,
  ];

  return (
    <Card padding="lg" data-testid="signal-bars-section">
      <h3
        style={{
          margin: 0,
          marginBottom: spacing.md,
          fontSize: fontSizes.lg,
          fontWeight: fontWeights.semibold,
          color: colors.text,
        }}
      >
        信号条 · Evidence Trace
      </h3>
      <div style={{ fontSize: fontSizes.xs, color: colors.overlay2, marginBottom: spacing.md }}>
        Task 13 后端就位前为 23 条占位;真实发布时 47 条全量。
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
        {dimensionOrder.map((dim) => {
          const defs = grouped.get(dim);
          if (!defs || defs.length === 0) return null;
          return (
            <div key={dim} data-testid={`signal-group-${dim}`}>
              <div
                style={{
                  fontSize: fontSizes.sm,
                  fontWeight: fontWeights.semibold,
                  color: colors.subtext1,
                  marginBottom: spacing.sm,
                }}
              >
                {V5_DIMENSION_LABELS_ZH[dim]} · {defs.length} 条
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                {defs.map((def) => {
                  const result = signalResults[def.id];
                  const isOpen = Boolean(expanded[def.id]);
                  return (
                    <SignalRow
                      key={def.id}
                      def={def}
                      result={result}
                      open={isOpen}
                      onToggle={() => toggle(def.id)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}

        {naCount > 0 && (
          <div
            data-testid="signal-na-row"
            style={{
              padding: spacing.sm,
              backgroundColor: colors.surface1,
              borderRadius: radii.sm,
              fontSize: fontSizes.xs,
              color: colors.overlay2,
            }}
          >
            N/A 信号(未参与模块) · {naCount} 条
          </div>
        )}
      </div>
    </Card>
  );
}

interface SignalRowProps {
  def: SignalViewMeta;
  result: SignalResult;
  open: boolean;
  onToggle: () => void;
}

function SignalRow({ def, result, open, onToggle }: SignalRowProps): React.ReactElement {
  return (
    <div
      data-testid={`signal-row-${def.id}`}
      style={{
        padding: spacing.sm,
        backgroundColor: colors.surface1,
        borderRadius: radii.sm,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
          marginBottom: open ? spacing.xs : 0,
        }}
      >
        <button
          type="button"
          data-testid={`signal-toggle-${def.id}`}
          aria-expanded={open}
          onClick={onToggle}
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.subtext0,
            cursor: 'pointer',
            padding: 0,
            fontSize: fontSizes.xs,
            width: 16,
          }}
        >
          {open ? '▾' : '▸'}
        </button>
        <span style={{ fontSize: fontSizes.sm, color: colors.text, flex: 1 }}>
          {def.id}
        </span>
        <Badge variant="default">{def.moduleSource}</Badge>
        {def.isLLMWhitelist && <Badge variant="info">LLM</Badge>}
        <span
          style={{
            fontSize: fontSizes.xs,
            color: colors.overlay2,
            minWidth: 40,
            textAlign: 'right',
          }}
        >
          {result.value != null ? result.value.toFixed(0) : 'N/A'}
        </span>
      </div>
      <ScoreBar
        score={result.value ?? 0}
        maxScore={100}
        showValue={false}
        label={undefined}
      />
      {open && (
        <div
          data-testid={`signal-evidence-${def.id}`}
          style={{
            marginTop: spacing.sm,
            padding: spacing.sm,
            backgroundColor: colors.surface0,
            borderRadius: radii.sm,
          }}
        >
          <div
            style={{
              fontSize: fontSizes.xs,
              color: colors.overlay2,
              marginBottom: spacing.xs,
            }}
          >
            算法版本:{result.algorithmVersion} · 证据 {result.evidence.length} 条
          </div>
          {result.evidence.length === 0 ? (
            <div style={{ fontSize: fontSizes.xs, color: colors.overlay2 }}>无证据</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
              {result.evidence.map((ev, i) => (
                <div
                  key={i}
                  style={{
                    padding: spacing.xs,
                    borderLeft: `2px solid ${colors.surface2}`,
                    paddingLeft: spacing.sm,
                  }}
                >
                  <div
                    style={{
                      fontSize: fontSizes.xs,
                      color: colors.overlay2,
                      marginBottom: 2,
                      display: 'flex',
                      gap: spacing.sm,
                    }}
                  >
                    <code style={{ fontFamily: 'monospace', color: colors.subtext0 }}>
                      {ev.source}
                    </code>
                    {ev.triggeredRule && (
                      <Badge variant="default">{ev.triggeredRule}</Badge>
                    )}
                    <span style={{ marginLeft: 'auto' }}>
                      贡献 {ev.contribution > 0 ? '+' : ''}
                      {ev.contribution?.toFixed(2) ?? '—'}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: fontSizes.xs,
                      color: colors.subtext1,
                      lineHeight: 1.5,
                    }}
                  >
                    {ev.excerpt}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
