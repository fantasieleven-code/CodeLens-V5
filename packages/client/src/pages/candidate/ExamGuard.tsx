/**
 * ExamGuard — wraps `/exam/:sessionId` to gate entry on consent.
 *
 * Server-authoritative guard. LocalStorage is only a cache written after
 * `/api/candidate/session/status` confirms consentAcceptedAt.
 */

import React, { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { fetchCandidateSessionStatus } from '../../services/candidateApi.js';
import { consentStorageKey } from './ConsentPage.js';

export const ExamGuard: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setAllowed(true);
      return;
    }
    let cancelled = false;
    fetchCandidateSessionStatus(sessionId)
      .then((status) => {
        if (cancelled) return;
        const consented = status.consentAcceptedAt !== null;
        if (consented) {
          localStorage.setItem(consentStorageKey(sessionId), '1');
        } else {
          localStorage.removeItem(consentStorageKey(sessionId));
        }
        setAllowed(consented);
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem(consentStorageKey(sessionId));
        setAllowed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (allowed === null) {
    return <div data-testid="exam-guard-loading" />;
  }

  if (!allowed && sessionId) {
    return <Navigate to={`/candidate/${sessionId}/consent`} replace />;
  }
  return <>{children}</>;
};
