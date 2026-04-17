# V5 Design Clarifications — Round 3(Four Structural Refactors)

> **文档作用**:本文件是 V5 设计的**第二层补丁**,建立在 `v5-design-clarifications.md`(Round 2)之上。定义 4 个结构性重构,提升 V5 从"可工作"到"可解释、可审计、可信任"。
>
> **冲突规则**:本文件 > Round 2 clarifications > `backend-agent-tasks.md` / `frontend-agent-tasks.md`。
>
> **适用范围**:V5.0 发布前的所有 Task。工期增量约 13-15 天,分散在 Task 4 / 10 / 13 / 19。
>
> **更新日期**:2026-04-17
> **触发背景**:V5.0 工期解锁后的深度优化讨论。三视角一致建议的 4 个根本性重构。

---

## 核心原则

V5.0 不是"AI 时代的评估工具",是"**AI 时代可解释、可审计、可信任的评估工具**"。

这个定位要求系统能:
1. 为每个分数提供证据(Evidence Trace)
2. 为每个评级提供置信度(Grade Confidence)
3. 为每道题提供质量门(Quality Gate)
4. 为候选人提供能力画像(Capability Profile)

四个重构合起来,是 V5.0 最大的护城河——竞品复制每个单点容易,复制"整体可解释性"极难。

---

# 重构 1:Evidence Trace(证据链可追溯)

## 问题

V5 当前的信号计算是 `compute(input) => number | null`。返回一个分数,但没说**为什么是这个分数**。

HR 看到 "sArgumentResilience = 0.85",没法回溯到候选人说的哪句话算出来的。

## 解决方案

SignalDefinition 的 compute 函数签名改为返回 `SignalResult`(非空值的情况)。

### 接口定义(packages/shared/src/types/v5-signals.ts 扩展)

```typescript
export interface SignalEvidence {
  /** 证据来源路径,如 'submissions.moduleA.round1.reasoning' / 'submissions.mb.editorBehavior.aiCompletionEvents[3]' */
  source: string;
  
  /** 原文片段或事件摘要,不超过 200 字符 */
  excerpt: string;
  
  /** 这条证据对最终分数的贡献(加到 value 上的分量,可正可负) */
  contribution: number;
  
  /** 命中了哪条规则(可选),如 'has_quantitative_marker' / 'stance_maintained' */
  triggeredRule?: string;
}

export interface SignalResult {
  value: number | null;
  evidence: SignalEvidence[];
  computedAt: number;
  algorithmVersion: string;  // 如 'sArgumentResilience@v1'
}

// SignalDefinition.compute 签名更新
export interface SignalDefinition {
  id: string;
  dimension: V5Dimension;
  moduleSource: string;
  isLLMWhitelist: boolean;
  weight?: number;
  compute: (input: SignalInput) => Promise<SignalResult>;  // 改
  fallback?: (input: SignalInput) => SignalResult;         // 改
}
```

### SignalRegistry.computeAll 返回值

```typescript
// 之前:Promise<Record<string, number | null>>
// 之后:
computeAll(input: SignalInput): Promise<Record<string, SignalResult>>;
```

向下兼容:下游聚合逻辑只需要 `result.value`。Evidence 只在报告 Layer 2 使用。

### 持久化

Session.metadata.signalResults 存所有 SignalResult:

```typescript
interface V5SessionMetadata {
  // ... 原有字段
  signalResults?: Record<string, SignalResult>;  // 新增
}
```

### 每个信号 compute 函数的 evidence 填充规则

**纯规则信号**:

每命中一条判定规则,加一条 evidence:
- `source`:规则读取的数据路径
- `excerpt`:被规则评估的原文片段(长度 > 200 时截断并加省略号)
- `contribution`:这条规则对 value 的加减分量
- `triggeredRule`:规则名

**LLM 白名单信号**(MD 的 3 个):

- 一条 evidence 来自 LLM 回复的"reasoning"字段(要求 LLM 输出 JSON 含 reasoning)
- `source`:`'llm_response.reasoning'`
- `triggeredRule`:`'llm_whitelist_judgment@<model>'`

