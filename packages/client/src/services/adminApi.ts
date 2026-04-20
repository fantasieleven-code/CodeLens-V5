/**
 * Admin API client — Task 12 Layer 2 cutover.
 *
 * A single module exposes the 7 Admin endpoints as `adminApi.*`. Each endpoint
 * has a mock implementation backed by the `pages/admin/mock/` fixtures and a
 * real implementation wired to Backend Task 15b under `/api/admin/*`. The
 * `VITE_ADMIN_API_MOCK` env switch (or the absence of `VITE_API_URL`) selects
 * which implementation is exported.
 *
 * Contract source: `@codelens-v5/shared/types/v5-admin-api.ts` (Task 15a).
 *
 * Auth: Day 2 AM adds Bearer-header injection + 401 logout once the auth
 * store lands. Day 1 AM keeps the transport layer plain.
 */

import { SUITES } from '@codelens-v5/shared';
import type {
  V5AdminExamInstance,
  V5AdminSessionReport,
  V5AdminSession,
  V5AdminStatsOverview,
  V5AdminSuite,
  V5AdminSessionCreateRequest,
  V5AdminSessionCreateResponse,
  V5AdminListSessionsParams,
  V5AdminSessionList,
} from '@codelens-v5/shared';
import { ADMIN_EXAM_INSTANCES, findExamInstanceById } from '../pages/admin/mock/admin-exam-instances-fixtures.js';
import {
  ADMIN_SESSIONS,
  findSessionById,
} from '../pages/admin/mock/admin-sessions-fixtures.js';
import { buildAdminStatsOverview } from '../pages/admin/mock/admin-stats-fixture.js';
import { REPORT_FIXTURES } from '../report/__fixtures__/index.js';

// ── Mock / real switch ───────────────────────────────────────────────

declare global {
  interface ImportMeta {
    readonly env?: Record<string, string | undefined>;
  }
}

function shouldUseMock(): boolean {
  const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
  if (env.VITE_ADMIN_API_MOCK === 'true') return true;
  if (env.VITE_ADMIN_API_MOCK === 'false') return false;
  return !env.VITE_API_URL;
}

// ── Mock implementations ─────────────────────────────────────────────

const SUITE_REPORT_BY_ID: Record<string, keyof typeof REPORT_FIXTURES> = {
  'sess-00001': 'a-fullstack-boundary',
  'sess-00002': 'sPlus-architect',
  'sess-00004': 'b-fullstack-danger',
  'sess-00006': 'sPlus-architect',
  'sess-00008': 'a-fullstack-boundary',
};

async function mockGetStatsOverview(): Promise<V5AdminStatsOverview> {
  return buildAdminStatsOverview();
}

async function mockListSessions(
  params: V5AdminListSessionsParams = {},
): Promise<V5AdminSessionList> {
  const { suiteId, status, orgId, page = 1, pageSize = 10 } = params;
  const filtered = ADMIN_SESSIONS.filter((s) => {
    if (suiteId && s.suiteId !== suiteId) return false;
    if (status && s.status !== status) return false;
    if (orgId && s.orgId !== orgId) return false;
    return true;
  });
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = (clampedPage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);
  return { items, page: clampedPage, pageSize, total, totalPages };
}

async function mockGetSession(sessionId: string): Promise<V5AdminSession> {
  const session = findSessionById(sessionId);
  if (!session) throw new Error(`session ${sessionId} not found`);
  return session;
}

async function mockGetSessionReport(
  sessionId: string,
): Promise<V5AdminSessionReport> {
  const session = findSessionById(sessionId);
  if (!session) throw new Error(`session ${sessionId} not found`);
  if (session.status !== 'COMPLETED') {
    throw new Error(`session ${sessionId} is not COMPLETED yet`);
  }
  const fixtureId = SUITE_REPORT_BY_ID[sessionId];
  // Fall back to a-fullstack-boundary so every completed session has a report
  // preview for the admin detail page.
  const report = fixtureId
    ? REPORT_FIXTURES[fixtureId]
    : REPORT_FIXTURES['a-fullstack-boundary'];
  return { ...report, sessionId };
}

async function mockCreateSession(
  req: V5AdminSessionCreateRequest,
): Promise<V5AdminSessionCreateResponse> {
  if (!req.suiteId) throw new Error('suiteId required');
  if (!req.examInstanceId) throw new Error('examInstanceId required');
  if (!req.candidate.name.trim()) throw new Error('candidate.name required');
  if (!req.candidate.email.trim()) throw new Error('candidate.email required');
  if (!findExamInstanceById(req.examInstanceId)) {
    throw new Error(`examInstance ${req.examInstanceId} not found`);
  }

  const id = `sess-${String(ADMIN_SESSIONS.length + 1).padStart(5, '0')}`;
  // The shareable link is what the recruiter sends to the candidate — it
  // must point to the candidate exam flow (`/exam/:sessionId`), not a
  // report URL. `/share/report/:token` remains reserved for future public
  // report-share feature (V5.1).
  const shareableLink = `/exam/${id}`;
  const session: V5AdminSession = {
    id,
    suiteId: req.suiteId,
    examInstanceId: req.examInstanceId,
    candidate: {
      id: `cand-${id}`,
      name: req.candidate.name.trim(),
      email: req.candidate.email.trim(),
    },
    status: 'CREATED',
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    grade: null,
    composite: null,
    shareableLink,
    orgId: req.orgId,
  };
  ADMIN_SESSIONS.unshift(session);
  return { session, shareableLink };
}

