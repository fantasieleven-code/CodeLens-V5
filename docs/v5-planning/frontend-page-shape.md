# Frontend Page Shape Template

This template captures the V5.0 A-series page pattern that shipped across
Consent, ProfileSetup, SelfView, and Transparency. Use it for new
candidate-facing or public policy pages unless the brief explicitly chooses a
different shape.

## When To Use

Use this shape for pages that:

- render user-facing narrative copy in zh + en inline;
- are route-level surfaces, not small reusable widgets;
- carry candidate, HR, or public trust/ethics context;
- need stable DOM anchors for smoke/e2e assertions.

Do not use this as a reason to create a landing page. The first screen should
remain the actual task surface.

## File Shape

```text
packages/client/src/pages/<area>/
  <feature>Content.ts
  <Feature>Page.tsx
  <Feature>Page.test.tsx
```

For guarded flow steps, keep the guard as a separate route-boundary component:

```text
  <RouteGuard>.tsx
  <RouteGuard>.test.tsx
```

Name guards by the route boundary they protect (`ExamGuard`, `ProfileGuard`),
not by the broad audience (`CandidateGuard`).

## Content Module

`<feature>Content.ts` owns all stable user-facing copy and lightweight copy
types.

Rules:

- Export a single uppercase content constant, for example `CONSENT_CONTENT` or
  `TRANSPARENCY_CONTENT`.
- Keep zh + en together under the same semantic key.
- Use readonly data shapes so pages cannot mutate copy.
- Keep backend/frontend error-code mapping in content when the page renders
  user-visible errors.
- Keep route-specific support text, policy copy, and ethics-floor language out
  of the page component body.

Example shape:

```ts
export interface BilingualText {
  readonly zh: string;
  readonly en: string;
}

export const FEATURE_CONTENT = {
  pageTitle: { zh: '...', en: '...' },
  intro: { zh: '...', en: '...' },
} as const;
```

If multiple new pages need the same copy helper type, prefer importing a shared
client-local helper instead of redeclaring it again.

## Page Module

`<Feature>Page.tsx` owns route params, page state, submission/fetch handlers,
and rendering.

Rules:

- Import copy from `<feature>Content.ts`.
- Import visual tokens from `../../lib/tokens.js`; do not create one-off color
  palettes.
- Keep route params explicit with `useParams<{ ... }>()`.
- Treat missing URL tokens as first-class states with `data-testid` anchors.
- Keep handlers pure enough for tests: no implicit global writes except the
  brief-approved surfaces (`localStorage`, `window.history`, route navigate).
- If the page fetches async data, guard state updates with a cancellation flag.
- If the page submits data, block double-submit and map known API errors to
  content-defined user messages.
- Use stable `data-testid` values for page root, major sections, submit buttons,
  and error blocks.

Rendering rules:

- Render zh + en inline, not behind a language switcher.
- Keep candidate/HR/public trust copy visible on the page; do not hide it in
  tooltips or tertiary surfaces.
- Use cards only for repeated items or genuinely framed chunks. Do not nest
  cards.
- Keep route-specific auth semantics visible in the file header comment:
  localStorage guard, URL-as-auth, public route, or admin auth.

## Test Module

`<Feature>Page.test.tsx` should prove the page contract, not snapshot incidental
style objects.

Minimum coverage:

- page root renders with its `data-testid`;
- zh + en copy appears inline;
- route wiring works through `MemoryRouter`;
- missing/invalid token state renders without throwing;
- submit/fetch success path reaches the intended route or DOM state;
- known API errors map to stable DOM/error-code anchors.

For ethics-sensitive pages, add negative DOM assertions for forbidden output.
Examples: no grade, no composite score, no absolute score, no signal IDs, no
danger flags.

For public pages, add a test proving the route is public and does not require a
guard or URL token.

## Cross-Checks Before PR

Run these before opening a PR:

```bash
npm --prefix packages/client test -- <Feature>Page.test.tsx
npx tsc --noEmit -p packages/client/tsconfig.json
npm run lint
git diff --check
```

If the page adds or changes route wiring, also run the relevant `App.test.tsx`
or route-specific test.

## Existing References

- `packages/client/src/pages/candidate/ConsentPage.tsx`
- `packages/client/src/pages/candidate/ProfileSetup.tsx`
- `packages/client/src/pages/candidate/SelfViewPage.tsx`
- `packages/client/src/pages/transparency/TransparencyPage.tsx`
