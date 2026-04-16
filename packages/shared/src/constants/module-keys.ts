/**
 * 修正 1：模块命名双向映射。
 *
 * SUITES.modules 和 V5Submissions 字段使用 camelCase key（phase0 / moduleA / mb / moduleC / moduleD / selfAssess）。
 * ExamModule.moduleType 列使用 uppercase abbreviation（P0 / MA / MB / MC / MD / SE）。
 *
 * 原文档里 Task 4 scoring orchestrator 用 `moduleType.toUpperCase()` 无法正确映射
 *   （'moduleA'.toUpperCase() === 'MODULEA' ≠ 'MA'），
 * 所有跨两种命名的地方都必须走这份映射。
 */

export type V5ModuleKey = 'phase0' | 'moduleA' | 'mb' | 'moduleC' | 'moduleD' | 'selfAssess';

export type V5ModuleType = 'P0' | 'MA' | 'MB' | 'MC' | 'MD' | 'SE';

export const MODULE_KEY_TO_TYPE: Readonly<Record<V5ModuleKey, V5ModuleType>> = {
  phase0: 'P0',
  moduleA: 'MA',
  mb: 'MB',
  moduleC: 'MC',
  moduleD: 'MD',
  selfAssess: 'SE',
} as const;

export const MODULE_TYPE_TO_KEY: Readonly<Record<V5ModuleType, V5ModuleKey>> = {
  P0: 'phase0',
  MA: 'moduleA',
  MB: 'mb',
  MC: 'moduleC',
  MD: 'moduleD',
  SE: 'selfAssess',
} as const;

export const V5_MODULE_KEYS: readonly V5ModuleKey[] = [
  'phase0',
  'moduleA',
  'mb',
  'moduleC',
  'moduleD',
  'selfAssess',
] as const;

export const V5_MODULE_TYPES: readonly V5ModuleType[] = [
  'P0',
  'MA',
  'MB',
  'MC',
  'MD',
  'SE',
] as const;

export function isV5ModuleKey(value: unknown): value is V5ModuleKey {
  return typeof value === 'string' && value in MODULE_KEY_TO_TYPE;
}

export function isV5ModuleType(value: unknown): value is V5ModuleType {
  return typeof value === 'string' && value in MODULE_TYPE_TO_KEY;
}

export function moduleKeyToType(key: V5ModuleKey): V5ModuleType {
  return MODULE_KEY_TO_TYPE[key];
}

export function moduleTypeToKey(type: V5ModuleType): V5ModuleKey {
  return MODULE_TYPE_TO_KEY[type];
}
