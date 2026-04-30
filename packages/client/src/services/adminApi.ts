/**
 * Admin API client — Task 12 Layer 2 cutover.
 *
 * A single module exposes the Admin endpoints as `adminApi.*`. Each endpoint
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
import { useAuthStore } from '../stores/auth.store.js';
import type {
  V5AdminExamInstance,
  V5AdminSessionReport,
  V5AdminSession,
  V5AdminStatsOverview,
  V5AdminSuite,
  V5AdminSessionCreateRequest,
  V5AdminSessionCreateResponse,
  V5AdminSessionLinksResponse,
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

export class AdminApiError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly details?: unknown;

  constructor(
    code: string,
    status: number | null,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AdminApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// ── Mock / real switch ───────────────────────────────────────────────

declare global {
  interface ImportMeta {
    readonly env?: Record<string, string | undefined>;
  }
}

function shouldUseMock(): boolean {
  const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
  // Component tests are fixture-backed by default. A developer shell can
  // legitimately export VITE_API_URL for manual real-backend smoke work, but
  // letting packages/client/.env leak into Vitest flips admin pages to real
  // fetch and makes local full client tests depend on a live server.
  if (env.MODE === 'test') return true;
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

async function mockGetSessionLinks(
  sessionId: string,
): Promise<V5AdminSessionLinksResponse> {
  const session = findSessionById(sessionId);
  if (!session) throw new Error(`session ${sessionId} not found`);
  const shareableLink = session.shareableLink ?? `/exam/${sessionId}`;
  const candidateToken = `mock-token-${sessionId}`;
  const candidateSelfViewToken = `mock-selfview-${sessionId}`;
  return {
    sessionId,
    shareableLink,
    candidateToken,
    candidateSelfViewToken,
    selfViewUrl: `/candidate/self-view/${sessionId}/${candidateSelfViewToken}`,
  };
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
  // Task B-A10-lite · deterministic mock stubs for the two separate tokens
  // + pre-rendered self-view URL. Real backend mints via randomBytes(32)
  // and returns the same field names.
  const candidateSelfViewToken = `mock-selfview-${session.id}`;
  return {
    session,
    shareableLink,
    // Task B-A12 auth-fallback: real backend mints via crypto.randomBytes(32).
    // Mock stub produces a deterministic value so downstream UI renders.
    candidateToken: `mock-token-${session.id}`,
    candidateSelfViewToken,
    selfViewUrl: `/candidate/self-view/${session.id}/${candidateSelfViewToken}`,
  };
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

/**
 * Centralized fetch wrapper for `/api/admin/*`.
 *
 * - Uses RELATIVE paths so the request hits the same origin as the page (the
 *   vite dev/CI proxy forwards `/api` → :4000; production is reverse-proxied
 *   same-origin). This mirrors authApi's Hotfix #11 C7 pattern and avoids
 *   cross-origin CORS overhead. `VITE_API_URL` is preserved as the
 *   mock/real toggle in `shouldUseMock()` but its value is no longer used as
 *   a URL prefix.
 * - Injects `Authorization: Bearer …` from the auth store so every admin call
 *   carries the admin JWT without the call sites threading the token through.
 * - Flips the auth store to logged-out on 401 so AdminGuard's next render
 *   bounces the admin to `/login`, preventing a loop where a stale token
 *   keeps firing failing requests.
 * - Callers receive the raw Response and decide how to parse/throw, because
 *   one endpoint (getSessionReport) encodes a domain-specific 400.
 */
async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    useAuthStore.getState().logout();
  }
  return res;
}

function parseAdminErrorBody(
  body: unknown,
  status: number,
): { code: string; message: string; details?: unknown } {
  if (body && typeof body === 'object') {
    const errField = (body as { error?: unknown }).error;
    if (errField && typeof errField === 'object') {
      const nested = errField as {
        code?: unknown;
        message?: unknown;
        details?: unknown;
      };
      const code = typeof nested.code === 'string' ? nested.code : 'UNKNOWN';
      const message =
        typeof nested.message === 'string'
          ? nested.message
          : `Admin request failed: ${status}`;
      return { code, message, details: nested.details };
    }
    if (typeof errField === 'string') {
      return {
        code:
          status === 401
            ? 'AUTH_REQUIRED'
            : status === 403
              ? 'FORBIDDEN'
              : 'UNKNOWN',
        message: errField,
      };
    }
  }
  return { code: 'UNKNOWN', message: `Admin request failed: ${status}` };
}

