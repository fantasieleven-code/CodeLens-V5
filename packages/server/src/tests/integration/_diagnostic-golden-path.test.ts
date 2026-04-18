/**
 * Task 17b diagnostic — NOT a gate test. Dumps full signal / dimension /
 * composite / grade breakdown for each Golden Path fixture so we can
 * identify the systematic under-scoring root cause. Deletable once Task
 * 17b calibration decisions land.
 */

import { describe, it, vi } from 'vitest';

vi.mock('../../lib/langfuse.js', () => ({
  getLangfuse: async () => ({
    trace: vi.fn(),
    generation: vi.fn(),
    flush: async () => {},
  }),
}));

vi.mock('../../services/prompt-registry.service.js', () => ({
  promptRegistry: {
    get: vi.fn(async (key: string) => `[TEMPLATE ${key}]`),
  },
}));

vi.mock('../../services/model/index.js', () => ({
  modelFactory: {
    generate: vi.fn(async () => ({
      text: '{"score":0}',
      usage: { promptTokens: 0, completionTokens: 0 },
    })),
  },
}));

import {
  V5_DIMENSIONS,
  V5_GRADE_COMPOSITE_THRESHOLDS,
  V5_GRADE_ORDER,
  type ScoreSessionInput,
  type SignalInput,
  type SignalResults,
  type V5DimensionScores,
} from '@codelens-v5/shared';
import { SUITES } from '@codelens-v5/shared';
import { SignalRegistryImpl } from '../../services/signal-registry.service.js';
import { registerAllSignals } from '../../signals/index.js';
import {
  computeAllProfiles,
  computeComposite,
  computeDimensions,
  gradeCandidate,
  participatingDimensionsOf,
} from '../../services/scoring.service.js';
import { liamSGradeFixture } from '../fixtures/golden-path/liam-s-grade.js';
import { steveAGradeFixture } from '../fixtures/golden-path/steve-a-grade.js';
import { emmaBGradeFixture } from '../fixtures/golden-path/emma-b-grade.js';
import { maxCGradeFixture } from '../fixtures/golden-path/max-c-grade.js';

interface Per {
  name: string;
  fixture: ScoreSessionInput;
}

const FIXTURES: Per[] = [
  { name: 'liam', fixture: liamSGradeFixture },
  { name: 'steve', fixture: steveAGradeFixture },
  { name: 'emma', fixture: emmaBGradeFixture },
  { name: 'max', fixture: maxCGradeFixture },
];

function toSignalInput(s: ScoreSessionInput): SignalInput {
  return {
    sessionId: s.sessionId,
    suiteId: s.suiteId,
    submissions: s.submissions,
    examData: s.examData,
    participatingModules: s.participatingModules,
    behaviorData: s.behaviorData,
  };
}

