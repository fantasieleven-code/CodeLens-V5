/**
 * ProfileSetup · /candidate/:sessionToken/profile · 7-field self-report POST.
 * On 200 writes `codelens_candidate_profile_submitted:{sessionToken}` and
 * navigates to `/exam/:sessionToken`. Client validation via
 * CandidateProfileSchema.safeParse (shared workspace transitive zod).
 */

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CandidateProfileSchema } from '@codelens-v5/shared';
import {
  submitProfile,
  CandidateApiError,
} from '../../services/candidateApi.js';
import { PROFILE_CONTENT } from './profileContent.js';
import type { BilingualText } from '../../lib/bilingual.js';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
} from '../../lib/tokens.js';

export const profileStorageKey = (sessionToken: string): string =>
  `codelens_candidate_profile_submitted:${sessionToken}`;

interface FormState {
  yearsOfExperience: string;
  currentRole: string;
  primaryTechStack: string[];
  companySize: string;
  aiToolYears: string;
  primaryAiTool: string;
  dailyAiUsageHours: string;
}

const INITIAL_FORM: FormState = {
  yearsOfExperience: '',
  currentRole: '',
  primaryTechStack: [],
  companySize: '',
  aiToolYears: '',
  primaryAiTool: '',
  dailyAiUsageHours: '',
};

function buildCandidate(form: FormState): Record<string, unknown> {
  return {
    yearsOfExperience:
      form.yearsOfExperience === '' ? undefined : Number(form.yearsOfExperience),
    currentRole: form.currentRole || undefined,
    primaryTechStack: form.primaryTechStack,
    companySize: form.companySize || undefined,
    aiToolYears: form.aiToolYears === '' ? undefined : Number(form.aiToolYears),
    primaryAiTool: form.primaryAiTool || undefined,
    dailyAiUsageHours: form.dailyAiUsageHours || undefined,
  };
}

