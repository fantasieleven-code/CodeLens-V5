/**
 * ModuleDPage — Task 8 MD (system design) UI.
 *
 * Single page (no 4-stage state machine — MD is one-shot per
 * frontend-agent-tasks.md L734-758). Candidate fills 6 sections in order:
 *
 *   1. designTask 展示    — read-only feature/business/NFR display
 *   2. subModules         — dynamic add/remove cards (name + responsibility +
 *                            interfaces[]; interfaces parsed from one-per-line
 *                            textarea so the candidate can list call shapes
 *                            without a sub-form)
 *   3. interfaceDefinitions — top-level cross-module contracts (string[],
 *                              one per line)
 *   4. dataFlowDescription  — single textarea
 *   5. constraintsSelected  — multi-select toggle from
 *                              MDModuleSpecific.constraintCategories
 *   6. tradeoffText         — single textarea
 *   7. aiOrchestrationPrompts — dynamic add/remove list of textareas
 *
 * Submit gating:
 *   - ≥ 1 subModule with non-empty name + responsibility
 *   - dataFlowDescription non-empty (the integration story is the load-bearing part)
 *   - tradeoffText non-empty (sScopeAwareness needs an explicit tradeoff)
 *   - constraintsSelected and aiOrchestrationPrompts may be empty (some
 *     designs validly defer constraints; AI prompts only score positive when
 *     present)
 *
 * Submit path:
 *   - setSubmission('moduleD', payload) writes locally (CompletePage /
 *     DecisionSummary read from there)
 *   - persistCandidateSubmission('moduleD:submit', ...) confirms server
 *     persistence through socket ack or HTTP fallback before advance().
 *   - advance() moves the module store forward only after persistence succeeds
 *
 * Content source:
 *   Real candidate sessions fetch canonical MD content by examInstanceId via
 *   `useModuleContent`. MD_MOCK_FIXTURE is kept only for preview/test
 *   overrides and no-session local rendering.
 *
 * Bare mode:
 *   `bare={true}` skips ModuleShell — mirrors ModuleAPage / ModuleBPage.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { V5ModuleDSubmission } from '@codelens-v5/shared';
import { persistCandidateSubmission } from '../lib/persistCandidateSubmission.js';
import { useModuleStore } from '../stores/module.store.js';
import { useSessionStore } from '../stores/session.store.js';
import { ModuleShell } from '../components/ModuleShell.js';
import { useModuleContent } from '../hooks/useModuleContent.js';
import { MD_MOCK_FIXTURE, type MDMockModule } from './moduleD/mock.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';

interface SubModuleDraft {
  name: string;
  responsibility: string;
  /** Free text — split on \n at submit time into string[]. */
  interfacesText: string;
}

const EMPTY_SUBMODULE: SubModuleDraft = {
  name: '',
  responsibility: '',
  interfacesText: '',
};

export interface ModuleDPageProps {
  module?: MDMockModule;
  onSubmit?: (submission: V5ModuleDSubmission) => void;
  bare?: boolean;
}