describe('DIAGNOSTIC — Golden Path signal/dim/composite/grade breakdown', () => {
  it('dumps all 47 signal values × 4 fixtures + dimension + composite + grade path', async () => {
    const registry = new SignalRegistryImpl();
    registerAllSignals(registry);
    const signalDefs = registry.listSignals().sort((a, b) => a.id.localeCompare(b.id));

    const results = new Map<
      string,
      { signals: SignalResults; dims: V5DimensionScores; composite: number; grade: string }
    >();

    for (const { name, fixture } of FIXTURES) {
      const suite = SUITES[fixture.suiteId];
      const signals = await registry.computeAll(toSignalInput(fixture));
      const dims = computeDimensions(signals, registry.listSignals(), suite);
      const composite = computeComposite(dims, suite);
      const gradeDecision = gradeCandidate(composite, dims, suite);
      results.set(name, { signals, dims, composite, grade: gradeDecision.grade });
    }

    // ── 47 × 4 signal value matrix ──
    const signalRows: string[] = [];
    signalRows.push('| Signal | Dimension | Module | Liam | Steve | Emma | Max |');
    signalRows.push('|--------|-----------|--------|------|-------|------|-----|');
    for (const def of signalDefs) {
      const vals = FIXTURES.map((f) => {
        const r = results.get(f.name)!;
        const v = r.signals[def.id];
        if (v == null) return 'MISSING';
        if (v.value === null) return `null(${v.algorithmVersion === 'registry@skipped' ? 'skip' : 'fail'})`;
        return v.value.toFixed(3);
      });
      signalRows.push(
        `| ${def.id} | ${def.dimension} | ${def.moduleSource} | ${vals.join(' | ')} |`,
      );
    }
    // eslint-disable-next-line no-console
    console.log('\n### 1. Signal values (47 × 4)\n\n' + signalRows.join('\n'));

    // ── Dimension scores (post × 100) ──
    const dimRows: string[] = [];
    dimRows.push('| Dimension | Liam | Steve | Emma | Max |');
    dimRows.push('|-----------|------|-------|------|-----|');
    for (const dim of V5_DIMENSIONS) {
      const vals = FIXTURES.map((f) => {
        const v = results.get(f.name)!.dims[dim];
        return v == null ? 'null' : v.toFixed(1);
      });
      dimRows.push(`| ${dim} | ${vals.join(' | ')} |`);
    }
    // eslint-disable-next-line no-console
    console.log('\n### 2. Dimension scores (0-100)\n\n' + dimRows.join('\n'));

    // ── Composite weighted breakdown ──
    // eslint-disable-next-line no-console
    console.log('\n### 3. Composite weighted breakdown\n');
    for (const { name, fixture } of FIXTURES) {
      const r = results.get(name)!;
      const suite = SUITES[fixture.suiteId];
      let weightedSum = 0;
      let activeWeight = 0;
      const lines: string[] = [];
      lines.push(`**${name}** (suite: ${fixture.suiteId})  `);
      for (const dim of V5_DIMENSIONS) {
        const weight = suite.weightProfile[dim] ?? 0;
        const score = r.dims[dim];
        if (score == null || weight <= 0) {
          lines.push(
            `- ${dim}: weight=${weight.toFixed(2)} × score=${score == null ? 'null' : score.toFixed(1)} → excluded (N/A rescaling)`,
          );
          continue;
        }
        const contrib = score * weight;
        weightedSum += contrib;
        activeWeight += weight;
        lines.push(
          `- ${dim}: weight=${weight.toFixed(2)} × score=${score.toFixed(1)} = ${contrib.toFixed(2)}`,
        );
      }
      const rescaled = activeWeight === 0 ? 0 : weightedSum / activeWeight;
      lines.push(
        `- **Sum (weighted)**: ${weightedSum.toFixed(2)} / active weight ${activeWeight.toFixed(2)} = **composite ${rescaled.toFixed(2)}**`,
      );
      lines.push(`- orchestrator composite: **${r.composite.toFixed(2)}**`);
      // eslint-disable-next-line no-console
      console.log(lines.join('\n') + '\n');
    }

    // ── Grade decision path ──
    // eslint-disable-next-line no-console
    console.log('### 4. Grade decision path\n');
    for (const { name, fixture } of FIXTURES) {
      const r = results.get(name)!;
      const suite = SUITES[fixture.suiteId];
      const lines: string[] = [];
      lines.push(`**${name}**: composite=${r.composite.toFixed(2)}  `);
      lines.push(`- gradeCap: ${suite.gradeCap}  `);
      // Composite-only grade (no floors)
      const thresholds: Array<[string, number]> = [
        ['S+', V5_GRADE_COMPOSITE_THRESHOLDS['S+']],
        ['S', V5_GRADE_COMPOSITE_THRESHOLDS.S],
        ['A', V5_GRADE_COMPOSITE_THRESHOLDS.A],
        ['B+', V5_GRADE_COMPOSITE_THRESHOLDS['B+']],
        ['B', V5_GRADE_COMPOSITE_THRESHOLDS.B],
        ['C', V5_GRADE_COMPOSITE_THRESHOLDS.C],
      ];
      const compositeOnlyGrade =
        thresholds.find(([, t]) => r.composite >= t)?.[0] ?? 'D';
      lines.push(`- composite-only grade (no floors): ${compositeOnlyGrade}  `);
      // Walk S+ / S / A / B+ floors
      for (const g of ['S+', 'S', 'A', 'B+'] as const) {
        const floors = suite.dimensionFloors[g];
        if (!floors) {
          lines.push(`- ${g} floor check: no floors defined  `);
          continue;
        }
        const floorReport: string[] = [];
        let passes = true;
        for (const [dimStr, required] of Object.entries(floors)) {
          if (required == null) continue;
          const actual = r.dims[dimStr as (typeof V5_DIMENSIONS)[number]];
          if (actual == null) continue;
          const ok = actual >= required;
          if (!ok) passes = false;
          floorReport.push(
            `${dimStr}=${actual.toFixed(1)} ${ok ? '≥' : '<'} ${required}${ok ? ' ✓' : ' ✗'}`,
          );
        }
        lines.push(`- ${g} floors (${passes ? 'PASS' : 'FAIL'}): ${floorReport.join(', ')}  `);
      }
      lines.push(`- **final grade**: ${r.grade}`);
      // eslint-disable-next-line no-console
      console.log(lines.join('\n') + '\n');
    }

    // ── Fixture content richness ──
    // eslint-disable-next-line no-console
    console.log('### 6. Fixture content richness\n');
    const richRows: string[] = [];
    richRows.push(
      '| Metric | Liam | Steve | Emma | Max |',
    );
    richRows.push(
      '|--------|------|-------|------|-----|',
    );
    function safeLen(s: unknown): number {
      return typeof s === 'string' ? s.length : 0;
    }
    function formatRow(metric: string, vals: (number | string)[]): void {
      richRows.push(`| ${metric} | ${vals.join(' | ')} |`);
    }
    formatRow(
      'P0.l2Answer char',
      FIXTURES.map((f) => safeLen(f.fixture.submissions.phase0?.codeReading.l2Answer)),
    );
    formatRow(
      'P0.l3Answer char',
      FIXTURES.map((f) => safeLen(f.fixture.submissions.phase0?.codeReading.l3Answer)),
    );
    formatRow(
      'MA.R1.reasoning char',
      FIXTURES.map((f) => safeLen(f.fixture.submissions.moduleA?.round1.reasoning)),
    );
    formatRow(
      'MA.R1.tradeoff char',
      FIXTURES.map((f) =>
        safeLen(f.fixture.submissions.moduleA?.round1.structuredForm.tradeoff),
      ),
    );
    formatRow(
      'MA.R1.verification char',
      FIXTURES.map((f) =>
        safeLen(f.fixture.submissions.moduleA?.round1.structuredForm.verification),
      ),
    );
    formatRow(
      'MA.R1.challengeResponse char',
      FIXTURES.map((f) => safeLen(f.fixture.submissions.moduleA?.round1.challengeResponse)),
    );
    formatRow(
      'MA.R2 markedDefects count',
      FIXTURES.map((f) => f.fixture.submissions.moduleA?.round2.markedDefects.length ?? 0),
    );
    formatRow(
      'MA.R3.diagnosisText char',
      FIXTURES.map((f) => safeLen(f.fixture.submissions.moduleA?.round3.diagnosisText)),
    );
    formatRow(
      'MA.R4.response char',
      FIXTURES.map((f) => safeLen(f.fixture.submissions.moduleA?.round4.response)),
    );
    formatRow(
      'MB.planning.decomposition char',
      FIXTURES.map((f) => safeLen(f.fixture.submissions.mb?.planning?.decomposition)),
    );
    formatRow(
      'MB.planning.fallback char',
      FIXTURES.map((f) => safeLen(f.fixture.submissions.mb?.planning?.fallbackStrategy)),
    );
    formatRow(
      'MB.aiCompletionEvents count',
      FIXTURES.map((f) => f.fixture.submissions.mb?.editorBehavior.aiCompletionEvents.length ?? 0),
    );
    formatRow(
      'MB.chatEvents count',
      FIXTURES.map((f) => f.fixture.submissions.mb?.editorBehavior.chatEvents.length ?? 0),
    );
    formatRow(
      'MB.diffEvents count',
      FIXTURES.map((f) => f.fixture.submissions.mb?.editorBehavior.diffEvents.length ?? 0),
    );
    formatRow(
      'MB.fileNav count',
      FIXTURES.map((f) => f.fixture.submissions.mb?.editorBehavior.fileNavigationHistory.length ?? 0),
    );
    formatRow(
      'MB.testRuns count',
      FIXTURES.map((f) => f.fixture.submissions.mb?.editorBehavior.testRuns.length ?? 0),
    );
    formatRow(
      'MB.finalTestPassRate',
      FIXTURES.map((f) => (f.fixture.submissions.mb?.finalTestPassRate ?? 0).toFixed(2)),
    );
    formatRow(
      'MB.finalFiles count',
      FIXTURES.map((f) => f.fixture.submissions.mb?.finalFiles.length ?? 0),
    );
    formatRow(
      'MB.rules char',
      FIXTURES.map((f) => safeLen(f.fixture.submissions.mb?.standards?.rulesContent)),
    );
    formatRow(
      'MB.agent char',
      FIXTURES.map((f) => safeLen(f.fixture.submissions.mb?.standards?.agentContent)),
    );
    formatRow(
      'SE.reasoning char',
      FIXTURES.map((f) => safeLen(f.fixture.submissions.selfAssess?.reasoning)),
    );
    formatRow(
      'MC rounds',
      FIXTURES.map((f) => f.fixture.submissions.moduleC?.length ?? 0),
    );
    formatRow(
      'MC total answer chars',
      FIXTURES.map((f) =>
        (f.fixture.submissions.moduleC ?? []).reduce((s, r) => s + safeLen(r.answer), 0),
      ),
    );
    // eslint-disable-next-line no-console
    console.log(richRows.join('\n') + '\n');

    // ── Profile dump for each fixture ──
    // eslint-disable-next-line no-console
    console.log('### 7. Capability profiles\n');
    for (const { name, fixture } of FIXTURES) {
      const suite = SUITES[fixture.suiteId];
      const r = results.get(name)!;
      const profiles = computeAllProfiles(r.dims, participatingDimensionsOf(suite));
      const lines = [`**${name}**:`];
      for (const p of profiles) {
        lines.push(`- ${p.nameEn} (${p.id}): ${p.score.toFixed(1)} / ${p.label}`);
      }
      // eslint-disable-next-line no-console
      console.log(lines.join('\n') + '\n');
    }

    // Reference: grade thresholds
    // eslint-disable-next-line no-console
    console.log('### Reference: composite thresholds\n');
    // eslint-disable-next-line no-console
    console.log(
      V5_GRADE_ORDER.map(
        (g) => `${g}: ${V5_GRADE_COMPOSITE_THRESHOLDS[g] ?? 'n/a'}`,
      ).join(', ') + '\n',
    );
  });
});
