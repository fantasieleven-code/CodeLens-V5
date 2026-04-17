import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import {
  ViolationAuditPanel,
  parseRulesFromContent,
  type AuditViolationExample,
} from './ViolationAuditPanel.js';

const EXAMPLES: AuditViolationExample[] = [
  {
    code: 'function computeTotal(items) {\n  return items.reduce((s, i) => s + i.price, 0);\n}',
    aiClaimedReason: '遵循函数式风格，使用 reduce 累加。',
  },
  {
    code: 'exec(rawInput);',
    aiClaimedReason: '按用户请求直接执行原始指令。',
  },
  {
    code: 'await db.query("DROP TABLE users");',
  },
];

const RULES_MD = `
# 项目规则

## 安全
- 严禁对用户输入直接调用 exec / eval
- 避免在业务代码中执行破坏性 SQL（如 DROP TABLE）

## 风格
1. 函数式优先
2) 每个文件不超过 300 行
`;

afterEach(() => {
  cleanup();
});

describe('parseRulesFromContent', () => {
  it('parses bullet, numbered, and heading rules into stable ids', () => {
    const rules = parseRulesFromContent(RULES_MD);
    expect(rules.map((r) => r.text)).toEqual([
      '安全',
      '严禁对用户输入直接调用 exec / eval',
      '避免在业务代码中执行破坏性 SQL（如 DROP TABLE）',
      '风格',
      '函数式优先',
      '每个文件不超过 300 行',
    ]);
    expect(rules.map((r) => r.id)).toEqual([
      'rule_0',
      'rule_1',
      'rule_2',
      'rule_3',
      'rule_4',
      'rule_5',
    ]);
  });

  it('returns empty array for empty or bullet-less content', () => {
    expect(parseRulesFromContent('')).toEqual([]);
    expect(parseRulesFromContent('just a blob of prose\nwith no structure')).toEqual([]);
  });

  it('ignores headings deeper than h2 and empty bullets', () => {
    const rules = parseRulesFromContent('### h3 heading\n- \n- actual rule');
    expect(rules).toEqual([{ id: 'rule_0', text: 'actual rule' }]);
  });
});

