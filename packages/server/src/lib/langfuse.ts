import { env } from '../config/env.js';
import { logger } from './logger.js';

// Langfuse integration - optional, no-op if keys not configured
interface TraceParams {
  name: string;
  sessionId?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
}

interface LangfuseClient {
  trace(params: TraceParams): { id: string };
  generation(params: TraceParams & { model?: string; usage?: unknown }): { id: string };
  flush(): Promise<void>;
}

function createNoOpClient(): LangfuseClient {
  return {
    trace: () => ({ id: 'noop' }),
    generation: () => ({ id: 'noop' }),
    flush: async () => {},
  };
}

async function createLangfuseClient(): Promise<LangfuseClient> {
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) {
    logger.info('Langfuse keys not configured, using no-op client');
    return createNoOpClient();
  }

  try {
    const { Langfuse } = await import('langfuse');
    const client = new Langfuse({
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY,
      baseUrl: env.LANGFUSE_BASE_URL,
    });
    logger.info('Langfuse client initialized');
    return client as unknown as LangfuseClient;
  } catch {
    logger.warn('Failed to initialize Langfuse, using no-op client');
    return createNoOpClient();
  }
}

let _client: LangfuseClient | null = null;

export async function getLangfuse(): Promise<LangfuseClient> {
  if (!_client) {
    _client = await createLangfuseClient();
  }
  return _client;
}
