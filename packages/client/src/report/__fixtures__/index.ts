export { sPlusArchitectFixture } from './sPlus-architect.js';
export { aFullStackBoundaryFixture } from './a-fullstack-boundary.js';
export { bFullStackDangerFixture } from './b-fullstack-danger.js';
export { MOCK_SIGNAL_DEFS, buildMockSignalResult, buildMockSignalResults } from './mock-signals.js';

import { sPlusArchitectFixture } from './sPlus-architect.js';
import { aFullStackBoundaryFixture } from './a-fullstack-boundary.js';
import { bFullStackDangerFixture } from './b-fullstack-danger.js';
import type { ReportViewModel } from '../types.js';

/**
 * 所有 fixture 按 fixture id 索引。preview 路由和 Storybook story 用这个 map
 * 选择展示哪一个。Task 15 后可由真实 API 替换。
 */
export const REPORT_FIXTURES: Record<string, ReportViewModel> = {
  'sPlus-architect': sPlusArchitectFixture,
  'a-fullstack-boundary': aFullStackBoundaryFixture,
  'b-fullstack-danger': bFullStackDangerFixture,
};

export const REPORT_FIXTURE_IDS = Object.keys(REPORT_FIXTURES) as Array<keyof typeof REPORT_FIXTURES>;
