/**
 * Golden-path testid constants — single source of truth.
 *
 * Enumerates canonical data-testid values used by B2 driver + B3 spec.
 * Reference · Frontend INV-3 discovery 2026-04-24 · 428 testids cataloged.
 * Reference · V5 Release Plan 2026-04-22 · W-B runway (B1 config · B2 driver · B3 spec).
 */

// ────────────────────────── Admin flow ──────────────────────────

export const ADMIN_TESTIDS = {
  loginEmail: 'admin-login-email',
  loginPassword: 'admin-login-password',
  loginSubmit: 'admin-login-submit',
  createStep1Position: (idx: number) => `admin-create-step1-position-${idx}`,
  createStep2Level: (id: 'junior' | 'mid' | 'senior') => `admin-create-step2-level-${id}`,
  createStep3Suite: (suiteId: string) => `admin-create-step3-suite-${suiteId}`,
  createStep3Exam: (examId: string) => `admin-create-step3-exam-${examId}`,
  createStep3CandidateName: 'admin-create-step3-candidate-name',
  createStep3CandidateEmail: 'admin-create-step3-candidate-email',
  createNextStep: 'admin-create-next-step',
  createSubmit: 'admin-create-submit',
  createSuccess: 'admin-create-success',
  createShareableLink: 'admin-create-shareable-link',
  createCandidateToken: 'admin-create-candidate-token',
  sessionDetailReport: 'admin-session-detail-report',
  sessionDetailReportIncomplete: 'admin-session-detail-report-incomplete',
  sessionDetailReportPending: 'admin-session-detail-report-pending',
} as const;

// ────────────────────────── Candidate flow ──────────────────────────

export const CANDIDATE_TESTIDS = {
  consent: {
    page: 'consent-page',
    checkbox: 'consent-checkbox',
    submit: 'consent-submit',
  },
  profile: {
    setup: 'profile-setup',
    // Brief #13 D1 · candidate name is captured in admin createSession step 3 ·
    // ProfileSetup.tsx intentionally omits a name field · driver must NOT
    // attempt to fill it on the profile page.
    yearsOfExperience: 'field-yearsOfExperience',
    primaryTechStackInput: 'field-primaryTechStack-input',
    primaryTechStackAdd: 'field-primaryTechStack-add',
    // Brief #13 D16 · CandidateProfileSchema requires 7 fields ·
    // ProfileSetup.tsx runs `safeParse` before the API call, so driver must
    // fill all of them or validation rejects client-side.
    currentRole: 'field-currentRole',
    companySize: 'field-companySize',
    aiToolYears: 'field-aiToolYears',
    primaryAiTool: 'field-primaryAiTool',
    dailyAiUsageHours: 'field-dailyAiUsageHours',
    submit: 'profile-submit',
  },
  evaluationIntro: {
    container: 'evaluation-intro-container',
    startButton: 'evaluation-intro-start-button',
  },
  complete: {
    root: 'complete-root',
    viewReportBtn: 'complete-view-report-btn',
  },
} as const;

// ────────────────────────── P0 module ──────────────────────────

export const P0_TESTIDS = {
  container: 'phase0-container',
  l1Option: (idx: number) => `phase0-l1-option-${idx}`,
  l2Answer: 'phase0-l2-answer',
  l3Answer: 'phase0-l3-answer',
  // Brief #20 C4 · slider added · 0..100 normalized to 0..1 in submission.
  l3Confidence: 'phase0-l3-confidence',
  // Brief #13 D2/D3 · page uses `phase0-ai-judgment-{1|2}-...` (1-indexed,
  // `ai-` infix, `reason` not `reasoning`). Driver still passes 0-indexed `i`;
  // helper translates.
  judgmentChoice: (i: number, choice: 'A' | 'B') => `phase0-ai-judgment-${i + 1}-choice-${choice}`,
  judgmentReasoning: (i: number) => `phase0-ai-judgment-${i + 1}-reason`,
  decisionChoice: (id: string) => `phase0-decision-choice-${id}`,
  // Brief #13 D4 · page uses `phase0-decision-reason` not `-reasoning`.
  decisionReasoning: 'phase0-decision-reason',
  aiClaimResponse: 'phase0-ai-claim-response',
  submit: 'phase0-submit',
} as const;

// ────────────────────────── MA module (4 rounds) ──────────────────────────

