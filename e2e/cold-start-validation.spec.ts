/**
 * V5.0 Cold Start Validation · release gate.
 *
 * This is intentionally stricter than `golden-path.spec.ts`.
 * Golden Path B3 proves calibrated fixture grades on the admin report surface.
 * Cold Start proves a newly-created real session can travel through every V5
 * module namespace and render the admin report with no missing signal values.
 */

import { test, expect, type Page } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';
import type { V5AdminSessionReport, V5ModuleDSubmission } from '@codelens-v5/shared';

import { GoldenPathDriver, type GoldenPathDriverFixture } from './helpers/golden-path-driver.js';
import { liamSGradeFixture } from '../packages/server/src/tests/fixtures/golden-path/liam-s-grade.js';
import { CANONICAL_EXAM_ID } from '../packages/server/src/data/canonical-v5-exam-data.js';

loadDotenv({ path: 'packages/server/.env' });

const ADMIN_CREDS = {
  email: process.env.ADMIN_EMAIL || 'admin@codelens.dev',
  password: process.env.ADMIN_PASSWORD || 'ci-test-password-1234',
};

const DEEP_DIVE_MODULES = ['phase0', 'moduleA', 'mb', 'moduleD', 'selfAssess', 'moduleC'] as const;

const LIAM_MD_SUBMISSION: V5ModuleDSubmission = {
  subModules: [
    {
      name: 'OrderController',
      responsibility: '订单入口;参数校验、限流 5k QPS、转发 OrderService,保留 requestId 用于幂等。',
      interfaces: ['POST /orders', 'GET /orders/:id'],
    },
    {
      name: 'InventoryService',
      responsibility: '库存扣减;Redis Lua 原子扣减,失败抛 OversoldError,成功后异步落 MySQL。',
      interfaces: ['reduce(skuId, qty)', 'compensate(orderId)'],
    },
    {
      name: 'OrderPersistence',
      responsibility: '订单写入 MySQL,唯一索引保证幂等,失败时触发补偿流程。',
      interfaces: ['create(order)', 'markPaid(orderId)'],
    },
    {
      name: 'SettlementWorker',
      responsibility: 'Kafka consumer 落库与对账,5 分钟窗口修复 Redis/MySQL diff 并告警。',
      interfaces: ['consume(event)', 'reconcile(window)'],
    },
  ],
  interfaceDefinitions: [
    'POST /orders {skuId, qty, requestId} -> 200 {orderId} / 409 Oversold',
    'reduce(skuId, qty, requestId) -> Promise<{ok, remain}>',
  ],
  dataFlowDescription:
    'Client -> OrderController -> InventoryService.reduce(Redis Lua) -> OrderPersistence.create -> SettlementWorker async reconcile; failure path invokes compensator and on-call alert.',
  constraintsSelected: [
    'performance · P99 < 50ms + sharding 平衡',
    'consistency · cross-shard 事务 + 对账',
    'availability · sentinel + 多副本 + RTO',
    'observability · per-shard metrics + Grafana',
    'cost · Redis cluster + MySQL slice 容量规划',
    'maintainability · shard 扩缩容 ops 流程',
  ],
  tradeoffText:
    '推荐 Redis 预扣 + MySQL 最终扣减 + Kafka 对账。纯 Redis 延迟低但一致性弱,纯 MySQL 一致性强但锁冲突无法承载 100k QPS。组合方案用 Redis Lua 扛峰值,requestId 保证幂等,MySQL 与对账任务保证最终真实性,以复杂度换性能和一致性。',
  aiOrchestrationPrompts: [
    '你是 InventoryService agent。实现 reduce(skuId, qty, requestId),必须 Redis Lua 原子扣减、幂等、防超卖、超时 300ms。',
    '你是 OrderPersistence agent。写入 MySQL 订单,使用唯一索引(user_id, sku_id, request_id)处理重复请求,返回既有 orderId。',
    '你是 Reconciliation agent。消费 Kafka 事件,比较 Redis 与 MySQL 库存差异,最多重试 3 次,失败告警 on-call。',
  ],
};

async function fetchAdminReport(page: Page, sessionId: string): Promise<V5AdminSessionReport> {
  return page.evaluate(async (sid) => {
    const raw = localStorage.getItem('codelens_admin_auth');
    if (!raw) throw new Error('admin auth snapshot missing');
    const { token } = JSON.parse(raw) as { token?: string };
    if (!token) throw new Error('admin auth token missing');
    const res = await fetch(`/api/admin/sessions/${sid}/report`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`admin report fetch failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as V5AdminSessionReport;
  }, sessionId);
}

test.describe('Cold Start Validation · deep_dive all modules', () => {
  test.setTimeout(420_000);

  test('completes a fresh real session with 48/48 non-null signals and 0 report N/A', async ({
    page,
  }) => {
    const fixture: GoldenPathDriverFixture = {
      ...liamSGradeFixture,
      suiteId: 'deep_dive',
      participatingModules: DEEP_DIVE_MODULES,
      submissions: {
        ...liamSGradeFixture.submissions,
        moduleD: LIAM_MD_SUBMISSION,
      },
      grade: 'S',
      candidate: {
        name: 'Cold Start Liam',
        email: `cold-start-liam-${Date.now()}@test.local`,
        yearsOfExperience: 8,
        primaryTechStack: ['TypeScript', 'React', 'Node.js'],
      },
      examId: CANONICAL_EXAM_ID,
    };

    const driver = new GoldenPathDriver(page, ADMIN_CREDS);
    const { sessionId } = await driver.runFullGoldenPath(fixture);

    const report = await fetchAdminReport(page, sessionId);
    const definitionIds = report.signalDefinitions.map((d) => d.id);
    const resultIds = Object.keys(report.signalResults);
    const missingResults = definitionIds.filter((id) => !(id in report.signalResults));
    const nullSignals = definitionIds.filter((id) => {
      const result = report.signalResults[id];
      return !result || result.value === null || result.value === undefined;
    });

    expect(report.suite.id).toBe('deep_dive');
    expect(report.participatingModules).toEqual([...DEEP_DIVE_MODULES]);
    expect(definitionIds).toHaveLength(48);
    expect(resultIds).toHaveLength(48);
    expect(missingResults, `missing signal results: ${missingResults.join(', ')}`).toEqual([]);
    expect(nullSignals, `null signals: ${nullSignals.join(', ')}`).toEqual([]);

    await page.goto(`/admin/sessions/${sessionId}`);
    const reportRoot = page.locator('[data-testid="admin-session-detail-report"]');
    await reportRoot.waitFor({ state: 'visible', timeout: 30_000 });

    await expect(
      page.locator('[data-testid="admin-session-detail-report-incomplete"]'),
    ).toHaveCount(0);
    await expect(page.locator('[data-testid="admin-session-detail-report-pending"]')).toHaveCount(
      0,
    );
    await expect(reportRoot.getByText(/待评估|N\/A/)).toHaveCount(0);
    await expect(page.locator('[data-testid="signal-na-row"]')).toHaveCount(0);
  });
});
