# V5 Design Clarifications — Round 2 (Post 3-Perspective Review)

> **文档作用**:本文件是 V5 设计规格的**补丁层**,覆盖原 `v5-design-spec.md` / `backend-agent-tasks.md` / `frontend-agent-tasks.md` 中对应段落。
>
> **冲突规则**:如果本文件与其他文档内容冲突,**以本文件为准**。
>
> **适用范围**:V5.0 发布前的所有 Task。Task 编号与 `backend-agent-tasks.md` / `frontend-agent-tasks.md` 对齐。
>
> **更新日期**:2026-04-17
> **触发背景**:客户反馈 "V4 测 AI 太间接、浅尝辄止";Steve 决定 V5.0 直接上 Cursor 模式;三视角 review 提出 5 个 P0 能力补齐项。

---

## Part 1 — AI 时代 S/A/B/C 的权威定义(信号设计的锚点)

原 `v5-design-reference.md` 的 S/A/B/C 画像保留,但增加一个贯穿所有模块的核心原则:

**S 级本质**:在无限可用的 AI 能力面前,依然保持自己的判断作为最终锚点。具体三个特征:

1. **信号-噪声比极高**:每个决策携带量化、具体、可反驳的信息(数字、QPS、行号、函数名、权衡因素)
2. **可塑性**:面对追问会合理更新心智模型——既不固执也不投降
3. **AI-skepticism calibration**:信任但验证——能识别 AI 在胡说八道,但不盲目拒绝 AI

**这三个特征对应 V5.0 的 3 个能力补齐(Part 2 详述)**:
- 特征 2 → MC 加 `sBeliefUpdateMagnitude` + MA 加 R4 迁移验证
- 特征 3 → P0 加 "AI claim detection" 题
- 特征 1 → Cursor 行为加 decision latency(测"看了再接受" vs "不看就接受")

---

## Part 2 — V5.0 信号总数更新:43 → 47

**原 43 信号保持不变**,新增 4 个信号:

| 新增信号 | 模块 | 维度 | 计算方式 | 影响 Task |
|---|---|---|---|---|
| `sAiClaimDetection` | P0 | technicalJudgment | 纯规则 | Task 9, Task 13 |
| `sPrincipleAbstraction` | MA | technicalJudgment | 纯规则 | Task 13 |
| `sBeliefUpdateMagnitude` | MC | metacognition | 纯规则 | Task 11, Task 13 |
| `sDecisionLatencyQuality` | MB(Cursor) | aiEngineering | 纯规则 | Task 12, Task 13 |

**更新后各维度信号数量(给 CI 断言用)**:

```typescript
// packages/server/src/signals/__tests__/registry-assertions.test.ts
expect(signalRegistry.getDimensionSignals('technicalJudgment').length).toBe(9);  // 7+2
expect(signalRegistry.getDimensionSignals('aiEngineering').length).toBe(14);     // 13+1
expect(signalRegistry.getDimensionSignals('codeQuality').length).toBe(12);       // 不变
expect(signalRegistry.getDimensionSignals('communication').length).toBe(3);      // 不变
expect(signalRegistry.getDimensionSignals('metacognition').length).toBe(6);      // 5+1
expect(signalRegistry.getDimensionSignals('systemDesign').length).toBe(3);       // 不变
expect(signalRegistry.getSignalCount()).toBe(47);
```

LLM 白名单信号仍为 3 个,全在 MD。

---

## Part 3 — 5 项 P0 调整详述

### 调整 1:P0 模块加 "AI claim detection" 题(K-FIX-2 延伸)

**替换 `backend-agent-tasks.md` 第 47-53 行的 P0 信号表**,改为:

| 信号 | 维度 | 计算 |
|---|---|---|
| sBaselineReading | technicalJudgment | L1×0.2 + L2×0.3 + L3×0.5(3 层理解递进) |
| sAiCalibration | metacognition | 题1正确×0.25 + 题2正确×0.25 + 两题理由质量×0.5 |
| **sAiClaimDetection** (新) | **technicalJudgment** | **见下方计算规则** |
| sDecisionStyle | metacognition | 决策风格(保持 V4 逻辑) |
| sTechProfile | metacognition | 技术画像(V5.0 非评分,记录) |

**sAiClaimDetection 计算规则**:

