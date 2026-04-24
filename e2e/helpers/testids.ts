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
    name: 'field-name',
    yearsOfExperience: 'field-yearsOfExperience',
    primaryTechStackInput: 'field-primaryTechStack-input',
    primaryTechStackAdd: 'field-primaryTechStack-add',
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
  l3Confidence: 'phase0-l3-confidence',
  judgmentChoice: (i: number, choice: 'A' | 'B') => `phase0-judgment-${i}-choice-${choice}`,
  judgmentReasoning: (i: number) => `phase0-judgment-${i}-reasoning`,
  decisionChoice: (id: string) => `phase0-decision-choice-${id}`,
  decisionReasoning: 'phase0-decision-reasoning',
  aiClaimResponse: 'phase0-ai-claim-response',
  submit: 'phase0-submit',
} as const;

// ────────────────────────── MA module (4 rounds) ──────────────────────────

export const MA_TESTIDS = {
  container: 'moduleA-container',
  r1Scheme: (id: 'A' | 'B' | 'C') => `ma-r1-scheme-${id}`,
  r1Reasoning: 'ma-r1-reasoning',
  r1StructuredScenario: 'ma-r1-structured-scenario',
  r1StructuredTradeoff: 'ma-r1-structured-tradeoff',
  r1StructuredDecision: 'ma-r1-structured-decision',
  r1StructuredVerification: 'ma-r1-structured-verification',
  r1ChallengeResponse: 'ma-r1-challenge-response',
  r1Submit: 'ma-r1-submit',
  r2DefectComment: (defectId: string) => `ma-r2-defect-${defectId}-comment`,
  r2DefectType: (defectId: string) => `ma-r2-defect-${defectId}-type`,
  r2DefectFix: (defectId: string) => `ma-r2-defect-${defectId}-fix`,
  r2Submit: 'ma-r2-submit',
  r3VersionChoice: (v: 'success' | 'failed') => `ma-r3-version-${v}`,
  r3DiffAnalysis: 'ma-r3-diff-analysis',
  r3Diagnosis: 'ma-r3-diagnosis',
  r3Submit: 'ma-r3-submit',
  r4Response: 'ma-r4-response',
  r4Submit: 'ma-r4-submit',
} as const;

// ────────────────────────── MB module (Cursor mode) ──────────────────────────

export const MB_TESTIDS = {
  container: 'moduleB-container',
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
  standardsRulesTextarea: 'mb-standards-rules-textarea',
  standardsAgentTextarea: 'mb-standards-agent-textarea',
  standardsSubmit: 'mb-standards-submit',
  auditViolation: (i: number) => `mb-audit-violation-${i}`,
  auditRuleId: (i: number) => `mb-audit-rule-${i}`,
  auditSubmit: 'mb-audit-submit',
  submit: 'mb-submit',
} as const;

// ────────────────────────── MC module (voice + text-fallback) ──────────────────────────

export const MC_TESTIDS = {
  container: 'modulec-container',
  preflight: 'modulec-preflight',
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
  dataflowDescription: 'md-dataflow-description',
  constraint: (key: string) => `md-constraint-${key}`,
  tradeoffText: 'md-tradeoff-text',
  aiOrchestration: (i: number) => `md-ai-orchestration-${i}`,
  submit: 'md-submit',
} as const;

// ────────────────────────── SE module ──────────────────────────

export const SE_TESTIDS = {
  container: 'selfassess-container',
  dimensionSlider: (dim: string) => `selfassess-slider-${dim}`,
  reasoning: 'selfassess-reasoning',
  submit: 'selfassess-submit',
} as const;

/** Convenience · build Playwright selector string from testid. */
export function byTestId(testid: string): string {
  return `[data-testid="${testid}"]`;
}
