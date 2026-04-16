/**
 * 修正 6：出题引擎 Step 0 的总纲输出 + ExamSpec 输入类型。
 *
 * BusinessScenario 作为"业务场景"贯穿 Step 1-7，所有模块的题目都从它派生。
 * 存入 ExamInstance.businessScenario（Json 字段，Task 2 的 schema 改动）。
 *
 * ExamSpec 是出题的输入约束：5 维度组合 + 级别。
 */

export type V5TechStack =
  | 'java_spring'
  | 'python_fastapi'
  | 'nodejs_nest'
  | 'go_gin'
  | 'typescript_express'
  | 'python_django'
  | string;

export type V5Domain =
  | 'payment'
  | 'ecommerce'
  | 'logistics'
  | 'social'
  | 'content'
  | 'fintech'
  | 'saas'
  | 'iot'
  | string;

export type V5ChallengePattern =
  | 'precision'
  | 'concurrency'
  | 'consistency'
  | 'performance'
  | 'resilience'
  | 'security'
  | string;

export type V5ArchStyle =
  | 'monolith'
  | 'microservices'
  | 'event_driven'
  | 'serverless'
  | 'layered'
  | string;

export type V5Level = 'junior' | 'mid' | 'senior';

/** 出题输入：5 维度组合（archStyle 可选）+ level。 */
export interface ExamSpec {
  techStack: V5TechStack;
  domain: V5Domain;
  challengePattern: V5ChallengePattern;
  archStyle?: V5ArchStyle;
  level: V5Level;
}

export interface BusinessEntity {
  name: string;
  attributes: string[];
  relationships: string[];
}

export interface TechStackDetail {
  language: string;
  framework: string;
  database: string;
  cache?: string;
  mq?: string;
}

/**
 * Step 0 输出：完整业务系统的总纲。
 * 后续 Step 1-7 所有题目基于这份总纲派生，保证跨模块使用同一个业务上下文。
 */
export interface BusinessScenario {
  systemName: string;
  /** 500-800 字的业务背景描述。 */
  businessContext: string;
  coreEntities: BusinessEntity[];
  techStackDetail: TechStackDetail;
  /** 主要业务流程，每条一步。 */
  businessFlow: string[];
  userRoles: string[];
}
