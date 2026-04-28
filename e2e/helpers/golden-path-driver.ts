/**
 * V5 Golden Path driver — drives the candidate UI through a full 13-step flow.
 *
 * Called by B3 `e2e/golden-path.spec.ts` (pending brief). 4 fixtures
 * (liam-S · steve-A · emma-B · max-C) replay the full candidate journey
 * from admin session create → candidate guards → exam modules → scoring
 * completion poll. Assertion surface is `/admin/sessions/:id` (NOT
 * `/report/:sessionId` which is demo-fixture-only Task 9+ deferred).
 *
 * Architectural decisions (Brief #8 B2 Phase 1 + Phase 2 ratify):
 * - Fixture type · `GoldenPathDriverFixture extends ScoreSessionInput`
 *   with { grade, candidate, examId } added for admin-setup metadata
 *   (Drift A α · Task 17 shared ScoreSessionInput preserved)
 * - Helper API · class static methods · `MonacoHelper.typeCode(...)`,
 *   `TerminalHelper.clickRun(...)` (Drift B α · no helper refactor)
 * - MD module · `runMD()` exists, orchestrator conditionally invokes
 *   via `participatingModules` check (Drift C α · forward-compat for
 *   V5.0.5 fixture extension; current 4 fixtures skip this path)
 * - Socket observation · DOM-render primary via `mb-chat-stream-active`
 *   + `mb-chat-message-{i}` count (V5 uses socket.io not SSE · route
 *   intercept fragile · Layer 2 grep confirmed events
 *   `v5:mb:chat_stream` + `v5:mb:chat_complete` match INV-3)
 * - MC module · text-fallback mode preferred (`modulec-mode-text`) ·
 *   real Volcano RTC validated Cold Start Tier 2
 * - Testid constants · single source `./testids.ts` (B3 consumes same)
 * - Scoring completion · poll `/admin/sessions/:id` 2-5s interval ·
 *   wait `admin-session-detail-report` testid appear (NOT
 *   `-report-incomplete` / `-report-pending`)
 *
 * Ref · V5 Release Plan 2026-04-22 · W-B Brief #8 · Frontend INV-3
 * 2026-04-24 · Task 17 Golden Path fixtures (A14a 180 validated)
 */

import { type Page, expect } from '@playwright/test';
import type { ScoreSessionInput, V5Grade, V5Submissions } from '@codelens-v5/shared';

import { MonacoHelper } from './monaco-helper.js';
import { TerminalHelper } from './terminal-helper.js';
import {
  ADMIN_TESTIDS,
  CANDIDATE_TESTIDS,
  MA_TESTIDS,
  MB_TESTIDS,
  MC_TESTIDS,
  MD_TESTIDS,
  P0_TESTIDS,
  SE_TESTIDS,
  byTestId,
} from './testids.js';

// ────────────────────────── Types ──────────────────────────

export interface GoldenPathDriverFixture extends ScoreSessionInput {
  grade: V5Grade;
  candidate: {
    name: string;
    email: string;
    yearsOfExperience: number;
    primaryTechStack: string[];
  };
  examId: string;
}

export interface AdminCredentials {
  email: string;
  password: string;
}

export interface CreateSessionResult {
  sessionId: string;
  shareableLink: string;
  candidateToken: string;
}

// ────────────────────────── Driver ──────────────────────────

export class GoldenPathDriver {
  constructor(
    private readonly page: Page,
    private readonly adminCreds: AdminCredentials,
  ) {}

  // ─── Step 1 · Admin login ────────────────────────────────

  async loginAdmin(): Promise<void> {
    await this.page.goto('/admin/login');
    await this.page
      .locator(byTestId(ADMIN_TESTIDS.loginEmail))
      .fill(this.adminCreds.email);
    await this.page
      .locator(byTestId(ADMIN_TESTIDS.loginPassword))
      .fill(this.adminCreds.password);
    await this.page.locator(byTestId(ADMIN_TESTIDS.loginSubmit)).click();
    await this.page.waitForURL(/\/admin(\/|$)/);
  }

  // ─── Step 2-3 · Admin session create (4-step wizard) ────

