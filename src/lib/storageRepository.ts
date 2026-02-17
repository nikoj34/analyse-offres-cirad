/**
 * Storage Repository Abstraction
 *
 * Provides a pluggable async storage interface for project data.
 * Two implementations:
 *   - LocalStorageRepository (fallback, single-user)
 *   - RestApiRepository (multi-user, SQLite backend)
 */

import type { ProjectData } from "@/types/project";

export interface ProjectLock {
  lockedBy: string;
  lockedAt: string;
}

export interface StorageRepository {
  loadAll(): Promise<Record<string, ProjectData>>;
  loadOne(id: string): Promise<ProjectData | null>;
  save(project: ProjectData): Promise<void>;
  remove(id: string): Promise<void>;

  acquireLock(projectId: string, userId: string): Promise<boolean>;
  releaseLock(projectId: string, userId: string): Promise<void>;
  getAllLocks(): Promise<Record<string, ProjectLock>>;
  heartbeat(projectId: string, userId: string): Promise<void>;
}

// ─── REST API Implementation ──────────────────────────────────────

/**
 * Detects the API base URL:
 * - In production build served by the Node server, API is on same origin
 * - In dev (Vite), proxy or explicit env variable
 */
function getApiBase(): string {
  // Allow override via env
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  // In production the Node server serves both API and static files on same origin
  return window.location.origin;
}

export class RestApiRepository implements StorageRepository {
  private base: string;

  constructor(baseUrl?: string) {
    this.base = baseUrl ?? getApiBase();
  }

  async loadAll(): Promise<Record<string, ProjectData>> {
    const res = await fetch(`${this.base}/api/projects`);
    if (!res.ok) throw new Error("Erreur chargement projets");
    const summaries: Array<{ id: string }> = await res.json();
    // Load full data for each project
    const entries = await Promise.all(
      summaries.map(async (s) => {
        const r = await fetch(`${this.base}/api/projects/${s.id}`);
        if (!r.ok) return null;
        const data: ProjectData = await r.json();
        return [data.id, data] as const;
      })
    );
    return Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, ProjectData]>);
  }

  async loadOne(id: string): Promise<ProjectData | null> {
    const res = await fetch(`${this.base}/api/projects/${id}`);
    if (!res.ok) return null;
    return res.json();
  }

  async save(project: ProjectData): Promise<void> {
    await fetch(`${this.base}/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
  }

  async remove(id: string): Promise<void> {
    await fetch(`${this.base}/api/projects/${id}`, { method: "DELETE" });
  }

  async acquireLock(projectId: string, userId: string): Promise<boolean> {
    const res = await fetch(`${this.base}/api/locks/${projectId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    return res.ok;
  }

  async releaseLock(projectId: string, userId: string): Promise<void> {
    await fetch(`${this.base}/api/locks/${projectId}?userId=${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
  }

  async getAllLocks(): Promise<Record<string, ProjectLock>> {
    const res = await fetch(`${this.base}/api/locks`);
    if (!res.ok) return {};
    return res.json();
  }

  async heartbeat(projectId: string, userId: string): Promise<void> {
    await fetch(`${this.base}/api/locks/${projectId}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
  }
}

// ─── LocalStorage Fallback ────────────────────────────────────────

const PROJECTS_KEY = "cirad-multi-projects-data";
const LOCKS_KEY = "cirad-project-locks";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export class LocalStorageRepository implements StorageRepository {
  async loadAll(): Promise<Record<string, ProjectData>> {
    const legacy = localStorage.getItem("cirad-multi-projects");
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy);
        if (parsed?.state?.projects) {
          writeJson(PROJECTS_KEY, parsed.state.projects);
        }
      } catch { /* ignore */ }
    }
    return readJson<Record<string, ProjectData>>(PROJECTS_KEY, {});
  }

  async loadOne(id: string): Promise<ProjectData | null> {
    const all = await this.loadAll();
    return all[id] ?? null;
  }

  async save(project: ProjectData): Promise<void> {
    const all = await this.loadAll();
    all[project.id] = project;
    writeJson(PROJECTS_KEY, all);
  }

  async remove(id: string): Promise<void> {
    const all = await this.loadAll();
    delete all[id];
    writeJson(PROJECTS_KEY, all);
    await this.releaseLock(id, "");
  }

  async acquireLock(projectId: string, userId: string): Promise<boolean> {
    const locks = readJson<Record<string, ProjectLock>>(LOCKS_KEY, {});
    const existing = locks[projectId];
    if (existing && existing.lockedBy !== userId) {
      const elapsed = Date.now() - new Date(existing.lockedAt).getTime();
      if (elapsed < 30 * 60 * 1000) return false;
    }
    locks[projectId] = { lockedBy: userId, lockedAt: new Date().toISOString() };
    writeJson(LOCKS_KEY, locks);
    return true;
  }

  async releaseLock(projectId: string, _userId: string): Promise<void> {
    const locks = readJson<Record<string, ProjectLock>>(LOCKS_KEY, {});
    delete locks[projectId];
    writeJson(LOCKS_KEY, locks);
  }

  async getAllLocks(): Promise<Record<string, ProjectLock>> {
    return readJson<Record<string, ProjectLock>>(LOCKS_KEY, {});
  }

  async heartbeat(_projectId: string, _userId: string): Promise<void> {
    // No-op for localStorage
  }
}

// ─── Singleton & Auto-detection ───────────────────────────────────

let _repo: StorageRepository | null = null;

/**
 * Auto-detect: if the API server is reachable, use REST.
 * Otherwise fall back to localStorage.
 */
export async function initRepository(): Promise<StorageRepository> {
  if (_repo) return _repo;

  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/locks`, { signal: AbortSignal.timeout(2000) });
    const contentType = res.headers.get("content-type") ?? "";
    if (res.ok && contentType.includes("application/json")) {
      _repo = new RestApiRepository(base);
      console.log("[StorageRepository] Mode serveur REST détecté");
      return _repo;
    }
  } catch {
    // Server not reachable
  }

  _repo = new LocalStorageRepository();
  console.log("[StorageRepository] Mode localStorage (fallback)");
  return _repo;
}

export function getRepository(): StorageRepository {
  if (!_repo) {
    // Synchronous fallback before init completes
    _repo = new LocalStorageRepository();
  }
  return _repo;
}

export function setRepository(repo: StorageRepository): void {
  _repo = repo;
}

// ─── Session user ─────────────────────────────────────────────────

const SESSION_KEY = "cirad-session-user";

export function getSessionUser(): string {
  let user = sessionStorage.getItem(SESSION_KEY);
  if (!user) {
    user = `user-${crypto.randomUUID().slice(0, 8)}`;
    sessionStorage.setItem(SESSION_KEY, user);
  }
  return user;
}

export function setSessionUser(name: string): void {
  sessionStorage.setItem(SESSION_KEY, name);
}
