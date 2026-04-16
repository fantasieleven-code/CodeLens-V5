type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
const isProduction = process.env.NODE_ENV === 'production';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  [key: string]: unknown;
}

function formatError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { error: err.message, stack: err.stack };
  }
  return { error: String(err) };
}

function log(level: LogLevel, message: string, context: Record<string, unknown>, args: unknown[]) {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...context,
  };

  // Merge extra args (first object arg or error)
  for (const arg of args) {
    if (arg instanceof Error) {
      Object.assign(entry, formatError(arg));
    } else if (arg && typeof arg === 'object') {
      Object.assign(entry, arg);
    }
  }

  if (isProduction) {
    // JSON structured output for log aggregation
    const output = JSON.stringify(entry);
    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  } else {
    // Human-readable output for development
    const prefix = `[${entry.timestamp}] [${entry.level}]`;
    const ctxKeys = Object.keys(context);
    const ctxStr = ctxKeys.length > 0 ? ` ${JSON.stringify(context)}` : '';
    if (level === 'error') {
      console.error(prefix, message + ctxStr, ...args);
    } else if (level === 'warn') {
      console.warn(prefix, message + ctxStr, ...args);
    } else {
      console.log(prefix, message + ctxStr, ...args);
    }
  }
}

export interface Logger {
  debug: (msg: string, ...args: unknown[]) => void;
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
  child: (childContext: Record<string, unknown>) => Logger;
}

function createLogger(context: Record<string, unknown> = {}): Logger {
  return {
    debug: (msg: string, ...args: unknown[]) => log('debug', msg, context, args),
    info: (msg: string, ...args: unknown[]) => log('info', msg, context, args),
    warn: (msg: string, ...args: unknown[]) => log('warn', msg, context, args),
    error: (msg: string, ...args: unknown[]) => log('error', msg, context, args),
    child: (childContext: Record<string, unknown>) =>
      createLogger({ ...context, ...childContext }),
  };
}

export const logger = createLogger();