export const MA_TESTIDS = {
  container: 'moduleA-container',
  // Brief #14 D18 · page renders `ma-r1-scheme-${s.id.toLowerCase()}` ·
  // driver normalize lowercase to match page truth.
  r1Scheme: (id: 'A' | 'B' | 'C') => `ma-r1-scheme-${id.toLowerCase()}`,
  r1Reasoning: 'ma-r1-reasoning',
  r1StructuredScenario: 'ma-r1-structured-scenario',
  r1StructuredTradeoff: 'ma-r1-structured-tradeoff',
  r1StructuredDecision: 'ma-r1-structured-decision',
  r1StructuredVerification: 'ma-r1-structured-verification',
  r1ChallengeResponse: 'ma-r1-challenge-response',
  r1Submit: 'ma-r1-submit',
  // Brief #13 D6 · MA r2 has single-defect-cycle UX · click `ma-r2-review-line-{N}`
  // to scope, fill SHARED `ma-r2-review-{type|comment|fix}`, click 保存评论
  // button (no testid · text-locator) to save and close the form. Driver
  // iterates fixture's markedDefects[], clicking line `i+1` deterministically
  // since fixture defectId ('d1','d2',...) doesn't map to page line numbers.
  r2ReviewLine: (line: number) => `ma-r2-review-line-${line}`,
  r2ReviewType: 'ma-r2-review-type',
  r2ReviewComment: 'ma-r2-review-comment',
  r2ReviewFix: 'ma-r2-review-fix',
  r2Submit: 'ma-r2-submit',
  // Brief #13 D7 · page uses `ma-r3-correct-choice-{success|failed}`.
  r3VersionChoice: (v: 'success' | 'failed') => `ma-r3-correct-choice-${v}`,
  r3DiffAnalysis: 'ma-r3-diff-analysis',
  r3Diagnosis: 'ma-r3-diagnosis',
  r3Submit: 'ma-r3-submit',
  r4Response: 'ma-r4-response',
  r4Submit: 'ma-r4-submit',
} as const;

// ────────────────────────── MB module (Cursor mode) ──────────────────────────

// Brief #13 · MB testids distributed across 8 panel sub-components
// (MB1PlanningPanel · CursorModeLayout · MultiFileEditor · EditorTabs ·
// FileTree · MBTerminalPanel · AIChatPanel · MB3StandardsPanel ·
// ViolationAuditPanel). 13/20 driver-expected testids matched directly;
// 5 renamed to page reality + 1 `submit` replaced with `advance` (page does
// NOT auto-progress after `mb-audit-submit` · sets stage='complete' and
// surfaces the `mb-advance` button which calls `useModuleStore.advance`).
export const MB_TESTIDS = {
  container: 'mb-page-root',
  planningDecomposition: 'mb-planning-decomposition',
  planningDependencies: 'mb-planning-dependencies',
  planningFallback: 'mb-planning-fallback',
  planningSubmit: 'mb-planning-submit',
  filetree: 'mb-filetree',
  filetreeItem: (path: string) => `mb-filetree-item-${path}`,
  terminalHost: 'mb-terminal-host',
  terminalRun: 'mb-terminal-run',
  chatInput: 'mb-chat-input',
  chatSend: 'mb-chat-send',
  chatStreamActive: 'mb-chat-stream-active',
  chatMessage: (i: number) => `mb-chat-message-${i}`,
  // Brief #16 D26 · execution → standards stage transition button.
  executionFinish: 'mb-execution-finish',
  standardsRulesTextarea: 'mb-standards-rules',
  standardsAgentTextarea: 'mb-standards-agent',
  standardsSubmit: 'mb-standards-submit',
  auditViolation: (i: number) => `mb-violation-toggle-${i}`,
  auditRuleId: (i: number) => `mb-violation-rule-select-${i}`,
  auditSubmit: 'mb-audit-submit',
  // mb-audit-submit transitions stage to 'complete'; `mb-advance` is the
  // user-actuated progression to the next module.
  complete: 'mb-complete',
  advance: 'mb-advance',
} as const;

// ────────────────────────── MC module (voice + text-fallback) ──────────────────────────

export const MC_TESTIDS = {
  // Brief #13 D8 · page uses `module-c-page`.
  container: 'module-c-page',
  preflight: 'modulec-preflight',
  // Brief #17 D30 · MicPreflight gates ModeTabs (ModuleCPage.tsx:393-401).
  // Skip routes to text-fallback · CI environment has no microphone.
  preflightSkip: 'modulec-preflight-skip',
  modeVoice: 'modulec-mode-voice',
  modeText: 'modulec-mode-text',
  voiceStatus: 'modulec-voice-status',
  chat: 'modulec-chat',
  answerInput: 'modulec-answer-input',
  submit: 'modulec-submit',
  finish: 'modulec-finish',
  done: 'modulec-done',
} as const;

// ────────────────────────── MD module ──────────────────────────

export const MD_TESTIDS = {
  container: 'moduleD-container',
  submoduleCard: (i: number) => `md-submodule-card-${i}`,
  submoduleName: (i: number) => `md-submodule-${i}-name`,
  submoduleResponsibility: (i: number) => `md-submodule-${i}-responsibility`,
  interfaceDefinitions: 'md-interface-definitions',
  // Brief #13 D9 · page uses `md-data-flow`.
  dataflowDescription: 'md-data-flow',
  constraint: (key: string) => `md-constraint-${key}`,
  tradeoffText: 'md-tradeoff-text',
  aiOrchestration: (i: number) => `md-ai-orchestration-${i}`,
  submit: 'md-submit',
} as const;

// ────────────────────────── SE module ──────────────────────────

export const SE_TESTIDS = {
  // Brief #13 D10 · page uses `selfassess-root`.
  container: 'selfassess-root',
  // Brief #13 D11 · page renders a single shared slider · not per-dimension.
  // Driver fills with the fixture's overall confidence; per-dim split is a
  // V5.0.5 housekeeping candidate.
  dimensionSlider: 'selfassess-slider',
  reasoning: 'selfassess-reasoning',
  submit: 'selfassess-submit',
} as const;

/** Convenience · build Playwright selector string from testid. */
export function byTestId(testid: string): string {
  return `[data-testid="${testid}"]`;
}