### 证据上限

每个信号最多 5 条 evidence。超出时保留 contribution 绝对值最大的 5 条。

## 报告呈现(前端)

Layer 2 的 `signal-bars` section 每个信号增加可展开详情:

```
sArgumentResilience         ███████▓░  0.85  [展开证据]
  ↓ 展开后
  • 候选人说 "方案 B 的锁竞争在 1000QPS 下失败率 30%" 
    (MA R1 challengeResponse · 规则 has_quantitative_marker · +0.5)
  • 回答长度 127 字 
    (MA R1 challengeResponse · +0.2)
  • 提及 R1 原选择 schemeId=B 
    (MA R1 challengeResponse · 规则 maintains_stance · +0.15)
```

## 实施负责 Task

- **Task 13(信号实现)**:每个新实现的信号都按新签名返回 SignalResult。Task 13 总工期 +2 天(从 9 天升至 11 天,每信号 +30% 复杂度分摊)。
- **Task 4(SignalRegistry)**:框架支持 SignalResult,`computeAll` 返回类型改。Task 4 +1 天。
- **Task 2(前端报告 Section Registry)**:`signal-bars` section 支持 evidence 展开。Task 2 +1.5 天。

## 验收断言

Task 13 完成时:
```typescript
it('every signal returns SignalResult with evidence', async () => {
  const signals = signalRegistry.listSignals();
  const mockInput = loadFixture('full_stack/s-grade');
  
  for (const def of signals) {
    const result = await def.compute(mockInput);
    expect(result.value).toBeDefined();  // null 或 number
    expect(result.evidence).toBeInstanceOf(Array);
    expect(result.evidence.length).toBeLessThanOrEqual(5);
    expect(result.algorithmVersion).toMatch(/@v\d+$/);
    
    if (result.value !== null) {
      expect(result.evidence.length).toBeGreaterThan(0);  // 有值必须有证据
    }
  }
});
```

---

# 重构 2:Grade with Confidence(带置信度的可解释评级)

## 问题

V5 当前 gradeCandidate 是硬阈值 + 硬 floor 的离散决策。84.5 分降 A、85.0 分升 S——0.5 分决定终身。

信号噪声范围内的分差被当成 grade 差距,不科学。

## 解决方案

gradeCandidate 返回 `GradeDecision` 而不是 `{ grade, composite, dimensions }`。

### 接口定义(packages/shared/src/types/v5-grade.ts 新建)

```typescript
export type GradeConfidence = 'high' | 'medium' | 'low';

export interface GradeDecision {
  grade: V5Grade;
  composite: number;
  dimensions: Record<V5Dimension, number>;
  
  confidence: GradeConfidence;
  
  boundaryAnalysis: {
    /** 如果能升一级,升到什么 */
    nearestUpperGrade: V5Grade | null;
    /** composite 到 upper grade 阈值的距离,null 表示已是最高 */
    distanceToUpper: number | null;
    /** 升级被什么阻挡('composite < X' / 'aiEngineering < 80' / 'gradeCap') */
    blockingFactor: string | null;
    
    /** 降一级的参考分差 */
    nearestLowerGrade: V5Grade | null;
    distanceToLower: number | null;
  };
  
  /** 人类可读的一句话说明 */
  reasoning: string;
  
  /** 标记 dangerFlag(B- 警告) */
  dangerFlag?: {
    message: string;
    evidenceSignals: string[];
  };
}
```

### Confidence 计算规则

```typescript
function computeConfidence(
  composite: number,
  upperThreshold: number | null,   // null 表示已是最高 grade
  lowerThreshold: number | null,   // null 表示已是最低
  floorDistances: number[],         // 所有参与 floor 的距离,正数=达标,负数=未达标
): GradeConfidence {
  const compositeMargin = Math.min(
    upperThreshold != null ? upperThreshold - composite : Infinity,
    lowerThreshold != null ? composite - lowerThreshold : Infinity,
  );
  
  const minFloorMargin = floorDistances.length > 0 
    ? Math.min(...floorDistances.map(Math.abs))
    : Infinity;
  
  const minMargin = Math.min(compositeMargin, minFloorMargin);
  
  if (minMargin >= 5) return 'high';
  if (minMargin >= 3) return 'medium';
  return 'low';
}
```

