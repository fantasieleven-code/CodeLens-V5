import type { EventCategory } from './events.js';

/**
 * V5 核心调度事件。命名遵循 "domain:action" 约定，和 V4 type 字段格式一致，
 * 这样 V5 event 可以直接存入既有 EventLog 表而不需要 schema 迁移。
 *
 * Task 4 的 scoring-orchestrator 和 Task 12 的 MB endpoints 通过
 *   eventBus.emit(V5Event.XXX, { sessionId, ... })
 * 发射。V4 式调用 eventBus.emit(sessionId, category, type, payload) 同时保留（overload 分派）。
 */
export enum V5Event {
  SESSION_CREATED = 'session:created',
  MODULE_SUBMITTED = 'module:submitted',
  MB_DIFF_ACCEPTED = 'mb:diff:accepted',
  MB_COMPLETION_SHOWN = 'mb:completion:shown',
  MB_TEST_RUN = 'mb:test:run',
  SCORING_STARTED = 'scoring:started',
  SCORING_COMPLETED = 'scoring:completed',
  SESSION_COMPLETED = 'session:completed',
}

export const V5_EVENTS: readonly V5Event[] = [
  V5Event.SESSION_CREATED,
  V5Event.MODULE_SUBMITTED,
  V5Event.MB_DIFF_ACCEPTED,
  V5Event.MB_COMPLETION_SHOWN,
  V5Event.MB_TEST_RUN,
  V5Event.SCORING_STARTED,
  V5Event.SCORING_COMPLETED,
  V5Event.SESSION_COMPLETED,
] as const;

/** V5 event payload 基础形状：所有 event 必须携带 sessionId，其余字段自由扩展。 */
export interface V5EventPayload {
  sessionId: string;
  [key: string]: unknown;
}

export function isV5Event(value: unknown): value is V5Event {
  return typeof value === 'string' && V5_EVENTS.includes(value as V5Event);
}

/**
 * V5 event → V4 EventCategory 映射。
 * 让 V5 event 复用 V4 的 EventLog 表（category 是 not-null），不新增 DB 列。
 */
export function deriveV5EventCategory(event: V5Event): EventCategory {
  switch (event) {
    case V5Event.SESSION_CREATED:
    case V5Event.SESSION_COMPLETED:
    case V5Event.MODULE_SUBMITTED:
      return 'SESSION';

    case V5Event.MB_DIFF_ACCEPTED:
    case V5Event.MB_COMPLETION_SHOWN:
      return 'AI';

    case V5Event.MB_TEST_RUN:
    case V5Event.SCORING_STARTED:
    case V5Event.SCORING_COMPLETED:
      return 'SYSTEM';
  }
}
