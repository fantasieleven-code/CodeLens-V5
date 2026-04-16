/**
 * ProctorService — Analyzes camera frames for integrity monitoring.
 *
 * M2 implementation: simple brightness-based heuristics (no CV model).
 * - Consecutive dark frames → CAMERA_BLOCKED
 * - Large brightness jump → SUDDEN_CHANGE
 * Results feed into S_proctor_integrity signal.
 */

import { logger } from '../lib/logger.js';

interface FrameRecord {
  brightness: number;
  timestamp: string;
}

interface ProctorAnomaly {
  flag: string;
  timestamp: string;
  details: string;
}

export class ProctorService {
  private sessionFrames = new Map<string, FrameRecord[]>();
  private sessionAnomalies = new Map<string, ProctorAnomaly[]>();

  /**
   * Analyze a single proctor frame (base64 JPEG).
   * Returns any detected anomaly flags.
   */
  analyzeFrame(sessionId: string, frameBase64: string, timestamp: string): string[] {
    const frames = this.sessionFrames.get(sessionId) || [];
    const brightness = this.computeApproxBrightness(frameBase64);
    frames.push({ brightness, timestamp });
    this.sessionFrames.set(sessionId, frames);

    const flags: string[] = [];

    // Check 1: Consecutive 5 dark frames → camera blocked/covered
    const recent5 = frames.slice(-5);
    if (recent5.length === 5 && recent5.every((f) => f.brightness < 30)) {
      flags.push('CAMERA_BLOCKED');
    }

    // Check 2: Sudden brightness change from previous frame
    if (frames.length >= 2) {
      const prev = frames[frames.length - 2];
      if (Math.abs(brightness - prev.brightness) > 80) {
        flags.push('SUDDEN_CHANGE');
      }
    }

    if (flags.length > 0) {
      const anomalies = this.sessionAnomalies.get(sessionId) || [];
      for (const flag of flags) {
        anomalies.push({ flag, timestamp, details: `brightness=${brightness.toFixed(0)}` });
      }
      this.sessionAnomalies.set(sessionId, anomalies);
      logger.info(`[proctor] Session ${sessionId}: ${flags.join(', ')} at ${timestamp}`);
    }

    return flags;
  }

  /**
   * Handle proctor_unavailable event (camera not accessible).
   */
  markUnavailable(sessionId: string, timestamp: string): void {
    const anomalies = this.sessionAnomalies.get(sessionId) || [];
    anomalies.push({ flag: 'PROCTOR_UNAVAILABLE', timestamp, details: 'getUserMedia denied or unavailable' });
    this.sessionAnomalies.set(sessionId, anomalies);
    logger.info(`[proctor] Session ${sessionId}: camera unavailable`);
  }

  /**
   * Generate summary for a session (called at end of interview).
   * Returns anomaly list and overall flag count.
   */
  generateSummary(sessionId: string): {
    totalFrames: number;
    anomalies: ProctorAnomaly[];
    isClean: boolean;
  } {
    const frames = this.sessionFrames.get(sessionId) || [];
    const anomalies = this.sessionAnomalies.get(sessionId) || [];
    return {
      totalFrames: frames.length,
      anomalies,
      isClean: anomalies.length === 0,
    };
  }

  /**
   * Clean up session data after scoring.
   */
  cleanup(sessionId: string): void {
    this.sessionFrames.delete(sessionId);
    this.sessionAnomalies.delete(sessionId);
  }

  /**
   * Approximate brightness from JPEG base64 string.
   * Uses file size as a proxy: dark images compress to smaller files.
   * Returns 0-100 scale.
   */
  private computeApproxBrightness(base64: string): number {
    const byteLength = Math.ceil(base64.length * 0.75); // base64 → bytes
    // 5KB JPEG at 160×120 quality 50% is typical for a normal face scene.
    // Very dark = ~1KB, normal = ~3-6KB, very bright = ~4-7KB
    return Math.min(100, byteLength / 50);
  }
}

export const proctorService = new ProctorService();