### Reasoning 模板(按场景生成)

```typescript
function generateReasoning(decision: Omit<GradeDecision, 'reasoning'>): string {
  const { grade, composite, confidence, boundaryAnalysis } = decision;
  
  if (confidence === 'high') {
    return `composite ${composite.toFixed(1)} 远高于 ${grade} 阈值,所有维度 floor 均以 >=5 分余量通过。`;
  }
  
  if (boundaryAnalysis.blockingFactor && boundaryAnalysis.distanceToUpper !== null) {
    return `composite ${composite.toFixed(1)} 距 ${boundaryAnalysis.nearestUpperGrade} 阈值仅差 ${boundaryAnalysis.distanceToUpper.toFixed(1)} 分,被 ${boundaryAnalysis.blockingFactor} 阻挡,综合判断 ${grade} 更稳健。`;
  }
  
  return `composite ${composite.toFixed(1)},${grade} 评级,置信度 ${confidence}。`;
}
```

## 报告呈现

**Hero section** 从"S 强判断力 87.3/100"改为:

```
┌────────────────────────────────────┐
│  S · 高置信                        │
│  87.3 / 100                        │
│                                    │
│  composite 87.3 远高于 S 阈值 85, │
│  所有维度 floor 均以 >= 5 分余量通过 │
│                                    │
│  [推荐录用]                        │
└────────────────────────────────────┘
```

边界候选人(Steve 83.8 场景):

```
┌────────────────────────────────────┐
│  A · 中等置信 · 边界候选人         │
│  83.8 / 100                        │
│                                    │
│  距 S 仅差 1.2 分,codeQuality 78  │
│  低于 S floor 75 的余量仅 3 分,    │
│  综合判断 A 更稳健                  │
│                                    │
│  [推荐进入终面]                    │
└────────────────────────────────────┘
```

"边界候选人"标签让 HR 有 pause——**系统主动提示"这个案子你再看看"**。

## 实施负责 Task

- **Task 4(gradeCandidate)**:scoring.service 重写 gradeCandidate,输出 GradeDecision。Task 4 +2 天。
- **Task 2(前端报告)**:Hero section 重新设计,展示 confidence + reasoning。Task 2 +1 天。

## 验收断言

```typescript
it('grade decision includes confidence and reasoning', () => {
  const decision = gradeCandidate(signals, SUITES.full_stack);
  expect(decision.grade).toBeDefined();
  expect(decision.confidence).toMatch(/^(high|medium|low)$/);
  expect(decision.reasoning).toBeTruthy();
  expect(decision.boundaryAnalysis).toBeDefined();
});

it('boundary candidates (composite near threshold) get medium/low confidence', () => {
  const decision = gradeCandidate(simulateNearThreshold(), SUITES.full_stack);
  expect(decision.confidence).not.toBe('high');
  expect(decision.boundaryAnalysis.distanceToUpper).toBeLessThan(5);
});
```

---

# 重构 3:Question Quality Gates(三级题目质量门)

## 问题

V5 出题引擎 Step 0-8 一次性生成所有题目。Step 8 只做 8 条关键词一致性检查,无法检测"形式对、实质不对"的题目——比如 schemes 和 defects 信号重叠导致作弊、scaffold 依赖顺序不合理等。

## 解决方案

在 Step 8 之后增加两级质量门。

### Gate 1 — Automated Behavioral Check(自动化行为校验)

**原理**:Golden Path fixture 里有 S/A/B/C 四档"理想回答"。让这些 fixture **跑过新生成的题目**,看信号值是否符合预期分布。

**流程**(每道新生成的题):

