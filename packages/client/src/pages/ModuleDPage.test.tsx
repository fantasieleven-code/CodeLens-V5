/**
 * ModuleDPage integration tests — single-page MD UI (Task 8).
 *
 * Covers the seams the orchestrator owns:
 *   - designTask / NFR / designChallenge render from MDModuleSpecific
 *   - dynamic subModules: add, remove (always keep ≥1)
 *   - constraint chips toggle multi-select state
 *   - aiOrchestrationPrompts dynamic list
 *   - submit gating: ≥1 named submodule + responsibility + dataFlow + tradeoff
 *   - submit payload shape matches V5ModuleDSubmission (interfaces split on \n,
 *     empty submodules filtered, empty prompts filtered)
 *   - submit writes to session.store.submissions.moduleD
 *   - submit calls module.store.advance()
 *   - bare prop skips ModuleShell wrapping
 *   - fallback to MD_MOCK_FIXTURE when no `module` prop
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { V5ModuleDSubmission } from '@codelens-v5/shared';
import { ModuleDPage } from './ModuleDPage.js';
import { MD_MOCK_FIXTURE, type MDMockModule } from './moduleD/mock.js';
import { useModuleStore } from '../stores/module.store.js';
import { useSessionStore } from '../stores/session.store.js';

const ORDER = ['phase0', 'moduleA', 'moduleD', 'selfAssess', 'moduleC'] as const;

const SUBMODULE_A = {
  name: 'OrderWriteService',
  responsibility: '接收下单请求,落库前校验,异步发库存预扣消息。',
  interfaces: 'POST /order/create\nPUT /order/{id}/cancel',
};

const SUBMODULE_B = {
  name: 'OrderReadService',
  responsibility: '订单查询/列表,读自只读副本,响应 p99 < 50ms。',
  interfaces: '',
};

const INTERFACE_DEFS =
  'OrderWriteService → InventoryService:消息 inventory.reserve(orderId, items)\nOrderWriteService → PaymentService:RPC pay(orderId, amount)';

const DATA_FLOW =
  '用户 → API Gateway → OrderWriteService(校验+落库)→ Kafka(inventory.reserve)→ InventoryService → Kafka(inventory.reserved)→ OrderWriteService 状态推进';

const TRADEOFF =
  '放弃订单 + 库存的强一致(双写),换 5 万 QPS 下的写入吞吐;一致性回退到 saga + 对账 T+1 修正。';

const AI_PROMPT_A =
  '基于这段 OrderWriteService 的代码,生成 saga 补偿事务的伪代码,要求覆盖 3 种失败分支。';
const AI_PROMPT_B = '给我用 k6 生成 5 万 QPS 的下单压测脚本,覆盖热点 SKU 场景。';

function seedModuleD() {
  useModuleStore.getState().reset();
  useSessionStore.getState().reset();
  useModuleStore.getState().setSuite('architect', [...ORDER]);
  useModuleStore.getState().advance(); // → phase0
  useModuleStore.getState().advance(); // → moduleA
  useModuleStore.getState().advance(); // → moduleD
}

function fillSubmodule(
  idx: number,
  data: { name: string; responsibility: string; interfaces?: string },
) {
  fireEvent.change(screen.getByTestId(`md-submodule-${idx}-name`), {
    target: { value: data.name },
  });
  fireEvent.change(screen.getByTestId(`md-submodule-${idx}-responsibility`), {
    target: { value: data.responsibility },
  });
  if (data.interfaces !== undefined) {
    fireEvent.change(screen.getByTestId(`md-submodule-${idx}-interfaces`), {
      target: { value: data.interfaces },
    });
  }
}

function fillRequiredFields() {
  fillSubmodule(0, SUBMODULE_A);
  fireEvent.change(screen.getByTestId('md-data-flow'), {
    target: { value: DATA_FLOW },
  });
  fireEvent.change(screen.getByTestId('md-tradeoff-text'), {
    target: { value: TRADEOFF },
  });
}

describe('<ModuleDPage />', () => {
  beforeEach(() => {
    seedModuleD();
  });

  describe('initial render', () => {
    it('renders container, designTask, NFR list, and designChallenge hints', () => {
      render(<ModuleDPage />);
      expect(screen.getByTestId('moduleD-container')).toBeInTheDocument();
      expect(screen.getByTestId('md-design-task-display')).toBeInTheDocument();
      expect(screen.getByTestId('md-design-task-business-context')).toBeInTheDocument();

      // Every NFR from the mock fixture renders with a canonical testid.
      MD_MOCK_FIXTURE.designTask.nonFunctionalRequirements.forEach((_, i) => {
        expect(screen.getByTestId(`md-design-task-nfr-${i}`)).toBeInTheDocument();
      });

      expect(screen.getByTestId('md-design-challenges')).toBeInTheDocument();
      MD_MOCK_FIXTURE.designChallenges.forEach((_, i) => {
        expect(screen.getByTestId(`md-design-challenge-${i}`)).toBeInTheDocument();
      });
    });

    it('starts with exactly one submodule card and one AI prompt row', () => {
      render(<ModuleDPage />);
      expect(screen.getByTestId('md-submodule-card-0')).toBeInTheDocument();
      expect(screen.queryByTestId('md-submodule-card-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('md-ai-orchestration-0')).toBeInTheDocument();
      expect(screen.queryByTestId('md-ai-orchestration-1')).not.toBeInTheDocument();
    });

    it('renders one constraint chip per mock category', () => {
      render(<ModuleDPage />);
      MD_MOCK_FIXTURE.constraintCategories.forEach((cat) => {
        expect(screen.getByTestId(`md-constraint-${cat}`)).toBeInTheDocument();
      });
    });

    it('uses MD_MOCK_FIXTURE when no module prop is passed', () => {
      render(<ModuleDPage />);
      expect(
        screen.getByTestId('md-design-task-business-context').textContent,
      ).toContain(MD_MOCK_FIXTURE.designTask.businessContext);
    });

    it('wraps body in ModuleShell by default, skips shell when bare', () => {
      const { unmount } = render(<ModuleDPage />);
      expect(screen.getByTestId('module-shell')).toBeInTheDocument();
      unmount();

      render(<ModuleDPage bare />);
      expect(screen.queryByTestId('module-shell')).not.toBeInTheDocument();
      expect(screen.getByTestId('moduleD-container')).toBeInTheDocument();
    });

    it('accepts a custom module prop over the default fixture', () => {
      const custom: MDMockModule = {
        designTask: {
          description: 'custom-desc',
          businessContext: 'custom-biz',
          nonFunctionalRequirements: ['nfr-a'],
        },
        constraintCategories: ['只一类约束'],
        designChallenges: [
          { trigger: 'x', challenge: 'y' },
        ],
      };
      render(<ModuleDPage module={custom} />);
      expect(
        screen.getByTestId('md-design-task-business-context').textContent,
      ).toContain('custom-biz');
      expect(screen.getByTestId('md-design-task-nfr-0').textContent).toContain(
        'nfr-a',
      );
      expect(screen.getByTestId('md-constraint-只一类约束')).toBeInTheDocument();
    });
  });

  describe('dynamic submodules', () => {
    it('adds a new submodule card on "+ 添加子模块"', () => {
      render(<ModuleDPage />);
      expect(screen.queryByTestId('md-submodule-card-1')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('md-add-submodule'));
      expect(screen.getByTestId('md-submodule-card-1')).toBeInTheDocument();
    });

    it('removes a non-first submodule but never the last one', () => {
      render(<ModuleDPage />);
      fireEvent.click(screen.getByTestId('md-add-submodule'));
      expect(screen.getByTestId('md-submodule-card-1')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('md-submodule-remove-1'));
      expect(screen.queryByTestId('md-submodule-card-1')).not.toBeInTheDocument();

      // Only one card left → remove button hidden so the form can't collapse.
      expect(
        screen.queryByTestId('md-submodule-remove-0'),
      ).not.toBeInTheDocument();
    });
  });

  describe('dynamic AI orchestration prompts', () => {
    it('adds a prompt row on "+ 添加 prompt"', () => {
      render(<ModuleDPage />);
      expect(screen.queryByTestId('md-ai-orchestration-1')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('md-add-ai-orchestration'));
      expect(screen.getByTestId('md-ai-orchestration-1')).toBeInTheDocument();
    });

    it('removes a non-first prompt but never the last row', () => {
      render(<ModuleDPage />);
      fireEvent.click(screen.getByTestId('md-add-ai-orchestration'));
      fireEvent.click(screen.getByTestId('md-ai-orchestration-remove-1'));
      expect(screen.queryByTestId('md-ai-orchestration-1')).not.toBeInTheDocument();

      // One row left → its remove button is hidden.
      expect(
        screen.queryByTestId('md-ai-orchestration-remove-0'),
      ).not.toBeInTheDocument();
    });
  });

  describe('constraints multi-select', () => {
    it('toggles aria-pressed on chip click', () => {
      render(<ModuleDPage />);
      const first = MD_MOCK_FIXTURE.constraintCategories[0];
      const chip = screen.getByTestId(`md-constraint-${first}`);
      expect(chip).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(chip);
      expect(chip).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(chip);
      expect(chip).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('submit gating', () => {
    it('leaves md-submit disabled and shows warn text when required fields missing', () => {
      render(<ModuleDPage />);
      const submit = screen.getByTestId('md-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      expect(screen.getByTestId('md-submit-warn')).toBeInTheDocument();
    });

    it('stays disabled when only name is present but responsibility is empty', () => {
      render(<ModuleDPage />);
      fireEvent.change(screen.getByTestId('md-submodule-0-name'), {
        target: { value: SUBMODULE_A.name },
      });
      fireEvent.change(screen.getByTestId('md-data-flow'), {
        target: { value: DATA_FLOW },
      });
      fireEvent.change(screen.getByTestId('md-tradeoff-text'), {
        target: { value: TRADEOFF },
      });
      expect(
        (screen.getByTestId('md-submit') as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    it('stays disabled when dataFlow is empty', () => {
      render(<ModuleDPage />);
      fillSubmodule(0, SUBMODULE_A);
      fireEvent.change(screen.getByTestId('md-tradeoff-text'), {
        target: { value: TRADEOFF },
      });
      expect(
        (screen.getByTestId('md-submit') as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    it('stays disabled when tradeoff is empty', () => {
      render(<ModuleDPage />);
      fillSubmodule(0, SUBMODULE_A);
      fireEvent.change(screen.getByTestId('md-data-flow'), {
        target: { value: DATA_FLOW },
      });
      expect(
        (screen.getByTestId('md-submit') as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    it('enables md-submit and hides warn once required fields filled', () => {
      render(<ModuleDPage />);
      fillRequiredFields();
      expect(
        (screen.getByTestId('md-submit') as HTMLButtonElement).disabled,
      ).toBe(false);
      expect(screen.queryByTestId('md-submit-warn')).not.toBeInTheDocument();
    });
  });

  describe('submit payload shape', () => {
    it('emits V5ModuleDSubmission with interfaces split on newlines + empty submodules filtered', () => {
      const captured: { s: V5ModuleDSubmission | null } = { s: null };
      render(<ModuleDPage onSubmit={(s) => (captured.s = s)} />);

      // Fill #0 with interfaces, add #1 and leave empty, add #2 with no interfaces.
      fillSubmodule(0, SUBMODULE_A);
      fireEvent.click(screen.getByTestId('md-add-submodule')); // idx 1 (empty, will be filtered)
      fireEvent.click(screen.getByTestId('md-add-submodule')); // idx 2
      fillSubmodule(2, SUBMODULE_B);

      fireEvent.change(screen.getByTestId('md-interface-definitions'), {
        target: { value: INTERFACE_DEFS },
      });
      fireEvent.change(screen.getByTestId('md-data-flow'), {
        target: { value: DATA_FLOW },
      });
      fireEvent.change(screen.getByTestId('md-tradeoff-text'), {
        target: { value: TRADEOFF },
      });

      // Select two constraints.
      const c0 = MD_MOCK_FIXTURE.constraintCategories[0];
      const c1 = MD_MOCK_FIXTURE.constraintCategories[1];
      fireEvent.click(screen.getByTestId(`md-constraint-${c0}`));
      fireEvent.click(screen.getByTestId(`md-constraint-${c1}`));

      // Two AI prompts (second added).
      fireEvent.change(screen.getByTestId('md-ai-orchestration-0'), {
        target: { value: AI_PROMPT_A },
      });
      fireEvent.click(screen.getByTestId('md-add-ai-orchestration'));
      fireEvent.change(screen.getByTestId('md-ai-orchestration-1'), {
        target: { value: AI_PROMPT_B },
      });

      fireEvent.click(screen.getByTestId('md-submit'));

      const s = captured.s;
      expect(s).not.toBeNull();

      // Empty submodule #1 dropped; #0 and #2 kept in order.
      expect(s?.subModules).toHaveLength(2);
      expect(s?.subModules[0]).toEqual({
        name: SUBMODULE_A.name,
        responsibility: SUBMODULE_A.responsibility,
        interfaces: ['POST /order/create', 'PUT /order/{id}/cancel'],
      });
      // #2 has no interfaces — the field is omitted per canonical shape.
      expect(s?.subModules[1]).toEqual({
        name: SUBMODULE_B.name,
        responsibility: SUBMODULE_B.responsibility,
      });
      expect(s?.subModules[1]).not.toHaveProperty('interfaces');

      expect(s?.interfaceDefinitions).toEqual([
        'OrderWriteService → InventoryService:消息 inventory.reserve(orderId, items)',
        'OrderWriteService → PaymentService:RPC pay(orderId, amount)',
      ]);
      expect(s?.dataFlowDescription).toBe(DATA_FLOW);
      expect(s?.constraintsSelected).toEqual([c0, c1]);
      expect(s?.tradeoffText).toBe(TRADEOFF);
      expect(s?.aiOrchestrationPrompts).toEqual([AI_PROMPT_A, AI_PROMPT_B]);
    });

    it('filters empty AI prompt rows from the payload', () => {
      const captured: { s: V5ModuleDSubmission | null } = { s: null };
      render(<ModuleDPage onSubmit={(s) => (captured.s = s)} />);

      fillRequiredFields();
      // Default prompt row stays empty → should be filtered.
      fireEvent.click(screen.getByTestId('md-submit'));
      expect(captured.s?.aiOrchestrationPrompts).toEqual([]);
    });

    it('writes the submission to session.store and advances module.store', () => {
      render(<ModuleDPage />);
      fillRequiredFields();
      expect(useModuleStore.getState().currentModule).toBe('moduleD');

      fireEvent.click(screen.getByTestId('md-submit'));

      const stored = useSessionStore.getState().submissions.moduleD;
      expect(stored).toBeDefined();
      expect(stored?.subModules).toHaveLength(1);
      expect(stored?.subModules[0]?.name).toBe(SUBMODULE_A.name);
      expect(stored?.dataFlowDescription).toBe(DATA_FLOW);
      expect(stored?.tradeoffText).toBe(TRADEOFF);

      // architect ORDER: moduleD → selfAssess.
      expect(useModuleStore.getState().currentModule).toBe('selfAssess');
    });

    it('does nothing when submit is clicked while gated', () => {
      const captured = { called: false };
      render(<ModuleDPage onSubmit={() => (captured.called = true)} />);
      // Disabled button still receives click events in jsdom; the handler is a no-op.
      fireEvent.click(screen.getByTestId('md-submit'));
      expect(captured.called).toBe(false);
      expect(useSessionStore.getState().submissions.moduleD).toBeUndefined();
      expect(useModuleStore.getState().currentModule).toBe('moduleD');
    });
  });

  describe('mock fixture integrity', () => {
    it('ships 5-7 constraint categories and ≥2 design challenges', () => {
      expect(MD_MOCK_FIXTURE.constraintCategories.length).toBeGreaterThanOrEqual(5);
      expect(MD_MOCK_FIXTURE.constraintCategories.length).toBeLessThanOrEqual(7);
      expect(MD_MOCK_FIXTURE.designChallenges.length).toBeGreaterThanOrEqual(2);
    });

    it('never leaks expectedSubModules (groundTruth) into the candidate-facing shape', () => {
      // MDMockModule must not expose the参考答案 used by sScopeAwareness.
      expect(MD_MOCK_FIXTURE).not.toHaveProperty('expectedSubModules');
    });
  });
});
