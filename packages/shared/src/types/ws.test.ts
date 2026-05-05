/**
 * Type-only contract tests for ws.ts v5:mb:* extensions (hotfix).
 *
 * These are *compile-time* assertions — the runtime assertions exist purely so
 * vitest will include the file in the suite; the real verification is that
 * `expectTypeOf(...)` still compiles.
 *
 * Reference: mb-handlers.ts payload interfaces + socket.emit call sites are the
 * source of truth. If a handler's shape drifts, the corresponding
 * `expectTypeOf` below must be updated in lock-step.
 */

import { describe, expectTypeOf, it } from 'vitest';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  V5MBAuditSubmitPayload,
  V5MBChatCompletePayload,
  V5MBChatGeneratePayload,
  V5MBChatStreamPayload,
  V5MBCompletionRequestPayload,
  V5MBCompletionResponsePayload,
  V5MBFileChangePayload,
  V5MBPlanningSubmitPayload,
  V5MBRunTestPayload,
  V5MBStandardsSubmitPayload,
  V5MBTestResultPayload,
  V5MBVisibilityChangePayload,
} from './ws.js';
import type { V5MBAudit, V5MBPlanning } from './v5-submissions.js';

describe('ws.ts v5:mb:* payload shapes', () => {
  it('Client → Server: 8 MB events are all listed on ClientToServerEvents', () => {
    expectTypeOf<ClientToServerEvents['v5:mb:chat_generate']>().parameters.toEqualTypeOf<
      [V5MBChatGeneratePayload]
    >();
    expectTypeOf<ClientToServerEvents['v5:mb:completion_request']>().parameters.toEqualTypeOf<
      [V5MBCompletionRequestPayload]
    >();
    expectTypeOf<ClientToServerEvents['v5:mb:file_change']>().parameters.toEqualTypeOf<
      [V5MBFileChangePayload]
    >();
    expectTypeOf<ClientToServerEvents['v5:mb:run_test']>().parameters.toEqualTypeOf<
      [V5MBRunTestPayload]
    >();
    expectTypeOf<ClientToServerEvents['v5:mb:planning:submit']>().parameters.toEqualTypeOf<
      [V5MBPlanningSubmitPayload, (ok: boolean) => void]
    >();
    expectTypeOf<ClientToServerEvents['v5:mb:standards:submit']>().parameters.toEqualTypeOf<
      [V5MBStandardsSubmitPayload, (ok: boolean) => void]
    >();
    expectTypeOf<ClientToServerEvents['v5:mb:audit:submit']>().parameters.toEqualTypeOf<
      [V5MBAuditSubmitPayload]
    >();
    expectTypeOf<ClientToServerEvents['v5:mb:visibility_change']>().parameters.toEqualTypeOf<
      [V5MBVisibilityChangePayload]
    >();
  });

  it('Server → Client: 4 MB response events are all listed on ServerToClientEvents', () => {
    expectTypeOf<ServerToClientEvents['v5:mb:chat_stream']>().parameters.toEqualTypeOf<
      [V5MBChatStreamPayload]
    >();
    expectTypeOf<ServerToClientEvents['v5:mb:chat_complete']>().parameters.toEqualTypeOf<
      [V5MBChatCompletePayload]
    >();
    expectTypeOf<ServerToClientEvents['v5:mb:completion_response']>().parameters.toEqualTypeOf<
      [V5MBCompletionResponsePayload]
    >();
    expectTypeOf<ServerToClientEvents['v5:mb:test_result']>().parameters.toEqualTypeOf<
      [V5MBTestResultPayload]
    >();
  });

  it('Client → Server: chat can use handshake identity while other MB payloads keep fallback sessionId', () => {
    expectTypeOf<V5MBChatGeneratePayload>()
      .toHaveProperty('sessionId')
      .toEqualTypeOf<string | undefined>();
    expectTypeOf<V5MBCompletionRequestPayload>().toHaveProperty('sessionId').toEqualTypeOf<string>();
    expectTypeOf<V5MBFileChangePayload>().toHaveProperty('sessionId').toEqualTypeOf<string>();
    expectTypeOf<V5MBRunTestPayload>().toHaveProperty('sessionId').toEqualTypeOf<string>();
    expectTypeOf<V5MBPlanningSubmitPayload>().toHaveProperty('sessionId').toEqualTypeOf<string>();
    expectTypeOf<V5MBStandardsSubmitPayload>().toHaveProperty('sessionId').toEqualTypeOf<string>();
    expectTypeOf<V5MBAuditSubmitPayload>().toHaveProperty('sessionId').toEqualTypeOf<string>();
    expectTypeOf<V5MBVisibilityChangePayload>().toHaveProperty('sessionId').toEqualTypeOf<string>();
  });

  it('file_change.source is a closed 3-value union', () => {
    expectTypeOf<V5MBFileChangePayload['source']>().toEqualTypeOf<
      'manual_edit' | 'ai_chat' | 'ai_completion'
    >();
  });

  it('planning payload re-uses V5MBPlanning', () => {
    expectTypeOf<V5MBPlanningSubmitPayload['planning']>().toEqualTypeOf<V5MBPlanning>();
  });

  it("audit payload's violations is V5MBAudit['violations']", () => {
    expectTypeOf<V5MBAuditSubmitPayload['violations']>().toEqualTypeOf<V5MBAudit['violations']>();
  });

  it('chat_stream.content is a delta (string), chat_complete.diff is accumulated (string)', () => {
    expectTypeOf<V5MBChatStreamPayload['content']>().toEqualTypeOf<string>();
    expectTypeOf<V5MBChatStreamPayload['done']>().toEqualTypeOf<boolean>();
    expectTypeOf<V5MBChatCompletePayload['diff']>().toEqualTypeOf<string>();
  });

  it('test_result mirrors mb-handlers.ts sandbox output', () => {
    expectTypeOf<V5MBTestResultPayload>().toMatchTypeOf<{
      stdout: string;
      stderr: string;
      exitCode: number;
      passRate: number;
      durationMs: number;
    }>();
  });
});
