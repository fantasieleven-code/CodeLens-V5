import { registerSection, resetRegistry } from '../section-registry.js';
import { HeroSection } from './HeroSection.js';
import { CapabilityProfilesSection } from './CapabilityProfilesSection.js';
import { CursorBehaviorLabelSection } from './CursorBehaviorLabelSection.js';
import { RecommendationSection } from './RecommendationSection.js';
import { RadarSection } from './RadarSection.js';
import { DimensionsSection } from './DimensionsSection.js';
import { MADetailSection } from './MADetailSection.js';
import { MBDetailSection } from './MBDetailSection.js';
import { MBCursorBehaviorSection } from './MBCursorBehaviorSection.js';
import { MDHeroSection } from './MDHeroSection.js';
import { MCTranscriptSection } from './MCTranscriptSection.js';
import { SignalBarsSection } from './SignalBarsSection.js';
import { ComplianceSection } from './ComplianceSection.js';
import { TransparencyStatement } from './TransparencyStatement.js';

/**
 * 一次性注册所有 V5 section。幂等:每次调用先清空 registry 再全量注册,
 * 方便 test / Storybook 在 beforeEach 中重置。生产侧由 main.tsx 在启动时调一次。
 */
export function registerAllSections(): void {
  resetRegistry();

  // Layer 1 (summary) — 顺序由 SuiteDefinition.reportSections 决定,不在此控制。
  registerSection({ id: 'hero', layer: 'summary', component: HeroSection });
  registerSection({
    id: 'capability-profiles',
    layer: 'summary',
    component: CapabilityProfilesSection,
  });
  registerSection({
    id: 'cursor-behavior-label',
    layer: 'summary',
    component: CursorBehaviorLabelSection,
    guard: (vm) => Boolean(vm.cursorBehaviorLabel),
  });
  registerSection({
    id: 'recommendation',
    layer: 'summary',
    component: RecommendationSection,
  });

  // Layer 2 (detail)
  registerSection({ id: 'radar', layer: 'detail', component: RadarSection });
  registerSection({ id: 'dimensions', layer: 'detail', component: DimensionsSection });
  registerSection({
    id: 'ma-detail',
    layer: 'detail',
    component: MADetailSection,
    guard: (vm) => Boolean(vm.submissions.moduleA),
  });
  registerSection({
    id: 'mb-detail',
    layer: 'detail',
    component: MBDetailSection,
    guard: (vm) => Boolean(vm.submissions.mb),
  });
  registerSection({
    id: 'mb-cursor-behavior',
    layer: 'detail',
    component: MBCursorBehaviorSection,
    guard: (vm) => Boolean(vm.submissions.mb),
  });
  registerSection({
    id: 'md-hero',
    layer: 'detail',
    component: MDHeroSection,
    guard: (vm) => Boolean(vm.submissions.moduleD),
  });
  registerSection({
    id: 'mc-transcript',
    layer: 'detail',
    component: MCTranscriptSection,
    guard: (vm) => (vm.submissions.moduleC?.length ?? 0) > 0,
  });
  registerSection({ id: 'signal-bars', layer: 'detail', component: SignalBarsSection });
  registerSection({ id: 'compliance', layer: 'detail', component: ComplianceSection });
}

export {
  HeroSection,
  CapabilityProfilesSection,
  CursorBehaviorLabelSection,
  RecommendationSection,
  RadarSection,
  DimensionsSection,
  MADetailSection,
  MBDetailSection,
  MBCursorBehaviorSection,
  MDHeroSection,
  MCTranscriptSection,
  SignalBarsSection,
  ComplianceSection,
  TransparencyStatement,
};