```typescript
async function gate1BehavioralCheck(examInstance: ExamInstance): Promise<Gate1Result> {
  const fixtures = loadFixtures(examInstance.suiteId);  // 每档 1 份理想回答
  const results: Record<string, { expectedRange: [number, number]; actual: number; pass: boolean }> = {};
  
  for (const [grade, fixture] of fixtures.entries()) {
    const signals = await runSignalsOnFixture(examInstance, fixture);
    
    // S 级 fixture 必须拿到 >= 预期下限
    const expectations = FIXTURE_EXPECTATIONS[grade];
    for (const [signalId, range] of Object.entries(expectations)) {
      const actual = signals[signalId]?.value ?? 0;
      results[`${grade}_${signalId}`] = {
        expectedRange: range,
        actual,
        pass: actual >= range[0] && actual <= range[1],
      };
    }
  }
  
  const passCount = Object.values(results).filter(r => r.pass).length;
  const totalCount = Object.values(results).length;
  
  return {
    passed: passCount / totalCount >= 0.8,  // 80% 通过率才算合格
    details: results,
  };
}
```

**FIXTURE_EXPECTATIONS 示例**(定义在 `packages/server/src/exam-generator/fixture-expectations.ts`):

```typescript
const FIXTURE_EXPECTATIONS = {
  S: {
    sArgumentResilience: [0.85, 1.0],
    sSchemeJudgment: [0.8, 1.0],
    sCodeReviewQuality: [0.75, 1.0],
    // ... 关键信号
  },
  A: {
    sArgumentResilience: [0.6, 0.85],
    sSchemeJudgment: [0.65, 0.9],
    // ...
  },
  B: {
    sArgumentResilience: [0.3, 0.6],
    // ...
  },
  C: {
    sArgumentResilience: [0.0, 0.3],
    // ...
  },
};
```

**不过 Gate 1 的题目 regenerate**:

```typescript
if (!gate1Result.passed) {
  logger.warn(`Exam ${examInstance.id} failed Gate 1: ${passCount}/${totalCount}`);
  // 触发 regenerate(最多 3 次),每次替换失败的 step 输出
  if (retryCount < 3) {
    return generateExam(spec, retryCount + 1);
  }
  throw new Error(`Exam generation failed Gate 1 after 3 retries`);
}
```

### Gate 2 — Human Spot Check(人工抽检)

**原理**:每个 BusinessScenario 入题库前,Steve 或指定技术人员花 10 分钟 review。

**Checklist**(存在 `docs/v5-planning/human-review-checklist.md`):

```
□ 1. systemCode 是真实业务场景,不是假大空
□ 2. 三个 schemes 中没有明显最优(应有实质权衡)
□ 3. defects 和 schemes 的 cons 无实质重叠(候选人不能从 R2 直接推 R1 答案)
□ 4. scaffold 的文件拆分合理(不应一个文件解决全部)
□ 5. failureScenario 的 rootCause 和 challengePattern 精确匹配
□ 6. MD designTask 和原 scenario 相关但不重复
□ 7. migrationScenario(R4)和原 scenario 相关但不同(共享技术挑战维度,业务不同)
□ 8. 整体难度和 level 匹配(junior 题不能难成 senior)
```

### 存储

ExamInstance.metadata 新增 `humanReviews` 字段:

```typescript
interface ExamInstanceMetadata {
  // ... 原有字段
  gate1Result?: Gate1Result;
  gate1CompletedAt?: number;
  
  humanReviews?: Array<{
    reviewerId: string;        // Steve / 技术负责人
    reviewedAt: number;
    checklistPassed: boolean[]; // 长度 8,对应 checklist 8 项
    overallPassed: boolean;
    notes?: string;
    version: number;            // 第几次 review(如果第一次失败 regenerate 后再 review)
  }>;
  
  /** 只有 gate1Result.passed && 最新 humanReview.overallPassed 才为 true */
  readyForProduction?: boolean;
}
```

### Admin 工具