async function mockListExamInstances(params: {
  suiteId?: string;
  techStack?: string;
  domain?: string;
  level?: string;
} = {}): Promise<V5AdminExamInstance[]> {
  return ADMIN_EXAM_INSTANCES.filter((e) => {
    if (params.suiteId && e.suiteId !== params.suiteId) return false;
    if (params.techStack && e.techStack !== params.techStack) return false;
    if (params.domain && e.domain !== params.domain) return false;
    if (params.level && e.level !== params.level) return false;
    return true;
  });
}

async function mockGetSuites(): Promise<V5AdminSuite[]> {
  return Object.values(SUITES).map((s) => ({
    id: s.id,
    nameZh: s.nameZh,
    nameEn: s.nameEn,
    estimatedMinutes: s.estimatedMinutes,
    gradeCap: s.gradeCap,
    modules: s.modules,
  }));
}

// ── Real implementations (Task 12 Layer 2 cutover) ───────────────────

function requireApiUrl(): string {
  const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
  const base = env.VITE_API_URL;
  if (!base) throw new Error('VITE_API_URL not configured');
  return base.replace(/\/+$/, '');
}

async function realCreateSession(
  req: V5AdminSessionCreateRequest,
): Promise<V5AdminSessionCreateResponse> {
  const res = await fetch(`${requireApiUrl()}/api/admin/sessions/create`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`createSession failed: ${res.status}`);
  return res.json() as Promise<V5AdminSessionCreateResponse>;
}

async function realListSessions(
  params: V5AdminListSessionsParams = {},
): Promise<V5AdminSessionList> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    // Backend derives orgId from the admin token; never submit it.
    if (k === 'orgId') continue;
    if (v !== undefined) qs.set(k, String(v));
  }
  const res = await fetch(`${requireApiUrl()}/api/admin/sessions?${qs.toString()}`);
  if (!res.ok) throw new Error(`listSessions failed: ${res.status}`);
  return res.json() as Promise<V5AdminSessionList>;
}

async function realGetSession(sessionId: string): Promise<V5AdminSession> {
  const res = await fetch(`${requireApiUrl()}/api/admin/sessions/${sessionId}`);
  if (!res.ok) throw new Error(`getSession failed: ${res.status}`);
  return res.json() as Promise<V5AdminSession>;
}

async function realGetSessionReport(
  sessionId: string,
): Promise<V5AdminSessionReport> {
  const res = await fetch(
    `${requireApiUrl()}/api/admin/sessions/${sessionId}/report`,
  );
  if (!res.ok) {
    if (res.status === 400) throw new Error('REPORT_NOT_COMPLETED');
    throw new Error(`getSessionReport failed: ${res.status}`);
  }
  return res.json() as Promise<V5AdminSessionReport>;
}

async function realListExamInstances(params: {
  suiteId?: string;
  techStack?: string;
  domain?: string;
  level?: string;
} = {}): Promise<V5AdminExamInstance[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const res = await fetch(
    `${requireApiUrl()}/api/admin/exam-instances?${qs.toString()}`,
  );
  if (!res.ok) throw new Error(`listExamInstances failed: ${res.status}`);
  return res.json() as Promise<V5AdminExamInstance[]>;
}

async function realGetSuites(): Promise<V5AdminSuite[]> {
  const res = await fetch(`${requireApiUrl()}/api/admin/suites`);
  if (!res.ok) throw new Error(`getSuites failed: ${res.status}`);
  return res.json() as Promise<V5AdminSuite[]>;
}

async function realGetStatsOverview(): Promise<V5AdminStatsOverview> {
  const res = await fetch(`${requireApiUrl()}/api/admin/stats/overview`);
  if (!res.ok) throw new Error(`getStatsOverview failed: ${res.status}`);
  return res.json() as Promise<V5AdminStatsOverview>;
}

// ── Public surface ───────────────────────────────────────────────────

export interface AdminApi {
  createSession: typeof mockCreateSession;
  listSessions: typeof mockListSessions;
  getSession: typeof mockGetSession;
  getSessionReport: typeof mockGetSessionReport;
  listExamInstances: typeof mockListExamInstances;
  getSuites: typeof mockGetSuites;
  getStatsOverview: typeof mockGetStatsOverview;
}

export const adminApi: AdminApi = shouldUseMock()
  ? {
      createSession: mockCreateSession,
      listSessions: mockListSessions,
      getSession: mockGetSession,
      getSessionReport: mockGetSessionReport,
      listExamInstances: mockListExamInstances,
      getSuites: mockGetSuites,
      getStatsOverview: mockGetStatsOverview,
    }
  : {
      createSession: realCreateSession,
      listSessions: realListSessions,
      getSession: realGetSession,
      getSessionReport: realGetSessionReport,
      listExamInstances: realListExamInstances,
      getSuites: realGetSuites,
      getStatsOverview: realGetStatsOverview,
    };

export const __mockAdminApi__ = {
  createSession: mockCreateSession,
  listSessions: mockListSessions,
  getSession: mockGetSession,
  getSessionReport: mockGetSessionReport,
  listExamInstances: mockListExamInstances,
  getSuites: mockGetSuites,
  getStatsOverview: mockGetStatsOverview,
};
