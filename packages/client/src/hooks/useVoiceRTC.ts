/**
 * useVoiceRTC — VERTC SDK integration for CP4 voice interview
 *
 * Handles:
 * - RTC engine creation and room join
 * - Remote audio subscription (AI interviewer)
 * - Microphone publish
 * - Subtitle events via WebSocket (not RTC — subtitles come from webhook callback)
 * - Cleanup on unmount
 */

import { useEffect, useRef, useCallback } from 'react';
import VERTC, { MediaType, StreamIndex } from '@volcengine/rtc';
import { useVoiceStore } from '../stores/voice.store.js';
import { useSessionStore } from '../stores/session.store.js';

interface VoiceRTCOptions {
  /** Whether CP4 is active and voice should start */
  enabled: boolean;
  /**
   * Server endpoint that boots the voice agent. Defaults to v3's
   * `/api/voice/start`. v4 Module C should pass `/api/voice/v4/start`
   * (different prompt builder, schema-gated). Both endpoints return the
   * same `{ roomId, taskId, mode }` shape.
   */
  startEndpoint?: string;
}

export function useVoiceRTC({ enabled, startEndpoint = '/api/voice/start' }: VoiceRTCOptions) {
  const engineRef = useRef<ReturnType<typeof VERTC.createEngine> | null>(null);
  const joinedRef = useRef(false);

  const startVoice = useCallback(async () => {
    const voiceStore = useVoiceStore.getState();
    const sessionStore = useSessionStore.getState();

    if (!sessionStore.sessionId || !sessionStore.token) return;

    voiceStore.setState('requesting_mic');

    try {
      // Request mic permission with browser-level echo cancellation.
      // VERTC SDK does its own capture with internal AEC, but these constraints
      // make the permission probe consistent and serve as a hint to drivers.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      stream.getTracks().forEach((t) => t.stop()); // VERTC SDK manages its own stream
      voiceStore.setMicGranted(true);

      voiceStore.setState('connecting');

      // 1. Request voice start from server (creates RTC agent)
      const res = await fetch(startEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStore.token}`,
        },
        body: JSON.stringify({ sessionId: sessionStore.sessionId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to start voice agent' }));
        throw new Error(err.error || 'Failed to start voice agent');
      }

      const { roomId, taskId, mode } = await res.json();
      voiceStore.setRoomInfo(roomId, taskId);
      voiceStore.setMode(mode);

      // 2. Get RTC token
      const tokenRes = await fetch('/api/voice/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStore.token}`,
        },
        body: JSON.stringify({ sessionId: sessionStore.sessionId }),
      });

      if (!tokenRes.ok) {
        throw new Error('Failed to get RTC token');
      }

      const { token: rtcToken, appId, userId } = await tokenRes.json();

      // 3. Create VERTC engine
      const engine = VERTC.createEngine(appId);
      engineRef.current = engine;

      // 4. Set up event handlers
      engine.on(VERTC.events.onUserJoined, (event) => {
        // AI agent joined the room
        if (event.userInfo.userId?.startsWith('AI_')) {
          voiceStore.setState('listening');
        }
      });

      engine.on(VERTC.events.onUserLeave, (event) => {
        if (event.userInfo.userId?.startsWith('AI_')) {
          voiceStore.setState('idle');
        }
      });

      engine.on(VERTC.events.onAutoplayFailed, () => {
        // Browser autoplay policy blocked audio
        // User interaction will resume playback
        console.warn('[voice-rtc] Autoplay failed, waiting for user gesture');
      });

      engine.on(VERTC.events.onUserPublishStream, async (event) => {
        // Subscribe to AI agent's audio stream
        if (event.userId?.startsWith('AI_')) {
          try {
            await engine.subscribeStream(event.userId, MediaType.AUDIO);
          } catch (err) {
            console.error('[voice-rtc] Failed to subscribe to remote audio:', err);
          }
        }
      });

      // 5. Join room
      await engine.joinRoom(
        rtcToken,
        roomId,
        { userId },
        { isAutoPublish: true, isAutoSubscribeAudio: true },
      );
      joinedRef.current = true;

      // 6. Start local audio capture and publish
      await engine.startAudioCapture();
      await engine.publishStream(MediaType.AUDIO);

      voiceStore.setState('listening');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Voice connection failed';
      console.error('[voice-rtc] Error:', msg);
      voiceStore.setError(msg);

      // Auto-degrade to text mode after 3s
      setTimeout(() => {
        if (useVoiceStore.getState().state === 'error') {
          voiceStore.setState('degraded');
        }
      }, 3000);
    }
  }, [startEndpoint]);

  const stopVoice = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    try {
      await engine.stopAudioCapture();
      if (joinedRef.current) {
        await engine.leaveRoom();
        joinedRef.current = false;
      }
      engine.destroy();
      engineRef.current = null;
    } catch (err) {
      console.error('[voice-rtc] Cleanup error:', err);
    }

    // Notify server to stop voice agent
    const { sessionId, token } = useSessionStore.getState();
    if (sessionId && token) {
      fetch('/api/voice/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }
  }, []);

  // Auto-start when enabled, auto-stop when disabled or unmount
  useEffect(() => {
    if (enabled) {
      startVoice();
    }

    return () => {
      if (joinedRef.current) {
        stopVoice();
      }
    };
  }, [enabled, startVoice, stopVoice]);

  return { startVoice, stopVoice };
}
