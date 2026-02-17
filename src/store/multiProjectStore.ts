import { create } from "zustand";
import { ProjectData, createDefaultProject } from "@/types/project";
import { getRepository, getSessionUser, initRepository, type ProjectLock } from "@/lib/storageRepository";

export interface ProjectSummary {
  id: string;
  name: string;
  marketRef: string;
  lotAnalyzed: string;
  updatedAt: string;
}

interface MultiProjectStore {
  projects: Record<string, ProjectData>;
  currentProjectId: string | null;
  locks: Record<string, ProjectLock>;
  ready: boolean;

  getProjectList: () => ProjectSummary[];
  createProject: () => Promise<string>;
  openProject: (id: string) => Promise<boolean>;
  deleteProject: (id: string) => Promise<void>;
  closeProject: () => Promise<void>;
  saveCurrentProject: (project: ProjectData) => Promise<void>;
  refreshLocks: () => Promise<void>;
  isLockedByOther: (id: string) => boolean;
  loadFromRepository: () => Promise<void>;
}

export const useMultiProjectStore = create<MultiProjectStore>()(
  (set, get) => ({
    projects: {},
    currentProjectId: null,
    locks: {},
    ready: false,

    loadFromRepository: async () => {
      const repo = await initRepository();
      const [projects, locks] = await Promise.all([repo.loadAll(), repo.getAllLocks()]);
      set({ projects, locks, ready: true });
    },

    getProjectList: () => {
      const { projects } = get();
      return Object.values(projects)
        .map((p) => ({
          id: p.id,
          name: p.info.name || "Sans titre",
          marketRef: p.info.marketRef,
          lotAnalyzed: p.info.lotAnalyzed,
          updatedAt: p.versions?.[0]?.createdAt ?? new Date().toISOString(),
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    createProject: async () => {
      const repo = getRepository();
      const newProject = createDefaultProject();
      const userId = getSessionUser();
      await Promise.all([repo.save(newProject), repo.acquireLock(newProject.id, userId)]);
      const locks = await repo.getAllLocks();
      set((state) => ({
        projects: { ...state.projects, [newProject.id]: newProject },
        currentProjectId: newProject.id,
        locks,
      }));
      return newProject.id;
    },

    openProject: async (id) => {
      const repo = getRepository();
      const userId = getSessionUser();
      const acquired = await repo.acquireLock(id, userId);
      const locks = await repo.getAllLocks();
      if (!acquired) {
        set({ locks });
        return false;
      }
      set({ currentProjectId: id, locks });
      return true;
    },

    deleteProject: async (id) => {
      const repo = getRepository();
      await repo.remove(id);
      const locks = await repo.getAllLocks();
      set((state) => {
        const { [id]: _, ...rest } = state.projects;
        return {
          projects: rest,
          currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
          locks,
        };
      });
    },

    closeProject: async () => {
      const { currentProjectId } = get();
      if (currentProjectId) {
        const repo = getRepository();
        const userId = getSessionUser();
        await repo.releaseLock(currentProjectId, userId);
        const locks = await repo.getAllLocks();
        set({ currentProjectId: null, locks });
      } else {
        set({ currentProjectId: null });
      }
    },

    saveCurrentProject: async (project) => {
      const repo = getRepository();
      await repo.save(project);
      set((state) => ({
        projects: { ...state.projects, [project.id]: project },
      }));
    },

    refreshLocks: async () => {
      const repo = getRepository();
      const locks = await repo.getAllLocks();
      set({ locks });
    },

    isLockedByOther: (id) => {
      const { locks } = get();
      const lock = locks[id];
      if (!lock) return false;
      const userId = getSessionUser();
      if (lock.lockedBy === userId) return false;
      const elapsed = Date.now() - new Date(lock.lockedAt).getTime();
      return elapsed < 30 * 60 * 1000;
    },
  })
);

// Initialize from repository on load
useMultiProjectStore.getState().loadFromRepository();
