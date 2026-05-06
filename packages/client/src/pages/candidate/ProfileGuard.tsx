/**
 * ProfileGuard · wraps /candidate/:sessionToken/profile.
 *
 * Server-authoritative nested gate:
 *   - no server consent → redirect to /candidate/:sessionToken/consent
 *   - server profile present → redirect to /exam/:sessionToken
 *   - otherwise → render children (ProfileSetup)
 *
 * LocalStorage flags are cache only and are reconciled from server state.
 */

import React, { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { fetchCandidateSessionStatus } from '../../services/candidateApi.js';
import { consentStorageKey } from './ConsentPage.js';
import { profileStorageKey } from './ProfileSetup.js';

type GuardState = 'loading' | 'needs-consent' | 'needs-profile' | 'profile-done';

export const ProfileGuard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { sessionToken } = useParams<{ sessionToken: string }>();
  const [state, setState] = useState<GuardState>('loading');

  useEffect(() => {
    if (!sessionToken) {
      setState('needs-profile');
      return;
    }
    let cancelled = false;
    fetchCandidateSessionStatus(sessionToken)
      .then((status) => {
        if (cancelled) return;
        const consented = status.consentAcceptedAt !== null;
        if (!consented) {
          localStorage.removeItem(consentStorageKey(sessionToken));
          localStorage.removeItem(profileStorageKey(sessionToken));
          setState('needs-consent');
          return;
        }
        localStorage.setItem(consentStorageKey(sessionToken), '1');
        if (status.profileSubmitted) {
          localStorage.setItem(profileStorageKey(sessionToken), '1');
          setState('profile-done');
          return;
        }
        localStorage.removeItem(profileStorageKey(sessionToken));
        setState('needs-profile');
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem(consentStorageKey(sessionToken));
        localStorage.removeItem(profileStorageKey(sessionToken));
        setState('needs-consent');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  if (state === 'loading') {
    return <div data-testid="profile-guard-loading" />;
  }
  if (state === 'needs-consent' && sessionToken) {
    return <Navigate to={`/candidate/${sessionToken}/consent`} replace />;
  }
  if (state === 'profile-done' && sessionToken) {
    return <Navigate to={`/exam/${sessionToken}`} replace />;
  }
  return <>{children}</>;
};
