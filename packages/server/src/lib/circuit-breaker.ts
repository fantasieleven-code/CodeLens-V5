import { CB_FAILURE_THRESHOLD, CB_OPEN_DURATION_MS } from '@codelens-v5/shared';
import { logger } from './logger.js';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly openDurationMs: number;

  constructor(
    name: string,
    failureThreshold = CB_FAILURE_THRESHOLD,
    openDurationMs = CB_OPEN_DURATION_MS,
  ) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.openDurationMs = openDurationMs;
  }

  isAvailable(): boolean {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.openDurationMs) {
        this.state = 'HALF_OPEN';
        logger.info(`CircuitBreaker [${this.name}]: OPEN → HALF_OPEN`);
        return true;
      }
      return false;
    }
    // HALF_OPEN: allow one request through
    return true;
  }

  recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      logger.info(`CircuitBreaker [${this.name}]: HALF_OPEN → CLOSED`);
    }
    this.state = 'CLOSED';
    this.failureCount = 0;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      logger.warn(`CircuitBreaker [${this.name}]: HALF_OPEN → OPEN`);
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.warn(
        `CircuitBreaker [${this.name}]: CLOSED → OPEN (${this.failureCount} failures)`,
      );
    }
  }

  getState(): CircuitState {
    // Re-evaluate if it's time to transition from OPEN
    if (this.state === 'OPEN' && Date.now() - this.lastFailureTime >= this.openDurationMs) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.isAvailable()) {
      throw new Error(`CircuitBreaker [${this.name}] is OPEN — service temporarily unavailable`);
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }
}
