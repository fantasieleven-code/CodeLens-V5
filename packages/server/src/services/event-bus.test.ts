import { describe, expect, it } from 'vitest';
import { V5Event } from '@codelens-v5/shared';
import { buildBufferedEvent } from './event-bus.helpers.js';

const fixedNow = () => new Date('2026-04-16T00:00:00.000Z');

describe('buildBufferedEvent — V5 overload', () => {
  it('derives category from V5 event and carries sessionId from payload', () => {
    const buffered = buildBufferedEvent(
      V5Event.SCORING_STARTED,
      { sessionId: 'sess-1', detail: 'x' },
      undefined,
      undefined,
      fixedNow,
    );

    expect(buffered).toEqual({
      sessionId: 'sess-1',
      category: 'SYSTEM',
      type: 'scoring:started',
      payload: { sessionId: 'sess-1', detail: 'x' },
      timestamp: '2026-04-16T00:00:00.000Z',
    });
  });

  it('routes session lifecycle events to SESSION category', () => {
    const buffered = buildBufferedEvent(
      V5Event.SESSION_CREATED,
      { sessionId: 'sess-2' },
      undefined,
      undefined,
      fixedNow,
    );
    expect(buffered.category).toBe('SESSION');
    expect(buffered.type).toBe('session:created');
  });

  it('routes MB AI interactions to AI category', () => {
    const buffered = buildBufferedEvent(
      V5Event.MB_COMPLETION_SHOWN,
      { sessionId: 'sess-3', lineNumber: 42 },
      undefined,
      undefined,
      fixedNow,
    );
    expect(buffered.category).toBe('AI');
    expect(buffered.payload.lineNumber).toBe(42);
  });

  it('throws when V5 payload is missing sessionId', () => {
    expect(() =>
      buildBufferedEvent(
        V5Event.SCORING_STARTED,
        // @ts-expect-error: testing runtime guard
        { foo: 'bar' },
        undefined,
        undefined,
        fixedNow,
      ),
    ).toThrow(/sessionId/);
  });

  it('throws when V5 payload is undefined', () => {
    expect(() =>
      buildBufferedEvent(
        V5Event.SCORING_STARTED,
        // @ts-expect-error: testing runtime guard
        undefined,
        undefined,
        undefined,
        fixedNow,
      ),
    ).toThrow(/sessionId/);
  });
});

describe('buildBufferedEvent — V4 overload (back-compat)', () => {
  it('preserves V4 (sessionId, category, type, payload) form', () => {
    const buffered = buildBufferedEvent(
      '11111111-2222-3333-4444-555555555555',
      'FILE',
      'file:edit',
      { lines: 3 },
      fixedNow,
    );
    expect(buffered).toEqual({
      sessionId: '11111111-2222-3333-4444-555555555555',
      category: 'FILE',
      type: 'file:edit',
      payload: { lines: 3 },
      timestamp: '2026-04-16T00:00:00.000Z',
    });
  });

  it('V4 form defaults payload to empty object when omitted', () => {
    const buffered = buildBufferedEvent(
      'sess-4',
      'SESSION',
      'checkpoint:1:start',
      undefined,
      fixedNow,
    );
    expect(buffered.payload).toEqual({});
  });

  it('V4 form throws when type argument is missing', () => {
    expect(() =>
      // @ts-expect-error: testing runtime guard
      buildBufferedEvent('sess-5', 'FILE', undefined, undefined, fixedNow),
    ).toThrow(/V4 emit requires/);
  });

  it('UUID-like first arg is treated as V4 (not a V5 event literal)', () => {
    const buffered = buildBufferedEvent(
      '11111111-2222-3333-4444-555555555555',
      'AI',
      'ai:custom',
      { k: 1 },
      fixedNow,
    );
    expect(buffered.category).toBe('AI');
    expect(buffered.type).toBe('ai:custom');
    expect(buffered.sessionId).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('explicit arbitrary "domain:action" string that is NOT a V5Event → V4 path', () => {
    const buffered = buildBufferedEvent(
      'sess-7',
      'TERMINAL',
      'terminal:command',
      { cmd: 'ls' },
      fixedNow,
    );
    expect(buffered.category).toBe('TERMINAL');
    expect(buffered.type).toBe('terminal:command');
  });
});
