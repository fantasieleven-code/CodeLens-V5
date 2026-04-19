// V5.0: zh+en inline per-section. V5.1 i18n migration will extract to i18next resources using zh literals as source of truth.
import React from 'react';
import { Card } from '../../components/ui/Card.js';
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
} from '../../lib/tokens.js';

/**
 * F-A15 · 透明度声明(Transparency Statement)
 *
 * 报告末尾的固定 trailer,不依赖 suite.reportSections,每份报告都展示。
 * 面向候选人 + HR 两类读者,基调是 professional + sympathetic,避免法律化合同语言。
 * 措辞:等级/信号/局限/数据处理四段,用"设计目标 / 持续校准"而非"validated / proven"。
 */
export function TransparencyStatement(): React.ReactElement {
  return (
    <Card padding="lg" data-testid="transparency-statement">
      <h3 style={styles.title}>
        关于这份报告
        <span style={styles.titleEn}> · About this report</span>
      </h3>

      <section style={styles.section} data-testid="transparency-grade">
        <h4 style={styles.sectionTitle}>
          等级的含义
          <span style={styles.sectionTitleEn}> · What your grade means</span>
        </h4>
        <p style={styles.body}>
          你的等级(S+/S/A/B+/B/C)是本次评估的综合结果,反映你在本套件 6 个维度上的整体表现。
          这是一个设计用于辅助招聘决策的参考信号,不是对个人能力的终局判断。
          同一候选人换套件、换场景、换时段都可能得到不同的等级。
        </p>
        <p style={styles.bodyEn}>
          Your grade (S+/S/A/B+/B/C) reflects your composite performance on the six dimensions measured by this suite in this session. It is a reference signal designed to inform hiring decisions, not a final verdict on your abilities. A different suite, scenario, or moment could produce a different grade.
        </p>
      </section>

      <section style={styles.section} data-testid="transparency-signals">
        <h4 style={styles.sectionTitle}>
          我们观察了什么
          <span style={styles.sectionTitleEn}> · What we measure (and what we don't)</span>
        </h4>
        <p style={styles.body}>
          我们通过 43 个信号观察你的技术判断、AI 协作、系统设计、代码质量、沟通表达与元认知。
          这些信号关注的是"你在本次场景里如何做决策、如何与 AI 协作、如何呈现思路",
          而不是"你对某个具体技术栈的熟练度"。
          我们没有测量的东西包括:长期协作、跨时区沟通、领域知识深度、情绪韧性等。
          请把这份报告理解为一次面试的切片,而不是完整画像。
        </p>
        <p style={styles.bodyEn}>
          We observe 43 signals spanning technical judgment, AI collaboration, system design, code quality, communication, and metacognition. These signals focus on how you make decisions, collaborate with AI, and articulate your thinking in this scenario — not your familiarity with a particular stack. Things we do not measure: long-running teamwork, async collaboration, domain depth, emotional resilience. Treat this report as a slice of one interview, not a complete portrait.
        </p>
      </section>

      <section style={styles.section} data-testid="transparency-limitations">
        <h4 style={styles.sectionTitle}>
          已知的局限
          <span style={styles.sectionTitleEn}> · Known limitations</span>
        </h4>
        <p style={styles.body}>
          本评估仍在持续校准中。已知可能存在的偏差包括:非母语表达可能影响沟通维度的打分;
          不同领域背景的候选人在同一场景下切入角度不同;AI 协作信号会随工具与模型版本的变化而漂移。
          减少这些偏差是我们的设计目标,但我们不声称"已经做到零偏差"。
          如果你认为结果和你的真实表现有较大出入,欢迎向招聘方反馈——这是我们持续校准的重要输入。
        </p>
        <p style={styles.bodyEn}>
          This assessment is still being calibrated. Known biases may include: non-native expression affecting communication scores; candidates from different domain backgrounds framing the same scenario differently; AI-collaboration signals drifting as tools and models evolve. Minimizing these is our design goal, but we do not claim zero bias. If the result feels far from your real ability, please share that with the hiring team — it is an important input for ongoing calibration.
        </p>
      </section>

      <section style={styles.section} data-testid="transparency-data">
        <h4 style={styles.sectionTitle}>
          数据如何被处理
          <span style={styles.sectionTitleEn}> · How your data is handled</span>
        </h4>
        <p style={styles.body}>
          你在本次评估中产生的全部数据(提交内容、编辑行为、语音追问记录)用于生成这份报告。
          我们不会将你的原始答题内容作为模型训练数据;未经你的同意,也不会把这些数据用于本次招聘流程以外的场景。
          如果你希望删除本次会话数据,可以联系招聘方提出申请。
        </p>
        <p style={styles.bodyEn}>
          All data you produce during this assessment (submissions, editing behavior, voice follow-up recordings) is used to generate this report. We do not use your raw responses as training data, and we do not reuse this data outside the current hiring process without your consent. To request deletion of your session data, please contact the hiring team.
        </p>
      </section>
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  title: {
    margin: 0,
    marginBottom: spacing.md,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  titleEn: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.subtext0,
    fontStyle: 'italic',
  },
  section: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTop: `1px solid ${colors.surface0}`,
  },
  sectionTitle: {
    margin: 0,
    marginBottom: spacing.sm,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  sectionTitleEn: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.subtext0,
    fontStyle: 'italic',
  },
  body: {
    margin: 0,
    fontSize: fontSizes.sm,
    color: colors.subtext1,
    lineHeight: 1.7,
  },
  bodyEn: {
    margin: 0,
    marginTop: spacing.xs,
    fontSize: fontSizes.xs,
    color: colors.overlay1,
    lineHeight: 1.7,
    fontStyle: 'italic',
  },
};