```typescript
// 输入:候选人对 "AI 生成代码 + AI 解释" 的回应文本
// AI 解释里故意植入一个错误主张(比如 "使用了 WATCH/MULTI" 但代码里没 MULTI)

interface AiClaimDetectionInput {
  candidateResponse: string;       // 候选人的回答
  aiClaimedFeatures: string[];     // AI 解释里声明的特性(来自 Step 1 prompt 产出)
  actualFeatures: string[];        // 代码实际有的特性(来自 Step 1 prompt 产出)
  deceptivePoint: {
    claimedFeature: string;        // AI 声称的(比如 "MULTI")
    realityGap: string;            // 实际情况(比如 "only SET, no MULTI")
  };
}

function sAiClaimDetection(input: AiClaimDetectionInput): number {
  const response = input.candidateResponse.toLowerCase();
  
  // 1. 是否提到欺骗点(关键词命中)
  const mentionsDeception = 
    response.includes(input.deceptivePoint.claimedFeature.toLowerCase()) &&
    (response.includes('没有') || response.includes('missing') || 
     response.includes('其实') || response.includes('实际') ||
     response.includes('没看到') || response.includes('not'));
  
  // 2. 是否给出证据(引用行号/函数名)
  const hasEvidence = 
    /\b(line|行)\s*\d+/i.test(input.candidateResponse) ||
    input.actualFeatures.some(f => response.includes(f.toLowerCase()));
  
  // 3. 是否表达 calibrated skepticism(不是全盘否定 AI)
  const isCalibrated = 
    !/(ai.*全是错|ai.*都不对|ai.*胡说)/i.test(input.candidateResponse);
  
  if (mentionsDeception && hasEvidence && isCalibrated) return 1.0;
  if (mentionsDeception && hasEvidence) return 0.8;
  if (mentionsDeception && !hasEvidence) return 0.5;   // 察觉但没给证据
  if (!mentionsDeception && hasEvidence) return 0.3;    // 在看代码但没发现问题
  return 0.1;
}
```

**P0 新题目结构(Task 9 Step 1 Prompt 更新)**:

Step 1 的 `codeReadingQuestions` 之后新增 `aiClaimDetection` 字段:

```typescript
interface Step1Output_Updated {
  // ... 原有字段
  aiOutputJudgment: [...];  // 已有的 2 题(K-FIX-2)
  
  // 新增
  aiClaimDetection: {
    code: string;                  // AI 生成的代码(带欺骗点)
    aiExplanation: string;         // AI 的解释(包含错误主张)
    claimedFeatures: string[];     // 解释里声明的特性列表
    actualFeatures: string[];      // 代码实际的特性列表
    deceptivePoint: {
      claimedFeature: string;
      realityGap: string;
    };
  };
}
```

**Step 1 Prompt 增加段落**(Task 9 实现):

```
此外,请生成 1 段 "AI 生成代码 + AI 解释" 的测试题。

要求:
- 代码 20-40 行,实现 BusinessScenario 里的一个真实功能(如:订单扣减的幂等锁)
- AI 解释 3-5 句话,声称代码使用了 X/Y/Z 技术特性
- 其中 **1 个声称的特性实际代码里不存在**(比如声称用了 WATCH/MULTI 但代码只有 SET)
- 欺骗点必须微妙——看起来合理(如果不仔细看代码会相信),但代码里明确缺失
- 候选人需要指出 "你说用了 WATCH/MULTI 但代码里没看到 MULTI"

输出 aiClaimDetection 字段,包含:
- code: 代码
- aiExplanation: 解释文本
- claimedFeatures: 声称的特性数组(含欺骗点)
- actualFeatures: 实际特性数组(不含欺骗点)
- deceptivePoint.claimedFeature: 欺骗点对应的特性
- deceptivePoint.realityGap: 实际情况简述
```

**前端改动(Task 4 Phase0Page)**:

在原有 L1/L2/L3 + 2 题 AI 判断之后增加:

```
┌────────────────────────────────────────────────┐
│ AI 声明验证                                      │
│                                                │
│ 以下是 AI 生成的代码:                            │
│ [代码块]                                        │
│                                                │
│ AI 的解释:                                      │
│ "这段代码使用了 Redis 的 WATCH/MULTI 实现乐观    │
│  锁,利用 SET 设置 TTL 为 30s,..."              │
│                                                │
│ 请审查 AI 的解释是否和代码一致。如果发现不一致    │
│ 的地方,请具体指出。                             │
│                                                │
│ [textarea - candidate response]                │
│ [提交]                                          │
└────────────────────────────────────────────────┘
```

**data-testid**:
- p0-ai-claim-code
- p0-ai-claim-explanation
- p0-ai-claim-response
- p0-ai-claim-submit

**时间成本**:P0 总时长从 5 分钟变 7 分钟(原 5 分钟 + 新题 2 分钟)。可接受。

**V5Phase0Submission 类型更新**(Task 1 shared types):

