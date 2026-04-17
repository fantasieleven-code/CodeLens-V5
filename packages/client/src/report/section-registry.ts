import type { ComponentType } from 'react';

import type { ReportLayer, ReportViewModel } from './types.js';

/**
 * Round 3 的 section 化报告架构:每个 reportSection 独立注册 + layer 分层 + guard 过滤。
 *
 * Layer 1(summary)默认对接 HR 级读者,只看 grade / 能力画像 / cursor 行为标签 / 推荐动作;
 * Layer 2(detail)供工程/面试官侧,展开雷达、维度、信号证据、各模块提交详情。
 *
 * 新增 section 不需要改 ReportRenderer,只要 registerSection({ id, layer, component, guard? })。
 */

export interface SectionProps {
  viewModel: ReportViewModel;
}

export interface SectionDefinition {
  /** 必须和 SuiteDefinition.reportSections 的字面量一致,才能参与渲染。 */
  id: string;
  layer: ReportLayer;
  /** suite.reportSections 中的顺序由 SUITES 决定,registry 只负责 layer 区分。 */
  component: ComponentType<SectionProps>;
  /**
   * 可选的运行时过滤:即使 suite 声明了该 section,也需要 viewModel 数据满足条件才渲染。
   * e.g. cursor-behavior-label 只在 `viewModel.cursorBehaviorLabel` 存在时显示。
   */
  guard?: (viewModel: ReportViewModel) => boolean;
}

const sectionRegistry = new Map<string, SectionDefinition>();

export function registerSection(def: SectionDefinition): void {
  if (sectionRegistry.has(def.id)) {
    throw new Error(`Section "${def.id}" already registered`);
  }
  sectionRegistry.set(def.id, def);
}

export function getSection(id: string): SectionDefinition | undefined {
  return sectionRegistry.get(id);
}

export function listRegisteredSections(): readonly SectionDefinition[] {
  return Array.from(sectionRegistry.values());
}

export function resetRegistry(): void {
  sectionRegistry.clear();
}

/**
 * 解析一个 suite 的 reportSections,按 layer 过滤并确认每个 id 都已注册。
 *
 * @returns 具体渲染顺序(和 suite.reportSections 中的出现顺序一致)。
 * @throws 如果 suite 中声明的 section 未在 registry 中找到——这是 shared 合约和 client 实现不同步的信号,应尽早失败。
 */
export function resolveSectionsForLayer(
  viewModel: ReportViewModel,
  layer: ReportLayer,
): readonly SectionDefinition[] {
  const out: SectionDefinition[] = [];
  for (const id of viewModel.suite.reportSections) {
    const def = sectionRegistry.get(id);
    if (!def) {
      throw new Error(
        `Suite "${viewModel.suite.id}" declares section "${id}" but it is not registered on the client.`,
      );
    }
    if (def.layer !== layer) continue;
    if (def.guard && !def.guard(viewModel)) continue;
    out.push(def);
  }
  return out;
}
