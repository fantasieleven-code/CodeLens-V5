import { beforeEach, describe, expect, it } from 'vitest';
import { useModuleStore } from './module.store.js';

const FULL_STACK_ORDER = ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'] as const;

describe('useModuleStore', () => {
  beforeEach(() => {
    useModuleStore.getState().reset();
  });

  it('starts empty', () => {
    const s = useModuleStore.getState();
    expect(s.suiteId).toBeNull();
    expect(s.moduleOrder).toEqual([]);
    expect(s.currentModule).toBeNull();
    expect(s.isComplete).toBe(false);
  });

  it('setSuite seeds moduleOrder and enters intro', () => {
    useModuleStore.getState().setSuite('full_stack', [...FULL_STACK_ORDER]);
    const s = useModuleStore.getState();
    expect(s.suiteId).toBe('full_stack');
    expect(s.moduleOrder).toEqual(FULL_STACK_ORDER);
    expect(s.currentModule).toBe('intro');
    expect(s.isComplete).toBe(false);
  });

  it('advance walks intro → first module → … → complete', () => {
    useModuleStore.getState().setSuite('full_stack', [...FULL_STACK_ORDER]);
    const { advance } = useModuleStore.getState();

    advance();
    expect(useModuleStore.getState().currentModule).toBe('phase0');
    advance();
    expect(useModuleStore.getState().currentModule).toBe('moduleA');
    advance();
    expect(useModuleStore.getState().currentModule).toBe('mb');
    advance();
    expect(useModuleStore.getState().currentModule).toBe('selfAssess');
    advance();
    expect(useModuleStore.getState().currentModule).toBe('moduleC');
    advance();
    const final = useModuleStore.getState();
    expect(final.currentModule).toBe('complete');
    expect(final.isComplete).toBe(true);
  });

  it('advance is a no-op after complete', () => {
    useModuleStore.getState().setSuite('quick_screen', ['phase0']);
    useModuleStore.getState().advance();
    useModuleStore.getState().advance();
    expect(useModuleStore.getState().currentModule).toBe('complete');
    useModuleStore.getState().advance();
    expect(useModuleStore.getState().currentModule).toBe('complete');
  });

  describe('getCurrentModuleIndex', () => {
    it('returns -1 for intro/null', () => {
      expect(useModuleStore.getState().getCurrentModuleIndex()).toBe(-1);
      useModuleStore.getState().setSuite('full_stack', [...FULL_STACK_ORDER]);
      expect(useModuleStore.getState().getCurrentModuleIndex()).toBe(-1);
    });

    it('returns moduleOrder.length for complete', () => {
      useModuleStore.getState().setSuite('full_stack', [...FULL_STACK_ORDER]);
      for (let i = 0; i < FULL_STACK_ORDER.length + 1; i++) {
        useModuleStore.getState().advance();
      }
      expect(useModuleStore.getState().getCurrentModuleIndex()).toBe(
        FULL_STACK_ORDER.length,
      );
    });

    it('returns indexOf for in-progress', () => {
      useModuleStore.getState().setSuite('full_stack', [...FULL_STACK_ORDER]);
      useModuleStore.getState().advance(); // → phase0
      useModuleStore.getState().advance(); // → moduleA
      expect(useModuleStore.getState().getCurrentModuleIndex()).toBe(1);
    });
  });

  describe('getProgress', () => {
    it('returns zeros when empty', () => {
      const p = useModuleStore.getState().getProgress();
      expect(p).toEqual({
        completed: 0,
        total: 0,
        percentage: 0,
        remainingMinutes: 0,
      });
    });

    it('computes percentage and remainingMinutes mid-flow', () => {
      useModuleStore.getState().setSuite('full_stack', [...FULL_STACK_ORDER]);
      useModuleStore.getState().advance(); // phase0 (idx 0)
      useModuleStore.getState().advance(); // moduleA (idx 1)
      useModuleStore.getState().advance(); // mb (idx 2) — 2 completed

      const p = useModuleStore.getState().getProgress();
      expect(p.total).toBe(5);
      expect(p.completed).toBe(2);
      expect(p.percentage).toBe(40);
      // full_stack.estimatedMinutes = 60, total = 5 → avg 12 min.
      // remaining = (5 - 2) * 12 = 36.
      expect(p.remainingMinutes).toBe(36);
    });

    it('remainingMinutes is 0 when complete', () => {
      useModuleStore.getState().setSuite('quick_screen', ['phase0']);
      useModuleStore.getState().advance();
      useModuleStore.getState().advance(); // → complete
      const p = useModuleStore.getState().getProgress();
      expect(p.completed).toBe(1);
      expect(p.percentage).toBe(100);
      expect(p.remainingMinutes).toBe(0);
    });
  });

  it('reset returns to initial state', () => {
    useModuleStore.getState().setSuite('full_stack', [...FULL_STACK_ORDER]);
    useModuleStore.getState().advance();
    useModuleStore.getState().reset();
    const s = useModuleStore.getState();
    expect(s.suiteId).toBeNull();
    expect(s.moduleOrder).toEqual([]);
    expect(s.currentModule).toBeNull();
    expect(s.isComplete).toBe(false);
    expect(s.isPaused).toBe(false);
  });

  describe('pause / resume', () => {
    it('pause sets isPaused while mid-module', () => {
      useModuleStore.getState().setSuite('full_stack', [...FULL_STACK_ORDER]);
      useModuleStore.getState().advance(); // → phase0
      useModuleStore.getState().pause();
      expect(useModuleStore.getState().isPaused).toBe(true);
    });

    it('pause is a no-op when in intro / complete / null', () => {
      // null
      useModuleStore.getState().pause();
      expect(useModuleStore.getState().isPaused).toBe(false);

      // intro
      useModuleStore.getState().setSuite('full_stack', [...FULL_STACK_ORDER]);
      useModuleStore.getState().pause();
      expect(useModuleStore.getState().isPaused).toBe(false);

      // complete
      useModuleStore.getState().setSuite('quick_screen', ['phase0']);
      useModuleStore.getState().advance(); // phase0
      useModuleStore.getState().advance(); // complete
      useModuleStore.getState().pause();
      expect(useModuleStore.getState().isPaused).toBe(false);
    });

    it('resume clears isPaused', () => {
      useModuleStore.getState().setSuite('full_stack', [...FULL_STACK_ORDER]);
      useModuleStore.getState().advance();
      useModuleStore.getState().pause();
      useModuleStore.getState().resume();
      expect(useModuleStore.getState().isPaused).toBe(false);
    });

    it('setSuite clears any prior paused flag', () => {
      useModuleStore.getState().setSuite('full_stack', [...FULL_STACK_ORDER]);
      useModuleStore.getState().advance();
      useModuleStore.getState().pause();
      useModuleStore.getState().setSuite('quick_screen', ['phase0']);
      expect(useModuleStore.getState().isPaused).toBe(false);
    });
  });
});