async function throwAdminApiError(
  res: Response,
  operation: string,
): Promise<never> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON bodies fall through to UNKNOWN with status context */
  }
  const { code, message, details } = parseAdminErrorBody(body, res.status);
  throw new AdminApiError(code, res.status, `${operation}: ${message}`, details);
}

async function realCreateSession(
  req: V5AdminSessionCreateRequest,
): Promise<V5AdminSessionCreateResponse> {
  const res = await adminFetch('/api/admin/sessions/create', {
    method: 'POST',
    body: JSON.stringify(req),
  });
  if (!res.ok) await throwAdminApiError(res, 'createSession');
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
  const res = await adminFetch(`/api/admin/sessions?${qs.toString()}`);
  if (!res.ok) await throwAdminApiError(res, 'listSessions');
  return res.json() as Promise<V5AdminSessionList>;
}

async function realGetSession(sessionId: string): Promise<V5AdminSession> {
  const res = await adminFetch(`/api/admin/sessions/${sessionId}`);
  if (!res.ok) await throwAdminApiError(res, 'getSession');
  return res.json() as Promise<V5AdminSession>;
}

async function realGetSessionLinks(
  sessionId: string,
): Promise<V5AdminSessionLinksResponse> {
  const res = await adminFetch(`/api/admin/sessions/${sessionId}/links`);
  if (!res.ok) await throwAdminApiError(res, 'getSessionLinks');
  return res.json() as Promise<V5AdminSessionLinksResponse>;
}

async function realGetSessionReport(
  sessionId: string,
): Promise<V5AdminSessionReport> {
  const res = await adminFetch(`/api/admin/sessions/${sessionId}/report`);
  if (!res.ok) {
    if (res.status === 400) throw new Error('REPORT_NOT_COMPLETED');
    await throwAdminApiError(res, 'getSessionReport');
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
  const res = await adminFetch(`/api/admin/exam-instances?${qs.toString()}`);
  if (!res.ok) await throwAdminApiError(res, 'listExamInstances');
  return res.json() as Promise<V5AdminExamInstance[]>;
}

async function realGetSuites(): Promise<V5AdminSuite[]> {
  const res = await adminFetch('/api/admin/suites');
  if (!res.ok) await throwAdminApiError(res, 'getSuites');
  return res.json() as Promise<V5AdminSuite[]>;
}

async function realGetStatsOverview(): Promise<V5AdminStatsOverview> {
  const res = await adminFetch('/api/admin/stats/overview');
  if (!res.ok) await throwAdminApiError(res, 'getStatsOverview');
  return res.json() as Promise<V5AdminStatsOverview>;
}

// ── Public surface ───────────────────────────────────────────────────

export interface AdminApi {
  createSession: typeof mockCreateSession;
  listSessions: typeof mockListSessions;
  getSession: typeof mockGetSession;
  getSessionLinks: typeof mockGetSessionLinks;
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
      getSessionLinks: mockGetSessionLinks,
      getSessionReport: mockGetSessionReport,
      listExamInstances: mockListExamInstances,
      getSuites: mockGetSuites,
      getStatsOverview: mockGetStatsOverview,
    }
  : {
      createSession: realCreateSession,
      listSessions: realListSessions,
      getSession: realGetSession,
      getSessionLinks: realGetSessionLinks,
      getSessionReport: realGetSessionReport,
      listExamInstances: realListExamInstances,
      getSuites: realGetSuites,
      getStatsOverview: realGetStatsOverview,
    };

export const __adminFetch__ = adminFetch;
export const __parseAdminErrorBody__ = parseAdminErrorBody;
export const __throwAdminApiError__ = throwAdminApiError;

export const __mockAdminApi__ = {
  createSession: mockCreateSession,
  listSessions: mockListSessions,
  getSession: mockGetSession,
  getSessionLinks: mockGetSessionLinks,
  getSessionReport: mockGetSessionReport,
  listExamInstances: mockListExamInstances,
  getSuites: mockGetSuites,
  getStatsOverview: mockGetStatsOverview,
};