```typescript
export interface V5Phase0Submission {
  codeReading: { l1Answer: string; l2Answer: string; l3Answer: string; confidence: number };
  aiOutputJudgment: Array<{ choice: 'A' | 'B' | 'both_good' | 'both_bad'; reasoning: string }>;
  
  // 新增
  aiClaimVerification: {
    response: string;           // 候选人的回答
    submittedAt: number;
  };
  
  decision: { choice: string; reasoning: string };
  inputBehavior?: Record<string, any>;
}
```

**V5Phase0Submission 已在 shared 定义**(Task 1 已 merged)。这里是追加字段,需要在 Task 11 的 P0 相关改动里同步加。

---

### 调整 2:MA 模块加 R4 迁移验证环节

**新增一轮 Round 4**,在原 R1/R2/R3 之后。

**`backend-agent-tasks.md` 第 55-66 行的 MA 信号表**更新为:

| 信号 | 维度 |
|---|---|
| sSchemeJudgment | technicalJudgment |
| sReasoningDepth | technicalJudgment |
| sContextQuality | technicalJudgment |
| sCriticalThinking | technicalJudgment |
| sArgumentResilience | technicalJudgment |
| sCodeReviewQuality | codeQuality |
| sHiddenBugFound | codeQuality |
| sReviewPrioritization | codeQuality |
| sDiagnosisAccuracy | technicalJudgment |
| **sPrincipleAbstraction**(新) | **technicalJudgment** |

**MA 总信号数从 9 → 10。**

**sPrincipleAbstraction 计算规则**:

```typescript
// 输入:候选人在 R4 迁移场景下的回答
interface PrincipleAbstractionInput {
  r1SchemeChoice: 'A' | 'B' | 'C';      // R1 选的方案
  r1Reasoning: string;                   // R1 的理由
  r4Response: string;                    // R4 迁移场景下的回答
  r4NewScenario: string;                 // R4 给的新场景描述
}

function sPrincipleAbstraction(input: PrincipleAbstractionInput): number {
  const response = input.r4Response;
  
  // 1. 是否识别"原则不变"(抽象层)
  const hasPrincipleStatement = 
    /(核心|原则|本质|根本|底层逻辑|关键是)/i.test(response) ||
    /(同样的|一样的|相同的).*(原则|思路|逻辑)/i.test(response);
  
  // 2. 是否识别"参数/实现变"(具体层)
  const hasParameterAdaptation = 
    /(不同|不一样|需要调整|参数.*变|阈值.*变|实现.*不同)/i.test(response) &&
    /(因为|由于|考虑到)/i.test(response);  // 有因果说明
  
  // 3. 长度门槛(S 级论证应有足够深度)
  const isSubstantive = response.length >= 100;
  
  // 4. 是否引用 R1 的 reasoning(显示跨场景连接)
  const referencesR1 = 
    response.includes(input.r1SchemeChoice) || 
    /(之前|前面|R1|第一轮|刚才)/i.test(response);
  
  // 复合判断
  if (hasPrincipleStatement && hasParameterAdaptation && isSubstantive && referencesR1) return 1.0;
  if (hasPrincipleStatement && hasParameterAdaptation && isSubstantive) return 0.85;
  if (hasPrincipleStatement && hasParameterAdaptation) return 0.7;
  if (hasPrincipleStatement || hasParameterAdaptation) return 0.4;
  return 0.15;
}
```

**MA R4 题目生成(Task 10 Step 2 Generator 扩展)**:

Step 2(原 schemes 生成)产出后增加 Step 2.5: `generateMigrationScenario`。

```typescript
// Step 2.5 输入
interface Step2_5Input {
  r1Scenario: BusinessScenario;
  r1Schemes: Step2Output['schemes'];
}

// Step 2.5 输出
interface Step2_5Output {
  migrationScenario: {
    newBusinessContext: string;    // 新场景描述(200-300 字)
    relatedDimension: string;      // 和原场景共享的维度(如"并发控制"、"一致性")
    differingDimension: string;    // 和原场景差异的维度(如"规模"、"容错需求")
    promptText: string;            // 给候选人的 R4 提问文本
  };
}

// Prompt 框架
`基于原 BusinessScenario 和 3 个方案,生成一个"相关但不同"的迁移场景。

原场景:{scenario.systemName} - {scenario.businessContext}
原方案:{schemes 摘要}

生成要求:
- 新场景的业务领域和原场景**不同**(订单→风控 / 支付→配送 / 物流→社交)
- 但核心挑战维度**有一个重叠**(如都涉及并发控制 / 都涉及一致性)
- 至少一个重要参数不同(规模、容错要求、延迟目标)

产出:
- newBusinessContext: 新场景的业务描述(200-300 字)
- relatedDimension: 和原场景共享的技术挑战
- differingDimension: 和原场景差异的关键维度
- promptText: 提问候选人的完整文本

提问文本模板:
"现在考虑一个类似的场景:{newBusinessContext}

