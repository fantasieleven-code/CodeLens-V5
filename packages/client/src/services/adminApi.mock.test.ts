import { describe, expect, it } from 'vitest';
import { __mockAdminApi__ } from './adminApi.js';
import { ADMIN_SESSIONS } from '../pages/admin/mock/admin-sessions-fixtures.js';
import { ADMIN_EXAM_INSTANCES } from '../pages/admin/mock/admin-exam-instances-fixtures.js';

describe('adminApi mock', () => {
  it('getStatsOverview sums sessions and derives grade distribution', async () => {
    const stats = await __mockAdminApi__.getStatsOverview();
    expect(stats.totalSessions).toBe(ADMIN_SESSIONS.length);
    expect(stats.completedSessions).toBeGreaterThan(0);
    const completedCount = ADMIN_SESSIONS.filter((s) => s.status === 'COMPLETED').length;
    expect(stats.completedSessions).toBe(completedCount);
    const gradeTotal = Object.values(stats.gradeDistribution).reduce((a, b) => a + b, 0);
    expect(gradeTotal).toBe(completedCount);
  });

  it('listSessions paginates', async () => {
    const page1 = await __mockAdminApi__.listSessions({ page: 1, pageSize: 3 });
    expect(page1.items).toHaveLength(3);
    expect(page1.page).toBe(1);
    expect(page1.pageSize).toBe(3);
    expect(page1.total).toBeGreaterThanOrEqual(3);
    expect(page1.totalPages).toBe(Math.ceil(page1.total / 3));
  });

  it('listSessions filters by suiteId', async () => {
    const { items } = await __mockAdminApi__.listSessions({
      suiteId: 'architect',
      pageSize: 50,
    });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((s) => s.suiteId === 'architect')).toBe(true);
  });

  it('listSessions filters by status', async () => {
    const { items } = await __mockAdminApi__.listSessions({
      status: 'COMPLETED',
      pageSize: 50,
    });
    expect(items.every((s) => s.status === 'COMPLETED')).toBe(true);
  });

  it('getSession throws for unknown id', async () => {
    await expect(__mockAdminApi__.getSession('nope')).rejects.toThrow(/not found/);
  });

  it('getSessionReport returns a ReportViewModel for completed sessions', async () => {
    const completed = ADMIN_SESSIONS.find((s) => s.status === 'COMPLETED');
    if (!completed) throw new Error('fixture invariant broken');
    const report = await __mockAdminApi__.getSessionReport(completed.id);
    expect(report.sessionId).toBe(completed.id);
    expect(report.suite).toBeDefined();
    expect(report.gradeDecision).toBeDefined();
    expect(Array.isArray(report.capabilityProfiles)).toBe(true);
  });

  it('getSessionReport rejects for non-completed sessions', async () => {
    const inProgress = ADMIN_SESSIONS.find((s) => s.status === 'IN_PROGRESS');
    if (!inProgress) throw new Error('fixture invariant broken');
    await expect(
      __mockAdminApi__.getSessionReport(inProgress.id),
    ).rejects.toThrow(/not COMPLETED/);
  });

  it('createSession pushes a new CREATED session and returns shareableLink', async () => {
    const prevCount = ADMIN_SESSIONS.length;
    const res = await __mockAdminApi__.createSession({
      suiteId: 'full_stack',
      examInstanceId: ADMIN_EXAM_INSTANCES[0].id,
      candidate: { name: 'Test Candidate', email: 'test@example.com' },
    });
    expect(res.session.status).toBe('CREATED');
    expect(res.shareableLink).toMatch(/^\/share\/report\/tok-/);
    expect(ADMIN_SESSIONS.length).toBe(prevCount + 1);
    expect(ADMIN_SESSIONS[0].id).toBe(res.session.id);
    // Cleanup so the side effect doesn't leak into other tests.
    ADMIN_SESSIONS.shift();
  });

  it('createSession rejects when required fields are missing', async () => {
    await expect(
      __mockAdminApi__.createSession({
        suiteId: 'full_stack',
        examInstanceId: ADMIN_EXAM_INSTANCES[0].id,
        candidate: { name: '', email: 'x@y.com' },
      }),
    ).rejects.toThrow(/name required/);
  });

  it('listExamInstances filters by techStack', async () => {
    const list = await __mockAdminApi__.listExamInstances({ techStack: 'java_spring' });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((e) => e.techStack === 'java_spring')).toBe(true);
  });

  it('listExamInstances filters by level', async () => {
    const list = await __mockAdminApi__.listExamInstances({ level: 'senior' });
    expect(list.every((e) => e.level === 'senior')).toBe(true);
  });

  it('getSuites returns all 5 suites with metadata', async () => {
    const suites = await __mockAdminApi__.getSuites();
    expect(suites).toHaveLength(5);
    for (const s of suites) {
      expect(s.id).toBeDefined();
      expect(s.nameZh).toBeTruthy();
      expect(s.estimatedMinutes).toBeGreaterThan(0);
      expect(s.modules.length).toBeGreaterThan(0);
    }
  });
});
