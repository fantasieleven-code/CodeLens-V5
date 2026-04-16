/**
 * RulesEditor — MB Stage 3 writable Monaco editor for RULES.md (and optional AGENT.md).
 *
 * ⚠️  GLOBAL RULE: every Monaco editor is readOnly by default — this file is the
 * ONE exception. Candidates write RULES.md (and optionally AGENT.md) here to
 * constrain how the Stage 2 autonomous runner uses the AI. The editor is
 * intentionally writable because candidates are producing English-language
 * constraints, not application code.
 *
 * Any new readOnly=false Monaco instance MUST go through PR review.
 *
 * This component is a thin 2-tab wrapper around @monaco-editor/react. Parents
 * own the content state — RulesEditor just forwards change events. The
 * RULES.md tab is required; AGENT.md is optional (AGENT.md captures
 * higher-level orchestration guidance and may be omitted).
 */

import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../lib/tokens.js';

export type RulesTabId = 'rules' | 'agent';
type TabId = RulesTabId;

interface RulesEditorProps {
  rulesContent: string;
  agentContent: string | null;
  onRulesChange: (value: string) => void;
  onAgentChange: (value: string | null) => void;
  disabled?: boolean;
  /** Optional behavior hook: fires when the candidate switches between RULES/AGENT. */
  onTabChange?: (tab: TabId) => void;
}

export const RulesEditor: React.FC<RulesEditorProps> = ({
  rulesContent,
  agentContent,
  onRulesChange,
  onAgentChange,
  disabled = false,
  onTabChange,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('rules');

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const hasAgent = agentContent !== null;

  const handleToggleAgent = (): void => {
    if (hasAgent) {
      onAgentChange(null);
      switchTab('rules');
    } else {
      onAgentChange('');
      switchTab('agent');
    }
  };

  const activeValue = activeTab === 'rules' ? rulesContent : agentContent ?? '';

  return (
    <div style={styles.container} data-testid="rules-editor">
      <div style={styles.tabs}>
        <button
          type="button"
          onClick={() => switchTab('rules')}
          style={{
            ...styles.tab,
            ...(activeTab === 'rules' ? styles.tabActive : {}),
          }}
          data-testid="rules-tab-rules"
        >
          RULES.md
          <span style={styles.required}>必填</span>
        </button>
        {hasAgent && (
          <button
            type="button"
            onClick={() => switchTab('agent')}
            style={{
              ...styles.tab,
              ...(activeTab === 'agent' ? styles.tabActive : {}),
            }}
            data-testid="rules-tab-agent"
          >
            AGENT.md
            <span style={styles.optional}>可选</span>
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={handleToggleAgent}
          style={styles.toggleAgent}
          data-testid="rules-toggle-agent"
        >
          {hasAgent ? '− 移除 AGENT.md' : '+ 添加 AGENT.md'}
        </button>
      </div>

      <div style={styles.editorWrap} data-testid={`rules-editor-pane-${activeTab}`}>
        <Editor
          key={activeTab}
          value={activeValue}
          language="markdown"
          theme="vs-dark"
          onChange={(v) => {
            if (activeTab === 'rules') onRulesChange(v ?? '');
            else onAgentChange(v ?? '');
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            wordWrap: 'on',
            tabSize: 2,
            padding: { top: 8 },
            readOnly: disabled,
          }}
          height="320px"
        />
      </div>

      <div style={styles.footer}>
        <span style={styles.hint}>
          提示：写至少 2 级标题 + 项目符号列表 + 代码示例（triple backticks），长度 ≥ 200 字。
          {activeTab === 'rules' && ' 具体引用任务中的文件名/函数名会得到更高的 Specificity 分数。'}
        </span>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  tabs: {
    display: 'flex',
    alignItems: 'stretch',
    backgroundColor: colors.crust,
    borderBottom: `1px solid ${colors.surface0}`,
    padding: `0 ${spacing.sm}`,
    gap: spacing.xs,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.sm} ${spacing.md}`,
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: colors.overlay1,
    fontSize: fontSizes.sm,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  tabActive: {
    color: colors.text,
    borderBottom: `2px solid ${colors.mauve}`,
  },
  required: {
    fontSize: fontSizes.xs,
    color: colors.red,
    fontWeight: fontWeights.medium,
  },
  optional: {
    fontSize: fontSizes.xs,
    color: colors.overlay1,
  },
  toggleAgent: {
    alignSelf: 'center',
    padding: `${spacing.xs} ${spacing.sm}`,
    background: 'transparent',
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    color: colors.subtext0,
    fontSize: fontSizes.xs,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  editorWrap: {
    minHeight: 320,
  },
  footer: {
    padding: `${spacing.sm} ${spacing.md}`,
    backgroundColor: colors.crust,
    borderTop: `1px solid ${colors.surface0}`,
  },
  hint: {
    fontSize: fontSizes.xs,
    color: colors.overlay1,
    lineHeight: 1.5,
  },
};
