import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const registerMBHandlers = vi.hoisted(() => vi.fn());
const registerBehaviorHandlers = vi.hoisted(() => vi.fn());
const registerSelfAssessHandlers = vi.hoisted(() => vi.fn());
const registerPhase0Handlers = vi.hoisted(() => vi.fn());
const registerModuleAHandlers = vi.hoisted(() => vi.fn());
const registerModuleCHandlers = vi.hoisted(() => vi.fn());
const registerModuleDHandlers = vi.hoisted(() => vi.fn());

vi.mock('./mb-handlers.js', () => ({ registerMBHandlers }));
vi.mock('./behavior-handlers.js', () => ({ registerBehaviorHandlers }));
vi.mock('./self-assess-handlers.js', () => ({ registerSelfAssessHandlers }));
vi.mock('./phase0-handlers.js', () => ({ registerPhase0Handlers }));
vi.mock('./moduleA-handlers.js', () => ({ registerModuleAHandlers }));
vi.mock('./moduleC-handlers.js', () => ({ registerModuleCHandlers }));
vi.mock('./moduleD-handlers.js', () => ({ registerModuleDHandlers }));
vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { registerSocketHandlers } from './index.js';

type ConnectionHandler = (socket: EventEmitter & { id: string }) => void;

function makeIo() {
  const rootHandlers: ConnectionHandler[] = [];
  const interviewHandlers: ConnectionHandler[] = [];
  const interviewNamespace = {
    on: vi.fn((event: string, handler: ConnectionHandler) => {
      if (event === 'connection') interviewHandlers.push(handler);
    }),
  };
  const io = {
    on: vi.fn((event: string, handler: ConnectionHandler) => {
      if (event === 'connection') rootHandlers.push(handler);
    }),
    of: vi.fn((name: string) => {
      expect(name).toBe('/interview');
      return interviewNamespace;
    }),
  };
  return { io, interviewNamespace, rootHandlers, interviewHandlers };
}

describe('registerSocketHandlers', () => {
  it('registers the V5 handlers on root and /interview namespaces', () => {
    const { io, interviewNamespace, rootHandlers, interviewHandlers } = makeIo();

    registerSocketHandlers(io as never);

    expect(io.on).toHaveBeenCalledWith('connection', expect.any(Function));
    expect(interviewNamespace.on).toHaveBeenCalledWith('connection', expect.any(Function));
    expect(rootHandlers).toHaveLength(1);
    expect(interviewHandlers).toHaveLength(1);
  });

  it('wires every module handler when the /interview namespace connects', () => {
    const { io, interviewHandlers } = makeIo();
    registerSocketHandlers(io as never);
    const socket = Object.assign(new EventEmitter(), { id: 'socket-interview' });

    interviewHandlers[0](socket);

    expect(registerMBHandlers).toHaveBeenCalledWith(io, socket);
    expect(registerBehaviorHandlers).toHaveBeenCalledWith(io, socket);
    expect(registerSelfAssessHandlers).toHaveBeenCalledWith(io, socket);
    expect(registerPhase0Handlers).toHaveBeenCalledWith(io, socket);
    expect(registerModuleAHandlers).toHaveBeenCalledWith(io, socket);
    expect(registerModuleCHandlers).toHaveBeenCalledWith(io, socket);
    expect(registerModuleDHandlers).toHaveBeenCalledWith(io, socket);
  });
});
