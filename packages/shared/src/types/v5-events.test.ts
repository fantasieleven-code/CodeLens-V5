import { describe, expect, it } from 'vitest';
import { V5Event, V5_EVENTS, deriveV5EventCategory, isV5Event } from './v5-events.js';

describe('V5Event enum coverage', () => {
  it('enum contains all 8 expected events', () => {
    expect(V5_EVENTS).toHaveLength(8);
    expect(V5_EVENTS).toEqual(
      expect.arrayContaining([
        V5Event.SESSION_CREATED,
        V5Event.MODULE_SUBMITTED,
        V5Event.MB_DIFF_ACCEPTED,
        V5Event.MB_COMPLETION_SHOWN,
        V5Event.MB_TEST_RUN,
        V5Event.SCORING_STARTED,
        V5Event.SCORING_COMPLETED,
        V5Event.SESSION_COMPLETED,
      ]),
    );
  });

  it('all enum values follow "domain:action" string format', () => {
    for (const ev of V5_EVENTS) {
      expect(ev).toMatch(/^[a-z]+(:[a-z]+)+$/);
    }
  });

  it('enum values are unique', () => {
    expect(new Set(V5_EVENTS).size).toBe(V5_EVENTS.length);
  });
});

describe('isV5Event', () => {
  it('accepts all enum values', () => {
    for (const ev of V5_EVENTS) expect(isV5Event(ev)).toBe(true);
  });

  it('rejects non-V5 strings and UUIDs', () => {
    expect(isV5Event('session:created:extra')).toBe(false);
    expect(isV5Event('SESSION_CREATED')).toBe(false);
    expect(isV5Event('11111111-2222-3333-4444-555555555555')).toBe(false);
    expect(isV5Event('')).toBe(false);
    expect(isV5Event(null)).toBe(false);
    expect(isV5Event(undefined)).toBe(false);
    expect(isV5Event(42)).toBe(false);
  });
});

describe('deriveV5EventCategory', () => {
  it('maps session lifecycle events to SESSION', () => {
    expect(deriveV5EventCategory(V5Event.SESSION_CREATED)).toBe('SESSION');
    expect(deriveV5EventCategory(V5Event.SESSION_COMPLETED)).toBe('SESSION');
    expect(deriveV5EventCategory(V5Event.MODULE_SUBMITTED)).toBe('SESSION');
  });

  it('maps MB AI interactions to AI', () => {
    expect(deriveV5EventCategory(V5Event.MB_DIFF_ACCEPTED)).toBe('AI');
    expect(deriveV5EventCategory(V5Event.MB_COMPLETION_SHOWN)).toBe('AI');
  });

  it('maps system-driven events to SYSTEM', () => {
    expect(deriveV5EventCategory(V5Event.MB_TEST_RUN)).toBe('SYSTEM');
    expect(deriveV5EventCategory(V5Event.SCORING_STARTED)).toBe('SYSTEM');
    expect(deriveV5EventCategory(V5Event.SCORING_COMPLETED)).toBe('SYSTEM');
  });

  it('covers every enum value (exhaustiveness)', () => {
    for (const ev of V5_EVENTS) {
      const category = deriveV5EventCategory(ev);
      expect(['SESSION', 'AI', 'SYSTEM']).toContain(category);
    }
  });
});
