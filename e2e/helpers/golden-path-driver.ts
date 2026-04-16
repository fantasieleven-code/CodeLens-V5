/**
 * Golden Path driver — drives the v4 candidate UI through a GoldenPathFixture.
 *
 * Called by candidate-v4-golden-path.spec.ts. Every selector goes through
 * testid-map.ts so UI testid renames break at compile time, not test time.
 *
 * Design gap — Phase 0 decisionStyle:
 *   Exam decisions render options as {id: 'A'/'B'/'C'/'D', label}. The UI sends
 *   option letters to server. mapDecisionStyle() in scoring-orchestrator-v4.ts
 *   maps unknown strings → 'experience_driven' fallback. So fixture.decisions[i].choice
 *   (DecisionStyle enum) is *not* round-trippable through UI — it stays 'experience_driven'
 *   regardless of S/A/B/C. All grades get identical sDecisionStyle contribution.
 *   Accepted for v1 Golden Path — the other 30 signals differentiate grades adequately.
 *   Fix later by either adding DecisionStyle-labeled UI options or post-UI store override.
 */

import { type Page, expect } from '@playwright/test';
import {
  PHASE0,
  MODULE_A,
  MODULE_B1,
  MODULE_B2,
  SELF_ASSESS,
  MODULE_C,
  SHELL,
  byTestId,
} from '../fixtures/golden-paths/testid-map.js';
import type { GoldenPathFixture, MB1RoundInputs } from '../fixtures/golden-paths/types.js';
import { MonacoHelper } from './monaco-helper.js';

// ─── Low-level helpers ─────────────────────────────────────────────

/** Type into a textarea (clear first, then fill with pressSequentially for realism).
 *  Uses `fill` when speed matters, `pressSequentially` when keystroke behavior is signal-relevant. */
async function fillTextField(
  page: Page,
  testid: string,
  text: string,
  opts?: { sequential?: boolean },
): Promise<void> {
  const locator = page.locator(byTestId(testid));
  await locator.waitFor({ state: 'visible' });
  await locator.fill('');
  if (opts?.sequential) {
    await locator.pressSequentially(text, { delay: 10 });
  } else {
    await locator.fill(text);
  }
}

/** Set a range slider to a numeric value via page.evaluate + InputEvent dispatch.
 *  React's _valueTracker dedupes onChange when the new value equals the tracker's
 *  last-seen value — this is a problem when the UI default visually equals our
 *  target (e.g. slider default 50, fixture sets 50). Workaround: reset the
 *  tracker via setValue('') before the native setter. */