Admin UI 增加 "Pending Review" 页面(Task 15):

- 列表:所有 `readyForProduction === false` 的 ExamInstance
- 详情页:ExamInstance 内容 + 8 项 checklist 勾选框 + notes + 提交按钮
- 提交后更新 humanReviews 数组

## 实施负责 Task

- **Task 10(Step 1-8 Generator)**:Gate 1 在 Step 8 之后调用。Task 10 +2 天。
- **Task 15(Admin API)**:Gate 2 的 review 接口。Task 15 +1.5 天。
- **Task 19(题库生成)**:18 道题生成后,Steve 手动走 Gate 2,约 3 小时。
- **Task 17(Golden Path fixture)**:FIXTURE_EXPECTATIONS 定义。Task 17 +1 天。

## 验收断言

```typescript
it('newly generated exam passes Gate 1', async () => {
  const exam = await generateExam(sampleSpec);
  const gate1 = await gate1BehavioralCheck(exam);
  expect(gate1.passed).toBe(true);
});

it('exam not readyForProduction until human reviewed', async () => {
  const exam = await generateExam(sampleSpec);
  expect(exam.metadata.readyForProduction).toBe(false);
  
  await submitHumanReview(exam.id, { checklistPassed: Array(8).fill(true) });
  
  const updated = await fetchExam(exam.id);
  expect(updated.metadata.readyForProduction).toBe(true);
});
```

---

# 重构 4:Capability Profiles(能力画像)

## 问题

6 个维度(technicalJudgment / aiEngineering / codeQuality / systemDesign / communication / metacognition)是内部分类,HR 看不懂。

HR 真正想知道的是"这人能不能独立交付"、"AI 协作成熟度"、"系统思维"、"学习敏捷"——维度聚合到 grade 的过程中信息损失巨大。

## 解决方案

在 dimensions 和 grade 之间增加"能力画像"层。4 个画像是 2-3 个维度的加权聚合。

### 接口定义(packages/shared/src/types/v5-capability-profile.ts 新建)

