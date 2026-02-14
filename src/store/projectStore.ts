import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ProjectData,
  Company,
  LotLine,
  WeightingCriterion,
  ProjectInfo,
  createDefaultProject,
  CompanyStatus,
  LotType,
  TechnicalNote,
  NotationLevel,
  PriceEntry,
  NegotiationVersion,
  NegotiationDecision,
} from "@/types/project";

interface ProjectStore {
  project: ProjectData;

  updateInfo: (info: Partial<ProjectInfo>) => void;

  addCompany: () => void;
  removeCompany: (id: number) => void;
  updateCompany: (id: number, updates: Partial<Company>) => void;
  setCompanyStatus: (id: number, status: CompanyStatus) => void;

  updateLotLine: (id: number, updates: Partial<LotLine>) => void;

  updateCriterionWeight: (criterionId: string, weight: number) => void;
  updateCriterionLabel: (criterionId: string, label: string) => void;
  addSubCriterion: (criterionId: string) => void;
  removeSubCriterion: (criterionId: string, subId: string) => void;
  updateSubCriterion: (criterionId: string, subId: string, updates: { label?: string; weight?: number }) => void;

  setTechnicalNote: (companyId: number, criterionId: string, subCriterionId: string | undefined, notation: NotationLevel | null, comment: string) => void;
  getTechnicalNote: (companyId: number, criterionId: string, subCriterionId?: string) => TechnicalNote | undefined;

  setPriceEntry: (companyId: number, lotLineId: number, dpgf1: number | null, dpgf2: number | null) => void;
  getPriceEntry: (companyId: number, lotLineId: number) => PriceEntry | undefined;

  setNegotiationDecision: (companyId: number, decision: NegotiationDecision) => void;
  getNegotiationDecision: (companyId: number) => NegotiationDecision;

  createVersion: (label: string) => void;
  switchVersion: (versionId: string) => void;
  freezeVersion: (versionId: string) => void;

  resetProject: () => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      project: createDefaultProject(),

      updateInfo: (info) =>
        set((state) => ({
          project: { ...state.project, info: { ...state.project.info, ...info } },
        })),

      addCompany: () =>
        set((state) => {
          if (state.project.companies.length >= 16) return state;
          const nextId = state.project.companies.length + 1;
          return {
            project: {
              ...state.project,
              companies: [...state.project.companies, { id: nextId, name: "", status: "non_defini", exclusionReason: "" }],
            },
          };
        }),

      removeCompany: (id) =>
        set((state) => {
          if (state.project.companies.length <= 1) return state;
          const filtered = state.project.companies
            .filter((c) => c.id !== id)
            .map((c, i) => ({ ...c, id: i + 1 }));
          return { project: { ...state.project, companies: filtered } };
        }),

      updateCompany: (id, updates) =>
        set((state) => ({
          project: {
            ...state.project,
            companies: state.project.companies.map((c) => (c.id === id ? { ...c, ...updates } : c)),
          },
        })),

      setCompanyStatus: (id, status) =>
        set((state) => ({
          project: {
            ...state.project,
            companies: state.project.companies.map((c) => (c.id === id ? { ...c, status } : c)),
          },
        })),

      updateLotLine: (id, updates) =>
        set((state) => {
          const lotLines = [...state.project.lotLines];
          const idx = lotLines.findIndex((l) => l.id === id);
          if (idx === -1) return state;
          lotLines[idx] = { ...lotLines[idx], ...updates };

          if (updates.label && updates.label.trim() !== "" && lotLines.length < 12) {
            const nextId = id + 1;
            if (!lotLines.find((l) => l.id === nextId)) {
              lotLines.push({ id: nextId, label: "", type: null, dpgfAssignment: "both", estimationDpgf1: null, estimationDpgf2: null });
            }
          }

          return { project: { ...state.project, lotLines } };
        }),

      updateCriterionWeight: (criterionId, weight) =>
        set((state) => ({
          project: {
            ...state.project,
            weightingCriteria: state.project.weightingCriteria.map((c) =>
              c.id === criterionId ? { ...c, weight } : c
            ),
          },
        })),

      updateCriterionLabel: (criterionId, label) =>
        set((state) => ({
          project: {
            ...state.project,
            weightingCriteria: state.project.weightingCriteria.map((c) =>
              c.id === criterionId ? { ...c, label } : c
            ),
          },
        })),

      addSubCriterion: (criterionId) =>
        set((state) => ({
          project: {
            ...state.project,
            weightingCriteria: state.project.weightingCriteria.map((c) => {
              if (c.id !== criterionId) return c;
              const newSub = { id: crypto.randomUUID(), label: "", weight: 0 };
              return { ...c, subCriteria: [...c.subCriteria, newSub] };
            }),
          },
        })),

      removeSubCriterion: (criterionId, subId) =>
        set((state) => ({
          project: {
            ...state.project,
            weightingCriteria: state.project.weightingCriteria.map((c) => {
              if (c.id !== criterionId) return c;
              return { ...c, subCriteria: c.subCriteria.filter((s) => s.id !== subId) };
            }),
          },
        })),

