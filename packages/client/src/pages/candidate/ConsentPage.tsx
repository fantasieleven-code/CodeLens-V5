/**
 * ConsentPage — `/candidate/:sessionToken/consent`.
 *
 * GDPR-style 4-section consent screen (privacy / scope / retention / rights),
 * a single accept checkbox, and a submit that:
 *   1. POSTs to `/api/candidate/profile/submit` (consent-only field set)
 *   2. On 200, sets the per-session localStorage flag
 *      `codelens_candidate_consent:{sessionToken}` so `CandidateGuard`
 *      lets `/exam/:sessionId` render
 *   3. Navigates to `/exam/:sessionToken` (sessionToken ≡ sessionId per
 *      Phase 1 ratify)
 *
 * Errors map server `SubmitConsentErrorKind` → bilingual copy in
 * `consentContent.ts`. The error block carries `data-error-kind` so the
 * smoke harness can assert without string-matching.
 */

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  submitConsent,
  SubmitConsentError,
  type SubmitConsentErrorKind,
} from '../../services/candidateApi.js';
import { CONSENT_CONTENT } from './consentContent.js';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
} from '../../lib/tokens.js';

export const consentStorageKey = (sessionToken: string): string =>
  `codelens_candidate_consent:${sessionToken}`;

export const ConsentPage: React.FC = () => {
  const { sessionToken } = useParams<{ sessionToken: string }>();
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorKind, setErrorKind] = useState<SubmitConsentErrorKind | null>(null);

  if (!sessionToken) {
    return (
      <div data-testid="consent-missing-token" style={styles.statusContainer}>
        <div style={styles.errorCard}>
          <h1 style={styles.errorTitle}>{CONSENT_CONTENT.errors.session_token_required.zh}</h1>
          <p style={styles.statusText}>
            {CONSENT_CONTENT.errors.session_token_required.en}
          </p>
        </div>
      </div>
    );
  }

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accepted || submitting) return;
    setSubmitting(true);
    setErrorKind(null);
    try {
      await submitConsent(sessionToken);
      localStorage.setItem(consentStorageKey(sessionToken), '1');
      navigate(`/exam/${sessionToken}`, { replace: true });
    } catch (err) {
      const kind: SubmitConsentErrorKind =
        err instanceof SubmitConsentError ? err.kind : 'unknown';
      setErrorKind(kind);
      setSubmitting(false);
    }
  };

  const submitLabel = submitting ? CONSENT_CONTENT.submitting : CONSENT_CONTENT.submit;
  const canSubmit = accepted && !submitting;

  return (
    <div data-testid="consent-page" style={styles.container}>
      <div style={styles.content}>
        <header style={styles.header}>
          <span style={styles.brand}>CodeLens</span>
          <h1 style={styles.title}>{CONSENT_CONTENT.title.zh}</h1>
          <p style={styles.subtitleEn}>{CONSENT_CONTENT.title.en}</p>
          <p style={styles.intro}>{CONSENT_CONTENT.intro.zh}</p>
          <p style={styles.introEn}>{CONSENT_CONTENT.intro.en}</p>
        </header>

        <ol data-testid="consent-sections" style={styles.sectionList}>
          {CONSENT_CONTENT.sections.map((section) => (
            <li
              key={section.id}
              data-section-id={section.id}
              style={styles.sectionCard}
            >
              <h2 style={styles.sectionTitleZh}>{section.title.zh}</h2>
              <p style={styles.sectionTitleEn}>{section.title.en}</p>
              <p style={styles.sectionBodyZh}>{section.body.zh}</p>
              <p style={styles.sectionBodyEn}>{section.body.en}</p>
            </li>
          ))}
        </ol>

        <form onSubmit={onSubmit} style={styles.form} noValidate>
          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              data-testid="consent-checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              disabled={submitting}
              style={styles.checkbox}
            />
            <span style={styles.checkboxText}>
              <span>{CONSENT_CONTENT.checkboxLabel.zh}</span>
              <span style={styles.checkboxTextEn}>
                {CONSENT_CONTENT.checkboxLabel.en}
              </span>
            </span>
          </label>

          {errorKind && (
            <p
              data-testid="consent-error"
              data-error-kind={errorKind}
              style={styles.errorMsg}
              role="alert"
            >
              <span>{CONSENT_CONTENT.errors[errorKind].zh}</span>
              <br />
              <span style={styles.errorMsgEn}>
                {CONSENT_CONTENT.errors[errorKind].en}
              </span>
            </p>
          )}

          <button
            type="submit"
            data-testid="consent-submit"
            disabled={!canSubmit}
            style={{
              ...styles.submitBtn,
              ...(canSubmit ? {} : styles.submitBtnDisabled),
            }}
          >
            <span>{submitLabel.zh}</span>
            <span style={styles.submitBtnEn}>{submitLabel.en}</span>
          </button>
        </form>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: colors.base,
    padding: `${spacing.xxl} ${spacing.lg}`,
    overflowY: 'auto',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
    maxWidth: 640,
    width: '100%',
    paddingTop: 32,
    paddingBottom: 48,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center' as const,
    gap: spacing.sm,
  },
  brand: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.mauve,
    letterSpacing: '1px',
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  subtitleEn: {
    fontSize: fontSizes.sm,
    color: colors.overlay2,
    margin: 0,
    fontStyle: 'italic',
  },
  intro: {
    fontSize: fontSizes.md,
    color: colors.subtext0,
    margin: `${spacing.md} 0 0`,
    lineHeight: 1.6,
  },
  introEn: {
    fontSize: fontSizes.sm,
    color: colors.overlay2,
    margin: 0,
    lineHeight: 1.6,
    fontStyle: 'italic',
  },
  sectionList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  sectionCard: {
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface0}`,
    padding: spacing.xl,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  sectionTitleZh: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    margin: 0,
  },
  sectionTitleEn: {
    fontSize: fontSizes.sm,
    color: colors.overlay2,
    margin: 0,
    fontStyle: 'italic',
  },
  sectionBodyZh: {
    fontSize: fontSizes.md,
    color: colors.subtext1,
    margin: `${spacing.sm} 0 0`,
    lineHeight: 1.7,
  },
  sectionBodyEn: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    margin: 0,
    lineHeight: 1.7,
  },
  form: {
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface0}`,
    padding: spacing.xl,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing.md,
    cursor: 'pointer',
  },
  checkbox: {
    marginTop: 4,
    width: 18,
    height: 18,
    accentColor: colors.mauve,
    cursor: 'pointer',
    flexShrink: 0,
  },
  checkboxText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    fontSize: fontSizes.md,
    color: colors.text,
    lineHeight: 1.5,
  },
  checkboxTextEn: {
    fontSize: fontSizes.sm,
    color: colors.overlay2,
    fontStyle: 'italic',
  },
  errorMsg: {
    backgroundColor: '#3a1f2a',
    border: `1px solid ${colors.red}`,
    borderRadius: radii.md,
    padding: spacing.md,
    margin: 0,
    fontSize: fontSizes.md,
    color: colors.red,
    lineHeight: 1.5,
  },
  errorMsgEn: {
    fontSize: fontSizes.sm,
    color: colors.maroon,
    fontStyle: 'italic',
  },
  submitBtn: {
    padding: `${spacing.md} ${spacing.xxl}`,
    backgroundColor: colors.mauve,
    border: 'none',
    borderRadius: radii.md,
    color: colors.base,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  submitBtnEn: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.normal,
    opacity: 0.75,
  },
  submitBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  statusContainer: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    minHeight: '100vh',
    backgroundColor: colors.base,
    padding: spacing.xl,
  },
  statusText: {
    fontSize: fontSizes.md,
    color: colors.subtext0,
    margin: 0,
    textAlign: 'center' as const,
    lineHeight: 1.6,
  },
  errorCard: {
    maxWidth: 480,
    padding: spacing.xl,
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface0}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    textAlign: 'center' as const,
  },
  errorTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.red,
    margin: 0,
  },
};