describe('ViolationAuditPanel', () => {
  it('mounts with 3 cards and a disabled submit', () => {
    render(
      <ViolationAuditPanel
        sessionId="s1"
        violationExamples={EXAMPLES}
        rulesContent={RULES_MD}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mb-audit-root')).toBeInTheDocument();
    expect(screen.getByTestId('mb-violation-card-0')).toBeInTheDocument();
    expect(screen.getByTestId('mb-violation-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('mb-violation-card-2')).toBeInTheDocument();
    expect((screen.getByTestId('mb-audit-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders each card code and the optional AI-claimed reason', () => {
    render(
      <ViolationAuditPanel
        sessionId="s1"
        violationExamples={EXAMPLES}
        rulesContent={RULES_MD}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByTestId('mb-violation-card-0-code')).toHaveTextContent(
      'function computeTotal',
    );
    expect(screen.getByTestId('mb-violation-card-0-ai-reason')).toHaveTextContent(
      '遵循函数式风格',
    );
    // Card 2 has no aiClaimedReason → reason block should be absent.
    expect(screen.queryByTestId('mb-violation-card-2-ai-reason')).not.toBeInTheDocument();
  });

  it('rule select appears only when a card is marked as violation', () => {
    render(
      <ViolationAuditPanel
        sessionId="s1"
        violationExamples={EXAMPLES}
        rulesContent={RULES_MD}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('mb-violation-rule-select-0')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mb-violation-toggle-0'), {
      target: { value: 'violation' },
    });
    expect(screen.getByTestId('mb-violation-rule-select-0')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mb-violation-toggle-0'), {
      target: { value: 'compliant' },
    });
    expect(screen.queryByTestId('mb-violation-rule-select-0')).not.toBeInTheDocument();
  });

  it('rule select options reflect parsed rules from rulesContent', () => {
    render(
      <ViolationAuditPanel
        sessionId="s1"
        violationExamples={EXAMPLES}
        rulesContent={RULES_MD}
        onSubmit={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('mb-violation-toggle-0'), {
      target: { value: 'violation' },
    });
    const select = screen.getByTestId('mb-violation-rule-select-0') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    // First option is the placeholder, then rule_0..rule_5.
    expect(values).toEqual(['', 'rule_0', 'rule_1', 'rule_2', 'rule_3', 'rule_4', 'rule_5']);
  });

  it('submit button only enables after every card is marked (and violations have ruleIds)', () => {
    render(
      <ViolationAuditPanel
        sessionId="s1"
        violationExamples={EXAMPLES}
        rulesContent={RULES_MD}
        onSubmit={vi.fn()}
      />,
    );
    const submit = screen.getByTestId('mb-audit-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('mb-violation-toggle-0'), {
      target: { value: 'compliant' },
    });
    fireEvent.change(screen.getByTestId('mb-violation-toggle-1'), {
      target: { value: 'violation' },
    });
    // Still disabled: violation card has no ruleId yet + card 2 unmarked.
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('mb-violation-rule-select-1'), {
      target: { value: 'rule_1' },
    });
    // Still disabled: card 2 unmarked.
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('mb-violation-toggle-2'), {
      target: { value: 'violation' },
    });
    // Still disabled: card 2 violation has no ruleId.
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('mb-violation-rule-select-2'), {
      target: { value: 'rule_2' },
    });
    expect(submit.disabled).toBe(false);
  });

  it('onSubmit payload has exampleIndex, markedAsViolation, and violatedRuleId for each card', () => {
    const onSubmit = vi.fn();
    render(
      <ViolationAuditPanel
        sessionId="s1"
        violationExamples={EXAMPLES}
        rulesContent={RULES_MD}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByTestId('mb-violation-toggle-0'), {
      target: { value: 'compliant' },
    });
    fireEvent.change(screen.getByTestId('mb-violation-toggle-1'), {
      target: { value: 'violation' },
    });
    fireEvent.change(screen.getByTestId('mb-violation-rule-select-1'), {
      target: { value: 'rule_1' },
    });
    fireEvent.change(screen.getByTestId('mb-violation-toggle-2'), {
      target: { value: 'violation' },
    });
    fireEvent.change(screen.getByTestId('mb-violation-rule-select-2'), {
      target: { value: 'rule_2' },
    });
    fireEvent.click(screen.getByTestId('mb-audit-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      violations: [
        { exampleIndex: 0, markedAsViolation: false, violatedRuleId: undefined },
        { exampleIndex: 1, markedAsViolation: true, violatedRuleId: 'rule_1' },
        { exampleIndex: 2, markedAsViolation: true, violatedRuleId: 'rule_2' },
      ],
    });
  });

  it('clears ruleId when switching a card from violation back to compliant', () => {
    const onSubmit = vi.fn();
    render(
      <ViolationAuditPanel
        sessionId="s1"
        violationExamples={EXAMPLES}
        rulesContent={RULES_MD}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByTestId('mb-violation-toggle-0'), {
      target: { value: 'violation' },
    });
    fireEvent.change(screen.getByTestId('mb-violation-rule-select-0'), {
      target: { value: 'rule_1' },
    });
    fireEvent.change(screen.getByTestId('mb-violation-toggle-0'), {
      target: { value: 'compliant' },
    });
    fireEvent.change(screen.getByTestId('mb-violation-toggle-1'), {
      target: { value: 'compliant' },
    });
    fireEvent.change(screen.getByTestId('mb-violation-toggle-2'), {
      target: { value: 'compliant' },
    });
    fireEvent.click(screen.getByTestId('mb-audit-submit'));

    expect(onSubmit).toHaveBeenCalledWith({
      violations: [
        { exampleIndex: 0, markedAsViolation: false, violatedRuleId: undefined },
        { exampleIndex: 1, markedAsViolation: false, violatedRuleId: undefined },
        { exampleIndex: 2, markedAsViolation: false, violatedRuleId: undefined },
      ],
    });
  });

  it('allows submit without ruleId when rulesContent parses to zero rules (degrade)', () => {
    const onSubmit = vi.fn();
    render(
      <ViolationAuditPanel
        sessionId="s1"
        violationExamples={EXAMPLES}
        rulesContent=""
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByTestId('mb-audit-no-rules-hint')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('mb-violation-toggle-0'), {
      target: { value: 'violation' },
    });
    fireEvent.change(screen.getByTestId('mb-violation-toggle-1'), {
      target: { value: 'compliant' },
    });
    fireEvent.change(screen.getByTestId('mb-violation-toggle-2'), {
      target: { value: 'violation' },
    });
    // Rule select exists but is disabled (noRules).
    const ruleSelect = screen.getByTestId('mb-violation-rule-select-0') as HTMLSelectElement;
    expect(ruleSelect.disabled).toBe(true);

    fireEvent.click(screen.getByTestId('mb-audit-submit'));
    expect(onSubmit).toHaveBeenCalledWith({
      violations: [
        { exampleIndex: 0, markedAsViolation: true, violatedRuleId: undefined },
        { exampleIndex: 1, markedAsViolation: false, violatedRuleId: undefined },
        { exampleIndex: 2, markedAsViolation: true, violatedRuleId: undefined },
      ],
    });
  });

  it('disabled prop locks every toggle + submit', () => {
    const onSubmit = vi.fn();
    render(
      <ViolationAuditPanel
        sessionId="s1"
        violationExamples={EXAMPLES}
        rulesContent={RULES_MD}
        onSubmit={onSubmit}
        disabled
      />,
    );
    for (let i = 0; i < 3; i++) {
      expect((screen.getByTestId(`mb-violation-toggle-${i}`) as HTMLSelectElement).disabled).toBe(
        true,
      );
    }
    expect((screen.getByTestId('mb-audit-submit') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('mb-audit-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