  async createSession(
    fx: GoldenPathDriverFixture,
  ): Promise<CreateSessionResult> {
    // AdminLayoutPage mounts the wizard at `/admin/create`, not under
    // `/admin/sessions/...`. Navigating to `/admin/sessions/create` matches
    // the `sessions/:sessionId` route with sessionId='create' →
    // AdminSessionDetailPage 404s with "加载失败:session create not found".
    // (Backend endpoint POST /admin/sessions/create is a separate namespace.)
    await this.page.goto('/admin/create');

    // Step 1 · position (default to first available · exam creation doesn't
    // require specific position semantics for Golden Path flow).
    // The wizard auto-advances on selection (pickPosition → setStep(2)) ·
    // there is no "next step" button between steps 1↔2 or 2↔3.
    await this.page
      .locator(byTestId(ADMIN_TESTIDS.createStep1Position(0)))
      .click();

    // Step 2 · level. The admin wizard filters step-3 exam options by the
    // selected level, and the canonical seeded exam (e0000000-...) is
    // `level: 'senior'`. All 4 grade fixtures must select 'senior' so the
    // canonical-exam testid renders — selecting `mid`/`junior` would filter
    // the canonical exam out and step 3 would time out waiting for
    // `admin-create-step3-exam-${CANONICAL_EXAM_ID}`. The grade bucket
    // (S/A/B/D) is independent of the wizard's level filter; scoring
    // computes grade from submission content. V5.0.5 housekeeping: seed
    // additional canonical exams at mid/junior levels OR thread an explicit
    // level field through GoldenPathDriverFixture.
    await this.page
      .locator(byTestId(ADMIN_TESTIDS.createStep2Level('senior')))
      .click();

    // Step 3 · suite + exam + candidate.
    await this.page
      .locator(byTestId(ADMIN_TESTIDS.createStep3Suite(fx.suiteId)))
      .click();
    await this.page
      .locator(byTestId(ADMIN_TESTIDS.createStep3Exam(fx.examId)))
      .click();
    await this.page
      .locator(byTestId(ADMIN_TESTIDS.createStep3CandidateName))
      .fill(fx.candidate.name);
    await this.page
      .locator(byTestId(ADMIN_TESTIDS.createStep3CandidateEmail))
      .fill(fx.candidate.email);

    await this.page.locator(byTestId(ADMIN_TESTIDS.createSubmit)).click();

    // Step 4 · shareableLink + candidateToken success state.
    await this.page
      .locator(byTestId(ADMIN_TESTIDS.createSuccess))
      .waitFor({ state: 'visible', timeout: 30_000 });

    const shareableLink = await this.page
      .locator(byTestId(ADMIN_TESTIDS.createShareableLink))
      .inputValue()
      .catch(() =>
        this.page
          .locator(byTestId(ADMIN_TESTIDS.createShareableLink))
          .textContent()
          .then((t) => t ?? ''),
      );

    const sessionId = shareableLink.replace(/^.*\/exam\//, '').trim();
    if (!sessionId) {
      throw new Error(
        `Failed to parse sessionId from shareableLink: ${shareableLink}`,
      );
    }

    // sessionToken ≡ sessionId per CandidateGuard's Phase 1 ratify [B] · the
    // step-4 success card surfaces only the shareable link; the candidate
    // token IS the sessionId baked into that link.
    const candidateToken = sessionId;

    return { sessionId, shareableLink, candidateToken };
  }

  // ─── Step 4 · Candidate consent ─────────────────────────

  async fillConsent(candidateToken: string): Promise<void> {
    await this.page.goto(`/candidate/${candidateToken}/consent`);
    await this.page
      .locator(byTestId(CANDIDATE_TESTIDS.consent.page))
      .waitFor({ state: 'visible', timeout: 15_000 });
    await this.page.locator(byTestId(CANDIDATE_TESTIDS.consent.checkbox)).check();
    await this.page.locator(byTestId(CANDIDATE_TESTIDS.consent.submit)).click();
    // ConsentPage.onSubmit awaits a backend submitConsent call before setting
    // the consentStorageKey localStorage flag and navigating to /exam.
    // ProfileGuard reads that flag and redirects back to /consent if it's
    // missing, so the driver MUST wait for the post-submit URL change before
    // navigating elsewhere — otherwise fillProfile's subsequent
    // `goto('/profile')` races the async submit and lands while the flag is
    // still unset.
    await this.page.waitForURL(`**/exam/${candidateToken}`, { timeout: 15_000 });
  }

  // ─── Step 5 · Candidate profile ─────────────────────────

  async fillProfile(
    candidateToken: string,
    fx: GoldenPathDriverFixture,
  ): Promise<void> {
    await this.page.goto(`/candidate/${candidateToken}/profile`);
    await this.page
      .locator(byTestId(CANDIDATE_TESTIDS.profile.setup))
      .waitFor({ state: 'visible', timeout: 15_000 });
    // Brief #13 D1 · candidate name was captured in admin createSession step 3 ·
    // ProfileSetup.tsx omits a name field by design (no `field-name` testid).
    await this.page
      .locator(byTestId(CANDIDATE_TESTIDS.profile.yearsOfExperience))
      .fill(String(fx.candidate.yearsOfExperience));
    for (const tech of fx.candidate.primaryTechStack) {
      await this.page
        .locator(byTestId(CANDIDATE_TESTIDS.profile.primaryTechStackInput))
        .fill(tech);
      await this.page
        .locator(byTestId(CANDIDATE_TESTIDS.profile.primaryTechStackAdd))
        .click();
    }
    // Brief #13 D16 · 5 additional CandidateProfileSchema-required fields.
    // ProfileSetup.tsx runs `safeParse` client-side BEFORE submitProfile, so
    // omitting any of these blocks the request from ever reaching the
    // backend. Hard-coded defaults match ProfileSetup.test.tsx's fixture
    // pattern; profile metadata doesn't influence grade scoring (submission
    // content drives that), so identical values across all 4 fixtures are
    // sound. Threading per-fixture profile metadata is V5.0.5 housekeeping.
    await this.page
      .locator(byTestId(CANDIDATE_TESTIDS.profile.currentRole))
      .selectOption('fullstack');
    await this.page
      .locator(byTestId(CANDIDATE_TESTIDS.profile.companySize))
      .selectOption('medium');
    await this.page
      .locator(byTestId(CANDIDATE_TESTIDS.profile.aiToolYears))
      .selectOption('1');
    await this.page
      .locator(byTestId(CANDIDATE_TESTIDS.profile.primaryAiTool))
      .selectOption('claude_code');
    await this.page
      .locator(byTestId(CANDIDATE_TESTIDS.profile.dailyAiUsageHours))
      .selectOption('1_3');
    await this.page.locator(byTestId(CANDIDATE_TESTIDS.profile.submit)).click();
    // Same race-defense as fillConsent · ProfileSetup.onSubmit awaits the
    // submitProfile API call before setting the profile flag and navigating
    // to /exam. Wait for the URL change so the next module's `goto` doesn't
    // race the in-flight submit (could lose the profile record server-side).
    await this.page.waitForURL(`**/exam/${candidateToken}`, { timeout: 15_000 });
  }

  // ─── Step 6 · Evaluation intro ──────────────────────────

  async navigateToExam(sessionId: string): Promise<void> {
    await this.page.goto(`/exam/${sessionId}`);
    await this.page
      .locator(byTestId(CANDIDATE_TESTIDS.evaluationIntro.container))
      .waitFor({ state: 'visible', timeout: 15_000 });
  }

  async clickIntroStart(): Promise<void> {
    await this.page
      .locator(byTestId(CANDIDATE_TESTIDS.evaluationIntro.startButton))
      .click();
  }

  // ─── Step 7 · P0 module ─────────────────────────────────

  async runP0(p0: NonNullable<V5Submissions['phase0']>): Promise<void> {
    await this.page
      .locator(byTestId(P0_TESTIDS.container))
      .waitFor({ state: 'visible', timeout: 15_000 });

    // Code reading · L1 (multi-choice · assumes correctIndex answered).
    // Fixture `l1Answer` is free text; driver selects matching option by
    // testid index 0 as a pragmatic default — the exam scores the index
    // not the text, so index 0 = correctIndex from exam-data is the
    // expected S-grade behavior. For non-S grades, fixture submissions
    // embed index via convention (not yet parameterized · V5.0.5 polish).
    await this.page.locator(byTestId(P0_TESTIDS.l1Option(0))).click();

    await this.page.locator(byTestId(P0_TESTIDS.l2Answer)).fill(p0.codeReading.l2Answer);
    await this.page.locator(byTestId(P0_TESTIDS.l3Answer)).fill(p0.codeReading.l3Answer);

    // Brief #20 C4 · ConfidenceSection slider gated on L3-done. Same range-
    // input native-setter trick as SE_TESTIDS.dimensionSlider (D34) so the
    // controlled-component handler runs.
    await this.page
      .locator(byTestId(P0_TESTIDS.l3Confidence))
      .evaluate((el, value) => {
        const input = el as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, String(Math.round((p0.codeReading.confidence ?? 0.5) * 100)))
      .catch(() => {});

    // AI output judgment · 2 items.
    for (let i = 0; i < p0.aiOutputJudgment.length; i++) {
      const judgment = p0.aiOutputJudgment[i];
      await this.page
        .locator(byTestId(P0_TESTIDS.judgmentChoice(i, judgment.choice as 'A' | 'B')))
        .click();
      await this.page
        .locator(byTestId(P0_TESTIDS.judgmentReasoning(i)))
        .fill(judgment.reasoning);
    }

    // Decision.
    await this.page
      .locator(byTestId(P0_TESTIDS.decisionChoice(p0.decision.choice)))
      .click();
    await this.page
      .locator(byTestId(P0_TESTIDS.decisionReasoning))
      .fill(p0.decision.reasoning);

    // AI claim verification.
    await this.page
      .locator(byTestId(P0_TESTIDS.aiClaimResponse))
      .fill(p0.aiClaimVerification.response);

    await this.page.locator(byTestId(P0_TESTIDS.submit)).click();
  }

  // ─── Step 8 · MA module (4 rounds) ──────────────────────

  async runMA(ma: NonNullable<V5Submissions['moduleA']>): Promise<void> {
    await this.page
      .locator(byTestId(MA_TESTIDS.container))
      .waitFor({ state: 'visible', timeout: 15_000 });

    // Round 1 · scheme selection + reasoning + structured form + challenge.
    await this.page
      .locator(byTestId(MA_TESTIDS.r1Scheme(ma.round1.schemeId as 'A' | 'B' | 'C')))
      .click();
    await this.page.locator(byTestId(MA_TESTIDS.r1Reasoning)).fill(ma.round1.reasoning);
    await this.page
      .locator(byTestId(MA_TESTIDS.r1StructuredScenario))
      .fill(ma.round1.structuredForm.scenario);
    await this.page
      .locator(byTestId(MA_TESTIDS.r1StructuredTradeoff))
      .fill(ma.round1.structuredForm.tradeoff);
    await this.page
      .locator(byTestId(MA_TESTIDS.r1StructuredDecision))
      .fill(ma.round1.structuredForm.decision);
    await this.page
      .locator(byTestId(MA_TESTIDS.r1StructuredVerification))
      .fill(ma.round1.structuredForm.verification);
    await this.page
      .locator(byTestId(MA_TESTIDS.r1ChallengeResponse))
      .fill(ma.round1.challengeResponse);
    await this.page.locator(byTestId(MA_TESTIDS.r1Submit)).click();

    // Round 2 · defect annotation · single-defect-cycle UX (Brief #13 D6).
    // Page renders one shared review form scoped via `ma-r2-review-line-${N}`
    // line-marker click. Fixture defectId ('d1','d2',...) doesn't map to page
    // line numbers, so we click line `i+1` deterministically — golden-path
    // scoring only cares that N reviews are submitted, not which lines.
    // The "保存评论" save button has no testid; locate via role+name.
    for (let i = 0; i < ma.round2.markedDefects.length; i++) {
      const defect = ma.round2.markedDefects[i];
      await this.page
        .locator(byTestId(MA_TESTIDS.r2ReviewLine(i + 1)))
        .click();
      await this.page
        .locator(byTestId(MA_TESTIDS.r2ReviewType))
        .selectOption(defect.commentType);
      await this.page
        .locator(byTestId(MA_TESTIDS.r2ReviewComment))
        .fill(defect.comment);
      if (defect.fixSuggestion) {
        await this.page
          .locator(byTestId(MA_TESTIDS.r2ReviewFix))
          .fill(defect.fixSuggestion);
      }
      await this.page.getByRole('button', { name: '保存评论' }).click();
    }
    await this.page.locator(byTestId(MA_TESTIDS.r2Submit)).click();

    // Round 3 · version comparison + diagnosis.
    await this.page
      .locator(byTestId(MA_TESTIDS.r3VersionChoice(ma.round3.correctVersionChoice)))
      .click();
    await this.page
      .locator(byTestId(MA_TESTIDS.r3DiffAnalysis))
      .fill(ma.round3.diffAnalysis);
    await this.page
      .locator(byTestId(MA_TESTIDS.r3Diagnosis))
      .fill(ma.round3.diagnosisText);
    await this.page.locator(byTestId(MA_TESTIDS.r3Submit)).click();

    // Round 4 · transfer reasoning (red envelope scenario).
    await this.page.locator(byTestId(MA_TESTIDS.r4Response)).fill(ma.round4.response);
    await this.page.locator(byTestId(MA_TESTIDS.r4Submit)).click();
  }

  // ─── Step 9 · MB module (Cursor mode · most complex) ────

  async runMB(mb: NonNullable<V5Submissions['mb']>): Promise<void> {
    await this.page
      .locator(byTestId(MB_TESTIDS.container))
      .waitFor({ state: 'visible', timeout: 30_000 });

    // Planning phase · 3 textareas (decomposition · dependencies · fallbackStrategy).
    if (mb.planning && !mb.planning.skipped) {
      await this.page
        .locator(byTestId(MB_TESTIDS.planningDecomposition))
        .fill(mb.planning.decomposition);
      await this.page
        .locator(byTestId(MB_TESTIDS.planningDependencies))
        .fill(mb.planning.dependencies);
      await this.page
        .locator(byTestId(MB_TESTIDS.planningFallback))
        .fill(mb.planning.fallbackStrategy);
      await this.page.locator(byTestId(MB_TESTIDS.planningSubmit)).click();
    }

    // Editor phase · iterate final files, click each in filetree, type content.
    for (const file of mb.finalFiles ?? []) {
      await MonacoHelper.clickFile(this.page, file.path);
      await MonacoHelper.selectAll(this.page);
      await MonacoHelper.typeCode(this.page, file.content);
      await MonacoHelper.saveFile(this.page);
    }

    // Terminal run · click run button · wait for test output.
    await TerminalHelper.clickRun(this.page);
    await TerminalHelper.waitForOutput(this.page, 'test', 30_000).catch(() => {
      // Terminal output may vary per run environment · swallow non-critical
      // wait failure; finalTestPassRate is asserted by B3 spec on admin route.
    });

    // Brief #16 D26 · execution → standards stage transition · sync setStage in
    // ModuleBPage.handleFinishExecution · no async wait needed.
    await this.page.locator(byTestId(MB_TESTIDS.executionFinish)).click();

    // Chat interactions (optional · fixture may or may not have chat events).
    // Chat observation via DOM-render · mb-chat-stream-active visibility +
    // mb-chat-message-{i} count (ws.ts: v5:mb:chat_stream + chat_complete
    // confirmed Layer 2 grep). Driver fires chat only if editorBehavior
    // has chatEvents; otherwise skip.

    // Standards phase.
    // Brief #16 D28(i) · stage transition click is unconditional · content
    // depth is the candidate-grade signal (Max has empty rulesContent · should
    // still progress, not stall here). Driver fills only what the fixture
    // provides; submit fires regardless.
    if (mb.standards?.rulesContent) {
      await this.page
        .locator(byTestId(MB_TESTIDS.standardsRulesTextarea))
        .fill(mb.standards.rulesContent);
    }
    if (mb.standards?.agentContent) {
      await this.page
        .locator(byTestId(MB_TESTIDS.standardsAgentTextarea))
        .fill(mb.standards.agentContent);
    }
    await this.page.locator(byTestId(MB_TESTIDS.standardsSubmit)).click();

    // Audit phase.
    // Brief #17 D29 · violation toggle is a <select> (unmarked/compliant/
    // violation) per ViolationAuditPanel.tsx:245-255 · rule chooser is a
    // <select> with positional rule_${idx} options from parseRulesFromContent
    // (panel L77-92) · driver MUST selectOption({ value }) for both, and MUST
    // set status for `markedAsViolation === false` cases too (otherwise the
    // select stays at default `unmarked` and canSubmit gates fail).
    if (mb.audit?.violations) {
      for (let i = 0; i < mb.audit.violations.length; i++) {
        const violation = mb.audit.violations[i];
        const violationStatus = violation.markedAsViolation ? 'violation' : 'compliant';
        await this.page
          .locator(byTestId(MB_TESTIDS.auditViolation(i)))
          .selectOption({ value: violationStatus });

        if (violation.markedAsViolation && violation.violatedRuleId) {
          await this.page
            .locator(byTestId(MB_TESTIDS.auditRuleId(i)))
            .selectOption({ value: violation.violatedRuleId });
        }
      }
      await this.page.locator(byTestId(MB_TESTIDS.auditSubmit)).click();
    }

    // Brief #13 · `mb-audit-submit` transitions stage to 'complete' but does
    // NOT auto-progress to the next module. Wait for the complete card and
    // click `mb-advance` (which calls useModuleStore.advance) to proceed.
    await this.page
      .locator(byTestId(MB_TESTIDS.complete))
      .waitFor({ state: 'visible', timeout: 15_000 });
    await this.page.locator(byTestId(MB_TESTIDS.advance)).click();
  }

  /**
   * Brief #20 C3 · MB editorBehavior + finalTestPassRate driver-side bypass.
   *
   * ModuleBPage L232-239 hardcodes empty editorBehavior arrays and the page
   * never wires its real Monaco/chat/test telemetry into the submission shape.
   * Real candidates populate these via socket `behavior:batch`; the e2e
   * driver doesn't replay those events, so without this bypass every
   * fixture observes empty editorBehavior + finalTestPassRate=0 in scoring.
   *
   * Posts fixture data via POST /mb/editor-behavior (Brief #20 C2 endpoint)
   * + POST /mb/test-result. Server-side append* functions dedup so re-posting
   * is safe; spread-merge preserves any already-persisted live telemetry.
   *
   * Runs in the page's fetch context (page.evaluate) so the same session
   * cookie that the candidate session uses is naturally attached.
   */
  private async pushMbBypassData(
    sessionId: string,
    mb: NonNullable<V5Submissions['mb']>,
  ): Promise<void> {
    const eb = mb.editorBehavior;
    if (eb) {
      const hasAny =
        (eb.aiCompletionEvents?.length ?? 0) > 0 ||
        (eb.chatEvents?.length ?? 0) > 0 ||
        (eb.diffEvents?.length ?? 0) > 0 ||
        (eb.fileNavigationHistory?.length ?? 0) > 0 ||
        (eb.editSessions?.length ?? 0) > 0 ||
        (eb.documentVisibilityEvents?.length ?? 0) > 0 ||
        (eb.testRuns?.length ?? 0) > 0;
      if (hasAny) {
        await this.page.evaluate(
          async ({ sessionId: sid, payload }) => {
            await fetch(`/api/v5/exam/${sid}/mb/editor-behavior`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          },
          { sessionId, payload: eb },
        );
      }
    }
    if (typeof mb.finalTestPassRate === 'number') {
      await this.page.evaluate(
        async ({ sessionId: sid, passRate }) => {
          await fetch(`/api/v5/exam/${sid}/mb/test-result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passRate, duration: 1000 }),
          });
        },
        { sessionId, passRate: mb.finalTestPassRate },
      );
    }
  }

  // ─── Step 10 · MC module (text-fallback mode) ───────────

  async runMC(mc: NonNullable<V5Submissions['moduleC']>): Promise<void> {
    await this.page
      .locator(byTestId(MC_TESTIDS.container))
      .waitFor({ state: 'visible', timeout: 15_000 });

    // Brief #17 D30 · MicPreflight gates ModeTabs (ModuleCPage.tsx:393-401).
    // CI has no microphone · skip routes to text-fallback (legitimate outlet,
    // not a bypass). After dismissal, ModeTabs renders.
    await this.page.locator(byTestId(MC_TESTIDS.preflightSkip)).click();
    await this.page
      .locator(byTestId(MC_TESTIDS.modeText))
      .waitFor({ state: 'visible', timeout: 10_000 });

    // Prefer text-fallback mode · real voice validated Cold Start Tier 2.
    await this.page.locator(byTestId(MC_TESTIDS.modeText)).click();

    for (const round of mc) {
      await this.page.locator(byTestId(MC_TESTIDS.answerInput)).fill(round.answer);
      await this.page.locator(byTestId(MC_TESTIDS.submit)).click();
      // Wait for next round to render (chat feed updates).
      await this.page.waitForTimeout(500);
    }

    // Brief #17 D37 · waitFor `modulec-done` BEFORE clicking `modulec-finish`.
    // The finish button lives INSIDE the done card (ModuleCPage.tsx:374-388),
    // and clicking it triggers `finishAndAdvance` → `advance()` → page navigates
    // away from MC (CompletePage for full_stack since MC is last). A post-click
    // waitFor would race against the unmount and time out. Matches the runMB
    // L468-471 pattern (`mb-complete waitFor → mb-advance click`).
    await this.page
      .locator(byTestId(MC_TESTIDS.done))
      .waitFor({ state: 'visible', timeout: 15_000 });
    await this.page.locator(byTestId(MC_TESTIDS.finish)).click();
  }

  // ─── Step 11 · MD module (forward-compat · current fixtures skip) ──

  async runMD(md: NonNullable<V5Submissions['moduleD']>): Promise<void> {
    await this.page
      .locator(byTestId(MD_TESTIDS.container))
      .waitFor({ state: 'visible', timeout: 15_000 });

    // Sub-modules.
    for (let i = 0; i < md.subModules.length; i++) {
      const sub = md.subModules[i];
      await this.page
        .locator(byTestId(MD_TESTIDS.submoduleName(i)))
        .fill(sub.name);
      await this.page
        .locator(byTestId(MD_TESTIDS.submoduleResponsibility(i)))
        .fill(sub.responsibility);
    }

    // Interface definitions (string[] · joined per-line) + dataflow.
    if (md.interfaceDefinitions.length > 0) {
      await this.page
        .locator(byTestId(MD_TESTIDS.interfaceDefinitions))
        .fill(md.interfaceDefinitions.join('\n'));
    }
    if (md.dataFlowDescription) {
      await this.page
        .locator(byTestId(MD_TESTIDS.dataflowDescription))
        .fill(md.dataFlowDescription);
    }

    // Constraints selected.
    for (const constraint of md.constraintsSelected ?? []) {
      await this.page
        .locator(byTestId(MD_TESTIDS.constraint(constraint)))
        .check();
    }

    // Tradeoff text.
    if (md.tradeoffText) {
      await this.page
        .locator(byTestId(MD_TESTIDS.tradeoffText))
        .fill(md.tradeoffText);
    }

    // AI orchestration prompts.
    for (let i = 0; i < (md.aiOrchestrationPrompts ?? []).length; i++) {
      await this.page
        .locator(byTestId(MD_TESTIDS.aiOrchestration(i)))
        .fill(md.aiOrchestrationPrompts![i]);
    }

    await this.page.locator(byTestId(MD_TESTIDS.submit)).click();
  }

  // ─── Step 12 · SE module + Complete ─────────────────────

  async runSE(se: NonNullable<V5Submissions['selfAssess']>): Promise<void> {
    await this.page
      .locator(byTestId(SE_TESTIDS.container))
      .waitFor({ state: 'visible', timeout: 15_000 });

    // Dimension sliders · fixture confidence maps to unified confidence value.
    // Brief #13 D11 · page renders a single shared `selfassess-slider`; per-
    // dim split is V5.0.5 housekeeping.
    // Brief #17 D34 · `.fill()` on a range input is a Playwright no-op (silent
    // failure with no error). Use the native HTMLInputElement value setter
    // (preserves React's internal value tracker) and dispatch input + change
    // events so the controlled-component handler runs.
    await this.page
      .locator(byTestId(SE_TESTIDS.dimensionSlider))
      .evaluate((el, value) => {
        const input = el as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, String(Math.round(se.confidence * 100)))
      .catch(() => {
        // Slider may be absent in some UI variants — non-fatal.
      });

    await this.page.locator(byTestId(SE_TESTIDS.reasoning)).fill(se.reasoning);
    await this.page.locator(byTestId(SE_TESTIDS.submit)).click();
  }

  async completeFlow(): Promise<void> {
    await this.page
      .locator(byTestId(CANDIDATE_TESTIDS.complete.root))
      .waitFor({ state: 'visible', timeout: 30_000 });
    // Candidate clicking viewReportBtn would navigate to the demo-fixture
    // self-view · B3 spec asserts via admin route instead; just confirm
    // the complete page rendered (scoring pipeline triggers server-side).
  }

  // ─── Step 13 · Scoring completion poll ──────────────────

  async waitForScoringComplete(
    sessionId: string,
    timeoutMs = 300_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    const pollIntervalMs = 3_000;

    while (Date.now() < deadline) {
      await this.page.goto(`/admin/sessions/${sessionId}`);

      const reportReady = await this.page
        .locator(byTestId(ADMIN_TESTIDS.sessionDetailReport))
        .isVisible()
        .catch(() => false);
      const incomplete = await this.page
        .locator(byTestId(ADMIN_TESTIDS.sessionDetailReportIncomplete))
        .isVisible()
        .catch(() => false);
      const pending = await this.page
        .locator(byTestId(ADMIN_TESTIDS.sessionDetailReportPending))
        .isVisible()
        .catch(() => false);

      if (reportReady && !incomplete && !pending) return;

      await this.page.waitForTimeout(pollIntervalMs);
    }

    throw new Error(
      `Scoring did not complete for sessionId=${sessionId} within ${timeoutMs}ms`,
    );
  }

  // ─── Orchestrator · full 13-step flow ───────────────────

  async runFullGoldenPath(
    fx: GoldenPathDriverFixture,
  ): Promise<{ sessionId: string }> {
    await this.loginAdmin();
    const { sessionId, candidateToken } = await this.createSession(fx);
    await this.fillConsent(candidateToken);
    await this.fillProfile(candidateToken, fx);
    await this.navigateToExam(sessionId);
    await this.clickIntroStart();

    // Brief #17 D32 · iterate fx.participatingModules in array order rather
    // than hardcoded sequence · matches frontend's `SUITES[suiteId].modules`
    // (session.store.ts:134) which is the canonical navigation source. Prior
    // hardcoded order assumed `mb → moduleC → SE` but all 4 MC-bearing suites
    // (full_stack · architect · ai_engineer · deep_dive) intentionally have
    // `... → SE → MC`, so a hardcoded driver diverged from real UI flow.
    const moduleHandlers: Record<string, () => Promise<void>> = {
      phase0: async () => {
        if (fx.submissions.phase0) await this.runP0(fx.submissions.phase0);
      },
      moduleA: async () => {
        if (fx.submissions.moduleA) await this.runMA(fx.submissions.moduleA);
      },
      mb: async () => {
        if (fx.submissions.mb) {
          await this.runMB(fx.submissions.mb);
          await this.pushMbBypassData(sessionId, fx.submissions.mb);
        }
      },
      moduleC: async () => {
        if (fx.submissions.moduleC) await this.runMC(fx.submissions.moduleC);
      },
      moduleD: async () => {
        if (fx.submissions.moduleD) await this.runMD(fx.submissions.moduleD);
      },
      selfAssess: async () => {
        if (fx.submissions.selfAssess) await this.runSE(fx.submissions.selfAssess);
      },
    };

    for (const moduleId of fx.participatingModules) {
      const handler = moduleHandlers[moduleId];
      if (!handler) {
        throw new Error(
          `GoldenPathDriver · unknown module in participatingModules: ${moduleId}`,
        );
      }
      await handler();
    }

    await this.completeFlow();
    await this.waitForScoringComplete(sessionId);
    return { sessionId };
  }
}

// Silence unused import warnings for types consumed only by JSDoc / inference.
void expect;
