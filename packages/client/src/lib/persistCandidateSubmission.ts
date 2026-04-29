import type { ClientToServerEvents } from '@codelens-v5/shared';
import { getSocket } from './socket.js';

type SubmitAckEvent =
  | 'phase0:submit'
  | 'moduleA:submit'
  | 'moduleD:submit'
  | 'v5:mb:submit'
  | 'self-assess:submit';

type AckPayload<K extends SubmitAckEvent> = ClientToServerEvents[K] extends (
  payload: infer P,
  ack: (ok: boolean) => void,
) => void
  ? P
  : never;

type SubmitEmitter = <K extends SubmitAckEvent>(
  event: K,
  payload: AckPayload<K>,
  ack: (ok: boolean) => void,
) => void;

interface PersistCandidateSubmissionOptions<K extends SubmitAckEvent> {
  event: K;
  payload: AckPayload<K>;
  http?: {
    url: string;
    body: unknown;
  };
  timeoutMs?: number;
}

function emitWithAck<K extends SubmitAckEvent>(
  event: K,
  payload: AckPayload<K>,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, timeoutMs);

    const socket = getSocket();
    const emit = socket.emit.bind(socket) as SubmitEmitter;
    emit(event, payload, (ok: boolean) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      resolve(ok);
    });
  });
}

async function postJson(url: string, body: unknown): Promise<boolean> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.ok;
}

export async function persistCandidateSubmission<K extends SubmitAckEvent>({
  event,
  payload,
  http,
  timeoutMs = 8000,
}: PersistCandidateSubmissionOptions<K>): Promise<boolean> {
  const socketOk = await emitWithAck(event, payload, timeoutMs);
  if (socketOk) return true;
  if (!http) return false;

  try {
    return await postJson(http.url, http.body);
  } catch {
    return false;
  }
}
