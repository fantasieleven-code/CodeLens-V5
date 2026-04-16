# CodeLens V5

## 当前版本
CodeLens V5 is the current and only version. V3/V4 are archived in the V4 repository (`legacy/v4` branch).

## 核心架构
- **统一 BusinessScenario**: 所有模块基于同一个业务场景贯穿
- **套件化**: 5 个套件（full_stack / architect / ai_engineer / quick_screen / deep_dive）
- **Cursor 模式 MB**: 多文件 Monaco + AI Chat + Inline Completion
- **6 维度评分**: technicalJudgment / aiEngineering / systemDesign / codeQuality / communication / metacognition
- **40 信号**: 37 纯规则 + 3 LLM 白名单（仅 MD）

## 目录规范
- 服务端：`packages/server/src/` 无版本前缀
- 客户端：`packages/client/src/` 无版本前缀
- 共享：`packages/shared/src/` 类型定义和常量
- 信号：`packages/server/src/signals/{p0,ma,mb,md,se,mc}/` 每个信号独立文件
- 出题：`packages/server/src/exam-generator/` 按 step 拆分

## 关键规则
1. 每个信号一个文件，通过 SignalRegistry 注册
2. Sandbox 通过 SandboxProvider 抽象（E2B → Docker → Static 三级降级）
3. AI 调用通过 ModelProvider 抽象
4. 数据契约在 `@codelens-v5/shared/types`，client 和 server 共享
5. EventBus 作为核心调度，socket handler 只 emit event

## V4 历史归档
```
git clone https://github.com/fantasieleven-code/tech-assessment
git checkout legacy/v4
```

## 开发流程
1. Phase 0: 基建 1-8（12 天）
2. Phase 1: 出题引擎 + P0 + MA（8 天）
3. Phase 2: MB with Cursor mode（18 天）
4. Phase 3: MD（3 天）
5. Phase 4: Golden Path + 收尾（5 天）