async function setSliderValue(page: Page, testid: string, value: number): Promise<void> {
  const locator = page.locator(byTestId(testid));
  await locator.waitFor({ state: 'visible' });
  await locator.evaluate((el: HTMLInputElement, v: number) => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    // Defeat React's _valueTracker dedupe — if present, clear its last-seen value.
    const tracker = (el as unknown as { _valueTracker?: { setValue: (s: string) => void } })._valueTracker;
    if (tracker && typeof tracker.setValue === 'function') {
      tracker.setValue('');
    }
    nativeInputValueSetter?.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

/** Click a button and wait for enabled state first. */
async function clickButton(page: Page, testid: string, opts?: { timeout?: number }): Promise<void> {
  const locator = page.locator(byTestId(testid));
  await locator.waitFor({ state: 'visible', timeout: opts?.timeout ?? 30000 });
  await expect(locator).toBeEnabled({ timeout: opts?.timeout ?? 30000 });
  await locator.click();
}

// ─── Phase 0 ──────────────────────────────────────────────────────

export async function fillPhase0(page: Page, fixture: GoldenPathFixture): Promise<void> {
  // 1. Wait for page to render.
  await page.locator(byTestId(PHASE0.page)).waitFor();

  // 2. Predictions: slider + optional reason text.
  for (let i = 0; i < fixture.phase0.predictions.length; i++) {
    const p = fixture.phase0.predictions[i];
    await setSliderValue(page, PHASE0.prediction(i).slider, p.predictedConfidence);
    await fillTextField(page, PHASE0.prediction(i).reason, p.actualAnswer);
  }

  // 3. Decisions: always click option 'A' (see file-level doc comment about
  //    DecisionStyle gap — UI only exposes option letters, not style enum).
  for (let i = 0; i < fixture.phase0.decisions.length; i++) {
    const d = fixture.phase0.decisions[i];
    await clickButton(page, PHASE0.decision(i).choice('A'));
    await fillTextField(page, PHASE0.decision(i).reason, d.reasoning);
  }

  // 4-5. Code reading answer + confidence.
  await fillTextField(page, PHASE0.codeReading.answer, fixture.phase0.codeReading.answer);
  await setSliderValue(page, PHASE0.codeReading.confidence, fixture.phase0.codeReading.confidence);

  // 6. Submit.
  await clickButton(page, PHASE0.submit);

  // 7. Wait for Module A round 1 to render.
  await page.locator(byTestId(MODULE_A.round1.section)).waitFor();
}

// ─── Module A (3 rounds) ──────────────────────────────────────────

export async function fillModuleARound1(page: Page, fixture: GoldenPathFixture): Promise<void> {
  const r1 = fixture.moduleA.round1;

  // 1. Click scheme select button for the chosen scheme.
  await clickButton(page, MODULE_A.round1.schemeSelect(r1.schemeId));

  // 2. Fill structured reasoning fields.
  const reasoningKeys: Array<keyof typeof r1.structuredForm> = [
    'assumptions',
    'tradeoffs',
    'risks',
    'verification',
  ];
  for (const key of reasoningKeys) {
    await fillTextField(page, MODULE_A.round1.reasoningField(key), r1.structuredForm[key]);
  }

  // 3. Personalized probe response.
  await fillTextField(page, MODULE_A.round1.probeResponse, r1.personalizedProbeResponse);

  // 4. Submit.
  await clickButton(page, MODULE_A.round1.submit);

  // 5. Wait for round 2.
  await page.locator(byTestId(MODULE_A.round2.section)).waitFor();
}

export async function fillModuleARound2(page: Page, fixture: GoldenPathFixture): Promise<void> {
  const r2 = fixture.moduleA.round2;

  // 1. Check each marked defect.
  for (const id of r2.markedDefectIds) {
    await clickButton(page, MODULE_A.round2.defectCheckbox(id));
  }

  // 2. Severity ranking — SIMPLIFIED: trust default order and rely on checkbox order.
  //    TODO: implement rank-up/rank-down drag once UI stabilizes. Severity ranking
  //    UI currently relies on up/down arrow buttons per row which require sequential
  //    reordering logic; skipped for v1 Golden Path.
  if (r2.severityRanking.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      '[golden-path-driver] severityRanking reorder not implemented; using default order',
    );
  }

  // 3. Defect reasoning textarea.
  await fillTextField(page, MODULE_A.round2.defectReasoning, r2.defectReasoning);

  // 4. Submit.
  await clickButton(page, MODULE_A.round2.submit);

  // 5. Wait for round 3.
  await page.locator(byTestId(MODULE_A.round3.section)).waitFor();
}

export async function fillModuleARound3(page: Page, fixture: GoldenPathFixture): Promise<void> {
  const r3 = fixture.moduleA.round3;

  // 1-2. Diagnosis + additional context textareas.
  await fillTextField(page, MODULE_A.round3.diagnosis, r3.diagnosisText);
  await fillTextField(page, MODULE_A.round3.context, r3.additionalContext);

  // 3. Submit.
  await clickButton(page, MODULE_A.round3.submit);

  // 4. Wait for MB1 page.
  await page.locator(byTestId(MODULE_B1.page)).waitFor();
}

// ─── Module B1 ────────────────────────────────────────────────────

export async function fillModuleB1(page: Page, fixture: GoldenPathFixture): Promise<void> {
  const rounds: MB1RoundInputs[] = fixture.mb1.rounds;

  for (let roundIdx = 0; roundIdx < rounds.length; roundIdx++) {
    const round = rounds[roundIdx];
    // testid uses 0-indexed roundIdx from rounds.map callback
    // (NOT round.roundNumber which is 1-indexed from the server).
    const uiRoundNum = roundIdx;

    // 1. Type prompt into input.
    await fillTextField(page, MODULE_B1.promptInput, round.prompt, { sequential: false });

    // 2. Send prompt to AI.
    await clickButton(page, MODULE_B1.sendPrompt);

    // 3. Wait for AI response — detect by waiting for at least one block to appear.
    await page
      .locator(byTestId(MODULE_B1.block(uiRoundNum, 0).container))
      .waitFor({ timeout: 90000 });

    // 4. verifyBeforeDecision: run tests AFTER AI response but BEFORE apply/skip.
    //    The mock handler attaches the resulting passRate to the latest round,
    //    so the round record must already exist — i.e. runTest goes after send,
    //    not before. sVerifyDiscipline reads `verifiedBeforeDecision` from the
    //    round record populated here.
    if (round.verifyBeforeDecision) {
      await clickButton(page, MODULE_B1.runTest);
    }

    // 5. Apply each requested block.
    for (const blockIndex of round.applyBlocks) {
      await clickButton(page, MODULE_B1.block(uiRoundNum, blockIndex).apply);
    }

    // 6. Skip each requested block with reason.
    for (const { blockIndex, reason } of round.skipBlocks) {
      await fillTextField(page, MODULE_B1.block(uiRoundNum, blockIndex).reason, reason);
      await clickButton(page, MODULE_B1.block(uiRoundNum, blockIndex).skip);
    }
  }

  // 7. Final round only: finish MB1.
  await clickButton(page, MODULE_B1.finish);
}

// ─── Module B2 ────────────────────────────────────────────────────

export async function fillModuleB2(page: Page, fixture: GoldenPathFixture): Promise<void> {
  // 1. Focus RULES.md tab.
  await clickButton(page, MODULE_B2.editor.tabRules);

  // 2. Clear + type RULES.md content via MonacoHelper (delay=5ms keeps tests fast).
  await MonacoHelper.selectAll(page);
  await MonacoHelper.typeCode(page, fixture.mb2.rulesContent, 5);

  // 3. Optional AGENT.md content.
  if (fixture.mb2.agentContent !== null) {
    await clickButton(page, MODULE_B2.editor.toggleAgent);
    await clickButton(page, MODULE_B2.editor.tabAgent);
    await MonacoHelper.selectAll(page);
    await MonacoHelper.typeCode(page, fixture.mb2.agentContent, 5);
  }

  // 4. Submit harness.
  await clickButton(page, MODULE_B2.submit);

  // 5. Wait for Self-Assess page.
  await page.locator(byTestId(SELF_ASSESS.slider)).waitFor();
}

// ─── Self-Assess ──────────────────────────────────────────────────

export async function fillSelfAssess(page: Page, fixture: GoldenPathFixture): Promise<void> {
  // 1. Confidence slider.
  await setSliderValue(page, SELF_ASSESS.slider, fixture.selfAssess.confidence);

  // 2. Reasoning textarea.
  await fillTextField(page, SELF_ASSESS.reasoning, fixture.selfAssess.reasoning);

  // 3. Submit.
  await clickButton(page, SELF_ASSESS.submit);

  // 4. Wait for Module C page root (matches both preflight gate and active chat).
  await page.locator(byTestId(MODULE_C.page)).waitFor();
}

// ─── Module C ─────────────────────────────────────────────────────

export async function fillModuleC(page: Page, fixture: GoldenPathFixture): Promise<void> {
  const rounds = fixture.moduleC.rounds;

  // Preflight gate — new mic-check screen shown before RTC starts. Click the
  // skip link to bypass (unconditionally calls onPass). Older Module C builds
  // had no preflight, so probe-and-skip rather than hard-wait.
  const preflightSkip = page.locator(byTestId(MODULE_C.preflightSkip));
  if (await preflightSkip.count().then((c) => c > 0)) {
    await clickButton(page, MODULE_C.preflightSkip);
  }

  // Text mode lives behind the "Text fallback" tab — voice mode doesn't expose
  // answerInput. Switch to text tab before filling.
  await page.locator(byTestId(MODULE_C.chat)).waitFor({ state: 'visible' });
  const textTab = page.locator(byTestId(MODULE_C.modeText));
  if (await textTab.count().then((c) => c > 0)) {
    await textTab.click();
  }

  for (const round of rounds) {
    // 1. Wait for answer input to be visible (+ editable).
    await page.locator(byTestId(MODULE_C.answerInput)).waitFor({ state: 'visible' });

    // 2. Fill answer.
    await fillTextField(page, MODULE_C.answerInput, round.answer);

    // 3. Submit.
    await clickButton(page, MODULE_C.submit);

    // 4. Wait for either next question or "done" state.
    await Promise.race([
      page
        .locator(byTestId(MODULE_C.done))
        .waitFor({ timeout: 60000 })
        .then(() => 'done'),
      page
        .locator(byTestId(MODULE_C.answerInput))
        .waitFor({ state: 'visible', timeout: 60000 })
        .then(() => 'next'),
    ]);
  }

  // Final: click finish if present.
  const finishLocator = page.locator(byTestId(MODULE_C.finish));
  if ((await finishLocator.count()) > 0) {
    await clickButton(page, MODULE_C.finish);
  }
}

// ─── Orchestration ────────────────────────────────────────────────

export interface RunOpts {
  /** If true, assume MB1 mock mode — skip real verifyBeforeDecision runTest click. */
  mockMb1?: boolean;
}

export async function runGoldenPath(
  page: Page,
  fixture: GoldenPathFixture,
  opts: RunOpts = {},
): Promise<void> {
  void opts; // reserved for future use (mockMb1 wiring into fillModuleB1).
  void SHELL; // reserved — currently unused but kept for future step-strip assertions.

  await fillPhase0(page, fixture);
  await fillModuleARound1(page, fixture);
  await fillModuleARound2(page, fixture);
  await fillModuleARound3(page, fixture);
  await fillModuleB1(page, fixture);
  await fillModuleB2(page, fixture);
  await fillSelfAssess(page, fixture);
  await fillModuleC(page, fixture);
}