export const ProfileSetup: React.FC = () => {
  const { sessionToken } = useParams<{ sessionToken: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [techInput, setTechInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  if (!sessionToken) {
    return (
      <div data-testid="profile-missing-token" style={styles.container}>
        <p style={styles.errorMsg} role="alert">
          <span>{PROFILE_CONTENT.urlMissingToken.zh}</span>
          <br />
          <span style={styles.errorMsgEn}>{PROFILE_CONTENT.urlMissingToken.en}</span>
        </p>
      </div>
    );
  }

  const addTech = (): void => {
    const item = techInput.trim();
    if (
      !item ||
      item.length > 50 ||
      form.primaryTechStack.includes(item) ||
      form.primaryTechStack.length >= 5
    )
      return;
    setForm({ ...form, primaryTechStack: [...form.primaryTechStack, item] });
    setTechInput('');
  };

  const removeTech = (item: string): void => {
    setForm({
      ...form,
      primaryTechStack: form.primaryTechStack.filter((x) => x !== item),
    });
  };

  const onSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (submitting) return;
    setErrorCode(null);

    const parsed = CandidateProfileSchema.safeParse(buildCandidate(form));
    if (!parsed.success) {
      setErrorCode('VALIDATION_ERROR');
      return;
    }

    setSubmitting(true);
    try {
      await submitProfile({ sessionToken, profile: parsed.data });
      localStorage.setItem(profileStorageKey(sessionToken), '1');
      navigate(`/exam/${sessionToken}`, { replace: true });
    } catch (err) {
      const code = err instanceof CandidateApiError ? err.code : 'UNKNOWN';
      setErrorCode(code);
      setSubmitting(false);
    }
  };

  const submitLabel = submitting
    ? PROFILE_CONTENT.submitting
    : PROFILE_CONTENT.submit;

  return (
    <div data-testid="profile-setup" style={styles.container}>
      <div style={styles.content}>
        <header style={styles.header}>
          <span style={styles.brand}>CodeLens</span>
          <h1 style={styles.title}>{PROFILE_CONTENT.pageTitle.zh}</h1>
          <p style={styles.subtitleEn}>{PROFILE_CONTENT.pageTitle.en}</p>
          <p style={styles.intro}>{PROFILE_CONTENT.intro.zh}</p>
          <p style={styles.introEn}>{PROFILE_CONTENT.intro.en}</p>
        </header>

        <form onSubmit={onSubmit} style={styles.form} noValidate>
          <FieldShell name="yearsOfExperience">
            <input
              type="number"
              data-testid="field-yearsOfExperience"
              min={0}
              max={50}
              value={form.yearsOfExperience}
              onChange={(e) =>
                setForm({ ...form, yearsOfExperience: e.target.value })
              }
              disabled={submitting}
              style={styles.input}
            />
          </FieldShell>

          <FieldShell name="currentRole">
            <EnumSelect
              testId="field-currentRole"
              value={form.currentRole}
              onChange={(v) => setForm({ ...form, currentRole: v })}
              options={PROFILE_CONTENT.enumLabels.currentRole as Record<string, BilingualText>}
              disabled={submitting}
            />
          </FieldShell>

          <FieldShell name="primaryTechStack">
            <div style={styles.tagRow} data-testid="techstack-items">
              {form.primaryTechStack.map((t) => (
                <span
                  key={t}
                  data-testid={`techstack-item-${t}`}
                  style={styles.tag}
                >
                  {t}
                  <button
                    type="button"
                    aria-label={`remove ${t}`}
                    onClick={() => removeTech(t)}
                    disabled={submitting}
                    style={styles.tagRemove}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={styles.tagInputRow}>
              <input
                type="text"
                data-testid="field-primaryTechStack-input"
                value={techInput}
                onChange={(e) => setTechInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTech();
                  }
                }}
                disabled={submitting || form.primaryTechStack.length >= 5}
                placeholder={PROFILE_CONTENT.techStackPlaceholder.zh}
                style={{ ...styles.input, flex: 1 }}
              />
              <button
                type="button"
                data-testid="field-primaryTechStack-add"
                onClick={addTech}
                disabled={submitting || form.primaryTechStack.length >= 5}
                style={styles.tagAdd}
              >
                +
              </button>
            </div>
            <p style={styles.hint}>
              {PROFILE_CONTENT.techStackHint.zh} / {PROFILE_CONTENT.techStackHint.en}
            </p>
          </FieldShell>

          <FieldShell name="companySize">
            <EnumSelect
              testId="field-companySize"
              value={form.companySize}
              onChange={(v) => setForm({ ...form, companySize: v })}
              options={PROFILE_CONTENT.enumLabels.companySize as Record<string, BilingualText>}
              disabled={submitting}
            />
          </FieldShell>

          <FieldShell name="aiToolYears">
            <EnumSelect
              testId="field-aiToolYears"
              value={form.aiToolYears}
              onChange={(v) => setForm({ ...form, aiToolYears: v })}
              options={PROFILE_CONTENT.enumLabels.aiToolYears as unknown as Record<string, BilingualText>}
              disabled={submitting}
            />
          </FieldShell>

          <FieldShell name="primaryAiTool">
            <EnumSelect
              testId="field-primaryAiTool"
              value={form.primaryAiTool}
              onChange={(v) => setForm({ ...form, primaryAiTool: v })}
              options={PROFILE_CONTENT.enumLabels.primaryAiTool as Record<string, BilingualText>}
              disabled={submitting}
            />
          </FieldShell>

          <FieldShell name="dailyAiUsageHours">
            <EnumSelect
              testId="field-dailyAiUsageHours"
              value={form.dailyAiUsageHours}
              onChange={(v) => setForm({ ...form, dailyAiUsageHours: v })}
              options={PROFILE_CONTENT.enumLabels.dailyAiUsageHours as Record<string, BilingualText>}
              disabled={submitting}
            />
          </FieldShell>

          {errorCode && (() => {
            const copy =
              (PROFILE_CONTENT.errors as Record<string, BilingualText>)[
                errorCode
              ] ?? PROFILE_CONTENT.errors.UNKNOWN;
            return (
              <p
                data-testid="profile-error"
                data-error-code={errorCode}
                style={styles.errorMsg}
                role="alert"
              >
                <span>{copy.zh}</span>
                <br />
                <span style={styles.errorMsgEn}>{copy.en}</span>
              </p>
            );
          })()}

          <button
            type="submit"
            data-testid="profile-submit"
            disabled={submitting}
            style={{
              ...styles.submitBtn,
              ...(submitting ? styles.submitBtnDisabled : {}),
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

const FieldShell: React.FC<{
  name:
    | 'yearsOfExperience'
    | 'currentRole'
    | 'primaryTechStack'
    | 'companySize'
    | 'aiToolYears'
    | 'primaryAiTool'
    | 'dailyAiUsageHours';
  children: React.ReactNode;
}> = ({ name, children }) => (
  <div data-testid={`field-shell-${name}`} style={styles.fieldShell}>
    <label style={styles.fieldLabel}>
      <span>{PROFILE_CONTENT.fieldLabels[name].zh}</span>
      <span style={enMetaLg}>{PROFILE_CONTENT.fieldLabels[name].en}</span>
    </label>
    {children}
    <p style={styles.fieldHelp} data-testid={`field-help-${name}`}>
      <span>{PROFILE_CONTENT.fieldHelps[name].zh}</span>
      <br />
      <span style={enMetaSm}>{PROFILE_CONTENT.fieldHelps[name].en}</span>
    </p>
  </div>
);

const enMetaLg: React.CSSProperties = { fontSize: fontSizes.sm, color: colors.overlay2, fontStyle: 'italic', fontWeight: fontWeights.normal };
const enMetaSm: React.CSSProperties = { fontSize: fontSizes.xs, color: colors.overlay2, fontStyle: 'italic' };

const EnumSelect: React.FC<{
  testId: string;
  value: string;
  onChange: (v: string) => void;
  options: Record<string, BilingualText>;
  disabled: boolean;
}> = ({ testId, value, onChange, options, disabled }) => (
  <select
    data-testid={testId}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    disabled={disabled}
    style={styles.input}
  >
    <option value="">—</option>
    {Object.keys(options).map((k) => (
      <option key={k} value={k}>
        {options[k].zh} / {options[k].en}
      </option>
    ))}
  </select>
);

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
  form: {
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface0}`,
    padding: spacing.xl,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
  },
  fieldShell: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  fieldLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    fontSize: fontSizes.md,
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  fieldHelp: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    margin: 0,
    lineHeight: 1.5,
  },
  hint: {
    fontSize: fontSizes.xs,
    color: colors.overlay2,
    margin: 0,
  },
  input: {
    padding: spacing.md,
    backgroundColor: colors.base,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.md,
    color: colors.text,
    fontSize: fontSizes.md,
    fontFamily: 'inherit',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.xs} ${spacing.sm}`,
    backgroundColor: colors.surface0,
    color: colors.text,
    borderRadius: radii.md,
    fontSize: fontSizes.sm,
  },
  tagRemove: {
    background: 'transparent',
    border: 'none',
    color: colors.red,
    cursor: 'pointer',
    fontSize: fontSizes.md,
    lineHeight: 1,
    padding: 0,
  },
  tagInputRow: {
    display: 'flex',
    gap: spacing.sm,
  },
  tagAdd: {
    padding: `0 ${spacing.md}`,
    backgroundColor: colors.surface1,
    border: 'none',
    borderRadius: radii.md,
    color: colors.text,
    cursor: 'pointer',
    fontSize: fontSizes.md,
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
};