你在前面的题目里选了方案 {r1.schemeId},理由是 {r1.reasoning 摘要}。

在这个新场景下:
1. 你的方案选择还成立吗?如果成立,底层原则是什么?
2. 具体实现层面,哪些参数或设计需要调整?为什么?

请结合前序思考展开回答。"
`
```

**前端改动(Task 5 ModuleAPage)**:

在 R3 之后增加 R4:

```
┌─────────────────────────────────────────────────┐
│ Round 4 — 迁移验证                              │
│                                                 │
│ 新场景:                                        │
│ {migrationScenario.newBusinessContext}         │
│                                                 │
│ 你在 Round 1 选的方案 {r1.schemeId},          │
│ 理由是:{r1.reasoning 前 100 字}...            │
│                                                 │
│ 在这个新场景下:                                │
│ 1. 你的方案选择还成立吗?底层原则是什么?        │
│ 2. 具体哪些参数/设计需要调整?为什么?          │
│                                                 │
│ [textarea - 至少 80 字]                         │
│                                                 │
│ [提交]                                         │
└─────────────────────────────────────────────────┘
```

**data-testid**:
- ma-r4-scenario-display
- ma-r4-reference-r1
- ma-r4-response
- ma-r4-submit

**MA 总时长**:原 R1/R2/R3 ≈ 12-15 分钟,新增 R4 ≈ 3-5 分钟,总时长 15-20 分钟。suite 预算仍在 full_stack 60 分钟内(因为 R3 的对比诊断部分可以压缩:原定 3-4 分钟,压到 2-3 分钟,差异由 R4 吸收)。

**V5ModuleASubmission 更新**:

```typescript
export interface V5ModuleASubmission {
  round1: { /* 不变 */ };
  round2: { /* 不变 */ };
  round3: { /* 不变 */ };
  
  // 新增
  round4: {
    response: string;
    submittedAt: number;
    timeSpentSec: number;
  };
}
```

**ExamModule (MA) moduleSpecific 更新**:

```typescript
interface MAModuleSpecific {
  round1: { /* 不变 */ };
  round2: { /* 不变 */ };
  round3: { /* 不变 */ };
  
  // 新增
  round4: {
    migrationScenario: {
      newBusinessContext: string;
      relatedDimension: string;
      differingDimension: string;
      promptText: string;
    };
  };
}
```

---

### 调整 3:MC 模块加 sBeliefUpdateMagnitude 信号

**不改变 MC 的模块流程**(仍是 5 轮追问,V4 已有),只**增加一个信号**。

**`backend-agent-tasks.md` 第 147 行的 MC 信号清单**更新:

从 `#### MC 模块(3 个):sBoundaryAwareness, sCommunicationClarity, sReflectionDepth`

改为:

```
#### MC 模块(4 个)
- sBoundaryAwareness: communication
- sCommunicationClarity: communication
- sReflectionDepth: metacognition
- sBeliefUpdateMagnitude(新): metacognition
```

**sBeliefUpdateMagnitude 计算规则**:

```typescript
// 输入:候选人在 MC contradiction round(Round 2)之后的所有轮次回答
interface BeliefUpdateInput {
  round2ChallengeText: string;      // Emma 在 Round 2 提出的挑战
  round2Response: string;           // 候选人对挑战的回应
  round3PlusResponses: string[];    // Round 3-5 的回答
  preModuleCStance: string;         // 候选人进入 MC 前最后一次核心决策的文本
                                    // (从 MA R1 reasoning 或 selfAssess 里提取)
}

function sBeliefUpdateMagnitude(input: BeliefUpdateInput): number {
  const r2 = input.round2Response;
  
  // 1. 是否有 belief-update 标记(承认自己某处有问题)
  const beliefUpdateMarkers = [
    '你说得对', '你提的对', '我没考虑到', '我之前没想到',
    '修正一下', '更准确地说', '更严谨地说', '我刚才用词不精确',
    '你这个问题很好', '确实', '的确是', '我承认',
    'fair point', 'good point', 'you are right'
  ];
  const hasBeliefUpdate = beliefUpdateMarkers.some(m => 
    r2.toLowerCase().includes(m.toLowerCase())
  );
  
  // 2. 是否 **同时** 捍卫核心立场(不是全盘放弃)
  const defenseMarkers = [
    '但是', '然而', '核心观点', '主要结论', '但我仍然',
    '在这个前提下', '从另一个角度', '不过',
  ];
  const defendsCore = defenseMarkers.some(m => r2.includes(m));
  
  // 3. 是否给出具体修正(不是笼统承认)
  const hasSpecificFix = 
    r2.length >= 80 &&
    (
      /(应该改为|可以改成|更好的是|修正为)/i.test(r2) ||
      /\d+/.test(r2)  // 有数字说明(如"5 秒改为 30 秒")
    );
  
  // 4. 后续 Round 3-5 是否体现了 update 后的新理解
  const subsequentCoherence = input.round3PlusResponses.some(r =>
    /(刚才的修正|基于 R2|沿着这个思路|在新的理解下)/i.test(r)
  );
  
  // 评分
  if (hasBeliefUpdate && defendsCore && hasSpecificFix && subsequentCoherence) return 1.0;
  if (hasBeliefUpdate && defendsCore && hasSpecificFix) return 0.85;
  if (hasBeliefUpdate && defendsCore) return 0.7;
  if (hasBeliefUpdate && !defendsCore) return 0.3;  // 全盘放弃立场,分低
  if (!hasBeliefUpdate && defendsCore) return 0.4;  // 固执不认错
  return 0.15;
}
```

