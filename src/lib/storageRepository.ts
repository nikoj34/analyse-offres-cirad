/**
 * Storage Repository Abstraction
 * 
 * Provides a pluggable storage interface for project data.
 * Currently backed by localStorage; swap implementation to
 * target a REST API or SQLite backend without changing stores.
 */

import type { ProjectData } from "@/types/project";

export interface ProjectLock {
  lockedBy: string;   // username or session id
  lockedAt: string;   // ISO date
}

export interface StorageRepository {
  /** Load all projects keyed by id */
  loadAll(): Record<string, ProjectData>;
  /** Persist a single project */
  save(project: ProjectData): void;
  /** Delete a project by id */
  remove(id: string): void;

  /** Lock management */
  acquireLock(projectId: string, userId: string): boolean;
  releaseLock(projectId: string, userId: string): void;
  getLock(projectId: string): ProjectLock | null;
  getAllLocks(): Record<string, ProjectLock>;
}

// ---------- localStorage implementation ----------

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
  loadAll(): Record<string, ProjectData> {
    // Migrate from old zustand persist key if present
    const legacy = localStorage.getItem("cirad-multi-projects");
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy);
        if (parsed?.state?.projects) {
          writeJson(PROJECTS_KEY, parsed.state.projects);
          // don't delete legacy key to avoid data loss
        }
      } catch { /* ignore */ }
    }
    return readJson<Record<string, ProjectData>>(PROJECTS_KEY, {});
  }

  save(project: ProjectData): void {
    const all = this.loadAll();
    all[project.id] = project;
    writeJson(PROJECTS_KEY, all);
  }

  remove(id: string): void {
    const all = this.loadAll();
    delete all[id];
    writeJson(PROJECTS_KEY, all);
    // Also release lock
    this.releaseLock(id, "");
  }

  acquireLock(projectId: string, userId: string): boolean {
    const locks = readJson<Record<string, ProjectLock>>(LOCKS_KEY, {});
    const existing = locks[projectId];
    if (existing && existing.lockedBy !== userId) {
      // Check if lock is stale (>30 min)
      const elapsed = Date.now() - new Date(existing.lockedAt).getTime();
      if (elapsed < 30 * 60 * 1000) return false;
    }
    locks[projectId] = { lockedBy: userId, lockedAt: new Date().toISOString() };
    writeJson(LOCKS_KEY, locks);
    return true;
  }

  releaseLock(projectId: string, _userId: string): void {
    const locks = readJson<Record<string, ProjectLock>>(LOCKS_KEY, {});
    delete locks[projectId];
    writeJson(LOCKS_KEY, locks);
  }

  getLock(projectId: string): ProjectLock | null {
    const locks = readJson<Record<string, ProjectLock>>(LOCKS_KEY, {});
    return locks[projectId] ?? null;
  }

  getAllLocks(): Record<string, ProjectLock> {
    return readJson<Record<string, ProjectLock>>(LOCKS_KEY, {});
  }
}

// ---------- Singleton ----------

let _repo: StorageRepository = new LocalStorageRepository();

export function getRepository(): StorageRepository {
  return _repo;
}

/** Replace the repository (e.g. for REST API backend) */
export function setRepository(repo: StorageRepository): void {
  _repo = repo;
}

// ---------- Session user (simulated) ----------

const SESSION_KEY = "cirad-session-user";

export function getSessionUser(): string {
  let user = sessionStorage.getItem(SESSION_KEY);
  if (!user) {
    user = `user-${crypto.randomUUID().slice(0, 8)}`;
    sessionStorage.setItem(SESSION_KEY, user);
  }
  return user;
}
