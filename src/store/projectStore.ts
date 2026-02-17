import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ProjectData,
  LotData,
  Company,
  LotLine,
  WeightingCriterion,
  ProjectInfo,
  createDefaultProject,
  createDefaultLot,
  migrateToMultiLot,
  CompanyStatus,
  LotType,
  TechnicalNote,
  NotationLevel,
  PriceEntry,
  NegotiationVersion,
  NegotiationDecision,
} from "@/types/project";

// === Helpers ===

function getLot(state: { project: ProjectData }): LotData {
  return state.project.lots[state.project.currentLotIndex];
}

function setLot(state: { project: ProjectData }, updates: Partial<LotData>) {
  const lots = [...state.project.lots];
  const idx = state.project.currentLotIndex;
  lots[idx] = { ...lots[idx], ...updates };
  return { project: { ...state.project, lots } };
}

// === Store interface ===

interface ProjectStore {
  project: ProjectData;

  // Project-level
  updateInfo: (info: Partial<ProjectInfo>) => void;

  // Lot management
  switchLot: (index: number) => void;
  addLot: () => void;
  removeLot: (index: number) => void;
  updateLotInfo: (updates: Partial<Pick<LotData, 'lotNumber' | 'lotAnalyzed' | 'hasDualDpgf' | 'estimationDpgf1' | 'estimationDpgf2' | 'label'>>) => void;
  updateLotInfoByIndex: (index: number, updates: Partial<Pick<LotData, 'lotNumber' | 'lotAnalyzed' | 'hasDualDpgf' | 'estimationDpgf1' | 'estimationDpgf2' | 'label'>>) => void;

  // Company actions (operate on current lot)
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

  setTechnicalNote: (companyId: number, criterionId: string, subCriterionId: string | undefined, notation: NotationLevel | null, comment: string, commentPositif?: string, commentNegatif?: string) => void;
  getTechnicalNote: (companyId: number, criterionId: string, subCriterionId?: string) => TechnicalNote | undefined;

  setPriceEntry: (companyId: number, lotLineId: number, dpgf1: number | null, dpgf2: number | null) => void;
  getPriceEntry: (companyId: number, lotLineId: number) => PriceEntry | undefined;

  setNegotiationDecision: (companyId: number, decision: NegotiationDecision) => void;
  getNegotiationDecision: (companyId: number) => NegotiationDecision;

  setDocumentsToVerify: (companyId: number, text: string) => void;
  getDocumentsToVerify: (companyId: number) => string;

  createVersion: (label: string, analysisDate: string) => void;
  switchVersion: (versionId: string) => void;
  freezeVersion: (versionId: string) => void;
  unfreezeVersion: (versionId: string) => void;
  validateVersion: (versionId: string) => void;
  unvalidateVersion: (versionId: string) => void;
  updateVersionAnalysisDate: (versionId: string, date: string) => void;

  hasAttributaire: (versionId: string) => boolean;
  canCreateNego: () => boolean;

  resetProject: () => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      project: createDefaultProject(),

      // === Project-level ===
      updateInfo: (info) =>
        set((state) => ({
          project: { ...state.project, info: { ...state.project.info, ...info } },
        })),

      // === Lot management ===
      switchLot: (index) =>
        set((state) => ({
          project: { ...state.project, currentLotIndex: Math.min(index, state.project.lots.length - 1) },
        })),

      addLot: () =>
        set((state) => {
          const newLot = createDefaultLot(`Lot ${state.project.lots.length + 1}`);
          const lots = [...state.project.lots, newLot];
          return {
            project: {
              ...state.project,
              lots,
              currentLotIndex: lots.length - 1,
              info: { ...state.project.info, numberOfLots: lots.length },
            },
          };
        }),

      removeLot: (index) =>
        set((state) => {
          if (state.project.lots.length <= 1) return state;
          const lots = state.project.lots.filter((_, i) => i !== index);
          const newIndex = Math.min(state.project.currentLotIndex, lots.length - 1);
          return {
            project: {
              ...state.project,
              lots,
              currentLotIndex: newIndex,
              info: { ...state.project.info, numberOfLots: lots.length },
            },
          };
        }),

      updateLotInfo: (updates) =>
        set((state) => setLot(state, updates)),

      updateLotInfoByIndex: (index, updates) =>
        set((state) => {
          const lots = [...state.project.lots];
          if (index < 0 || index >= lots.length) return state;
          lots[index] = { ...lots[index], ...updates };
          return { project: { ...state.project, lots } };
        }),

      // === Company actions ===
      addCompany: () =>
        set((state) => {
          const lot = getLot(state);
          if (lot.companies.length >= 30) return state;
          const nextId = lot.companies.length + 1;
          return setLot(state, {
            companies: [...lot.companies, { id: nextId, name: "", status: "non_defini", exclusionReason: "" }],
          });
        }),

