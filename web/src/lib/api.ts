export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface Job {
  id: string;
  name: string;
  status: JobStatus;
  createdAt: string;
  durationMs: number;
  command: string;
  log: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  revoked: boolean;
}

const MOCK_JOBS: Job[] = [
  {
    id: "job-001",
    name: "build-frontend",
    status: "succeeded",
    createdAt: "2026-11-18T10:02:00Z",
    durationMs: 48210,
    command: "npm run build",
    log: "$ npm run build\n✓ built in 48.2s\n",
  },
  {
    id: "job-002",
    name: "run-tests",
    status: "running",
    createdAt: "2026-11-19T08:15:00Z",
    durationMs: 12300,
    command: "npm test -- --coverage",
    log: "$ npm test\n⠋ running 42 tests…\n",
  },
  {
    id: "job-003",
    name: "lint",
    status: "failed",
    createdAt: "2026-11-19T07:40:00Z",
    durationMs: 8210,
    command: "npm run lint",
    log: "$ npm run lint\n✗ 3 errors in src/pages/Jobs.tsx\n",
  },
  {
    id: "job-004",
    name: "deploy-preview",
    status: "queued",
    createdAt: "2026-11-19T09:00:00Z",
    durationMs: 0,
    command: "npm run deploy:preview",
    log: "waiting for runner…\n",
  },
];

const MOCK_KEYS: ApiKey[] = [
  { id: "key-1", name: "ci-main", prefix: "cr_live_7f3a", createdAt: "2026-10-01", revoked: false },
  { id: "key-2", name: "local-dev", prefix: "cr_test_9b1c", createdAt: "2026-11-02", revoked: false },
  { id: "key-3", name: "old-runner", prefix: "cr_live_2d8e", createdAt: "2026-08-14", revoked: true },
];

const BASE = import.meta.env.VITE_DAEMON_URL ?? "";

async function tryFetch<T>(path: string, init?: RequestInit, fallback?: T): Promise<T> {
  if (!BASE) return fallback as T;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "content-type": "application/json" },
      ...init,
    });
    if (!res.ok) throw new Error(`daemon ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback as T;
  }
}

export const api = {
  listJobs: () => tryFetch<Job[]>("/jobs", undefined, MOCK_JOBS),
  getJob: (id: string) =>
    tryFetch<Job>(`/jobs/${id}`, undefined, MOCK_JOBS.find((j) => j.id === id) ?? MOCK_JOBS[0]),
  runJob: (name: string, command: string) =>
    tryFetch<Job>(
      "/run",
      { method: "POST", body: JSON.stringify({ name, command }) },
      {
        id: `job-${Date.now()}`,
        name,
        status: "queued",
        createdAt: new Date().toISOString(),
        durationMs: 0,
        command,
        log: "queued by dashboard\n",
      },
    ),
  listKeys: () => tryFetch<ApiKey[]>("/keys", undefined, MOCK_KEYS),
  createKey: (name: string) =>
    tryFetch<ApiKey>(
      "/keys",
      { method: "POST", body: JSON.stringify({ name }) },
      {
        id: `key-${Date.now()}`,
        name,
        prefix: "cr_live_mock",
        createdAt: new Date().toISOString().slice(0, 10),
        revoked: false,
      },
    ),
  revokeKey: (id: string) => tryFetch<{ ok: boolean }>(`/keys/${id}`, { method: "DELETE" }, { ok: true }),
};

export const mockJobs = MOCK_JOBS;
export const mockKeys = MOCK_KEYS;
