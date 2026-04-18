# Field Naming Glossary (Pattern C 防御)

> 目的:V5 里有多组**同前缀字段名**(aiClaim* / reflection* / decision* / scoring* 等),Claude 写 brief 时经常混淆。本文件是 **canonical 字段名 + 归属 + import path + 消费方** 的 single source of truth。
>
> 使用方式:每次写 Task brief 引用某字段前,**grep 本文件**确认字段精确命名 + import path。若 brief 和本文件冲突,以本文件为准;若本文件和 shared 实际冲突,以 shared 为准(本文件滞后更新)。

## Pattern C 历史命中(Day 1-2)

1. **Task 13a**:brief `aiClaimDetection` vs shared `aiClaimVerification`(observation #011)
2. **Task 13a**:brief `aiClaimedFeatures` vs shared `claimedFeatures`(observation #013)
3. **Task 7.5**:brief `MBViolationExample.aiClaimedReason` vs shared `explanation`(observation #018)
4. **Task 7.5**:brief `V5MBAudit.submittedAt` 不存在
5. **Task 7.5**:brief `violatedRuleId` 位置错(应在 audit.violations[] 不在 example 上)

## Canonical Field Glossary

### AI Claim 系列(P0 + 其他)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5Phase0Submission.aiClaimVerification` | Shared P0 | `@codelens-v5/shared/types/v5-phase0` | Phase0Page (write) + sAiClaimDetection signal (read) | 候选人对 AI 代码主张的判断 |
| `ExamModule(P0).aiOutputJudgment` | Shared ExamModule | `@codelens-v5/shared/types/v5-exam-module` | Phase0 题目数据 | P0 的 2 题 AI 代码判断 |
| `ExamModule(P0).aiClaimedFeatures` | Shared ExamModule | `@codelens-v5/shared/types/v5-exam-module` | scoring signal(算法不读,keep in interface with comment) | Deceptive AI 声明的特性 |
| `MBViolationExample.explanation` | Shared MB | `@codelens-v5/shared/types/v5-mb` | Stage 4 audit + sRuleEnforcement signal | AI 执行结果的"官方"解释(groundTruth 的一部分) |
| `MBViolationExample.aiClaimedReason` | ⚠️ **不存在** (brief 误用) | — | — | Frontend Task 7.5 Props 暴露给候选人的字段,需要 mapping 从 shared `explanation` |

**常见混淆**:
- `aiClaimedReason`(brief 常用)≠ `explanation`(shared 实际)
- `aiClaimedFeatures`(ExamModule 保留)≠ `claimedFeatures`(不存在)
- `aiClaimVerification`(Submission 写)≠ `aiClaimDetection`(signal ID,不是字段)
- `aiClaimDetection`**是 signal 名**,不是字段名

### Decision 系列(P0 + SelfAssess)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5SelfAssessSubmission.decisionSummary`(V5.2+) | Shared(未实现) | 未建立 | 未来 ReportView | V5 决策摘要 — 候选人回顾 |
| `session.store.getDecisionSummary()` | Client store | `@/stores/session.store` | DecisionSummary Component | 运行时从 submissions 聚合 3 模块决策 |
| `sDecisionStyle` | Signal registry (P0) | `@/server/signals/p0/s-decision-style` | scoring | 决策风格 signal(不是字段) |
| `sDecisionLatencyQuality` | Signal registry (MB Cursor) | `@/server/signals/mb/cursor/s-decision-latency-quality` | scoring | signal(不是字段) |

**常见混淆**:
- `decisionSummary`(Submission 字段,V5.2+)≠ `getDecisionSummary()`(store method)
- `decisionStyle` / `decisionLatencyQuality`**是 signal 名**,不是字段名

### Reflection 系列(MC + SelfAssess)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5ModuleCSubmission.answers[].answer` | Shared MC | `@codelens-v5/shared/types/v5-mc` | MC Emma + sReflectionDepth signal | MC 对话中候选人回答内容 |
| `V5SelfAssessSubmission.reflection` | Shared SelfAssess | `@codelens-v5/shared/types/v5-self-assess` | sReflectionDepth + sMetaCognition signals | 自评反思文本 |
| `sReflectionDepth` | Signal registry (MC) | `@/server/signals/mc/s-reflection-depth` | scoring | 反思深度 signal(综合 MC + SE) |

**常见混淆**:
- `reflection`(SelfAssess 字段)≠ MC answer(字段是 `answers[].answer`)
- `reflectionDepth`**是 signal**,不是字段

### Scheme 系列(MA Round 1)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5MASubmission.round1.schemeId` | Shared MA | `@codelens-v5/shared/types/v5-ma` | sSchemeJudgment signal | 候选人选的方案 id (A / B / C) |
| `V5MASubmission.round1.reasoning` | Shared MA | `@codelens-v5/shared/types/v5-ma` | sReasoningDepth signal | 选方案的推理 |
| `ExamModule(MA).round1.schemes` | Shared ExamModule | `@codelens-v5/shared/types/v5-exam-module` | Task prompt | 3 个方案的 pros/cons 数据 |
| `sSchemeJudgment` | Signal registry | `@/server/signals/ma/s-scheme-judgment` | scoring | 方案判断准确度 signal |

### Challenge 系列(MA Round 1 / MB)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5MASubmission.round1.challengeResponse` | Shared MA | `@codelens-v5/shared/types/v5-ma` | sArgumentResilience signal | 候选人对 system challenge 的回应 |
| `ExamModule(MA).round1.challengeText` | Shared ExamModule | `@codelens-v5/shared/types/v5-exam-module` | Task prompt | 系统对候选人方案的挑战文字 |
| `sChallengeComplete` | Signal registry (**MB**) | `@/server/signals/mb/stage2-quality/s-challenge-complete` | scoring | **注意:这是 MB 的,不是 MA 的!**MB testPassRate |

**常见混淆**:
- `challengeResponse`(MA R1 字段)和 `sChallengeComplete`(MB signal) **不相关**,是不同模块的不同东西!

### Audit 系列(MB Stage 4)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5MBSubmission.audit.violations[]` | Shared MB | `@codelens-v5/shared/types/v5-mb` | sRuleEnforcement signal | 候选人对 3 个 AI 执行结果的标注 |
| `V5MBSubmission.audit.violations[].markedAsViolation` | — | — | — | 候选人判断是否违规 |
| `V5MBSubmission.audit.violations[].violatedRuleId` | Shared MB | `@codelens-v5/shared/types/v5-mb` | sRuleEnforcement | 违规时选的 rule id(**在 audit 里,不在 example 上**) |
| `V5MBSubmission.audit.submittedAt` | ⚠️ **不存在** | — | — | Parent component 自己打 timestamp,不在 shared |
| `ExamModule(MB).violationExamples[].isViolation` | Shared (groundTruth) | `@codelens-v5/shared/types/v5-exam-module` | sRuleEnforcement | 正确答案(不给候选人) |
| `ExamModule(MB).violationExamples[].violatedRuleId` | Shared (groundTruth) | `@codelens-v5/shared/types/v5-exam-module` | sRuleEnforcement | 正确答案 rule id(不给候选人) |

### AI Orchestration 系列(MD + MB)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5ModuleDSubmission.aiOrchestrationPrompts[]` | Shared MD | `@codelens-v5/shared/types/v5-md` | sAiOrchestrationQuality signal | MD 候选人写的 AI 协调 prompts |
| `sAiOrchestrationQuality` | Signal registry (LLM whitelist) | `@/server/signals/md/s-ai-orchestration-quality` | scoring | LLM 判断的 AI orchestration 质量 |
| `MBCursorModeEvents`(chatEvents + diffEvents)| Shared MB | `@codelens-v5/shared/types/v5-mb` | sChatVsDirectRatio / sPromptQuality 等 | Cursor 模式事件 |

### Signal Result 系列(Round 3 重构 1)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `SignalResult.value` | Shared | `@codelens-v5/shared/types/v5-signals` | dimension aggregation | 信号值 0-1 scale |
| `SignalResult.evidence[]` | Shared | `@codelens-v5/shared/types/v5-signals` | Report Layer 2 UI | 证据列表,上限 5 条 |
| `SignalEvidence.source` | Shared | `@codelens-v5/shared/types/v5-signals` | — | 证据来源路径 |
| `SignalEvidence.excerpt` | Shared | `@codelens-v5/shared/types/v5-signals` | — | 原文片段(≤200 字符) |
| `SignalEvidence.contribution` | Shared | `@codelens-v5/shared/types/v5-signals` | — | 对 value 的贡献(可正可负) |
| `SignalEvidence.triggeredRule` | Shared | `@codelens-v5/shared/types/v5-signals` | — | 规则名(如 `has_quantitative_marker`) |
| `SignalResult.algorithmVersion` | Shared | `@codelens-v5/shared/types/v5-signals` | — | 如 `sArgumentResilience@v1` / `@v1_llm` / `@v1_fallback` |

### Grade 系列(Round 3 重构 2)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `GradeDecision.grade` | Shared | `@codelens-v5/shared/types/v5-grade` | Report Hero | V5Grade enum |
| `GradeDecision.composite` | Shared | `@codelens-v5/shared/types/v5-grade` | Report Hero | 0-100 scale |
| `GradeDecision.dimensions` | Shared | `@codelens-v5/shared/types/v5-grade` | Report Radar | Record<V5Dimension, number> 0-100 |
| `GradeDecision.confidence` | Shared | `@codelens-v5/shared/types/v5-grade` | Report Hero | 'high' / 'medium' / 'low' |
| `GradeDecision.boundaryAnalysis` | Shared | `@codelens-v5/shared/types/v5-grade` | Report Hero | 升降档距离分析 |
| `GradeDecision.reasoning` | Shared | `@codelens-v5/shared/types/v5-grade` | Report Hero | 人类可读说明 |
| `GradeDecision.dangerFlag` | Shared | `@codelens-v5/shared/types/v5-grade` | Report Hero | B- 警告(AI 依赖症) |
| `V5_GRADE_COMPOSITE_THRESHOLDS` | Shared | `@codelens-v5/shared/types/v5-grade` | scoring | D=0/C=45/B=55/B+=65/A=75/S=85/S+=90 |

### Capability Profile 系列(Round 3 重构 4)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `CapabilityProfile.id` | Shared | `@codelens-v5/shared/types/v5-scoring` | scoring / report | 4 个 profile id |
| `CapabilityProfile.score` | Shared | `@codelens-v5/shared/types/v5-scoring` | Report Hero | 0-100 |
| `CapabilityProfile.label` | Shared | `@codelens-v5/shared/types/v5-scoring` | Report Hero | '自主'/'熟练'/'有潜力'/'待发展' |
| `CapabilityProfile.dimensionBreakdown` | Shared | `@codelens-v5/shared/types/v5-scoring` | Report Layer 2 | 展开时显示权重贡献 |
| `CapabilityProfile.evidenceSignals[]` | Shared | `@codelens-v5/shared/types/v5-scoring` | Report Layer 2 | 3-5 个支撑 signal id |
| `CAPABILITY_PROFILE_DEFINITIONS` | Shared | `@codelens-v5/shared/types/v5-scoring` | scoring | 4 profile 的权重 + 模板 |

### Cursor Behavior 系列(Round 2 Part 3 调整 5)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `CursorBehaviorLabel.label` | Shared(Task 17 从 client 迁过来) | `@codelens-v5/shared/types/v5-scoring` | Report Hero | '深思熟虑型'/'熟练接受型'/'快速粘贴型'/'无序混乱型' |
| `CursorBehaviorLabel.summary` | Shared | `@codelens-v5/shared/types/v5-scoring` | Report | 3-5 行 summary |
| `CursorBehaviorLabel.evidenceSignals[]` | Shared | `@codelens-v5/shared/types/v5-scoring` | Report | 支撑 signal id |
| `computeCursorBehaviorLabel` | **V5.1 deferred**,V5.0 orchestrator 返 undefined | — | — | 实现未做 |

### V5ScoringResult 系列(Task 17 新建)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5ScoringResult` (全部 fields) | Shared(Task 17 新建) | `@codelens-v5/shared/types/v5-scoring` | scoreSession 返回 + Report UI 消费 | 含 grade + composite + dimensions + confidence + boundaryAnalysis + reasoning + dangerFlag + signals + capabilityProfiles + cursorBehaviorLabel |
| `ScoreSessionInput` (flat input) | Shared(Task 17 新建) | `@codelens-v5/shared/types/v5-scoring` | scoreSession 参数 + Golden Path fixture | 含 session + submissions + examData + participatingModules + suiteId |

### Legacy Scoring Result(V3/V4 兼容)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `ScoringResult` (legacy, V3 shape) | Shared | `@codelens-v5/shared/types/scoring` | V3/V4 archive 代码 | **勿和 V5ScoringResult 混淆!V5 code 不用这个** |

## 使用规则

### 写 Task brief 前 Claude 必做:

1. **识别 brief 里引用的字段** — grep 本文件
2. 每个字段 confirm:
   - 归属(shared 哪个文件 / ExamModule 哪个 module / client store / ...)
   - **精确 canonical 名称**
   - **Import path**(Frontend / Backend 都能用得上)
   - 消费方(write / read 分别)
3. 若本文件和 brief 里引用的名字**有任何 ambiguity**,**stop-for-Steve-clarification**

### Backend / Frontend agent pre-verify 必做:

1. Grep shared 源码,对比 brief 里的字段名
2. Grep import path 看 actual module name 和本文件对齐
3. 若发现 mismatch:
   - 轻微(brief 简写 vs canonical): 按 canonical 执行,PR 说明
   - 严重(字段不存在 / 位置错 / import path 错): **stop-for-clarification**

### Task 完成后 Claude 必做:

1. 若本次 Task 涉及**新 shared field**,追加到本文件(含 import path)
2. 若 observations 里标注 Pattern C:**立即更新本文件对应条目**

## 本文件更新纪律

- 任何 shared type 变动 → 本文件同步
- 任何 Task 里发现的 field naming 混淆 → 本文件补充混淆案例
- V5.1 开发时继承本文件,继续扩展
