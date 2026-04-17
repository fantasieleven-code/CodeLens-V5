/**
 * MB mock fixture — development default used when no module content is wired
 * in via prop. Same pattern as MA_MOCK_FIXTURE (packages/client/src/pages/moduleA/mock.ts).
 *
 * Backend Task 12/13 promotes this shape into `MBModuleSpecific` persisted on
 * ExamModule rows, at which point the page will receive the real data via
 * prop and the fixture can be retained only for tests / storybook.
 *
 * violationExamples shape is the **candidate-safe narrow form**:
 * `{ code, aiClaimedReason? }`. The backend-side MBViolationExample carries
 * groundTruth fields (isViolation, violationType, explanation) that NEVER
 * appear in this fixture — ViolationAuditPanel types them out, and Task 7.6
 * owns the strip/map when real data lands.
 */

import type { MultiFileEditorFile } from '../../components/editors/MultiFileEditor.js';

export interface MBMockModule {
  featureRequirement: {
    description: string;
    acceptanceCriteria: string[];
  };
  scaffold: {
    files: MultiFileEditorFile[];
    dependencyOrder: string[];
  };
  violationExamples: Array<{
    code: string;
    aiClaimedReason?: string;
  }>;
}

const SCAFFOLD_MAIN = `from typing import List, Dict

def filter_orders(orders: List[Dict], min_amount: float) -> List[Dict]:
    """Return orders whose total is at or above min_amount."""
    # TODO: candidate implements
    return []
`;

const SCAFFOLD_UTIL = `def order_total(order: dict) -> float:
    """Sum the \`items\` array prices, default 0 for missing."""
    return sum(item.get('price', 0) for item in order.get('items', []))
`;

const SCAFFOLD_TESTS = `from main import filter_orders

def test_filters_by_total():
    orders = [
        {'id': 1, 'items': [{'price': 100}]},
        {'id': 2, 'items': [{'price': 40}, {'price': 20}]},
    ]
    result = filter_orders(orders, 90)
    assert [o['id'] for o in result] == [1]
`;

export const MB_MOCK_FIXTURE: MBMockModule = {
  featureRequirement: {
    description:
      '实现 filter_orders(orders, min_amount)：返回总价不低于 min_amount 的订单。总价通过 order_total 计算。要求函数式写法，纯函数，无副作用。',
    acceptanceCriteria: [
      '返回的订单列表顺序与输入一致（保留稳定排序）',
      'min_amount = 0 时返回全部订单',
      '空 orders 数组返回空列表',
      '订单缺失 items 字段时视为总价 0',
      '不得修改传入的 orders 引用（纯函数）',
    ],
  },
  scaffold: {
    files: [
      { path: 'main.py', content: SCAFFOLD_MAIN, language: 'python' },
      { path: 'util.py', content: SCAFFOLD_UTIL, language: 'python' },
      { path: 'test_main.py', content: SCAFFOLD_TESTS, language: 'python' },
    ],
    dependencyOrder: ['util.py', 'main.py', 'test_main.py'],
  },
  violationExamples: [
    {
      code:
        'def filter_orders(orders, min_amount):\n    return [o for o in orders if order_total(o) >= min_amount]',
      aiClaimedReason: '使用列表推导，函数式写法，不修改原列表。',
    },
    {
      code:
        'def filter_orders(orders, min_amount):\n    orders.sort(key=lambda o: order_total(o), reverse=True)\n    return [o for o in orders if order_total(o) >= min_amount]',
      aiClaimedReason: '先按金额排序可以让结果更好看。',
    },
    {
      code:
        'def filter_orders(orders, min_amount):\n    result = []\n    for o in orders:\n        if order_total(o) >= min_amount:\n            result.append(o)\n    return result',
    },
  ],
};
