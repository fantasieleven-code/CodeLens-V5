/**
 * TransparencyPage · /transparency
 *
 * Public-facing GDPR-narrative policy doc (Task A15 · V5.0 A-series #8).
 * No auth, no Guard, no URL token — anyone can read. Renders 7 sections
 * (introduction · methodology · ethics · data-usage · candidate-rights ·
 * reviewer-guidance · contact) with zh+en inline copy per the β bilingual
 * pattern inherited from consentContent / profileContent / selfViewContent
 * / ReportTransparencyFooter.tsx.
 *
 * A15 Phase 1 ratify D1: deliberately does NOT reuse `ReportTransparencyFooter`
 * (report/sections/) — that component is a report-trailer disclaimer, this
 * page is a public policy doc. Different audience discovery paths.
 */

import React from 'react';
import { TRANSPARENCY_CONTENT } from './transparencyContent.js';
import type {
  BilingualText,
  TransparencySection,
} from './transparencyContent.js';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../lib/tokens.js';

function handleBack(): void {
  if (typeof window === 'undefined') return;
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = '/';
  }
}

export const TransparencyPage: React.FC = () => {
  const content = TRANSPARENCY_CONTENT;
  return (
    <div style={styles.root} data-testid="transparency-page">
      <div style={styles.container}>
        <Header
          title={content.pageTitle}
          backLabel={content.backLabel}
        />
        <TableOfContents
          label={content.tocLabel}
          sections={content.sections}
        />
        <main style={styles.main}>
          {content.sections.map((section) => (
            <SectionBlock key={section.id} section={section} />
          ))}
        </main>
        <Footer
          versionLabel={content.footer.versionLabel}
          version={content.footer.version}
          updatedLabel={content.footer.updatedLabel}
          updatedAt={content.footer.updatedAt}
        />
      </div>
    </div>
  );
};

const Header: React.FC<{ title: BilingualText; backLabel: BilingualText }> = ({
  title,
  backLabel,
}) => (
  <header style={styles.header}>
    <button
      type="button"
      onClick={handleBack}
      style={styles.backButton}
      data-testid="transparency-back-button"
      aria-label={`${backLabel.zh} / ${backLabel.en}`}
    >
      ← {backLabel.zh} / {backLabel.en}
    </button>
    <h1 style={styles.pageTitleZh}>
      {title.zh}
      <span style={styles.pageTitleEn}> · {title.en}</span>
    </h1>
  </header>
);

const TableOfContents: React.FC<{
  label: BilingualText;
  sections: readonly TransparencySection[];
}> = ({ label, sections }) => (
  <nav style={styles.toc} data-testid="transparency-toc" aria-label={label.en}>
    <h2 style={styles.tocTitle}>
      {label.zh}
      <span style={styles.tocTitleEn}> · {label.en}</span>
    </h2>
    <ul style={styles.tocList}>
      {sections.map((section) => (
        <li key={section.id} style={styles.tocItem}>
          <a href={`#${section.id}`} style={styles.tocLink}>
            {section.title.zh} / {section.title.en}
          </a>
        </li>
      ))}
    </ul>
  </nav>
);

const SectionBlock: React.FC<{ section: TransparencySection }> = ({ section }) => (
  <section
    id={section.id}
    style={styles.section}
    data-testid={`transparency-section-${section.id}`}
  >
    <h2 style={styles.sectionTitle}>
      {section.title.zh}
      <span style={styles.sectionTitleEn}> · {section.title.en}</span>
    </h2>
    <div style={styles.sectionBody}>
      {section.body.zh.map((para, i) => (
        <p key={`zh-${i}`} style={styles.bodyZh}>
          {para}
        </p>
      ))}
      {section.body.en.map((para, i) => (
        <p key={`en-${i}`} style={styles.bodyEn}>
          {para}
        </p>
      ))}
    </div>
  </section>
);

const Footer: React.FC<{
  versionLabel: BilingualText;
  version: string;
  updatedLabel: BilingualText;
  updatedAt: string;
}> = ({ versionLabel, version, updatedLabel, updatedAt }) => (
  <footer style={styles.footer} data-testid="transparency-footer">
    <p style={styles.footerLine}>
      {versionLabel.zh} / {versionLabel.en}: <strong>{version}</strong>
    </p>
    <p style={styles.footerLine}>
      {updatedLabel.zh} / {updatedLabel.en}: <strong>{updatedAt}</strong>
    </p>
  </footer>
);

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    backgroundColor: colors.base,
    color: colors.text,
    padding: spacing.xl,
  },
  container: {
    maxWidth: 860,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    background: 'transparent',
    border: `1px solid ${colors.surface0}`,
    color: colors.subtext1,
    padding: `${spacing.xs} ${spacing.md}`,
    borderRadius: radii.sm,
    fontSize: fontSizes.sm,
    cursor: 'pointer',
  },
  pageTitleZh: {
    margin: 0,
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  pageTitleEn: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    color: colors.subtext0,
    fontStyle: 'italic',
  },
  toc: {
    padding: spacing.lg,
    backgroundColor: colors.mantle,
    borderRadius: radii.md,
    border: `1px solid ${colors.surface0}`,
  },
  tocTitle: {
    margin: 0,
    marginBottom: spacing.sm,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  tocTitleEn: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.subtext0,
    fontStyle: 'italic',
  },
  tocList: {
    margin: 0,
    paddingLeft: spacing.lg,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  tocItem: {
    fontSize: fontSizes.sm,
    color: colors.subtext1,
  },
  tocLink: {
    color: colors.blue,
    textDecoration: 'none',
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
  },
  section: {
    padding: spacing.lg,
    backgroundColor: colors.mantle,
    borderRadius: radii.md,
    border: `1px solid ${colors.surface0}`,
    scrollMarginTop: spacing.xl,
  },
  sectionTitle: {
    margin: 0,
    marginBottom: spacing.md,
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  sectionTitleEn: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.subtext0,
    fontStyle: 'italic',
  },
  sectionBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  bodyZh: {
    margin: 0,
    fontSize: fontSizes.md,
    color: colors.subtext1,
    lineHeight: 1.7,
  },
  bodyEn: {
    margin: 0,
    marginTop: spacing.xs,
    fontSize: fontSizes.sm,
    color: colors.overlay1,
    lineHeight: 1.7,
    fontStyle: 'italic',
  },
  footer: {
    paddingTop: spacing.lg,
    borderTop: `1px solid ${colors.surface0}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    color: colors.subtext0,
  },
  footerLine: {
    margin: 0,
    fontSize: fontSizes.sm,
  },
};