```typescript
export type CapabilityProfileId = 
  | 'independent_delivery'   // 独立交付能力
  | 'ai_collaboration'       // AI 协作成熟度
  | 'system_thinking'        // 系统思维
  | 'learning_agility';      // 学习敏捷

export type CapabilityLabel = '自主' | '熟练' | '有潜力' | '待发展';

export interface CapabilityProfile {
  id: CapabilityProfileId;
  nameZh: string;
  nameEn: string;
  score: number;                          // 0-100
  label: CapabilityLabel;
  
  /** 依据的维度及其贡献权重 */
  dimensionBreakdown: Record<V5Dimension, number>;
  
  /** 最能说明该画像的 3-5 个信号 ID */
  evidenceSignals: string[];
  
  /** 人类可读描述,1-2 句 */
  description: string;
}

export const CAPABILITY_PROFILE_DEFINITIONS: Record<CapabilityProfileId, {
  nameZh: string;
  nameEn: string;
  dimensions: Partial<Record<V5Dimension, number>>;  // 权重,和为 1.0
  evidenceSignalIds: string[];
  descriptionTemplate: (label: CapabilityLabel) => string;
}> = {
  independent_delivery: {
    nameZh: '独立交付能力',
    nameEn: 'Independent Delivery',
    dimensions: {
      [V5Dimension.TECHNICAL_JUDGMENT]: 0.4,
      [V5Dimension.CODE_QUALITY]: 0.35,
      [V5Dimension.AI_ENGINEERING]: 0.25,
    },
    evidenceSignalIds: [
      'sSchemeJudgment',
      'sDiagnosisAccuracy',
      'sModifyQuality',
      'sCodeReviewQuality',
    ],
    descriptionTemplate: (label) => {
      switch (label) {
        case '自主': return '候选人能独立拿到需求、拆解、实现、验证,不需要被 handhold';
        case '熟练': return '候选人能完成大部分交付,偶尔需要方向指导';
        case '有潜力': return '候选人需要较多方向指导,但执行环节可靠';
        case '待发展': return '候选人当前独立交付能力不足,需要 mentor 同步跟进';
      }
    },
  },
  
  ai_collaboration: {
    nameZh: 'AI 协作成熟度',
    nameEn: 'AI Collaboration Maturity',
    dimensions: {
      [V5Dimension.AI_ENGINEERING]: 0.7,
      [V5Dimension.CODE_QUALITY]: 0.3,
    },
    evidenceSignalIds: [
      'sAiCompletionAcceptRate',
      'sDecisionLatencyQuality',
      'sPromptQuality',
      'sAiClaimDetection',
      'sChatVsDirectRatio',
    ],
    descriptionTemplate: (label) => {
      switch (label) {
        case '自主': return '候选人展现成熟的 AI 协作模式:审查 AI 输出,合理接受率,测试驱动,能识别 AI 胡说八道';
        case '熟练': return '候选人能高效使用 AI,大部分情况审查到位,偶有懒惰接受';
        case '有潜力': return '候选人使用 AI 有一定模式但缺少审查深度,需要培训';
        case '待发展': return '候选人的 AI 协作模式偏极端(全接受或全拒绝),这是 AI 时代的警示信号';
      }
    },
  },
  
  system_thinking: {
    nameZh: '系统思维',
    nameEn: 'System Thinking',
    dimensions: {
      [V5Dimension.SYSTEM_DESIGN]: 0.5,
      [V5Dimension.TECHNICAL_JUDGMENT]: 0.3,
      [V5Dimension.AI_ENGINEERING]: 0.2,
    },
    evidenceSignalIds: [
      'sDesignDecomposition',
      'sPrincipleAbstraction',
      'sReasoningDepth',
      'sTradeoffArticulation',
    ],
    descriptionTemplate: (label) => {
      switch (label) {
        case '自主': return '候选人能从业务场景推导技术架构,识别权衡,迁移场景仍能应用原则';
        case '熟练': return '候选人有系统视角,单场景下表现稳定,跨场景迁移略弱';
        case '有潜力': return '候选人当前更侧重实现,系统思维有基础但未成熟';
        case '待发展': return '候选人当前系统思维较弱,适合在明确框架下执行';
      }
    },
  },
  
  learning_agility: {
    nameZh: '学习敏捷',
    nameEn: 'Learning Agility',
    dimensions: {
      [V5Dimension.METACOGNITION]: 0.5,
      [V5Dimension.COMMUNICATION]: 0.3,
      [V5Dimension.TECHNICAL_JUDGMENT]: 0.2,
    },
    evidenceSignalIds: [
      'sBeliefUpdateMagnitude',
      'sReflectionDepth',
      'sMetaCognition',
      'sArgumentResilience',
    ],
    descriptionTemplate: (label) => {
      switch (label) {
        case '自主': return '候选人能面对质疑合理更新立场,有强元认知,学习曲线陡';
        case '熟练': return '候选人对自己的能力和局限有清晰认知,学习动机强';
        case '有潜力': return '候选人有一定自省能力,但受挑战时调整较慢';
        case '待发展': return '候选人当前自我认知偏差较大,需要反馈机制辅助';
      }
    },
  },
};
```

### Score → Label 映射

```typescript
function scoreToLabel(score: number): CapabilityLabel {
  if (score >= 80) return '自主';
  if (score >= 65) return '熟练';
  if (score >= 50) return '有潜力';
  return '待发展';
}
```

### 画像计算

