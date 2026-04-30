/**
 * Consent page bilingual copy (Option α — V5.0 inline pattern).
 *
 * V5.0 ships zh + en literals side-by-side per section, matching the
 * convention already in `report/sections/ReportTransparencyFooter.tsx`. V5.1
 * will extract the zh side as i18n source-of-truth once a translation
 * layer is added.
 *
 * The shape here is consumed by `ConsentPage.tsx`. Error codes are the
 * Backend AppError codes (Round 3 remap — AUTH_REQUIRED / NOT_FOUND /
 * VALIDATION_ERROR / FORBIDDEN / INTERNAL_ERROR) plus two Frontend-only
 * ones (NETWORK for fetch rejection, UNKNOWN for defensive fallback).
 */

import type { CandidateApiErrorCode } from '../../services/candidateApi.js';
import type { BilingualText } from '../../lib/bilingual.js';

export interface ConsentSection {
  readonly id: 'privacy' | 'scope' | 'retention' | 'rights';
  readonly title: BilingualText;
  readonly body: BilingualText;
}

export interface ConsentContent {
  readonly title: BilingualText;
  readonly intro: BilingualText;
  readonly sections: ReadonlyArray<ConsentSection>;
  readonly checkboxLabel: BilingualText;
  readonly submit: BilingualText;
  readonly submitting: BilingualText;
  readonly errors: Readonly<Record<CandidateApiErrorCode, BilingualText>>;
  readonly urlMissingToken: BilingualText;
  readonly supportEmail: string;
}

export const CONSENT_CONTENT: ConsentContent = {
  title: {
    zh: '数据处理与隐私同意',
    en: 'Data Processing & Privacy Consent',
  },
  intro: {
    zh: '继续评估前,请阅读以下 4 节内容,了解我们如何处理您在评估过程中产生的数据。',
    en: 'Before continuing, please review the four sections below to understand how we handle the data generated during your assessment.',
  },
  sections: [
    {
      id: 'privacy',
      title: {
        zh: '1. 您的数据 · 我们如何保护',
        en: '1. Your data · How we protect it',
      },
      body: {
        zh: '您在评估中提交的代码、答案和录音存储在加密数据库中,仅评估发起方与评分管线可访问。我们不会将您的数据出售或与第三方广告网络共享。',
        en: 'The code, answers, and recordings you submit are stored in an encrypted database accessible only to the evaluation owner and the scoring pipeline. Your data is never sold or shared with third-party ad networks.',
      },
    },
    {
      id: 'scope',
      title: {
        zh: '2. 我们测量什么 · 以及不测什么',
        en: '2. What we measure · and what we don\u2019t',
      },
      body: {
        zh: '我们仅评估技术能力(技术判断、AI 协作、系统设计、代码质量、沟通、元认知)。我们不测量也不存储与下列受保护属性相关的任何信号:性别、种族、年龄、政治观点、宗教信仰。',
        en: 'We assess only technical competence (technical judgement, AI engineering, system design, code quality, communication, metacognition). We do not measure or store any signal related to gender, race, age, political views, or religious belief.',
      },
    },
    {
      id: 'retention',
      title: {
        zh: '3. 数据保留 · 90 天后自动删除',
        en: '3. Retention · auto-deleted after 90 days',
      },
      body: {
        zh: '原始评估数据(代码、录音、AI 对话)保留 90 天,到期后自动从所有备份中删除。聚合的评分结果可能匿名化后用于改进模型。',
        en: 'Raw assessment data (code, recordings, AI conversations) is retained for 90 days and then automatically deleted from all backups. Aggregate scoring results may be anonymised for model improvement.',
      },
    },
    {
      id: 'rights',
      title: {
        zh: '4. 您的权利 · 访问 / 解释 / 删除 / 撤回',
        en: '4. Your rights · access / explanation / deletion / withdrawal',
      },
      body: {
        zh: '您随时可通过 privacy@codelens.dev 联系我们以:查阅您的评估数据、获得评分依据的解释、要求提前删除原始数据,或撤回本同意(撤回不影响在此之前的处理活动)。',
        en: 'You may contact privacy@codelens.dev at any time to: access your assessment data, obtain an explanation of the scoring rationale, request early deletion of raw data, or withdraw this consent (withdrawal does not affect processing prior to that point).',
      },
    },
  ],
  checkboxLabel: {
    zh: '我已阅读并同意上述数据处理条款',
    en: 'I have read and agree to the data processing terms above',
  },
  submit: {
    zh: '继续评估',
    en: 'Continue Assessment',
  },
  submitting: {
    zh: '提交中…',
    en: 'Submitting\u2026',
  },
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
      zh: '提交内容未通过校验,请重试。如问题持续,请联系招聘联系人。',
      en: 'Submission failed validation. Please retry. If the problem persists, contact your recruiter.',
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
  supportEmail: 'privacy@codelens.dev',
};
