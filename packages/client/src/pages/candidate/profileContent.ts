/**
 * Profile page bilingual copy (F-A12 · zh + en inline, mirrors consentContent).
 *
 * Error keys are the full CandidateApiErrorCode union so TypeScript enforces
 * coverage. GDPR field helps are one-line each (zh + en) per scope-reduce in
 * Phase 2 ratify — expanding to paragraphs is a V5.0.5 copy task.
 */

import type { CandidateApiErrorCode } from '../../services/candidateApi.js';
import type {
  CandidateCurrentRole,
  CandidateCompanySize,
  CandidateAiToolYears,
  CandidatePrimaryAiTool,
  CandidateDailyAiUsageHours,
} from '@codelens-v5/shared';

export interface BilingualText {
  readonly zh: string;
  readonly en: string;
}

export type ProfileFieldName =
  | 'yearsOfExperience'
  | 'currentRole'
  | 'primaryTechStack'
  | 'companySize'
  | 'aiToolYears'
  | 'primaryAiTool'
  | 'dailyAiUsageHours';

export interface ProfileContent {
  readonly pageTitle: BilingualText;
  readonly intro: BilingualText;
  readonly fieldLabels: Readonly<Record<ProfileFieldName, BilingualText>>;
  readonly fieldHelps: Readonly<Record<ProfileFieldName, BilingualText>>;
  readonly enumLabels: {
    readonly currentRole: Readonly<
      Record<CandidateCurrentRole, BilingualText>
    >;
    readonly companySize: Readonly<
      Record<CandidateCompanySize, BilingualText>
    >;
    readonly aiToolYears: Readonly<
      Record<CandidateAiToolYears, BilingualText>
    >;
    readonly primaryAiTool: Readonly<
      Record<CandidatePrimaryAiTool, BilingualText>
    >;
    readonly dailyAiUsageHours: Readonly<
      Record<CandidateDailyAiUsageHours, BilingualText>
    >;
  };
  readonly techStackPlaceholder: BilingualText;
  readonly techStackHint: BilingualText;
  readonly submit: BilingualText;
  readonly submitting: BilingualText;
  readonly errors: Readonly<Record<CandidateApiErrorCode, BilingualText>>;
  readonly urlMissingToken: BilingualText;
}