```typescript
function computeCapabilityProfile(
  profileId: CapabilityProfileId,
  dimensions: Record<V5Dimension, number>,
): CapabilityProfile {
  const def = CAPABILITY_PROFILE_DEFINITIONS[profileId];
  
  let score = 0;
  let totalWeight = 0;
  const breakdown: Partial<Record<V5Dimension, number>> = {};
  
  for (const [dim, weight] of Object.entries(def.dimensions)) {
    const dimScore = dimensions[dim as V5Dimension] ?? 0;
    score += dimScore * weight;
    totalWeight += weight;
    breakdown[dim as V5Dimension] = dimScore * weight;
  }
  
  score = totalWeight > 0 ? score / totalWeight : 0;
  const label = scoreToLabel(score);
  
  return {
    id: profileId,
    nameZh: def.nameZh,
    nameEn: def.nameEn,
    score: Math.round(score * 10) / 10,
    label,
    dimensionBreakdown: breakdown as Record<V5Dimension, number>,
    evidenceSignals: def.evidenceSignalIds,
    description: def.descriptionTemplate(label),
  };
}

function computeAllProfiles(
  dimensions: Record<V5Dimension, number>,
  participatingDimensions: V5Dimension[],
): CapabilityProfile[] {
  const profileIds: CapabilityProfileId[] = [
    'independent_delivery',
    'ai_collaboration',
    'system_thinking',
    'learning_agility',
  ];
  
  return profileIds
    .map(id => computeCapabilityProfile(id, dimensions))
    .filter(p => {
      // 如果画像依赖的所有维度都不参与,跳过这个画像
      const def = CAPABILITY_PROFILE_DEFINITIONS[p.id];
      const allDimsAbsent = Object.keys(def.dimensions).every(
        dim => !participatingDimensions.includes(dim as V5Dimension)
      );
      return !allDimsAbsent;
    });
}
```

### 报告呈现

**Hero section 新布局**(Layer 1 最重要):

```
┌──────────────────────────────────────────────┐
│  S · 高置信                  87.3 / 100      │
│  composite 远高于 S 阈值 85                  │
├──────────────────────────────────────────────┤
│  能力画像                                    │
│                                              │
│  独立交付能力      █████████░  88  熟练      │
│  AI 协作成熟度     ██████████  94  自主      │
│  系统思维         ████░░░░░░  48  待发展    │
│  学习敏捷         ████████░░  82  熟练      │
│                                              │
│  [推荐进入终面]                              │
└──────────────────────────────────────────────┘
```

6 维度雷达图下移到 Layer 2 的 `radar` section,不再是主展示。

每个画像可点击展开,看:
- 依据的维度及权重(dimensionBreakdown)
- 支撑信号(evidenceSignals)每个的分数 + evidence(依赖重构 1)

### SUITES reportSections 更新

所有 suite 的 reportSections 新增 `capability-profiles` section,放在 `hero` 之后、`radar` 之前:

```typescript
// full_stack 例子
reportSections: [
  'hero',
  'capability-profiles',  // 新增
  'radar',                // 从主位降为次位
  'recommendation',
  'ma-detail',
  'mb-detail',
  'cursor-behavior-label',
  'mb-cursor-behavior',
  'mc-transcript',
  'dimensions',
  'signal-bars',
  'compliance',
],
```

所有 5 个 suite 都加 `capability-profiles`。

## 实施负责 Task

- **Task 4(scoring.service)**:computeAllProfiles 集成。Task 4 +1.5 天。
- **Task 2(前端报告)**:`capability-profiles` section 渲染。Task 2 +2 天。
- **Task 1 延伸(shared types)**:CapabilityProfile interface + CAPABILITY_PROFILE_DEFINITIONS 定义。**建议单独 PR**,因为 Frontend 需要消费。0.5 天。

## 验收断言