**S 级参考**:Liam Zhu Round 3: *"第一,我在选方案 b 时更多的是定性分析,如果原子性更强,锁的边界条件多,但没有给出定量依据...第二,我应该明确列出..."* — 这段同时具备 belief-update("没有给出定量依据")+ defend core(仍选 B)+ specific fix(应该明确列出),应得 0.85+。

**前端改动**:无。MC 前端已有文字回答采集,不改 UI。

**后端改动(Task 11 MC 后端)**:
- `mc.service.ts` 在所有 5 轮完成后,调用 `computeBeliefUpdateMagnitude(session)` 并记入 signals
- 需要从 `session.metadata.submissions.moduleA.round1.reasoning` 和 `session.metadata.submissions.selfAssess.reflection` 里提取 `preModuleCStance`

---

### 调整 4:Cursor 行为加 sDecisionLatencyQuality + tab visibility

**这是 V5.0 最容易被忽略但 ROI 最高的调整。**

**`backend-agent-tasks.md` 第 101-105 行的 Cursor 行为信号表**更新为:

```
**Cursor 行为(aiEngineering)**:
- sAiCompletionAcceptRate: 反 U 曲线,50-70% 最优
- sChatVsDirectRatio: 30-50% 最优
- sFileNavigationEfficiency
- sTestFirstBehavior
- sEditPatternQuality
- sDecisionLatencyQuality(新): completion shown → accept/reject 的平均时长
```

**MB 总信号数从 17 → 18。aiEngineering 维度从 13 → 14。**

**sDecisionLatencyQuality 计算规则**:

```typescript
interface DecisionLatencyInput {
  completionEvents: Array<{
    timestamp: number;
    shown: boolean;
    accepted: boolean;
    rejected: boolean;
    shownAt?: number;           // 新:completion 显示时间
    respondedAt?: number;       // 新:accept 或 reject 的时间
    documentVisibleMs?: number; // 新:shown 到 responded 之间 tab 可见的毫秒数
  }>;
}

function sDecisionLatencyQuality(input: DecisionLatencyInput): number | null {
  // 只考虑既 shown 又 responded 的 completion,且至少部分时间 tab 是可见的
  const validEvents = input.completionEvents.filter(e =>
    e.shownAt && e.respondedAt && 
    (e.documentVisibleMs ?? (e.respondedAt - e.shownAt)) >= 100  // 至少 100ms 可见
  );
  
  if (validEvents.length < 5) return null;  // 样本太少
  
  // 计算每个 completion 的 "有效决策时间"(只算 tab 可见的部分)
  const latencies = validEvents.map(e => 
    e.documentVisibleMs ?? (e.respondedAt! - e.shownAt!)
  );
  
  // S 级特征:50% 以上的 latency 在 500-2000ms 区间
  //   <500ms:没看(要么反射性接受,要么反射性拒绝)
  //   500-2000ms:在读在想
  //   >2000ms:可能在做别的事(但 tab 可见所以不完全排除)
  //   >10000ms:异常,排除(虽然 tab 可见但可能 AFK)
  
  const usefulLatencies = latencies.filter(ms => ms <= 10000);
  if (usefulLatencies.length === 0) return null;
  
  const inGoodRange = usefulLatencies.filter(ms => ms >= 500 && ms <= 2000).length;
  const tooFast = usefulLatencies.filter(ms => ms < 500).length;
  const goodRangeRatio = inGoodRange / usefulLatencies.length;
  const tooFastRatio = tooFast / usefulLatencies.length;
  
  // 评分
  if (goodRangeRatio >= 0.5 && tooFastRatio <= 0.2) return 1.0;  // 大部分在思考
  if (goodRangeRatio >= 0.3 && tooFastRatio <= 0.4) return 0.7;
  if (tooFastRatio >= 0.7) return 0.2;                            // 大部分没看就决定
  return 0.4;
}
```

