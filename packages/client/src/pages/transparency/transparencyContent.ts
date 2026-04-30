/**
 * Transparency page bilingual copy (Task A15 · V5.0 A-series #8).
 *
 * Public-facing policy doc at `/transparency` (no auth, no Guard). Mirrors
 * the bilingual-inline zh+en β pattern established by consentContent.ts,
 * profileContent.ts, and selfViewContent.ts. Per A15 Phase 1 ratify D2,
 * signal-count literal is "48 · 45 pure-rule + 3 LLM whitelist" — the
 * post-A14a framing. The report trailer copy was reconciled in the
 * signal-count content-only pass, so public page + report trailer now agree.
 *
 * Copy tone follows ReportTransparencyFooter.tsx:
 *   · "设计目标 / 持续校准", not "validated / proven"
 *   · candidate + HR symmetric narrative
 *   · professional + sympathetic, avoids legal-contract register
 */

import type {
  BilingualParagraphs,
  BilingualText,
} from '../../lib/bilingual.js';

export type TransparencySectionId =
  | 'introduction'
  | 'methodology'
  | 'ethics'
  | 'data-usage'
  | 'candidate-rights'
  | 'reviewer-guidance'
  | 'contact';

export interface TransparencySection {
  readonly id: TransparencySectionId;
  readonly title: BilingualText;
  readonly body: BilingualParagraphs;
}

export interface TransparencyContent {
  readonly pageTitle: BilingualText;
  readonly tocLabel: BilingualText;
  readonly backLabel: BilingualText;
  readonly sections: readonly TransparencySection[];
  readonly footer: {
    readonly versionLabel: BilingualText;
    readonly version: string;
    readonly updatedLabel: BilingualText;
    readonly updatedAt: string;
  };
}