      updateSubCriterion: (criterionId, subId, updates) =>
        set((state) => ({
          project: {
            ...state.project,
            weightingCriteria: state.project.weightingCriteria.map((c) => {
              if (c.id !== criterionId) return c;
              return {
                ...c,
                subCriteria: c.subCriteria.map((s) => (s.id === subId ? { ...s, ...updates } : s)),
              };
            }),
          },
        })),

      setTechnicalNote: (companyId, criterionId, subCriterionId, notation, comment) =>
        set((state) => {
          const version = state.project.versions.find((v) => v.id === state.project.currentVersionId);
          if (!version || version.frozen) return state;

          const notes = [...version.technicalNotes];
          const idx = notes.findIndex(
            (n) =>
              n.companyId === companyId &&
              n.criterionId === criterionId &&
              (n.subCriterionId ?? undefined) === subCriterionId
          );

          const newNote: TechnicalNote = { companyId, criterionId, subCriterionId, notation, comment };
          if (idx >= 0) {
            notes[idx] = newNote;
          } else {
            notes.push(newNote);
          }

          return {
            project: {
              ...state.project,
              versions: state.project.versions.map((v) =>
                v.id === state.project.currentVersionId ? { ...v, technicalNotes: notes } : v
              ),
            },
          };
        }),

      getTechnicalNote: (companyId, criterionId, subCriterionId) => {
        const state = get();
        const version = state.project.versions.find((v) => v.id === state.project.currentVersionId);
        if (!version) return undefined;
        return version.technicalNotes.find(
          (n) =>
            n.companyId === companyId &&
            n.criterionId === criterionId &&
            (n.subCriterionId ?? undefined) === subCriterionId
        );
      },

      setPriceEntry: (companyId, lotLineId, dpgf1, dpgf2) =>
        set((state) => {
          const version = state.project.versions.find((v) => v.id === state.project.currentVersionId);
          if (!version || version.frozen) return state;

          const entries = [...version.priceEntries];
          const idx = entries.findIndex((e) => e.companyId === companyId && e.lotLineId === lotLineId);
          const newEntry: PriceEntry = { companyId, lotLineId, dpgf1, dpgf2 };
          if (idx >= 0) {
            entries[idx] = newEntry;
          } else {
            entries.push(newEntry);
          }

          return {
            project: {
              ...state.project,
              versions: state.project.versions.map((v) =>
                v.id === state.project.currentVersionId ? { ...v, priceEntries: entries } : v
              ),
            },
          };
        }),

      getPriceEntry: (companyId, lotLineId) => {
        const state = get();
        const version = state.project.versions.find((v) => v.id === state.project.currentVersionId);
        if (!version) return undefined;
        return version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === lotLineId);
      },

      setNegotiationDecision: (companyId, decision) =>
        set((state) => {
          const version = state.project.versions.find((v) => v.id === state.project.currentVersionId);
          if (!version) return state;
          const decisions = { ...version.negotiationDecisions, [companyId]: decision };
          return {
            project: {
              ...state.project,
              versions: state.project.versions.map((v) =>
                v.id === state.project.currentVersionId ? { ...v, negotiationDecisions: decisions } : v
              ),
            },
          };
        }),

      getNegotiationDecision: (companyId) => {
        const state = get();
        const version = state.project.versions.find((v) => v.id === state.project.currentVersionId);
        return version?.negotiationDecisions?.[companyId] ?? "non_defini";
      },

      createVersion: (label) =>
        set((state) => {
          const currentVersion = state.project.versions.find((v) => v.id === state.project.currentVersionId);
          const newVersionId = crypto.randomUUID();
          const newVersion: NegotiationVersion = {
            id: newVersionId,
            label,
            createdAt: new Date().toISOString(),
            technicalNotes: currentVersion ? [...currentVersion.technicalNotes] : [],
            priceEntries: currentVersion ? [...currentVersion.priceEntries] : [],
            frozen: false,
            negotiationDecisions: currentVersion ? { ...currentVersion.negotiationDecisions } : {},
          };
          const versions = state.project.versions.map((v) =>
            v.id === state.project.currentVersionId ? { ...v, frozen: true } : v
          );
          return {
            project: {
              ...state.project,
              versions: [...versions, newVersion],
              currentVersionId: newVersionId,
            },
          };
        }),

      switchVersion: (versionId) =>
        set((state) => ({
          project: { ...state.project, currentVersionId: versionId },
        })),

      freezeVersion: (versionId) =>
        set((state) => ({
          project: {
            ...state.project,
            versions: state.project.versions.map((v) =>
              v.id === versionId ? { ...v, frozen: true } : v
            ),
          },
        })),

      resetProject: () => set({ project: createDefaultProject() }),
    }),
    {
      name: "procure-analyze-project",
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as any;
        if (version < 2 && state?.project) {
          if (state.project.lotLines) {
            state.project.lotLines = state.project.lotLines.map((l: any) => ({
              ...l,
              estimationDpgf1: l.estimationDpgf1 ?? l.estimation ?? null,
              estimationDpgf2: l.estimationDpgf2 ?? null,
            }));
          }
          if (state.project.versions) {
            state.project.versions = state.project.versions.map((v: any) => ({
              ...v,
              negotiationDecisions: v.negotiationDecisions ??
                Object.fromEntries((v.negotiationRetained ?? []).map((id: number) => [id, "retenue" as const])),
            }));
          }
        }
        return state;
      },
    }
  )
);
