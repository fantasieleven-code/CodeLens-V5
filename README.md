# CodeLens V5

AI-era engineering talent assessment platform.

Evaluates candidates' ability to direct, judge, and understand AI-written code — not whether they can write code themselves.

## Quick Start

```bash
npm install
cp .env.example .env  # Fill in actual values
npm run prisma:generate
npm run prisma:migrate dev
npm run dev
```

## Architecture

- **Unified BusinessScenario**: One business context spans all modules
- **Suite system**: 5 pre-configured evaluation suites for different roles
- **Cursor mode**: Candidates work in a multi-file IDE with AI assistance
- **43 signals**: Data-driven scoring across 6 dimensions

See `docs/v5-design-spec.md` for full architecture documentation.

## Development

```bash
npm run dev              # Start all packages in dev mode
npm run build            # Build all packages
npm run test             # Run unit tests
npm run test:e2e         # Run E2E tests
npm run test:golden-path # Run Golden Path regression tests
```

## History

This is CodeLens V5. V3/V4 are archived at:
https://github.com/fantasieleven-code/tech-assessment (branch: legacy/v4)