      removeCompany: (id) =>
        set((state) => {
          const lot = getLot(state);
          if (lot.companies.length <= 1) return state;
          const filtered = lot.companies
            .filter((c) => c.id !== id)
            .map((c, i) => ({ ...c, id: i + 1 }));
          return setLot(state, { companies: filtered });
        }),

      updateCompany: (id, updates) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            companies: lot.companies.map((c) => (c.id === id ? { ...c, ...updates } : c)),
          });
        }),

      setCompanyStatus: (id, status) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            companies: lot.companies.map((c) => (c.id === id ? { ...c, status } : c)),
          });
        }),

      // === Lot lines ===
      updateLotLine: (id, updates) =>
        set((state) => {
          const lot = getLot(state);
          const lotLines = [...lot.lotLines];
          const idx = lotLines.findIndex((l) => l.id === id);
          if (idx === -1) return state;
          lotLines[idx] = { ...lotLines[idx], ...updates };

          if (updates.label && updates.label.trim() !== "" && lotLines.length < 50) {
            const nextId = id + 1;
            if (!lotLines.find((l) => l.id === nextId)) {
              lotLines.push({ id: nextId, label: "", type: null, dpgfAssignment: "both", estimationDpgf1: null, estimationDpgf2: null });
            }
          }

          return setLot(state, { lotLines });
        }),

      // === Weighting criteria ===
      updateCriterionWeight: (criterionId, weight) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            weightingCriteria: lot.weightingCriteria.map((c) =>
              c.id === criterionId ? { ...c, weight } : c
            ),
          });
        }),

      updateCriterionLabel: (criterionId, label) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            weightingCriteria: lot.weightingCriteria.map((c) =>
              c.id === criterionId ? { ...c, label } : c
            ),
          });
        }),

      addSubCriterion: (criterionId) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            weightingCriteria: lot.weightingCriteria.map((c) => {
              if (c.id !== criterionId) return c;
              const newSub = { id: crypto.randomUUID(), label: "", weight: 0 };
              return { ...c, subCriteria: [...c.subCriteria, newSub] };
            }),
          });
        }),

      removeSubCriterion: (criterionId, subId) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            weightingCriteria: lot.weightingCriteria.map((c) => {
              if (c.id !== criterionId) return c;
              return { ...c, subCriteria: c.subCriteria.filter((s) => s.id !== subId) };
            }),
          });
        }),

      updateSubCriterion: (criterionId, subId, updates) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            weightingCriteria: lot.weightingCriteria.map((c) => {
              if (c.id !== criterionId) return c;
              return {
                ...c,
                subCriteria: c.subCriteria.map((s) => (s.id === subId ? { ...s, ...updates } : s)),
              };
            }),
          });
        }),

      // === Technical notes ===
      setTechnicalNote: (companyId, criterionId, subCriterionId, notation, comment, commentPositif, commentNegatif) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === lot.currentVersionId);
          if (!version) return state;

          const notes = [...version.technicalNotes];
          const idx = notes.findIndex(
            (n) =>
              n.companyId === companyId &&
              n.criterionId === criterionId &&
              (n.subCriterionId ?? undefined) === subCriterionId
          );

          const existing = idx >= 0 ? notes[idx] : undefined;
          const newNote: TechnicalNote = {
            companyId, criterionId, subCriterionId, notation, comment,
            commentPositif: commentPositif ?? existing?.commentPositif ?? "",
            commentNegatif: commentNegatif ?? existing?.commentNegatif ?? "",
          };
          if (idx >= 0) {
            notes[idx] = newNote;
          } else {
            notes.push(newNote);
          }

          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === lot.currentVersionId ? { ...v, technicalNotes: notes } : v
            ),
          });
        }),

      getTechnicalNote: (companyId, criterionId, subCriterionId) => {
        const state = get();
        const lot = getLot(state);
        const version = lot.versions.find((v) => v.id === lot.currentVersionId);
        if (!version) return undefined;
        return version.technicalNotes.find(
          (n) =>
            n.companyId === companyId &&
            n.criterionId === criterionId &&
            (n.subCriterionId ?? undefined) === subCriterionId
        );
      },

      // === Price entries ===
      setPriceEntry: (companyId, lotLineId, dpgf1, dpgf2) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === lot.currentVersionId);
          if (!version) return state;

          const entries = [...version.priceEntries];
          const idx = entries.findIndex((e) => e.companyId === companyId && e.lotLineId === lotLineId);
          const newEntry: PriceEntry = { companyId, lotLineId, dpgf1, dpgf2 };
          if (idx >= 0) {
            entries[idx] = newEntry;
          } else {
            entries.push(newEntry);
          }

          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === lot.currentVersionId ? { ...v, priceEntries: entries } : v
            ),
          });
        }),

      getPriceEntry: (companyId, lotLineId) => {
        const state = get();
        const lot = getLot(state);
        const version = lot.versions.find((v) => v.id === lot.currentVersionId);
        if (!version) return undefined;
        return version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === lotLineId);
      },

      // === Negotiation decisions ===
      setNegotiationDecision: (companyId, decision) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === lot.currentVersionId);
          if (!version) return state;
          const decisions = { ...version.negotiationDecisions, [companyId]: decision };
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === lot.currentVersionId ? { ...v, negotiationDecisions: decisions } : v
            ),
          });
        }),

      getNegotiationDecision: (companyId) => {
        const state = get();
        const lot = getLot(state);
        const version = lot.versions.find((v) => v.id === lot.currentVersionId);
        return version?.negotiationDecisions?.[companyId] ?? "non_defini";
      },

      // === Documents ===
      setDocumentsToVerify: (companyId, text) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === lot.currentVersionId);
          if (!version) return state;
          const docs = { ...(version.documentsToVerify ?? {}), [companyId]: text };
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === lot.currentVersionId ? { ...v, documentsToVerify: docs } : v
            ),
          });
        }),

      getDocumentsToVerify: (companyId) => {
        const state = get();
        const lot = getLot(state);
        const version = lot.versions.find((v) => v.id === lot.currentVersionId);
        return version?.documentsToVerify?.[companyId] ?? "";
      },

      // === Version management ===
      hasAttributaire: (versionId) => {
        const state = get();
        const lot = getLot(state);
        const version = lot.versions.find((v) => v.id === versionId);
        if (!version) return false;
        return Object.values(version.negotiationDecisions).some((d) => d === "attributaire");
      },

      canCreateNego: () => {
        const state = get();
        const lot = getLot(state);
        const currentVersion = lot.versions.find((v) => v.id === lot.currentVersionId);
        if (!currentVersion) return false;
        if (currentVersion.validated) return false;
        if (lot.versions.length >= 3) return false;
        return true;
      },

      createVersion: (label, analysisDate) =>
        set((state) => {
          const lot = getLot(state);
          const currentVersion = lot.versions.find((v) => v.id === lot.currentVersionId);
          if (!currentVersion) return state;

          const currentDecisions = currentVersion.negotiationDecisions ?? {};
          const retainedIds = Object.entries(currentDecisions)
            .filter(([, d]) => d === "retenue" || d === "attributaire")
            .map(([id]) => Number(id));

          const newVersionId = crypto.randomUUID();

          const newTechnicalNotes = currentVersion.technicalNotes.filter(
            (n) => retainedIds.includes(n.companyId)
          );
          const newPriceEntries = currentVersion.priceEntries.filter(
            (e) => retainedIds.includes(e.companyId)
          );

          const newVersion: NegotiationVersion = {
            id: newVersionId,
            label,
            createdAt: new Date().toISOString(),
            analysisDate,
            technicalNotes: newTechnicalNotes.map((n) => ({ ...n })),
            priceEntries: newPriceEntries.map((e) => ({ ...e })),
            frozen: false,
            validated: false,
            validatedAt: null,
            negotiationDecisions: {},
            documentsToVerify: {},
          };

          const versions = lot.versions.map((v) =>
            v.id === lot.currentVersionId ? { ...v, frozen: true } : v
          );

          return setLot(state, {
            versions: [...versions, newVersion],
            currentVersionId: newVersionId,
          });
        }),

      switchVersion: (versionId) =>
        set((state) => setLot(state, { currentVersionId: versionId })),

      freezeVersion: (versionId) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === versionId ? { ...v, frozen: true } : v
            ),
          });
        }),

      unfreezeVersion: (versionId) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === versionId ? { ...v, frozen: false } : v
            ),
          });
        }),

      validateVersion: (versionId) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === versionId ? { ...v, validated: true, frozen: true, validatedAt: new Date().toISOString() } : v
            ),
          });
        }),

      unvalidateVersion: (versionId) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === versionId ? { ...v, validated: false, frozen: false, validatedAt: null } : v
            ),
          });
        }),

      updateVersionAnalysisDate: (versionId, date) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === versionId ? { ...v, analysisDate: date } : v
            ),
          });
        }),

      resetProject: () => set({ project: createDefaultProject() }),
    }),
    {
      name: "procure-analyze-project",
      version: 6,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as any;
        if (state?.project) {
          // Apply full migration (handles all versions)
          state.project = migrateToMultiLot(state.project);
        }
        return state;
      },
    }
  )
);
