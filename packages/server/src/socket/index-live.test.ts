import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Server as SocketIOServer } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';

const persistModuleASubmission = vi.hoisted(() => vi.fn());
const saveRoundAnswer = vi.hoisted(() => vi.fn());
const eventBusEmit = vi.hoisted(() => vi.fn());
const noopRegistrar = vi.hoisted(() => vi.fn());

vi.mock('./mb-handlers.js', () => ({ registerMBHandlers: noopRegistrar }));
vi.mock('./behavior-handlers.js', () => ({ registerBehaviorHandlers: noopRegistrar }));
vi.mock('./self-assess-handlers.js', () => ({ registerSelfAssessHandlers: noopRegistrar }));
vi.mock('./phase0-handlers.js', () => ({ registerPhase0Handlers: noopRegistrar }));
vi.mock('./moduleD-handlers.js', () => ({ registerModuleDHandlers: noopRegistrar }));

vi.mock('../services/modules/ma.service.js', () => ({
  persistModuleASubmission,
}));

vi.mock('../services/modules/mc.service.js', () => ({
  saveRoundAnswer,
}));

vi.mock('../services/event-bus.service.js', () => ({
  eventBus: { emit: eventBusEmit },
}));

import { registerSocketHandlers } from './index.js';

const VALID_MODULE_A_SUBMISSION = {
  round1: {
    schemeId: 'A',
    reasoning: 'reasoning',
    structuredForm: {
      scenario: 'scenario',
      tradeoff: 'tradeoff',
      decision: 'decision',
      verification: 'verification',
    },
    challengeResponse: 'challenge',
  },
  round2: {
    markedDefects: [
      { defectId: 'line-4', line: 4, commentType: 'bug', comment: 'comment' },
    ],
  },
  round3: {
    correctVersionChoice: 'success',
    diffAnalysis: 'diff',
    diagnosisText: 'diagnosis',
  },
  round4: {
    response: 'response',
    submittedAt: 1,
    timeSpentSec: 1,
  },
};

describe('socket namespace smoke', () => {
  let httpServer: HttpServer;
  let io: SocketIOServer;
  let client: ClientSocket | null = null;

  beforeEach(async () => {
    persistModuleASubmission.mockReset();
    persistModuleASubmission.mockResolvedValue(undefined);
    saveRoundAnswer.mockReset();
    saveRoundAnswer.mockResolvedValue(undefined);
    eventBusEmit.mockReset();
    eventBusEmit.mockResolvedValue(undefined);

    httpServer = createServer();
    io = new SocketIOServer(httpServer, { transports: ['websocket'] });
    registerSocketHandlers(io);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  });

  afterEach(async () => {
    client?.disconnect();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('accepts V5 module emits on the /interview namespace used by the client', async () => {
    const port = (httpServer.address() as AddressInfo).port;
    client = createClient(`http://127.0.0.1:${port}/interview`, {
      transports: ['websocket'],
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      client!.once('connect', resolve);
      client!.once('connect_error', reject);
    });

    const ok = await client.emitWithAck('moduleA:submit', {
      sessionId: 'sess-live-socket',
      submission: VALID_MODULE_A_SUBMISSION,
    });

    expect(ok).toBe(true);
    expect(persistModuleASubmission).toHaveBeenCalledWith(
      'sess-live-socket',
      VALID_MODULE_A_SUBMISSION,
    );
    expect(eventBusEmit).toHaveBeenCalled();
  });

  it('accepts Module C answer emits on /interview with explicit sessionId', async () => {
    const port = (httpServer.address() as AddressInfo).port;
    client = createClient(`http://127.0.0.1:${port}/interview`, {
      transports: ['websocket'],
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      client!.once('connect', resolve);
      client!.once('connect_error', reject);
    });

    const ok = await client.emitWithAck('v5:modulec:answer', {
      sessionId: 'sess-live-mc',
      round: 2,
      question: 'Emma question',
      answer: 'Candidate answer',
      probeStrategy: 'contradiction',
    });

    expect(ok).toBe(true);
    expect(saveRoundAnswer).toHaveBeenCalledWith(
      'sess-live-mc',
      2,
      'Candidate answer',
      'Emma question',
      'contradiction',
    );
  });
});
