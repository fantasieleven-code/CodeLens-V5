/**
 * ExamGuard — wraps `/exam/:sessionId` to gate entry on consent.
 *
 * Reads the per-session localStorage flag
 * `codelens_candidate_consent:{sessionId}` (written by ConsentPage on 200).
 * Absent → redirects to `/candidate/:sessionId/consent` (sessionToken ≡
 * sessionId per Phase 1 ratify [B]). Present → renders children.
 *
 * Option b (V5.0) — localStorage flag, no TTL. V5.0.5 may upgrade to a
 * server-side `session-status` endpoint if Backend grows one (tracked in
 * observation #117).
 *
 * Pattern D defense: no expiry on the flag — V5.0 explicitly punts TTL
 * because (a) the flag is per-session-token, so leaking a stale flag
 * across sessions is impossible, and (b) the source of truth lives
 * server-side in the consent record; the flag is just a UX shortcut.
 */

import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { consentStorageKey } from './ConsentPage.js';

export const ExamGuard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { sessionId } = useParams<{ sessionId: string }>();

  if (!sessionId) {
    return <>{children}</>;
  }

  const consented =
    typeof localStorage !== 'undefined' &&
    typeof localStorage.getItem === 'function' &&
    localStorage.getItem(consentStorageKey(sessionId)) === '1';

  if (!consented) {
    return <Navigate to={`/candidate/${sessionId}/consent`} replace />;
  }
  return <>{children}</>;
};