```typescript
it('scoring result includes 4 capability profiles', () => {
  const result = scoreSession(mockSession, SUITES.full_stack);
  expect(result.capabilityProfiles).toHaveLength(4);
  expect(result.capabilityProfiles.map(p => p.id)).toContain('independent_delivery');
  expect(result.capabilityProfiles.map(p => p.id)).toContain('ai_collaboration');
});

it('profile scores correctly aggregate from dimensions', () => {
  const dims = {
    technicalJudgment: 90,
    codeQuality: 80,
    aiEngineering: 70,
    // ...
  };
  const profile = computeCapabilityProfile('independent_delivery', dims);
  // 90*0.4 + 80*0.35 + 70*0.25 = 36 + 28 + 17.5 = 81.5
  expect(profile.score).toBeCloseTo(81.5, 1);
  expect(profile.label).toBe('自主');
});

it('profile with all dimensions missing is filtered out', () => {
  // quick_screen 不参与 systemDesign、communication
  const profiles = computeAllProfiles(dims, ['technicalJudgment', 'aiEngineering', 'codeQuality', 'metacognition']);
  // system_thinking 主要依赖 systemDesign,应该被过滤
  // 但 system_thinking 还依赖 technicalJudgment/aiEngineering,不应完全过滤
  // 验证过滤逻辑:只有"所有维度都不参与"才过滤
  const systemThinking = profiles.find(p => p.id === 'system_thinking');
  expect(systemThinking).toBeDefined();  // 有部分维度参与就不过滤
});
```

---

# 总工期增量

| Task | 原预算(Round 2 后) | Round 3 增量 | 新预算 |
|---|---|---|---|
| Task 1 延伸(shared types CapabilityProfile) | — | +0.5 | 0.5 天(独立小 PR) |
| Task 2(报告 Section Registry) | 3.5 | +4.5 | **8 天** |
| Task 4(gradeCandidate + SignalRegistry) | — | +4.5 | 4.5 天增量 |
| Task 10(Step 1-8 Generator) | 8 | +2 | **10 天** |
| Task 13(47 信号实现) | 9 | +2 | **11 天** |
| Task 15(Admin API) | 4.5 | +1.5 | **6 天** |
| Task 17(Golden Path fixture) | 5 | +1 | **6 天** |
| Task 19(题库生成) | 6 | +0(Steve 3 小时手动) | 6 天 |

**总增量**:约 16 天。V5.0 从 Round 2 的 14 周(+buffer 16 周)变为 **16 周(+buffer 18 周)**。

---

# 实施顺序和依赖

```
Phase 0(基建)            Task 1-8 完成
                          ↓
重构 4 shared types       新独立 PR(CapabilityProfile 定义)— 立即做
                          ↓
Task 4 扩展               重构 2 + 重构 4 的 scoring.service 实现
                          ↓
Phase 1(出题引擎)         Task 9-10 + 重构 3 Gate 1
                          ↓
Phase 2(模块+信号)        Task 11-15
                          - Task 13 信号实现时加重构 1 evidence
                          - Task 15 Admin API 加重构 3 Gate 2 review 接口
                          ↓
Phase 3(Golden Path)     Task 16-20
                          - Task 17 Golden Path 加重构 3 的 FIXTURE_EXPECTATIONS
                          - Task 19 题库生成后 Steve 手动走 Gate 2
                          ↓
Phase 4(收尾)             Task 21(加文档说明 4 个重构)
```

Frontend 侧的重构集中在 Task 2(报告 Section Registry),需要等 Backend Task 4 完成后启动。

---

# V5.0 发布 Gate 条件(基于四重构)

V5.0 发布必须满足:

1. **Evidence Trace**:所有 47 信号返回 SignalResult(evidence 非空)
2. **Grade Confidence**:gradeCandidate 返回 GradeDecision,confidence 分布合理(至少有 high/medium/low 三档在 Golden Path 中体现)
3. **Quality Gates**:18 个题库 100% 通过 Gate 1 + Gate 2
4. **Capability Profiles**:报告 Hero 区以画像为主展示,雷达图降为 Layer 2
5. 加上 Round 2 已定的 gate(Golden Path 跑通、真人校标)

---

# 使用本文件的规则

1. **本文件(Round 3)> Round 2 > 原 tasks 文档**。冲突以本文件为准。
2. 每个 Task 启动前,agent 必须读 Round 2 + Round 3 的对应 Part。
3. 任何对本文件内容的偏离(包括"我觉得这样更优雅"),必须停下报告 Steve。
4. 本文件不再改动。V5.0 scope 至此冻结。

---

**文件结束**
