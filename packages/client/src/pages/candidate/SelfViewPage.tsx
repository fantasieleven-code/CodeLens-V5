/**
 * SelfViewPage · /candidate/self-view/:sessionId/:privateToken
 *
 * Candidate-private post-exam capability view (Task F-A10-lite · V5.0 A-series
 * #6 · ethics floor Frontend closure). URL token IS the auth — no Guard wrap,
 * no localStorage flag, no login redirect. Renders the restricted
 * V5CandidateSelfView (4 capability profiles + 6-dim relative strength) and
 * deliberately hides grade / composite / abs-score / signals / dangerFlag.
 * The client-side .strict() safeParse inside fetchCandidateSelfView is the
 * second ethics-floor guard (Backend schema.strict() is first).
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { V5CandidateSelfView } from '@codelens-v5/shared';
import {
  CandidateApiError,
  fetchCandidateSelfView,
} from '../../services/candidateApi.js';
import {
  SELF_VIEW_CONTENT,
  type SelfViewErrorKey,
} from './selfViewContent.js';
import type { BilingualText } from '../../lib/bilingual.js';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../lib/tokens.js';

type Strength = V5CandidateSelfView['dimensionRadar'][number]['relativeStrength'];

const KNOWN_ERROR_KEYS: ReadonlySet<SelfViewErrorKey> = new Set([
  'NOT_FOUND',
  'SESSION_INCOMPLETE',
  'VALIDATION_ERROR',
  'INTERNAL_ERROR',
]);

function resolveErrorKey(err: unknown): SelfViewErrorKey {
  if (err instanceof CandidateApiError && KNOWN_ERROR_KEYS.has(err.code as SelfViewErrorKey)) {
    return err.code as SelfViewErrorKey;
  }
  return 'INTERNAL_ERROR';
}

function formatCompletedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const SelfViewPage: React.FC = () => {
  const { sessionId, privateToken } = useParams<{
    sessionId: string;
    privateToken: string;
  }>();
  const [data, setData] = useState<V5CandidateSelfView | null>(null);
  const [errorKey, setErrorKey] = useState<SelfViewErrorKey | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId || !privateToken) {
      setErrorKey('NOT_FOUND');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchCandidateSelfView(sessionId, privateToken)
      .then((view) => {
        if (!cancelled) setData(view);
      })
      .catch((err: unknown) => {
        if (!cancelled) setErrorKey(resolveErrorKey(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, privateToken]);

  if (loading) {
    return <LoadingState />;
  }
  if (errorKey || !data) {
    return <ErrorState errorKey={errorKey ?? 'INTERNAL_ERROR'} />;
  }

  return (
    <div style={styles.page} data-testid="self-view-page">
      <Header completedAt={data.completedAt} />
      <CapabilityProfilesSection profiles={data.capabilityProfiles} />
      <DimensionRadarSection radar={data.dimensionRadar} />
      <Footer />
    </div>
  );
};

const Header: React.FC<{ completedAt: string }> = ({ completedAt }) => {
  const subtitle = SELF_VIEW_CONTENT.subtitle(formatCompletedAt(completedAt));
  return (
    <header style={styles.header}>
      <h1 style={styles.title}>
        <span>{SELF_VIEW_CONTENT.pageTitle.zh}</span>
        <span style={styles.titleEn}>{SELF_VIEW_CONTENT.pageTitle.en}</span>
      </h1>
      <p style={styles.subtitle}>
        <span>{subtitle.zh}</span>
        <span style={styles.subtitleEn}> · {subtitle.en}</span>
      </p>
      <p style={styles.ethicsNote} data-testid="self-view-ethics-note">
        <span>{SELF_VIEW_CONTENT.ethicsNote.zh}</span>
        <br />
        <span style={styles.ethicsNoteEn}>{SELF_VIEW_CONTENT.ethicsNote.en}</span>
      </p>
    </header>
  );
};

const CapabilityProfilesSection: React.FC<{
  profiles: V5CandidateSelfView['capabilityProfiles'];
}> = ({ profiles }) => (
  <section style={styles.section} data-testid="self-view-capability-section">
    <h2 style={styles.sectionTitle}>
      <span>{SELF_VIEW_CONTENT.capabilitySectionTitle.zh}</span>
      <span style={styles.sectionTitleEn}>
        {' · '}
        {SELF_VIEW_CONTENT.capabilitySectionTitle.en}
      </span>
    </h2>
    <div style={styles.profileList}>
      {profiles.map((p) => (
        <ProfileCard key={p.id} profile={p} />
      ))}
    </div>
  </section>
);

const LABEL_COLORS: Record<string, string> = {
  '自主': colors.green,
  '熟练': colors.blue,
  '有潜力': colors.peach,
  '待发展': colors.overlay2,
};

const ProfileCard: React.FC<{
  profile: V5CandidateSelfView['capabilityProfiles'][number];
}> = ({ profile }) => (
  <article style={styles.profileCard} data-testid="self-view-profile-card">
    <div style={styles.profileCardHeader}>
      <div>
        <div style={styles.profileName}>{profile.nameZh}</div>
        <div style={styles.profileNameEn}>{profile.nameEn}</div>
      </div>
      <span
        style={{
          ...styles.profileLabel,
          color: LABEL_COLORS[profile.label] ?? colors.text,
          borderColor: LABEL_COLORS[profile.label] ?? colors.overlay0,
        }}
      >
        {profile.label}
      </span>
    </div>
    <p style={styles.profileDescription}>{profile.description}</p>
  </article>
);

const DimensionRadarSection: React.FC<{
  radar: V5CandidateSelfView['dimensionRadar'];
}> = ({ radar }) => (
  <section style={styles.section} data-testid="self-view-radar-section">
    <h2 style={styles.sectionTitle}>
      <span>{SELF_VIEW_CONTENT.radarSectionTitle.zh}</span>
      <span style={styles.sectionTitleEn}>
        {' · '}
        {SELF_VIEW_CONTENT.radarSectionTitle.en}
      </span>
    </h2>
    <ul style={styles.radarList}>
      {radar.map((d) => (
        <DimensionBar key={d.id} dim={d} />
      ))}
    </ul>
  </section>
);

const STRENGTH_DOTS: Record<Strength, number> = { strong: 3, medium: 2, weak: 1 };
const STRENGTH_DOT_COLORS: Record<Strength, string> = {
  strong: colors.green,
  medium: colors.sapphire,
  weak: colors.overlay1,
};

const DimensionBar: React.FC<{
  dim: V5CandidateSelfView['dimensionRadar'][number];
}> = ({ dim }) => {
  const filled = STRENGTH_DOTS[dim.relativeStrength];
  const strengthLabel: BilingualText = SELF_VIEW_CONTENT.strengthLabels[dim.relativeStrength];
  return (
    <li style={styles.radarRow} data-testid="self-view-dim-bar">
      <div style={styles.radarName}>
        <span>{dim.nameZh}</span>
        <span style={styles.radarNameEn}>{dim.nameEn}</span>
      </div>
      <div
        style={styles.radarDots}
        aria-label={`${strengthLabel.zh} · ${strengthLabel.en}`}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              ...styles.radarDot,
              backgroundColor:
                i < filled ? STRENGTH_DOT_COLORS[dim.relativeStrength] : colors.surface1,
            }}
          />
        ))}
      </div>
      <div style={styles.radarStrength}>
        <span>{strengthLabel.zh}</span>
        <span style={styles.radarStrengthEn}> / {strengthLabel.en}</span>
      </div>
    </li>
  );
};

const Footer: React.FC = () => (
  <footer style={styles.footer} data-testid="self-view-footer">
    <span>{SELF_VIEW_CONTENT.footer.zh}</span>
    <br />
    <span style={styles.footerEn}>{SELF_VIEW_CONTENT.footer.en}</span>
  </footer>
);

const LoadingState: React.FC = () => (
  <div style={styles.statusWrap} data-testid="self-view-loading">
    <span>{SELF_VIEW_CONTENT.loading.zh}</span>
    <span style={styles.statusEn}> · {SELF_VIEW_CONTENT.loading.en}</span>
  </div>
);

const ErrorState: React.FC<{ errorKey: SelfViewErrorKey }> = ({ errorKey }) => {
  const copy = SELF_VIEW_CONTENT.errors[errorKey];
  return (
    <div style={styles.statusWrap} data-testid="self-view-error">
      <h2 style={styles.errorTitle}>
        <span>{SELF_VIEW_CONTENT.errorTitle.zh}</span>
        <span style={styles.errorTitleEn}>
          {' · '}
          {SELF_VIEW_CONTENT.errorTitle.en}
        </span>
      </h2>
      <p style={styles.errorBody} data-testid={`self-view-error-${errorKey}`}>
        <span>{copy.zh}</span>
        <br />
        <span style={styles.errorBodyEn}>{copy.en}</span>
      </p>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 720,
    margin: '0 auto',
    padding: spacing.xl,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xxl,
    color: colors.text,
    backgroundColor: colors.base,
    minHeight: '100vh',
  },
  header: { display: 'flex', flexDirection: 'column', gap: spacing.sm },
  title: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    margin: 0,
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
  },
  titleEn: { fontSize: fontSizes.md, fontWeight: fontWeights.normal, color: colors.subtext0 },
  subtitle: { margin: 0, fontSize: fontSizes.md, color: colors.subtext1 },
  subtitleEn: { color: colors.overlay2, fontStyle: 'italic' },
  ethicsNote: {
    margin: 0,
    padding: spacing.md,
    backgroundColor: colors.mantle,
    borderLeft: `3px solid ${colors.mauve}`,
    borderRadius: radii.sm,
    fontSize: fontSizes.sm,
    color: colors.subtext0,
  },
  ethicsNoteEn: { color: colors.overlay2, fontStyle: 'italic' },
  section: { display: 'flex', flexDirection: 'column', gap: spacing.lg },
  sectionTitle: {
    margin: 0,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
  },
  sectionTitleEn: { fontSize: fontSizes.sm, fontWeight: fontWeights.normal, color: colors.overlay2 },
  profileList: { display: 'flex', flexDirection: 'column', gap: spacing.md },
  profileCard: {
    padding: spacing.lg,
    backgroundColor: colors.mantle,
    borderRadius: radii.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  profileCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileName: { fontSize: fontSizes.lg, fontWeight: fontWeights.semibold },
  profileNameEn: { fontSize: fontSizes.xs, color: colors.overlay2, fontStyle: 'italic' },
  profileLabel: {
    padding: `${spacing.xs} ${spacing.sm}`,
    border: '1px solid',
    borderRadius: radii.full,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  profileDescription: { margin: 0, fontSize: fontSizes.md, color: colors.subtext1, lineHeight: 1.55 },
  radarList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  radarRow: {
    display: 'grid',
    gridTemplateColumns: '1fr auto auto',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing.sm} ${spacing.md}`,
    backgroundColor: colors.mantle,
    borderRadius: radii.sm,
  },
  radarName: { display: 'flex', flexDirection: 'column' },
  radarNameEn: { fontSize: fontSizes.xs, color: colors.overlay2, fontStyle: 'italic' },
  radarDots: { display: 'flex', gap: spacing.xs },
  radarDot: {
    width: 10,
    height: 10,
    borderRadius: radii.full,
    display: 'inline-block',
  },
  radarStrength: { fontSize: fontSizes.sm, color: colors.subtext0, minWidth: 80, textAlign: 'right' },
  radarStrengthEn: { color: colors.overlay2, fontStyle: 'italic' },
  footer: {
    fontSize: fontSizes.xs,
    color: colors.overlay1,
    textAlign: 'center',
    lineHeight: 1.6,
    paddingTop: spacing.lg,
    borderTop: `1px solid ${colors.surface0}`,
  },
  footerEn: { color: colors.overlay2, fontStyle: 'italic' },
  statusWrap: {
    maxWidth: 480,
    margin: '0 auto',
    padding: spacing.xxl,
    textAlign: 'center',
    color: colors.subtext0,
    fontSize: fontSizes.md,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: spacing.md,
  },
  statusEn: { color: colors.overlay2, fontStyle: 'italic' },
  errorTitle: { margin: 0, fontSize: fontSizes.xl, color: colors.red },
  errorTitleEn: { fontSize: fontSizes.sm, fontWeight: fontWeights.normal, color: colors.overlay2 },
  errorBody: { margin: 0, fontSize: fontSizes.md, color: colors.subtext0, lineHeight: 1.6 },
  errorBodyEn: { color: colors.overlay2, fontStyle: 'italic' },
};