**V5MBSubmission.editorBehavior 更新(Task 1 shared types)**:

```typescript
editorBehavior: {
  aiCompletionEvents: Array<{
    timestamp: number;
    shown: boolean;
    accepted: boolean;
    rejected?: boolean;          // 新:显式 reject(用户按 Esc 或继续打字)
    lineNumber: number;
    completionLength: number;
    shownAt?: number;            // 新
    respondedAt?: number;        // 新
    documentVisibleMs?: number;  // 新
  }>;
  
  chatEvents: Array<{
    timestamp: number;
    prompt: string;
    responseLength: number;
    duration: number;
    diffShownAt?: number;        // 新:diff 展示给用户的时间
    diffRespondedAt?: number;    // 新:accept/reject 时间
    documentVisibleMs?: number;  // 新
  }>;
  
  // 新增顶级字段
  documentVisibilityEvents: Array<{
    timestamp: number;
    hidden: boolean;             // true = tab 被隐藏
  }>;
  
  // 其余字段不变
  diffEvents: [...];
  fileNavigationHistory: [...];
  editSessions: [...];
  testRuns: [...];
};
```

**前端改动(Task 1.2 B 类 TODO + Task 7.3 InlineCompletionProvider)**:

1. **`useBehaviorTracker.ts`** 新增 documentVisibility 追踪:

```typescript
useEffect(() => {
  const handleVisibilityChange = () => {
    trackEvent('document_visibility', {
      timestamp: Date.now(),
      hidden: document.hidden,
    });
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, []);
```

2. **`InlineCompletionProvider.tsx`** 更新:

```typescript
const shownAt = Date.now();
const startVisibilityState = !document.hidden;
let visibleMsAccumulated = 0;
let lastVisibleStart = startVisibilityState ? shownAt : null;

// 监听 visibility change 累计可见时间
const visibilityListener = () => {
  if (document.hidden && lastVisibleStart !== null) {
    visibleMsAccumulated += Date.now() - lastVisibleStart;
    lastVisibleStart = null;
  } else if (!document.hidden && lastVisibleStart === null) {
    lastVisibleStart = Date.now();
  }
};
document.addEventListener('visibilitychange', visibilityListener);

// 当用户 accept 或 reject 时:
function onResponse(accepted: boolean) {
  if (lastVisibleStart !== null) {
    visibleMsAccumulated += Date.now() - lastVisibleStart;
  }
  
  trackEvent('ai_completion_responded', {
    timestamp: Date.now(),
    shownAt,
    respondedAt: Date.now(),
    documentVisibleMs: visibleMsAccumulated,
    accepted,
  });
  
  document.removeEventListener('visibilitychange', visibilityListener);
}
```

3. **`AIChatPanel.tsx`** 同样逻辑用于 chat → diff accept/reject 的延迟追踪。

---

### 调整 5:报告 Layer 1 加 Cursor 行为标签

**不改 Cursor 行为信号的计算,只加一个展示层聚合。**

**`backend-agent-tasks.md` Task 15 Admin 报告数据 API** 新增字段:

```typescript
// GET /admin/reports/:sessionId/summary 响应体扩展
interface ReportSummary {
  grade: string;
  composite: number;
  dimensions: Record<string, number>;
  recommendation: string;
  
  // 新增
  cursorBehaviorLabel?: {
    label: '深思熟虑型' | '熟练接受型' | '快速粘贴型' | '无序混乱型';
    summary: string;          // 3-5 行小 summary
    evidenceSignals: string[];// 哪些信号支撑这个标签
  };
}
```

**标签计算规则**:

```typescript
function computeCursorBehaviorLabel(signals: Record<string, number | null>): CursorBehaviorLabel | null {
  const s = signals;
  
  // 必须 MB 参与才有此标签
  if (s.sAiCompletionAcceptRate == null) return null;
  
  const acceptRate = s.sAiCompletionAcceptRate;
  const chatRatio = s.sChatVsDirectRatio ?? 0;
  const testFirst = s.sTestFirstBehavior ?? 0;
  const decisionLatency = s.sDecisionLatencyQuality ?? 0.5;
  
  // 深思熟虑型 = S 级特征
  if (acceptRate >= 0.8 && decisionLatency >= 0.7 && testFirst >= 0.5) {
    return {
      label: '深思熟虑型',
      summary: '候选人展现了成熟的 AI 协作模式:AI 补全接受率控制在合理区间,每次接受前有明显思考时间,测试驱动意识强。能在 AI 辅助下保持自己的判断作为锚点。',
      evidenceSignals: ['sAiCompletionAcceptRate', 'sDecisionLatencyQuality', 'sTestFirstBehavior'],
    };
  }
  
  // 熟练接受型 = A 级特征
  if (acceptRate >= 0.6 && decisionLatency >= 0.4) {
    return {
      label: '熟练接受型',
      summary: '候选人对 AI 工具使用熟练,大部分 AI 输出直接使用,偶有修改。测试驱动意识中等。整体是合格的 AI 协作者,但对 AI 产出的审查深度有提升空间。',
      evidenceSignals: ['sAiCompletionAcceptRate', 'sChatVsDirectRatio'],
    };
  }
  
  // 快速粘贴型 = B 级特征
  if (acceptRate < 0.6 && decisionLatency < 0.4) {
    return {
      label: '快速粘贴型',
      summary: '候选人使用 AI 的模式偏向"快速接受",多数 completion 在短时间内被接受,缺少审查过程。这是 AI 时代工程师的警示信号——依赖 AI 但不审查 AI。',
      evidenceSignals: ['sAiCompletionAcceptRate', 'sDecisionLatencyQuality'],
    };
  }
  
  // 无序混乱型 = C 级特征
  return {
    label: '无序混乱型',
    summary: '候选人的 AI 协作行为缺乏明确模式:接受率偏极端,决策时间分布异常,测试意识薄弱。在真实工作场景下可能需要大量指导。',
    evidenceSignals: ['sAiCompletionAcceptRate', 'sDecisionLatencyQuality', 'sTestFirstBehavior'],
  };
}
```

**前端改动(Task 2 报告 Section Registry)**:

Layer 1 增加一个 `cursor-behavior-label` section,放在推荐结论之后、雷达图之前。UI 示例:

```
┌──────────────────────────────────────────┐
│ AI 协作风格:深思熟虑型                    │
│                                           │
│ 候选人展现了成熟的 AI 协作模式:AI 补全    │
│ 接受率控制在合理区间(68%),每次接受前    │
│ 平均思考 1.2 秒,测试驱动意识强。能在 AI  │
│ 辅助下保持自己的判断作为锚点。            │
│                                           │
│ 支撑信号:接受率 0.95 · 决策延迟 0.92    │
└──────────────────────────────────────────┘
```

full_stack / ai_engineer / deep_dive 套件的 `reportSections` 都加入 `cursor-behavior-label`(Task 3 SUITES 更新)。quick_screen 不加(信号量不足)。architect 不加(无 MB)。

---

## Part 4 — 时间线影响

**新增 P0 调整工作量**(对齐 `backend-agent-tasks.md` Task 9-15):

| Task | 原预算 | 新增工作 | 新预算 |
|---|---|---|---|
| Task 9 (Step 0 Prompt) | 4 天 | AI claim detection prompt 增强 + 迁移场景 prompt | **6 天** |
| Task 10 (Step 1-8 Generator) | 7 天 | Step 2.5 migration scenario 生成 | **8 天** |
| Task 11 (MC 后端) | 3 天 | sBeliefUpdateMagnitude 信号实现 | **4 天** |
| Task 12 (MB Cursor Endpoints) | 8 天 | visibility 事件流处理 | **8.5 天** |
| Task 13 (47 信号实现) | 7 天 | 4 个新信号(sAiClaim / sPrinciple / sBelief / sDecisionLatency)+ MB 标签算法 | **9 天** |
| Task 15 (Admin API) | 4 天 | cursor-behavior-label 字段 | **4.5 天** |

**Backend 总增量**:约 +7 天。原 62 天 → **69 天(约 14 周)**。

**Frontend 增量**:

| Task | 原预算 | 新增工作 | 新预算 |
|---|---|---|---|
| Task 1 B 类 TODO | 1-2 天 | useBehaviorTracker 加 visibility | **2 天** |
| Task 4 Phase0Page | 3 天 | AI claim detection UI | **4 天** |
| Task 5 ModuleAPage | 8 天 | R4 迁移验证 UI | **9 天** |
| Task 2 报告 Section Registry | 3 天 | cursor-behavior-label section | **3.5 天** |
| Task 7 MB Cursor 前端 | 12 天 | InlineCompletionProvider / AIChatPanel 的 latency tracking | **12.5 天** |

**Frontend 总增量**:约 +3 天。原 48 天 → **51 天(约 10.5 周)**。

**结论**:V5.0 整体时间从原 12 周(加 buffer 14 周)变为 **14 周(加 buffer 16 周)**。

---

## Part 5 — V5.0 测试基准更新

**Golden Path fixture 必须包含新信号的 S/A/B/C baseline**(Task 17):

新增 4 个信号的每档 baseline(参考 Liam / Steve 对比):

