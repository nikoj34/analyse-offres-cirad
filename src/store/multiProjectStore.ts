import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ProjectData, createDefaultProject } from "@/types/project";

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

  getProjectList: () => ProjectSummary[];
  createProject: () => string;
  openProject: (id: string) => void;
  deleteProject: (id: string) => void;
  closeProject: () => void;
  saveCurrentProject: (project: ProjectData) => void;
}

export const useMultiProjectStore = create<MultiProjectStore>()(
  persist(
    (set, get) => ({
      projects: {},
      currentProjectId: null,

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
        const newProject = createDefaultProject();
        set((state) => ({
          projects: { ...state.projects, [newProject.id]: newProject },
          currentProjectId: newProject.id,
        }));
        return newProject.id;
      },

      openProject: (id) => {
        set({ currentProjectId: id });
      },

      deleteProject: (id) => {
        set((state) => {
          const { [id]: _, ...rest } = state.projects;
          return {
            projects: rest,
            currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
          };
        });
      },

      closeProject: () => {
        set({ currentProjectId: null });
      },

      saveCurrentProject: (project) => {
        set((state) => ({
          projects: { ...state.projects, [project.id]: project },
        }));
      },
    }),
    {
      name: "cirad-multi-projects",
      version: 1,
    }
  )
);
