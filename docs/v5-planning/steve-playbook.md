# Steve Playbook · V5 Release Execution

**Purpose**: V5 release execution quick-reference for Steve · points to canonical docs +
records discipline principles accumulated during V5 A-series / W-A / W-B / W-C execution.

## Canonical source docs

- **V5 Release Plan 2026-04-22** · `docs/v5-planning/V5-release-plan-20260422.md` · 9 briefs ·
  W-A / W-B / W-C workstream · realistic 5-2 / 5-5 ship date
- **backend-agent-tasks.md** · `docs/v5-planning/backend-agent-tasks.md` · technical task plan
- **cross-task-shared-extension-backlog.md** · V5.0.5 / V5.1 housekeeping entries
- **v5-state-audit-20260422.md** · `docs/v5-planning/v5-state-audit-20260422.md` · baseline audit snapshot
- **observations.md** · accumulated pattern library (#1-#154+)
- **TYPECHECK_EXCLUDES.md** · `docs/v5-planning/TYPECHECK_EXCLUDES.md` · V4→V5 tsconfig exclude protocol

## V5 ship gate · 6 items

1. **Evidence Trace** · candidate signals evidence 可 trace · Steve sample verify Cold Start
2. **Grade Confidence** · grade boundary logic · 4-grade monotonicity
3. **Quality Gates** · lint + test + build + e2e + prompt-regression green
4. **Capability Profiles** · 4 profiles render · label + description match
5. **Golden Path** · 48 signals non-null production (45 automated + 3 MC manual)
6. **Cold Start Validation** · Steve real candidate flow · ethics floor + lifecycle

## Discipline principles · pattern library

### Pattern F · Verify before assume

Brief assumptions vs implementation drift · Phase 1 grep source-of-truth · 不 silent impl ·
三视角 ratify 之后 proceed。Project knowledge / audit doc snapshots ≤ live filesystem grep ·
session-28-drift-catch track record proves this rule's leverage.

### Pattern G · No silent push

Agent Phase 1 / Phase 2 pre-impl 发现 drift · 必 §E E1 stop · report planning Claude ·
不 silent 修 / silent ratify 扩 scope。

### Pattern B · Scope fence

Brief §8 列出 scope fence（哪些 不 touch）· Phase 2 诱惑 scope creep 时 stop · surface
三视角 consider V5.0 vs V5.0.5 defer。

### Pattern E · Path + branch discipline

Brief §3 明确 working dir + branch name pattern · Phase 1 Q grep 验证 precise path ·
不假设 mental map。

### Pattern H · Cross-task isolation

每 Task 严守 surface · 不 touch 其他 Task owner scope · 避免 cross-brief drift。

## Self-merge authority · Steve ratified 2026-04-21

- 三视角 consensus (brief + Phase 1 + ratify) + 4-green pre-PR gate + main CI green → agent self-merge
- `gh pr merge <PR_NUMBER> --squash --delete-branch`
- Post-merge main CI verify 4 gated jobs green (lint-and-typecheck · test · build · e2e) ·
  docker / prompt-regression may skip per path-gate · report planning Claude window

## Brief lifecycle

```
Planning Claude draft brief
    ↓
Steve paste 给 agent window
    ↓
Agent Phase 1 pre-verify (read-only grep · 5 Q · 10-20 min)
    ↓
Planning Claude ratify (三视角 consensus · 5-15 min)
    ↓
Agent Phase 2 implement (N commits · each bisect-clean green)
    ↓
Agent Pre-PR smoke gate (4 green strict)
    ↓
Agent open PR · PR CI verify green
    ↓
Agent self-merge · post-merge main CI verify
    ↓
Planning Claude observation + next brief draft
```

## Cold Start validation · Gate #6

Pre-V5.0-release manual smoke · Steve 扮 candidate full flow + MC real voice (Volcano RTC ·
15-20 min Tier 2 · W-B E2E automation 覆盖其他 7/8 module Tier 1 · per V5 Release Plan OQ-R5 β)。

Phase 1-5 protocol detail · V5 Release Plan §Cold Start section + cold-start-validation-brief.md。

## V5.0.5 rule candidates · accumulated

1. **Stale TYPECHECK_EXCLUDES → delete vs rewrite** (A1 observation #150) · when an exclude entry has
   no owner progress for >N days AND architecture diverged · promote to delete decision rather
   than indefinite exclusion.
2. **Audit doc snapshot · re-verify before implement** (A5 observation #151) · audit claims are
   snapshots · re-grep implementation before acting on audit-derived Tasks (UNDOCUMENTED_IMPL-4
   was stale at A5 execution).
3. **Plan doc typed shapes > prose narrative** (A4 Phase 2 L2) · when brief prose conflicts with
   TypeScript / zod typed shape · typed shape wins · surface drift to planning Claude.
4. **Brief pre-impl CI gate scope verify** (A4 Phase 2 L3) · verify which CI jobs gate which paths
   before scope-fencing · `prisma/` dir fence was vacuous in that brief (no CI gate watched it).
5. **Doc signal count · grep implementation before update** (C1 observation #154) · plan doc
   narrative numbers are snapshot 可 stale · implementation (signal registry · env.ts · Prisma
   schema · fixtures) 是 source of truth · cross-ref via grep before doc-number update.

## Version

Created 2026-04-22 (V5 Release Plan brief #6 · C1 · Steve playbook State B greenfield create)
Updated · as future briefs surface pattern · V5.0.5 housekeeping 可 enrich (deeper content +
additional pattern entries + ship gate item-by-item sub-protocols)