| 信号 | S 级(Liam 参考) | A 级(Steve 参考) | B 级 | C 级 |
|---|---|---|---|---|
| sAiClaimDetection | ≥0.85 | 0.5-0.8 | 0.2-0.4 | <0.2 |
| sPrincipleAbstraction | ≥0.85 | 0.6-0.8 | 0.3-0.5 | <0.3 |
| sBeliefUpdateMagnitude | ≥0.85 | 0.55-0.8 | 0.2-0.5 | <0.2 |
| sDecisionLatencyQuality | ≥0.85(500-2000ms 区间占 50%+) | 0.6-0.8 | 0.2-0.5 | <0.3 |

**两份参考报告的主观校标**(从上传 PDF):
- **Liam Zhu 87.3 / S**:MC Round 3 *"第一...第二..."* 结构化反思 + 量化论证("1000QPS","50 毫秒","30%") → sBeliefUpdateMagnitude ≈ 0.9
- **Steve 83.8 / A**:MC Round 2 *"抱歉,忘了大大大大大"* → sReflectionDepth 偏低(PDF 显示沟通清晰度 57%),sBeliefUpdateMagnitude 若做会 ≈ 0.3

**Golden Path 必须能把 Liam 和 Steve 分到 S 和 A**,这是 fixture 有效性的底线。

---

## Part 6 — 不做的事(V5.0 明确排除,避免 scope creep)

**三视角讨论过但决定推迟的项**:

1. **MC 语音/文字模式切换开关** → V5.1(先看客户反馈再做)
2. **sQuestionQuality(候选人反问质量)** → V5.1(需要真实数据定阈值)
3. **full_stack "include MD-mini" 可选开关** → V5.0 **暂不做**,维持原套件定义(避免 Admin 创建流程复杂化)
4. **Cursor chat 的 review duration 独立信号** → 合并进 sDecisionLatencyQuality,不单独建信号
5. **sEditPatternQuality 的算法优化** → V5.0 保持 Kendall Tau,V5.1 根据数据调整

---

## Part 7 — 给 CI 的断言(质量控制)

**Task 13 完成后必须跑这些断言**,否则 PR 不 merge:

```typescript
// packages/server/src/signals/__tests__/registry-assertions.test.ts
describe('Signal Registry Assertions (V5.0 Final)', () => {
  it('total signal count = 47', () => {
    expect(signalRegistry.getSignalCount()).toBe(47);
  });
  
  it('dimension breakdown', () => {
    expect(signalRegistry.getDimensionSignals('technicalJudgment').length).toBe(9);
    expect(signalRegistry.getDimensionSignals('aiEngineering').length).toBe(14);
    expect(signalRegistry.getDimensionSignals('codeQuality').length).toBe(12);
    expect(signalRegistry.getDimensionSignals('communication').length).toBe(3);
    expect(signalRegistry.getDimensionSignals('metacognition').length).toBe(6);
    expect(signalRegistry.getDimensionSignals('systemDesign').length).toBe(3);
  });
  
  it('LLM whitelist = 3', () => {
    const whitelist = signalRegistry.listSignals().filter(s => s.isLLMWhitelist);
    expect(whitelist.length).toBe(3);
    expect(whitelist.map(s => s.id).sort()).toEqual([
      'sAiOrchestrationQuality',
      'sDesignDecomposition',
      'sTradeoffArticulation',
    ]);
  });
  
  it('new P0 signals registered', () => {
    expect(signalRegistry.listSignals().find(s => s.id === 'sAiClaimDetection')).toBeDefined();
    expect(signalRegistry.listSignals().find(s => s.id === 'sPrincipleAbstraction')).toBeDefined();
    expect(signalRegistry.listSignals().find(s => s.id === 'sBeliefUpdateMagnitude')).toBeDefined();
    expect(signalRegistry.listSignals().find(s => s.id === 'sDecisionLatencyQuality')).toBeDefined();
  });
  
  it('all signals have dimension and compute function', () => {
    for (const def of signalRegistry.listSignals()) {
      expect(def.dimension).toBeDefined();
      expect(def.compute).toBeInstanceOf(Function);
      if (def.isLLMWhitelist) {
        expect(def.fallback).toBeInstanceOf(Function);
      }
    }
  });
});
```

---

## 使用本文件的规则

1. **Backend / Frontend Agent 每次 Task 启动前**:先读 `kickoff.md`,再读本文件对应 Task 的 Part。
2. **本文件不是可选参考,是权威规范**。如果和 `backend-agent-tasks.md` / `frontend-agent-tasks.md` 冲突,以本文件为准。
3. **任何对本文件内容的偏离**(包括"我觉得这样更合理"),必须先停下报告 Steve。
4. **本文件不再改动**。V5.0 scope 至此冻结。后续调整走 V5.1 路径。

---

**文件结束**