export const TRANSPARENCY_CONTENT: TransparencyContent = {
  pageTitle: {
    zh: 'CodeLens 透明度声明',
    en: 'CodeLens Transparency Statement',
  },
  tocLabel: { zh: '目录', en: 'Table of contents' },
  backLabel: { zh: '返回', en: 'Back' },
  sections: [
    {
      id: 'introduction',
      title: { zh: '概述', en: 'Overview' },
      body: {
        zh: [
          'CodeLens 是面向 AI 时代的工程判断力评估平台。我们通过 Module A/B/C/D 模块以及自我评估,从技术判断、AI 协作、系统设计、代码质量、沟通、元认知六个维度观察候选人的工作方式。',
          '这份公开页面说明我们如何评估、使用哪些数据、以及你作为候选人拥有哪些权利。我们希望把这些说清楚,让候选人和招聘方都能在相同的前提下使用这份报告。',
        ],
        en: [
          'CodeLens is an engineering-judgment assessment platform built for the AI era. Through Module A/B/C/D and self-assessment we observe how candidates work across six dimensions: technical judgment, AI collaboration, system design, code quality, communication, and metacognition.',
          'This public page explains how we assess, what data we use, and what rights you have as a candidate. We want both candidates and hiring teams to work from the same understanding when reading a report.',
        ],
      },
    },
    {
      id: 'methodology',
      title: { zh: '评估方法', en: 'Scoring methodology' },
      body: {
        zh: [
          '我们从候选人的考试行为中提取 48 个信号。其中 45 个通过纯规则算法计算,在相同输入下 100% 确定性(由 A14a 自动化 CI 测试守门);另 3 个是 LLM 白名单信号(MD 系统设计模块),用于开放式判断,我们对其 variance 做监控。',
          '48 信号汇总为 6 个维度分数,分数阈值决定 grade(S / A / B / C / D)。同时,基于维度数据,我们生成 4 个能力画像:独立交付能力、AI 协作、系统思维、学习敏捷度,每个画像标记为"自主 / 熟练 / 有潜力 / 待发展"之一。',
          '我们不在本页公开具体信号列表和阈值——这部分属于企业订阅的 HR 后台视图。此设计的目的是防止候选人 gaming 评估,同时让企业看到 evidence trace 做出负责任的招聘判断。',
        ],
        en: [
          'We extract 48 signals from candidate exam behavior. 45 are computed via pure-rule algorithms and are 100% deterministic under identical input (gated by automated CI via Task A14a). 3 are LLM whitelist signals (MD system-design module) for open-ended judgment, with variance monitoring in place.',
          'The 48 signals aggregate into 6 dimension scores. Thresholds on those scores determine the grade (S/A/B/C/D). In parallel, the dimension data generates 4 capability profiles: Independent Delivery, AI Collaboration, System Thinking, Learning Agility — each marked as one of Autonomous / Proficient / Has Potential / Needs Development.',
          'We do not publish specific signal lists or thresholds on this page — that surface belongs to the enterprise HR admin view. The design intent is to prevent candidate gaming of the assessment while letting hiring teams see evidence trace to make responsible hiring judgments.',
        ],
      },
    },
    {
      id: 'ethics',
      title: { zh: '伦理底线', en: 'Ethics floor' },
      body: {
        zh: [
          '候选人可见:通过 HR 发给你的私人链接,你可以查看自己的四个能力画像(label)和六维度的相对强弱(强 / 中 / 弱)。你看不到 grade、composite、绝对分数、具体信号、dangerFlag——这是公平性设计,避免 over-interpretation 和 gaming。',
          '企业可见:企业 HR 和面试官看到 grade、composite、完整信号列表、evidence trace。企业无法通过任何渠道访问你的 private self-view URL——两条链接、两个 token、完全独立的 scope(Session.candidateToken 与 Session.candidateSelfViewToken 在 schema 层分离,后端 zod schema 对 candidate 响应加了 `.strict()` 拒绝任何越界字段)。',
          '对称承诺:我们不会 silently 扩大候选人视图边界,也不会 downgrade 企业视图。任何变更,本页会同步更新。',
        ],
        en: [
          'What the candidate sees: Through the private link your HR sends you, you can view your four capability profiles (labels) and the six-dimension relative strength (Strong/Medium/Weak). You cannot see grade, composite, absolute scores, specific signals, or dangerFlag — this is a fairness design to prevent over-interpretation and gaming.',
          'What the company sees: Company HR and interviewers see grade, composite, the full signal list, and evidence trace. The company cannot access your private self-view URL through any channel — two links, two tokens, fully independent scope (Session.candidateToken and Session.candidateSelfViewToken are separate at the schema level, and the backend zod schema enforces `.strict()` on candidate responses to reject any out-of-scope field).',
          'Symmetric commitment: we will not silently expand the candidate view boundary, and we will not downgrade the company view. Any change will be reflected on this page.',
        ],
      },
    },
    {
      id: 'data-usage',
      title: { zh: '数据使用', en: 'Data handling' },
      body: {
        zh: [
          '你在评估中产生的数据包括:自我画像的 7 个字段、consent 记录、考试行为(提交内容、编辑时间线、语音追问记录)、自我评估答案。',
          '数据用途:仅用于生成本次评估报告。我们不会将原始答题内容用于模型训练,也不会在本次招聘流程以外的场景使用这些数据(除非你另有明确同意)。',
          '保留期:自 session 完成日起,候选人数据保留 12 个月;若法律或合规要求触及,保留期可适度延长。过期自动删除。',
          '你可以联系招聘方申请提前删除本次会话数据——详见下文"候选人权利"。',
        ],
        en: [
          'Data we record during assessment: the 7-field self profile, consent record, exam behavior (submissions, edit timeline, voice follow-up recordings), and self-assessment answers.',
          'Data usage: solely to generate this assessment report. We do not use raw responses as model training data, and we do not reuse this data outside the current hiring process (unless you explicitly consent).',
          'Retention: candidate data is retained for 12 months from session completion; retention may be extended when legal or compliance requirements apply. After expiration, data is auto-deleted.',
          'You may contact the hiring team to request early deletion of this session — see "Candidate rights" below.',
        ],
      },
    },
    {
      id: 'candidate-rights',
      title: { zh: '候选人权利', en: 'Candidate rights' },
      body: {
        zh: [
          '访问权:通过 HR 提供的 private self-view URL 查看你的能力画像;通过邮件申请查看完整数据,我们承诺 30 天内回复。',
          '修改权:自我画像字段可申请修改(由 HR 协助);考试行为数据不接受事后修改(完整性要求)。',
          '删除权:可申请删除全部个人数据,处理周期 30 天,已生成的评估报告会一并删除。',
          '投诉渠道:如果你认为评估不公或数据处理不当,可通过本页底部联系邮箱提出,我们承诺 14 天内首次回复。',
        ],
        en: [
          'Right to access: view your capability profile via the HR-provided private self-view URL; request full data access by email, with a response committed within 30 days.',
          'Right to rectification: self-profile fields can be modified on request (HR-assisted); exam-behavior data is not modifiable after the fact (integrity requirement).',
          'Right to erasure: request deletion of all personal data, processed within 30 days; generated assessment reports are deleted alongside.',
          'Complaint channel: if you believe the assessment is unfair or data handling is improper, contact us via the footer email below; we commit to a first response within 14 days.',
        ],
      },
    },
    {
      id: 'reviewer-guidance',
      title: { zh: '企业审阅者指南', en: 'Reviewer guidance' },
      body: {
        zh: [
          'grade 与 composite 是信号汇总的参考结果,不是个人能力的终局判断。它们应与 evidence trace 和结构化面试一起使用,不应孤立作为招聘依据。',
          '反对 over-reliance:我们推荐把 CodeLens 用作 preliminary screening、structured interview 的话题引导,或 hire/no-hire 决策的辅助输入,而非唯一依据。',
          'Evidence-first:每个信号都有 evidence(excerpt + triggeredRule)。决策时,请查看 evidence 了解数字背后的实际行为,不仅看分数。',
          '偏差警觉:信号基于候选人行为,不会自动 account 候选人背景、母语、技术栈偏好。reviewer 应主动校正这些因素,避免分数 mask 真实能力。',
        ],
        en: [
          'Grade and composite are aggregated reference signals, not final verdicts on ability. Use them together with evidence trace and structured interviews — not in isolation as a hiring gate.',
          'Against over-reliance: we recommend CodeLens as preliminary screening, structured-interview topic guidance, or hire/no-hire decision support — not as the sole input.',
          'Evidence-first: each signal carries evidence (excerpt + triggeredRule). When deciding, read the evidence to understand the behavior behind the number, not just the number.',
          'Bias awareness: signals track candidate behavior and do not automatically account for background, native language, or tech-stack preference. Reviewers should actively correct for these factors and not let scores mask true ability.',
        ],
      },
    },
    {
      id: 'contact',
      title: { zh: '联系方式', en: 'Contact' },
      body: {
        zh: [
          '合规与数据相关咨询:compliance@codelens.example',
          '评估质量与 bug 反馈:feedback@codelens.example',
          '公平性与伦理投诉:ethics@codelens.example',
        ],
        en: [
          'Compliance and data queries: compliance@codelens.example',
          'Assessment quality and bug reports: feedback@codelens.example',
          'Fairness and ethics complaints: ethics@codelens.example',
        ],
      },
    },
  ],
  footer: {
    versionLabel: { zh: '版本', en: 'Version' },
    version: 'V5.0.0',
    updatedLabel: { zh: '更新于', en: 'Last updated' },
    updatedAt: '2026-04-22',
  },
};
