import { create } from "zustand";
import { ProjectData, createDefaultProject } from "@/types/project";
import { getRepository, getSessionUser, type ProjectLock } from "@/lib/storageRepository";

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

  getProjectList: () => ProjectSummary[];
  createProject: () => string;
  openProject: (id: string) => boolean;
  deleteProject: (id: string) => void;
  closeProject: () => void;
  saveCurrentProject: (project: ProjectData) => void;
  refreshLocks: () => void;
  isLockedByOther: (id: string) => boolean;
  loadFromRepository: () => void;
}

export const useMultiProjectStore = create<MultiProjectStore>()(
  (set, get) => ({
    projects: {},
    currentProjectId: null,
    locks: {},

    loadFromRepository: () => {
      const repo = getRepository();
      set({
        projects: repo.loadAll(),
        locks: repo.getAllLocks(),
      });
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

    createProject: () => {
      const repo = getRepository();
      const newProject = createDefaultProject();
      repo.save(newProject);
      const userId = getSessionUser();
      repo.acquireLock(newProject.id, userId);
      set((state) => ({
        projects: { ...state.projects, [newProject.id]: newProject },
        currentProjectId: newProject.id,
        locks: repo.getAllLocks(),
      }));
      return newProject.id;
    },

    openProject: (id) => {
      const repo = getRepository();
      const userId = getSessionUser();
      const acquired = repo.acquireLock(id, userId);
      if (!acquired) {
        // Refresh locks so UI shows who locked it
        set({ locks: repo.getAllLocks() });
        return false;
      }
      set({ currentProjectId: id, locks: repo.getAllLocks() });
      return true;
    },

    deleteProject: (id) => {
      const repo = getRepository();
      repo.remove(id);
      set((state) => {
        const { [id]: _, ...rest } = state.projects;
        return {
          projects: rest,
          currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
          locks: repo.getAllLocks(),
        };
      });
    },

    closeProject: () => {
      const { currentProjectId } = get();
      if (currentProjectId) {
        const repo = getRepository();
        const userId = getSessionUser();
        repo.releaseLock(currentProjectId, userId);
        set({ currentProjectId: null, locks: repo.getAllLocks() });
      } else {
        set({ currentProjectId: null });
      }
    },

    saveCurrentProject: (project) => {
      const repo = getRepository();
      repo.save(project);
      set((state) => ({
        projects: { ...state.projects, [project.id]: project },
      }));
    },

    refreshLocks: () => {
      const repo = getRepository();
      set({ locks: repo.getAllLocks() });
    },

    isLockedByOther: (id) => {
      const { locks } = get();
      const lock = locks[id];
      if (!lock) return false;
      const userId = getSessionUser();
      if (lock.lockedBy === userId) return false;
      // Check stale (>30min)
      const elapsed = Date.now() - new Date(lock.lockedAt).getTime();
      return elapsed < 30 * 60 * 1000;
    },
  })
);

// Initialize from repository on load
useMultiProjectStore.getState().loadFromRepository();
