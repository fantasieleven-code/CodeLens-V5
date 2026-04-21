/**
 * ProfileGuard · wraps /candidate/:sessionToken/profile.
 *
 * Nested flag gate (V5.0 · option b / localStorage · no TTL):
 *   - consent flag absent → redirect to /candidate/:sessionToken/consent
 *   - profile flag present → redirect to /exam/:sessionToken (avoid re-submit)
 *   - otherwise → render children (ProfileSetup)
 *
 * Mirrors CandidateGuard's Pattern D defense: flags are per-session-token
 * UX shortcuts, not the source of truth (server-side consentAcceptedAt /
 * profile record is authoritative).
 */

import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { consentStorageKey } from './ConsentPage.js';
import { profileStorageKey } from './ProfileSetup.js';

export const ProfileGuard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { sessionToken } = useParams<{ sessionToken: string }>();

  if (!sessionToken) {
    return <>{children}</>;
  }

  const canRead =
    typeof localStorage !== 'undefined' &&
    typeof localStorage.getItem === 'function';
  const consented =
    canRead && localStorage.getItem(consentStorageKey(sessionToken)) === '1';
  const profileSubmitted =
    canRead && localStorage.getItem(profileStorageKey(sessionToken)) === '1';

  if (!consented) {
    return <Navigate to={`/candidate/${sessionToken}/consent`} replace />;
  }
  if (profileSubmitted) {
    return <Navigate to={`/exam/${sessionToken}`} replace />;
  }
  return <>{children}</>;
};