export const ModuleDPage: React.FC<ModuleDPageProps> = ({
  module: moduleProp,
  onSubmit,
  bare = false,
}) => {
  const advance = useModuleStore((s) => s.advance);
  const setSubmission = useSessionStore((s) => s.setModuleSubmissionLocal);
  const sessionId = useSessionStore((s) => s.sessionId);
  const examInstanceId = useSessionStore((s) => s.examInstanceId);
  const fetchState = useModuleContent(moduleProp || !examInstanceId ? null : examInstanceId, 'md');
  const moduleContent =
    moduleProp ??
    (fetchState.status === 'loaded' ? fetchState.data : !examInstanceId ? MD_MOCK_FIXTURE : null);

  const [subModules, setSubModules] = useState<SubModuleDraft[]>([{ ...EMPTY_SUBMODULE }]);
  const [interfaceDefinitionsText, setInterfaceDefinitionsText] = useState('');
  const [dataFlowDescription, setDataFlowDescription] = useState('');
  const [constraintsSelected, setConstraintsSelected] = useState<string[]>([]);
  const [tradeoffText, setTradeoffText] = useState('');
  const [aiOrchestrationPrompts, setAiOrchestrationPrompts] = useState<string[]>(['']);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─────────────────── handlers ───────────────────

  const updateSubModule = useCallback((idx: number, patch: Partial<SubModuleDraft>) => {
    setSubModules((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }, []);

  const addSubModule = useCallback(() => {
    setSubModules((prev) => [...prev, { ...EMPTY_SUBMODULE }]);
  }, []);

  const removeSubModule = useCallback((idx: number) => {
    setSubModules((prev) => {
      // Keep at least one card so the form never collapses to nothing.
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const toggleConstraint = useCallback((category: string) => {
    setConstraintsSelected((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  }, []);

  const updatePrompt = useCallback((idx: number, value: string) => {
    setAiOrchestrationPrompts((prev) => prev.map((p, i) => (i === idx ? value : p)));
  }, []);

  const addPrompt = useCallback(() => {
    setAiOrchestrationPrompts((prev) => [...prev, '']);
  }, []);

  const removePrompt = useCallback((idx: number) => {
    setAiOrchestrationPrompts((prev) => {
      if (prev.length <= 1) return [''];
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  // ─────────────────── derived ───────────────────

  const submoduleValid = useMemo(
    () => subModules.some((s) => s.name.trim().length > 0 && s.responsibility.trim().length > 0),
    [subModules],
  );

  const canSubmit =
    submoduleValid &&
    dataFlowDescription.trim().length > 0 &&
    tradeoffText.trim().length > 0 &&
    !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !moduleContent) return;
    setSubmitting(true);
    setSubmitError(null);

    const submission: V5ModuleDSubmission = {
      subModules: subModules
        .filter((s) => s.name.trim().length > 0 && s.responsibility.trim().length > 0)
        .map((s) => {
          const interfaces = s.interfacesText
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
          return {
            name: s.name.trim(),
            responsibility: s.responsibility.trim(),
            ...(interfaces.length > 0 ? { interfaces } : {}),
          };
        }),
      interfaceDefinitions: interfaceDefinitionsText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
      dataFlowDescription: dataFlowDescription.trim(),
      constraintsSelected,
      tradeoffText: tradeoffText.trim(),
      aiOrchestrationPrompts: aiOrchestrationPrompts
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
    };

    setSubmission('moduleD', submission);
    const persisted = await persistCandidateSubmission({
      event: 'moduleD:submit',
      payload: { sessionId: sessionId ?? 'moduleD-pending', submission },
      ...(sessionId
        ? { http: { url: `/api/v5/exam/${sessionId}/moduled/submit`, body: { submission } } }
        : {}),
    });
    if (!persisted) {
      setSubmitError('提交未保存成功,请重试。');
      setSubmitting(false);
      return;
    }
    onSubmit?.(submission);
    advance();
    setSubmitting(false);
  }, [
    canSubmit,
    subModules,
    interfaceDefinitionsText,
    dataFlowDescription,
    constraintsSelected,
    tradeoffText,
    aiOrchestrationPrompts,
    onSubmit,
    setSubmission,
    sessionId,
    advance,
  ]);

  if (!moduleContent) {
    const inner =
      fetchState.status === 'error' ? (
        <div style={styles.container} data-testid="md-content-error">
          <p style={styles.bodyText}>{fetchState.message}</p>
        </div>
      ) : (
        <div style={styles.container} data-testid="md-content-loading">
          <p style={styles.bodyText}>正在加载 Module D 内容…</p>
        </div>
      );
    return bare ? inner : <ModuleShell>{inner}</ModuleShell>;
  }

  // ─────────────────── render ───────────────────

  const body = (
    <div style={styles.container} data-testid="moduleD-container">
      <header style={styles.header}>
        <span style={styles.pill}>Module D · 系统设计</span>
        <h1 style={styles.title}>子模块拆解 · 接口契约 · 数据流 · 取舍</h1>
      </header>

      <DesignTaskDisplay designTask={moduleContent.designTask} />

      <SubModulesSection
        subModules={subModules}
        onUpdate={updateSubModule}
        onAdd={addSubModule}
        onRemove={removeSubModule}
      />

      <InterfaceDefinitionsSection
        value={interfaceDefinitionsText}
        onChange={setInterfaceDefinitionsText}
      />

      <DataFlowSection value={dataFlowDescription} onChange={setDataFlowDescription} />

      <ConstraintsSection
        categories={moduleContent.constraintCategories}
        selected={constraintsSelected}
        onToggle={toggleConstraint}
      />

      <TradeoffSection value={tradeoffText} onChange={setTradeoffText} />

      <AIOrchestrationSection
        prompts={aiOrchestrationPrompts}
        onUpdate={updatePrompt}
        onAdd={addPrompt}
        onRemove={removePrompt}
      />

      <DesignChallengesHint challenges={moduleContent.designChallenges} />

      <div style={styles.actionRow}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="md-submit"
          style={canSubmit ? styles.btnPrimary : styles.btnDisabled}
        >
          {submitting ? '提交中…' : '提交并完成 Module D'}
        </button>
        {!canSubmit && (
          <span style={styles.warn} data-testid="md-submit-warn">
            至少 1 个子模块需填名称 + 职责;数据流 + 取舍必须填写。
          </span>
        )}
      </div>
      {submitError && (
        <div style={styles.submitError} data-testid="md-submit-error">
          {submitError}
        </div>
      )}
    </div>
  );

  return bare ? body : <ModuleShell>{body}</ModuleShell>;
};

// ─────────────────── designTask display ───────────────────

const DesignTaskDisplay: React.FC<{ designTask: MDMockModule['designTask'] }> = ({
  designTask,
}) => (
  <section style={styles.card} data-testid="md-design-task-display">
    <h2 style={styles.h2}>设计任务</h2>
    <p style={styles.bodyText}>{designTask.description}</p>

    <h3 style={styles.h3}>业务背景</h3>
    <p style={styles.bodyText} data-testid="md-design-task-business-context">
      {designTask.businessContext}
    </p>

    <h3 style={styles.h3}>非功能性要求</h3>
    <ul style={styles.ul}>
      {designTask.nonFunctionalRequirements.map((nfr, i) => (
        <li key={i} style={styles.li} data-testid={`md-design-task-nfr-${i}`}>
          {nfr}
        </li>
      ))}
    </ul>
  </section>
);

// ─────────────────── subModules ───────────────────

interface SubModulesSectionProps {
  subModules: SubModuleDraft[];
  onUpdate: (idx: number, patch: Partial<SubModuleDraft>) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}

const SubModulesSection: React.FC<SubModulesSectionProps> = ({
  subModules,
  onUpdate,
  onAdd,
  onRemove,
}) => (
  <section style={styles.card}>
    <SectionHeader
      title="子模块拆解"
      hint="按职责切分,每个模块一段名字 + 职责描述。如有跨模块接口可一并写出(每行一个)。"
    />
    <div style={styles.submoduleGrid}>
      {subModules.map((sm, i) => (
        <article key={i} style={styles.submoduleCard} data-testid={`md-submodule-card-${i}`}>
          <header style={styles.submoduleCardHeader}>
            <strong style={styles.submoduleCardTitle}>模块 #{i + 1}</strong>
            {subModules.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(i)}
                style={styles.btnRemove}
                aria-label={`删除模块 ${i + 1}`}
                data-testid={`md-submodule-remove-${i}`}
              >
                ×
              </button>
            )}
          </header>

          <label style={styles.fieldLabel}>名称</label>
          <input
            type="text"
            value={sm.name}
            onChange={(e) => onUpdate(i, { name: e.target.value })}
            data-testid={`md-submodule-${i}-name`}
            placeholder="例:OrderWriteService"
            style={styles.input}
          />

          <label style={styles.fieldLabel}>职责</label>
          <textarea
            value={sm.responsibility}
            onChange={(e) => onUpdate(i, { responsibility: e.target.value })}
            data-testid={`md-submodule-${i}-responsibility`}
            placeholder="例:接收下单请求,落库前校验,异步发库存预扣消息。"
            rows={3}
            style={styles.textarea}
          />

          <label style={styles.fieldLabel}>跨模块接口(可选,每行一个)</label>
          <textarea
            value={sm.interfacesText}
            onChange={(e) => onUpdate(i, { interfacesText: e.target.value })}
            data-testid={`md-submodule-${i}-interfaces`}
            placeholder={'POST /order/create\nPUT /order/{id}/cancel'}
            rows={3}
            style={styles.textarea}
          />
        </article>
      ))}
    </div>
    <div style={styles.actionRow}>
      <button type="button" onClick={onAdd} style={styles.btnGhost} data-testid="md-add-submodule">
        + 添加子模块
      </button>
    </div>
  </section>
);

// ─────────────────── interfaceDefinitions ───────────────────

const InterfaceDefinitionsSection: React.FC<{
  value: string;
  onChange: (s: string) => void;
}> = ({ value, onChange }) => (
  <section style={styles.card}>
    <SectionHeader
      title="跨模块接口契约"
      hint="子模块之间的核心契约。一行一个,可以是 REST / RPC / 消息 topic 任何形式。"
    />
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={6}
      placeholder={
        'OrderWriteService → InventoryService:消息 inventory.reserve(orderId, items)\nOrderWriteService → PaymentService:RPC pay(orderId, amount)\n...'
      }
      style={styles.textarea}
      data-testid="md-interface-definitions"
    />
  </section>
);

// ─────────────────── dataFlowDescription ───────────────────

const DataFlowSection: React.FC<{
  value: string;
  onChange: (s: string) => void;
}> = ({ value, onChange }) => (
  <section style={styles.card}>
    <SectionHeader
      title="数据流"
      hint="完整链路:请求进来后,数据如何在你拆出的模块之间流转、落库、出库。"
    />
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={6}
      placeholder="例:用户 → API Gateway → OrderWriteService(校验+落库)→ Kafka(inventory.reserve)→ InventoryService → Kafka(inventory.reserved)→ OrderWriteService 状态推进 …"
      style={styles.textarea}
      data-testid="md-data-flow"
    />
  </section>
);

// ─────────────────── constraintsSelected ───────────────────

interface ConstraintsSectionProps {
  categories: string[];
  selected: string[];
  onToggle: (category: string) => void;
}

const ConstraintsSection: React.FC<ConstraintsSectionProps> = ({
  categories,
  selected,
  onToggle,
}) => (
  <section style={styles.card}>
    <SectionHeader title="关键约束" hint="选出你为这个设计明确考虑过的约束类别(多选)。" />
    <div style={styles.constraintsGrid} data-testid="md-constraints-selected">
      {categories.map((cat) => {
        const active = selected.includes(cat);
        return (
          <button
            type="button"
            key={cat}
            onClick={() => onToggle(cat)}
            data-testid={`md-constraint-${cat}`}
            aria-pressed={active}
            style={{
              ...styles.constraintChip,
              borderColor: active ? colors.blue : colors.surface1,
              backgroundColor: active ? `${colors.blue}22` : colors.surface0,
              color: active ? colors.blue : colors.text,
            }}
          >
            {cat}
          </button>
        );
      })}
    </div>
  </section>
);

// ─────────────────── tradeoffText ───────────────────

const TradeoffSection: React.FC<{
  value: string;
  onChange: (s: string) => void;
}> = ({ value, onChange }) => (
  <section style={styles.card}>
    <SectionHeader
      title="关键取舍"
      hint="这套设计放弃了什么,换来了什么。说明 1-2 个最重要的 tradeoff。"
    />
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={5}
      placeholder="例:放弃订单 + 库存的强一致(双写),换 5 万 QPS 下的写入吞吐;一致性回退到 saga + 对账 T+1 修正。"
      style={styles.textarea}
      data-testid="md-tradeoff-text"
    />
  </section>
);

// ─────────────────── aiOrchestrationPrompts ───────────────────

interface AIOrchestrationSectionProps {
  prompts: string[];
  onUpdate: (idx: number, value: string) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
}

const AIOrchestrationSection: React.FC<AIOrchestrationSectionProps> = ({
  prompts,
  onUpdate,
  onAdd,
  onRemove,
}) => (
  <section style={styles.card}>
    <SectionHeader
      title="AI 编排策略"
      hint="如果你要用 AI 协助实现 / 运维这套设计,你会写哪些 prompt?(可选,但写了能拿 sAIOrchestration 信号)"
    />
    {prompts.map((p, i) => (
      <div key={i} style={styles.promptRow}>
        <textarea
          value={p}
          onChange={(e) => onUpdate(i, e.target.value)}
          rows={3}
          placeholder="例:基于这段 OrderWriteService 的代码,生成 saga 补偿事务的伪代码,要求覆盖 3 种失败分支。"
          style={styles.textarea}
          data-testid={`md-ai-orchestration-${i}`}
        />
        {prompts.length > 1 && (
          <button
            type="button"
            onClick={() => onRemove(i)}
            style={styles.btnRemove}
            aria-label={`删除 prompt ${i + 1}`}
            data-testid={`md-ai-orchestration-remove-${i}`}
          >
            ×
          </button>
        )}
      </div>
    ))}
    <div style={styles.actionRow}>
      <button
        type="button"
        onClick={onAdd}
        style={styles.btnGhost}
        data-testid="md-add-ai-orchestration"
      >
        + 添加 prompt
      </button>
    </div>
  </section>
);

// ─────────────────── designChallenges (read-only hint) ───────────────────

const DesignChallengesHint: React.FC<{
  challenges: MDMockModule['designChallenges'];
}> = ({ challenges }) => (
  <section style={styles.challengeCard} data-testid="md-design-challenges">
    <strong style={styles.challengeTitle}>面试官可能追问的方向</strong>
    <ul style={styles.ul}>
      {challenges.map((c, i) => (
        <li key={i} style={styles.li} data-testid={`md-design-challenge-${i}`}>
          <em style={styles.challengeTrigger}>{c.trigger}</em> — {c.challenge}
        </li>
      ))}
    </ul>
  </section>
);

// ─────────────────── shared section header ───────────────────

const SectionHeader: React.FC<{ title: string; hint: string }> = ({ title, hint }) => (
  <div style={styles.sectionHeader}>
    <h2 style={styles.h2}>{title}</h2>
    <p style={styles.hint}>{hint}</p>
  </div>
);

// ─────────────────── styles ───────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    width: '100%',
    maxWidth: 960,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  pill: {
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: `${colors.mauve}22`,
    color: colors.mauve,
    borderRadius: radii.full,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    letterSpacing: '0.5px',
    alignSelf: 'flex-start',
  },
  title: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  card: {
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface0}`,
    padding: spacing.xl,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  challengeCard: {
    backgroundColor: `${colors.peach}11`,
    borderRadius: radii.md,
    border: `1px solid ${colors.peach}55`,
    padding: spacing.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  challengeTitle: {
    fontSize: fontSizes.sm,
    color: colors.peach,
  },
  challengeTrigger: {
    color: colors.subtext0,
  },
  sectionHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  h2: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    margin: 0,
  },
  h3: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.subtext1,
    margin: 0,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.overlay2,
    lineHeight: 1.4,
    margin: 0,
  },
  bodyText: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    lineHeight: 1.6,
    margin: 0,
  },
  ul: {
    margin: 0,
    paddingLeft: spacing.lg,
  },
  li: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    lineHeight: 1.6,
  },
  submoduleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: spacing.md,
  },
  submoduleCard: {
    backgroundColor: colors.surface0,
    borderRadius: radii.md,
    border: `1px solid ${colors.surface1}`,
    padding: spacing.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  submoduleCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  submoduleCardTitle: {
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  fieldLabel: {
    fontSize: fontSizes.xs,
    color: colors.subtext1,
    fontWeight: fontWeights.medium,
    marginTop: spacing.xs,
  },
  input: {
    padding: spacing.sm,
    backgroundColor: colors.mantle,
    color: colors.text,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    fontSize: fontSizes.sm,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    width: '100%',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    padding: spacing.sm,
    backgroundColor: colors.mantle,
    color: colors.text,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: fontSizes.sm,
    lineHeight: 1.5,
    resize: 'vertical',
  },
  constraintsGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  constraintChip: {
    padding: `${spacing.sm} ${spacing.md}`,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.full,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  promptRow: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  actionRow: {
    display: 'flex',
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  btnPrimary: {
    padding: `${spacing.sm} ${spacing.xl}`,
    backgroundColor: colors.blue,
    color: colors.crust,
    border: 'none',
    borderRadius: radii.md,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnDisabled: {
    padding: `${spacing.sm} ${spacing.xl}`,
    backgroundColor: colors.surface1,
    color: colors.overlay1,
    border: 'none',
    borderRadius: radii.md,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    cursor: 'not-allowed',
    fontFamily: 'inherit',
  },
  btnGhost: {
    padding: `${spacing.sm} ${spacing.lg}`,
    backgroundColor: 'transparent',
    color: colors.blue,
    border: `1px dashed ${colors.blue}`,
    borderRadius: radii.md,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnRemove: {
    padding: `0 ${spacing.sm}`,
    backgroundColor: 'transparent',
    border: `1px solid ${colors.red}55`,
    color: colors.red,
    borderRadius: radii.sm,
    fontSize: fontSizes.md,
    cursor: 'pointer',
    fontFamily: 'inherit',
    height: 32,
  },
  warn: {
    fontSize: fontSizes.xs,
    color: colors.peach,
  },
  submitError: {
    color: colors.red,
    fontSize: fontSizes.sm,
    textAlign: 'right',
  },
};
