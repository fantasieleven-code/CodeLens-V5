import { describe, expect, it, beforeEach } from 'vitest';
import React from 'react';
import {
  registerSection,
  resolveSectionsForLayer,
  listRegisteredSections,
  resetRegistry,
  getSection,
} from './section-registry.js';
import {
  sPlusArchitectFixture,
  aFullStackBoundaryFixture,
} from './__fixtures__/index.js';

const noop = () => React.createElement('div');

/** architect suite 的完整 reportSections(用于让 resolveSectionsForLayer 通过未注册校验)。 */
const ARCHITECT_SECTION_IDS = [
  'hero',
  'capability-profiles',
  'radar',
  'recommendation',
  'ma-detail',
  'md-hero',
  'mc-transcript',
  'dimensions',
  'signal-bars',
  'compliance',
] as const;

/** full_stack suite(带 mb-detail / cursor-behavior-label / mb-cursor-behavior)。 */
const FULL_STACK_SECTION_IDS = [
  'hero',
  'capability-profiles',
  'radar',
  'recommendation',
  'ma-detail',
  'mb-detail',
  'cursor-behavior-label',
  'mb-cursor-behavior',
  'mc-transcript',
  'dimensions',
  'signal-bars',
  'compliance',
] as const;

describe('section-registry', () => {
  beforeEach(() => {
    resetRegistry();
  });

  it('registers and looks up by id', () => {
    registerSection({ id: 'hero', layer: 'summary', component: noop });
    expect(getSection('hero')?.layer).toBe('summary');
    expect(listRegisteredSections()).toHaveLength(1);
  });

  it('throws on duplicate id', () => {
    registerSection({ id: 'hero', layer: 'summary', component: noop });
    expect(() =>
      registerSection({ id: 'hero', layer: 'summary', component: noop }),
    ).toThrow(/already registered/);
  });

  function registerArchitectSet(): void {
    registerSection({ id: 'hero', layer: 'summary', component: noop });
    registerSection({
      id: 'capability-profiles',
      layer: 'summary',
      component: noop,
    });
    registerSection({ id: 'recommendation', layer: 'summary', component: noop });
    registerSection({ id: 'radar', layer: 'detail', component: noop });
    registerSection({ id: 'ma-detail', layer: 'detail', component: noop });
    registerSection({ id: 'md-hero', layer: 'detail', component: noop });
    registerSection({ id: 'mc-transcript', layer: 'detail', component: noop });
    registerSection({ id: 'dimensions', layer: 'detail', component: noop });
    registerSection({ id: 'signal-bars', layer: 'detail', component: noop });
    registerSection({ id: 'compliance', layer: 'detail', component: noop });
  }

  it('resolveSectionsForLayer filters by layer + respects suite order', () => {
    registerArchitectSet();

    const summary = resolveSectionsForLayer(sPlusArchitectFixture, 'summary');
    expect(summary.map((s) => s.id)).toEqual([
      'hero',
      'capability-profiles',
      'recommendation',
    ]);

    const detail = resolveSectionsForLayer(sPlusArchitectFixture, 'detail');
    expect(detail.map((s) => s.id)).toEqual([
      'radar',
      'ma-detail',
      'md-hero',
      'mc-transcript',
      'dimensions',
      'signal-bars',
      'compliance',
    ]);

    expect(ARCHITECT_SECTION_IDS.length).toBe(summary.length + detail.length);
  });

  it('guard filters out section when data missing on fixture', () => {
    // 用 architect 的 fixture(无 cursorBehaviorLabel)跑 full_stack 的 reportSections,
    // 测试 cursor-behavior-label 的 guard 应该把它滤掉。
    const vmWithoutCursor = {
      ...sPlusArchitectFixture,
      suite: { ...sPlusArchitectFixture.suite, reportSections: FULL_STACK_SECTION_IDS },
      submissions: {},
      cursorBehaviorLabel: undefined,
    };

    registerSection({ id: 'hero', layer: 'summary', component: noop });
    registerSection({
      id: 'capability-profiles',
      layer: 'summary',
      component: noop,
    });
    registerSection({
      id: 'cursor-behavior-label',
      layer: 'summary',
      component: noop,
      guard: (vm) => Boolean(vm.cursorBehaviorLabel),
    });
    registerSection({ id: 'recommendation', layer: 'summary', component: noop });
    registerSection({ id: 'radar', layer: 'detail', component: noop });
    registerSection({
      id: 'ma-detail',
      layer: 'detail',
      component: noop,
      guard: (vm) => Boolean(vm.submissions.moduleA),
    });
    registerSection({
      id: 'mb-detail',
      layer: 'detail',
      component: noop,
      guard: (vm) => Boolean(vm.submissions.mb),
    });
    registerSection({
      id: 'mb-cursor-behavior',
      layer: 'detail',
      component: noop,
      guard: (vm) => Boolean(vm.submissions.mb),
    });
    registerSection({
      id: 'mc-transcript',
      layer: 'detail',
      component: noop,
      guard: (vm) => (vm.submissions.moduleC?.length ?? 0) > 0,
    });
    registerSection({ id: 'dimensions', layer: 'detail', component: noop });
    registerSection({ id: 'signal-bars', layer: 'detail', component: noop });
    registerSection({ id: 'compliance', layer: 'detail', component: noop });

    const summary = resolveSectionsForLayer(vmWithoutCursor, 'summary');
    expect(summary.map((s) => s.id)).toEqual([
      'hero',
      'capability-profiles',
      'recommendation',
    ]);

    const detail = resolveSectionsForLayer(vmWithoutCursor, 'detail');
    // ma-detail / mb-detail / mb-cursor-behavior / mc-transcript 都被 guard 过滤掉了。
    expect(detail.map((s) => s.id)).toEqual([
      'radar',
      'dimensions',
      'signal-bars',
      'compliance',
    ]);
  });

  it('throws when suite declares unregistered section', () => {
    registerSection({ id: 'hero', layer: 'summary', component: noop });
    expect(() =>
      resolveSectionsForLayer(aFullStackBoundaryFixture, 'summary'),
    ).toThrow(/not registered/);
  });
});