export const PROFILE_CONTENT: ProfileContent = {
  pageTitle: {
    zh: '答题前的技术背景',
    en: 'Your technical context before the exam',
  },
  intro: {
    zh: '以下 7 个字段用于为你的评估校准基线。提交后会直接进入答题环节。',
    en: 'The 7 fields below calibrate baseline for your assessment. You enter the exam immediately after submitting.',
  },
  fieldLabels: {
    yearsOfExperience: { zh: '总编程年数', en: 'Years of programming experience' },
    currentRole: { zh: '当前角色', en: 'Current role' },
    primaryTechStack: { zh: '主要技术栈 (2-5 项)', en: 'Primary tech stack (2-5 items)' },
    companySize: { zh: '公司规模', en: 'Company size' },
    aiToolYears: { zh: '使用 AI 编程工具的年数', en: 'Years using AI coding tools' },
    primaryAiTool: { zh: '主要使用的 AI 工具', en: 'Primary AI tool' },
    dailyAiUsageHours: { zh: '每日 AI 协作时长', en: 'Daily AI collaboration hours' },
  },
  fieldHelps: {
    yearsOfExperience: {
      zh: '用于判断 AI 协作成熟度 baseline · 不作为性别 / 年龄 / 国籍 proxy。',
      en: 'Calibrates AI-collaboration baseline · not used as proxy for gender / age / nationality.',
    },
    currentRole: {
      zh: '用于匹配合适的 suite · 选项不代表优劣 · 选"其他"完全 OK。',
      en: 'Used to match the appropriate suite · options are not a hierarchy.',
    },
    primaryTechStack: {
      zh: '用于代码评审 baseline · 不共享给第三方 · 不推断薪资。',
      en: 'Used for code-review baseline · not shared with third parties · not for salary inference.',
    },
    companySize: {
      zh: '用于理解你的工程上下文 · 不推断薪资或公司名称。',
      en: 'Used to understand engineering context · not for salary or company-name inference.',
    },
    aiToolYears: {
      zh: '用于理解你的 AI 工作流成熟度 · 不推断技能水平。',
      en: 'Used to understand AI workflow maturity · not for skill-level inference.',
    },
    primaryAiTool: {
      zh: '用于理解你的工具偏好 · 不推断厂商绑定。',
      en: 'Used to understand tool preference · not for vendor-lock inference.',
    },
    dailyAiUsageHours: {
      zh: '用于 AI 协作 frequency baseline · 不推断工作强度或考勤。',
      en: 'Calibrates AI-collaboration frequency · not for work-intensity or attendance inference.',
    },
  },
  enumLabels: {
    currentRole: {
      frontend: { zh: '前端', en: 'Frontend' },
      backend: { zh: '后端', en: 'Backend' },
      fullstack: { zh: '全栈', en: 'Full-stack' },
      mobile: { zh: '移动端', en: 'Mobile' },
      data: { zh: '数据 / 算法', en: 'Data / ML' },
      devops: { zh: 'DevOps / SRE', en: 'DevOps / SRE' },
      engineering_manager: { zh: '工程经理', en: 'Engineering manager' },
    },
    companySize: {
      startup: { zh: '< 20 人 (初创)', en: '< 20 (startup)' },
      small: { zh: '20-100 人', en: '20-100' },
      medium: { zh: '100-500 人', en: '100-500' },
      large: { zh: '500-5000 人', en: '500-5000' },
      enterprise: { zh: '5000+ 人', en: '5000+' },
    },
    aiToolYears: {
      0: { zh: '不到 1 年', en: 'Less than 1 year' },
      1: { zh: '1 年', en: '1 year' },
      2: { zh: '2 年', en: '2 years' },
      3: { zh: '3 年以上', en: '3+ years' },
    },
    primaryAiTool: {
      claude_code: { zh: 'Claude Code', en: 'Claude Code' },
      cursor: { zh: 'Cursor', en: 'Cursor' },
      copilot: { zh: 'GitHub Copilot', en: 'GitHub Copilot' },
      chatgpt: { zh: 'ChatGPT', en: 'ChatGPT' },
      gemini: { zh: 'Gemini', en: 'Gemini' },
      deepseek: { zh: 'DeepSeek', en: 'DeepSeek' },
      qwen: { zh: '通义千问', en: 'Qwen' },
      tongyi_lingma: { zh: '通义灵码', en: 'Tongyi Lingma' },
      other: { zh: '其他', en: 'Other' },
    },
    dailyAiUsageHours: {
      '0_1': { zh: '0-1 小时', en: '0-1 hours' },
      '1_3': { zh: '1-3 小时', en: '1-3 hours' },
      '3_6': { zh: '3-6 小时', en: '3-6 hours' },
      '6_plus': { zh: '6+ 小时', en: '6+ hours' },
    },
  },
  techStackPlaceholder: {
    zh: '例如 typescript,按回车添加',
    en: 'e.g. typescript, press Enter to add',
  },
  techStackHint: {
    zh: '请添加 2-5 项,每项不超过 50 字符。',
    en: 'Please add 2-5 items, each up to 50 characters.',
  },
  submit: { zh: '提交并开始答题', en: 'Submit and start exam' },
  submitting: { zh: '提交中…', en: 'Submitting…' },
  errors: {
    AUTH_REQUIRED: {
      zh: '会话凭据无效或已过期,请重新打开招聘方发送的链接。',
      en: 'Session credential missing or expired. Please reopen the link sent by your recruiter.',
    },
    NOT_FOUND: {
      zh: '会话不存在或已被撤销,请联系招聘联系人确认链接。',
      en: 'Session not found or has been revoked. Please contact your recruiter to confirm the link.',
    },
    VALIDATION_ERROR: {
      zh: '请检查所有字段是否填写正确,尤其是技术栈需 2-5 项。',
      en: 'Please check all fields are filled correctly — tech stack requires 2-5 items.',
    },
    FORBIDDEN: {
      zh: '访问被拒绝,请确认您使用的是自己的评估链接。',
      en: 'Access denied. Please confirm you are using the link issued to you.',
    },
    INTERNAL_ERROR: {
      zh: '服务器暂时无法处理请求,请稍后重试。',
      en: 'The server cannot process the request right now. Please retry shortly.',
    },
    NETWORK: {
      zh: '网络连接异常,请检查网络后重试。',
      en: 'Network error. Please check your connection and retry.',
    },
    UNKNOWN: {
      zh: '提交失败,请稍后重试。如问题持续,请联系招聘联系人。',
      en: 'Submission failed. Please retry shortly. If the problem persists, contact your recruiter.',
    },
  },
  urlMissingToken: {
    zh: '会话标识缺失,请重新打开招聘方发送的链接。',
    en: 'Session token missing. Please reopen the link sent by your recruiter.',
  },
};
