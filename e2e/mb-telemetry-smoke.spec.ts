/**
 * MB telemetry browser smoke.
 *
 * Server-side behavior:batch already has unit + integration coverage. This
 * spec closes the browser boundary: Vite-loaded client socket helper →
 * `/interview` Socket.IO namespace → server behavior handler → Prisma
 * `metadata.mb.editorBehavior`.
 */

import { test, expect, type Page } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import type { V5ModuleKey } from '@codelens-v5/shared';

import { GoldenPathDriver, type GoldenPathDriverFixture } from './helpers/golden-path-driver.js';
import { liamSGradeFixture } from '../packages/server/src/tests/fixtures/golden-path/liam-s-grade.js';
import { CANONICAL_EXAM_ID } from '../packages/server/src/data/canonical-v5-exam-data.js';

loadDotenv({ path: 'packages/server/.env' });

const ADMIN_CREDS = {
  email: process.env.ADMIN_EMAIL || 'admin@codelens.dev',
  password: process.env.ADMIN_PASSWORD || 'ci-test-password-1234',
};

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

type EditorBehaviorCounts = {
  chatEvents: number;
  diffEvents: number;
  fileNavigationHistory: number;
  editSessions: number;
};

async function emitBehaviorBatchFromBrowser(page: Page, sessionId: string): Promise<void> {
  await page.evaluate(async (sid) => {
    type BrowserSocket = {
      connected: boolean;
      once: (event: string, handler: (...args: unknown[]) => void) => void;
      off: (event: string, handler: (...args: unknown[]) => void) => void;
      emit: (event: string, payload: unknown) => void;
    };
    const mod = (await import('/src/lib/socket.ts')) as { getSocket: () => BrowserSocket };
    const socket = mod.getSocket();
    if (!socket.connected) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          socket.off('connect', onConnect);
          socket.off('connect_error', onError);
          reject(new Error('socket connect timeout'));
        }, 10_000);
        const onConnect = () => {
          window.clearTimeout(timeout);
          socket.off('connect_error', onError);
          resolve();
        };
        const onError = (err: unknown) => {
          window.clearTimeout(timeout);
          socket.off('connect', onConnect);
          reject(err instanceof Error ? err : new Error(String(err)));
        };
        socket.once('connect', onConnect);
        socket.once('connect_error', onError);
      });
    }

    const now = Date.now();
    const module: V5ModuleKey = 'mb';
    socket.emit('behavior:batch', {
      sessionId: sid,
      events: [
        {
          type: 'chat_response_received',
          timestamp: new Date(now).toISOString(),
          payload: {
            module,
            prompt: 'verify InventoryService.reduce() edge case because concurrency can oversell',
            responseLength: 240,
            duration: 1200,
          },
        },
        {
          type: 'diff_rejected',
          timestamp: new Date(now + 1).toISOString(),
          payload: { module, accepted: false, linesAdded: 3, linesRemoved: 1 },
        },
        {
          type: 'file_opened',
          timestamp: new Date(now + 2).toISOString(),
          payload: { module, filePath: 'src/inventory.ts' },
        },
        {
          type: 'edit_session_completed',
          timestamp: new Date(now + 3).toISOString(),
          payload: {
            module,
            filePath: 'src/inventory.ts',
            startTime: now,
            endTime: now + 2500,
            keystrokeCount: 42,
          },
        },
      ],
    });
  }, sessionId);
}

async function readEditorBehaviorCounts(sessionId: string): Promise<EditorBehaviorCounts> {
  const row = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { metadata: true },
  });
  const metadata = (row?.metadata ?? {}) as Record<string, unknown>;
  const mb = (metadata.mb ?? {}) as Record<string, unknown>;
  const editorBehavior = (mb.editorBehavior ?? {}) as Record<string, unknown>;
  return {
    chatEvents: Array.isArray(editorBehavior.chatEvents) ? editorBehavior.chatEvents.length : 0,
    diffEvents: Array.isArray(editorBehavior.diffEvents) ? editorBehavior.diffEvents.length : 0,
    fileNavigationHistory: Array.isArray(editorBehavior.fileNavigationHistory)
      ? editorBehavior.fileNavigationHistory.length
      : 0,
    editSessions: Array.isArray(editorBehavior.editSessions)
      ? editorBehavior.editSessions.length
      : 0,
  };
}

test.describe('MB telemetry browser smoke', () => {
  test.setTimeout(120_000);

  test('browser behavior:batch lands in metadata.mb.editorBehavior via /interview socket', async ({
    page,
  }) => {
    const fixture: GoldenPathDriverFixture = {
      ...liamSGradeFixture,
      grade: 'S',
      candidate: {
        name: 'Telemetry Smoke',
        email: `telemetry-smoke-${Date.now()}@test.local`,
        yearsOfExperience: 8,
        primaryTechStack: ['TypeScript', 'React', 'Node.js'],
      },
      examId: CANONICAL_EXAM_ID,
    };
    const driver = new GoldenPathDriver(page, ADMIN_CREDS);
    await driver.loginAdmin();
    const { sessionId } = await driver.createSession(fixture);

    await emitBehaviorBatchFromBrowser(page, sessionId);

    await expect
      .poll(() => readEditorBehaviorCounts(sessionId), {
        timeout: 15_000,
        intervals: [250, 500, 1000],
      })
      .toEqual({
        chatEvents: 1,
        diffEvents: 1,
        fileNavigationHistory: 1,
        editSessions: 1,
      });
  });
});
