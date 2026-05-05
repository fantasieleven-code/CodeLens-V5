/**
 * Task CI-Green-Up · C2 · promptfoo mock provider.
 *
 * Deterministic file-based provider for the MD prompt-regression baseline
 * (3 LLM signals · A14b). Returns a fixed JSON payload so `npx promptfoo eval`
 * runs without network, secrets, token cost, or provider variance in main CI.
 * Real-provider variance monitoring belongs in a separate nightly/manual gate.
 *
 * The shape mirrors the contract enforced by
 * `packages/server/src/signals/md/llm-helper.ts` (SYSTEM_PROMPT):
 *   `{ "score": <0-1>, "notes": "<=2 sentences" }`
 *
 * promptfoo's JS-provider loader (v0.121.x) calls `new DefaultExport()`,
 * so we export a class — not an object literal. CommonJS on purpose
 * (`module.exports = class`); adding a .cjs/.mjs bridge would expand blast
 * radius for a 25-LOC stub.
 */
module.exports = class MockMdProvider {
  constructor(options = {}) {
    this.providerId = (options && options.id) || 'mock-md-provider';
  }
  id() {
    return this.providerId;
  }
  async callApi(_prompt, _context) {
    return {
      output: JSON.stringify({
        score: 0.75,
        notes: 'Mock baseline · deterministic response · no real LLM call.',
      }),
    };
  }
};
