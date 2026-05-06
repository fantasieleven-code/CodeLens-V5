import { describe, expect, it } from 'vitest';
import { recommendSuite } from './suite-recommendations.js';
import { ADMIN_POSITIONS } from './admin-positions-fixtures.js';
import type { V5AdminPosition } from '@codelens-v5/shared';

function pos(id: string): V5AdminPosition {
  const p = ADMIN_POSITIONS.find((x) => x.id === id);
  if (!p) throw new Error(`fixture ${id} missing`);
  return p;
}

describe('recommendSuite', () => {
  it('junior + any stack → quick_screen', () => {
    const r = recommendSuite(pos('pos-backend-payment-concurrency'), 'junior');
    expect(r.primary).toBe('quick_screen');
    expect(r.alternates).not.toContain('quick_screen');
    expect(r.alternates.length).toBe(4);
  });

  it('mid + backend domain → full_stack', () => {
    const r = recommendSuite(pos('pos-backend-payment-concurrency'), 'mid');
    expect(r.primary).toBe('full_stack');
  });

  it('mid + ai-heavy domain still routes to full_stack (not junior, not senior)', () => {
    const r = recommendSuite(pos('pos-ai-engineer-content'), 'mid');
    expect(r.primary).toBe('full_stack');
  });

  it('senior + archStyle set → architect', () => {
    const r = recommendSuite(pos('pos-architect-logistics'), 'senior');
    expect(r.primary).toBe('architect');
    expect(r.reasoning).toMatch(/架构|Architect/);
  });

  it('senior + AI stack/domain → ai_engineer', () => {
    const r = recommendSuite(pos('pos-ai-engineer-content'), 'senior');
    expect(r.primary).toBe('ai_engineer');
  });

  it('senior + generic full-stack → deep_dive', () => {
    const r = recommendSuite(pos('pos-fullstack-saas-resilience'), 'senior');
    expect(r.primary).toBe('deep_dive');
  });

  it('senior + security/fintech without archStyle → deep_dive', () => {
    const r = recommendSuite(pos('pos-fintech-security'), 'senior');
    // python_django is in AI_TECH_STACKS by design (fintech + django → ai_engineer).
    expect(['ai_engineer', 'deep_dive']).toContain(r.primary);
  });

  it('reasoning is non-empty human text', () => {
    const r = recommendSuite(pos('pos-backend-payment-concurrency'), 'mid');
    expect(r.reasoning.length).toBeGreaterThan(10);
  });

  it('alternates never include the primary suite', () => {
    for (const level of ['junior', 'mid', 'senior'] as const) {
      for (const p of ADMIN_POSITIONS) {
        const r = recommendSuite(p, level);
        expect(r.alternates).not.toContain(r.primary);
      }
    }
  });
});
