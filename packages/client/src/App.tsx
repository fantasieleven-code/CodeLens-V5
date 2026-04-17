/**
 * App — top-level router.
 *
 * Routes:
 *   /exam/:sessionId    → candidate flow (ExamRouter switches on currentModule)
 *   /report/:sessionId  → finished report (Task 3: demo fixtures only)
 *   /admin/*            → recruiter tools (stub until admin work)
 *   /share/report/:token → public report share link (stub)
 *   /__preview/report   → Section Registry preview (Task 2 dev tool)
 *   /__preview/sections → Section gallery (Task 2 dev tool)
 *   /                   → landing page (stub)
 *
 * Module pages (Phase0 / ModuleA / ModuleB / ModuleD) render the skeletons
 * introduced in Task 3. Real functionality lands in later task batches.
 * ModuleC stays as an inline placeholder until voice.store + useVoiceRTC
 * are wired (tracked separately from Task 3).
 */

import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { useModuleStore } from './stores/module.store.js';
import { useSessionStore } from './stores/session.store.js';
import { EvaluationIntroPage } from './pages/EvaluationIntroPage.js';
import { Phase0Page } from './pages/Phase0Page.js';
import { ModuleAPage } from './pages/ModuleAPage.js';
import { ModuleBPage } from './pages/ModuleBPage.js';
import { ModuleDPage } from './pages/ModuleDPage.js';
import { SelfAssessPage } from './pages/SelfAssessPage.js';
import { CompletePage } from './pages/CompletePage.js';
import { ReportViewPage } from './pages/ReportViewPage.js';
import { ReportPreviewPage } from './report/preview/ReportPreviewPage.js';
import { SectionGalleryPage } from './report/preview/SectionGalleryPage.js';
import { Phase0PreviewPage } from './pages/phase0/Phase0PreviewPage.js';
import { colors, spacing, fontSizes, fontWeights } from './lib/tokens.js';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/exam/:sessionId" element={<ExamRouter />} />
        <Route path="/report/:sessionId" element={<ReportViewPage />} />
        <Route path="/admin/*" element={<AdminRoutes />} />
        <Route path="/share/report/:token" element={<SharedReportPage />} />
        <Route path="/__preview/report" element={<ReportPreviewPage />} />
        <Route path="/__preview/sections" element={<SectionGalleryPage />} />
        <Route path="/__preview/phase0" element={<Phase0PreviewPage />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<ErrorPage message="页面不存在" />} />
      </Routes>
    </BrowserRouter>
  );
}

function ExamRouter() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const currentModule = useModuleStore((s) => s.currentModule);
  const loadSession = useSessionStore((s) => s.loadSession);

  useEffect(() => {
    if (sessionId) void loadSession(sessionId);
  }, [sessionId, loadSession]);

  switch (currentModule) {
    case null:
    case 'intro':
      return <EvaluationIntroPage />;
    case 'phase0':
      return <Phase0Page />;
    case 'moduleA':
      return <ModuleAPage />;
    case 'mb':
      return <ModuleBPage />;
    case 'moduleD':
      return <ModuleDPage />;
    case 'selfAssess':
      return <SelfAssessPage />;
    case 'moduleC':
      // ModuleCPage is present but pending voice.store + useVoiceRTC (Task 7);
      // render a placeholder until that wiring lands.
      return <ModulePlaceholder name="Module C · 语音追问" />;
    case 'complete':
      return <CompletePage />;
    default:
      return <ErrorPage message="未知模块" />;
  }
}

const ModulePlaceholder: React.FC<{ name: string }> = ({ name }) => (
  <div style={placeholderStyles.container} data-testid="module-placeholder">
    <div style={placeholderStyles.card}>
      <h1 style={placeholderStyles.title}>{name}</h1>
      <p style={placeholderStyles.body}>
        该模块尚在构建中（后续 Task 将实现）。
      </p>
    </div>
  </div>
);

const AdminRoutes: React.FC = () => (
  <ErrorPage message="Admin 控制台尚未启用" />
);

const SharedReportPage: React.FC = () => (
  <ErrorPage message="分享报告页尚未启用" />
);

const LandingPage: React.FC = () => (
  <div style={placeholderStyles.container}>
    <div style={placeholderStyles.card}>
      <h1 style={placeholderStyles.title}>CodeLens</h1>
      <p style={placeholderStyles.body}>
        请通过招聘方发送的链接访问评估。
      </p>
    </div>
  </div>
);

const ErrorPage: React.FC<{ message: string }> = ({ message }) => (
  <div style={placeholderStyles.container} data-testid="error-page">
    <div style={placeholderStyles.card}>
      <h1 style={{ ...placeholderStyles.title, color: colors.red }}>出错了</h1>
      <p style={placeholderStyles.body}>{message}</p>
    </div>
  </div>
);

const placeholderStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: colors.base,
    padding: spacing.xl,
  },
  card: {
    maxWidth: 480,
    padding: spacing.xxl,
    backgroundColor: colors.mantle,
    borderRadius: 12,
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  body: {
    fontSize: fontSizes.md,
    color: colors.subtext0,
    margin: 0,
    lineHeight: 1.6,
  },
};
