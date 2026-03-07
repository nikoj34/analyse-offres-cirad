import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ProjectData,
  LotData,
  Company,
  LotLine,
  VarianteLine,
  DpgfAssignment,
  WeightingCriterion,
  SubCriterionItem,
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
  NegotiationQuestionnaire,
  CompanyQuestionnaire,
  NegotiationQuestion,
} from "@/types/project";


// === Helpers ===

function getLot(state: { project: ProjectData }): LotData {
  const lots = state.project.lots ?? [];
  const idx = state.project.currentLotIndex ?? 0;
  return lots[idx] ?? lots[0] ?? createDefaultLot("Lot 1");
}

function setLot(state: { project: ProjectData }, updates: Partial<LotData>) {
  const lots = [...state.project.lots];
  const idx = state.project.currentLotIndex;
  lots[idx] = { ...lots[idx], ...updates };
  return { project: { ...state.project, lots } };
}

/** Si on passe en variante interdite = OUI ou autorisée = NON ou exigée = NON, effacer texte et prix des lignes variantes */
function applyVarianteCoherenceClear(lot: LotData, updates: Partial<LotData>): Partial<LotData> | null {
  const shouldClear =
    updates.varianteInterdite === true ||
    updates.varianteAutorisee === false ||
    updates.varianteExigee === false;
  if (!shouldClear) return null;
  const clearedVarianteLines = (lot.varianteLines ?? []).map((l) => ({
    ...l,
    label: "",
    estimationDpgf1: null,
    estimationDpgf2: null,
  }));
  const newVersions = (lot.versions ?? []).map((v) => ({
    ...v,
    priceEntries: (v.priceEntries ?? []).filter((e) => e.lotLineId >= 0),
  }));
  return { varianteLines: clearedVarianteLines, versions: newVersions };
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
  updateLotInfo: (updates: Partial<Pick<LotData, 'lotNumber' | 'lotAnalyzed' | 'hasDualDpgf' | 'estimationDpgf1' | 'estimationDpgf2' | 'label' | 'toleranceSeuil' | 'varianteInterdite' | 'varianteAutorisee' | 'varianteExigee'>>) => void;
  updateLotInfoByIndex: (index: number, updates: Partial<Pick<LotData, 'lotNumber' | 'lotAnalyzed' | 'hasDualDpgf' | 'estimationDpgf1' | 'estimationDpgf2' | 'label' | 'toleranceSeuil' | 'varianteInterdite' | 'varianteAutorisee' | 'varianteExigee'>>) => void;

  // Company actions (operate on current lot)
  addCompany: () => void;
  removeCompany: (id: number) => void;
  updateCompany: (id: number, updates: Partial<Company>) => void;
  setCompanyStatus: (id: number, status: CompanyStatus) => void;

  getVarianteTechnicalNote: (companyId: number, varianteLineId: number, criterionId: string, subCriterionId?: string) => string | null;
  setVarianteTechnicalNote: (companyId: number, varianteLineId: number, criterionId: string, subCriterionId: string | undefined, notation: NotationLevel | null) => void;
  updateNoteVariante: (companyId: number, varianteId: string, critereId: string, note: string) => void;
  updateStatutVariante: (companyId: number, varianteId: string, statut: string) => void;
  updateDecisionVariante: (companyId: number, varianteId: string, decision: string) => void;

  updateLotLine: (id: number, updates: Partial<LotLine>) => void;
  removeLotLine: (id: number) => void;

  addVarianteLine: () => void;
  updateVarianteLine: (id: number, updates: Partial<Omit<VarianteLine, "id">>) => void;
  removeVarianteLine: (id: number) => void;

  updateCriterionWeight: (criterionId: string, weight: number) => void;
  updateCriterionLabel: (criterionId: string, label: string) => void;
  addSubCriterion: (criterionId: string) => void;
  removeSubCriterion: (criterionId: string, subId: string) => void;
  updateSubCriterion: (criterionId: string, subId: string, updates: { label?: string; weight?: number }) => void;
  addItem: (criterionId: string, subId: string) => void;
  removeItem: (criterionId: string, subId: string, itemId: string) => void;
  updateItemLabel: (criterionId: string, subId: string, itemId: string, label: string) => void;
  setItemNote: (companyId: number, criterionId: string, subCriterionId: string, itemId: string, notation: NotationLevel | null, commentPositif: string, commentNegatif: string) => void;
  getItemNote: (companyId: number, criterionId: string, subCriterionId: string, itemId: string) => TechnicalNote | undefined;

  setTechnicalNote: (companyId: number, criterionId: string, subCriterionId: string | undefined, notation: NotationLevel | null, comment: string, commentPositif?: string, commentNegatif?: string) => void;
  getTechnicalNote: (companyId: number, criterionId: string, subCriterionId?: string) => TechnicalNote | undefined;
  setTechnicalNoteResponse: (companyId: number, criterionId: string, subCriterionId: string | undefined, response: string) => void;

  setPriceEntry: (companyId: number, lotLineId: number, dpgf1: number | null, dpgf2: number | null) => void;
  getPriceEntry: (companyId: number, lotLineId: number) => PriceEntry | undefined;

  setNegotiationDecision: (companyId: number, decision: NegotiationDecision) => void;
  getNegotiationDecision: (companyId: number) => NegotiationDecision;

  setDocumentsToVerify: (companyId: number, text: string) => void;
  getDocumentsToVerify: (companyId: number) => string;

  setCompanyProposedVariante: (companyId: number, value: boolean) => void;
  getCompanyProposedVariante: (companyId: number) => boolean;

  setScenarioEnabledLine: (lineId: number, enabled: boolean) => void;
  getScenarioEnabledLines: (activeLotLineIds: { id: number; type: string | null }[]) => Record<number, boolean>;
  setPseVarianteChoice: (lineId: number, choice: "oui" | "non" | null) => void;
  getPseVarianteChoice: (lineId: number) => "oui" | "non" | undefined;

  createVersion: (label: string, analysisDate: string) => void;
  switchVersion: (versionId: string) => void;
  deleteVersion: (versionId: string) => void;
  freezeVersion: (versionId: string) => void;
  unfreezeVersion: (versionId: string) => void;
  validateVersion: (versionId: string) => void;
  unvalidateVersion: (versionId: string) => void;
  updateVersionAnalysisDate: (versionId: string, date: string) => void;

  hasAttributaire: (versionId: string) => boolean;
  canCreateNego: () => boolean;

  // Questionnaire actions
  activateQuestionnaire: (versionId: string, retainedCompanyIds: number[]) => void;
  syncQuestionnaireCompanies: (versionId: string, retainedCompanyIds: number[]) => void;
  setQuestionnaireDealine: (versionId: string, date: string) => void;
  addQuestion: (versionId: string, companyId: number) => void;
  updateQuestion: (versionId: string, companyId: number, questionId: string, text: string) => void;
  removeQuestion: (versionId: string, companyId: number, questionId: string) => void;
  setReceptionMode: (versionId: string, companyId: number, mode: boolean) => void;
  setQuestionResponse: (versionId: string, companyId: number, questionId: string, response: string) => void;

  resetProject: () => void;

  /** Exporte l'intégralité du projet en JSON (aucun filtre). */
  exportToJson: () => string;
  /** Importe un projet depuis une chaîne JSON et écrase l'état project. */
  importFromJson: (jsonData: string) => void;
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
        set((state) => {
          const lot = getLot(state);
          const clearExtra = applyVarianteCoherenceClear(lot, updates);
          return setLot(state, clearExtra ? { ...updates, ...clearExtra } : updates);
        }),

      updateLotInfoByIndex: (index, updates) =>
        set((state) => {
          const lots = [...state.project.lots];
          if (index < 0 || index >= lots.length) return state;
          const lot = lots[index];
          const clearExtra = applyVarianteCoherenceClear(lot, updates);
          lots[index] = { ...lot, ...updates, ...(clearExtra ?? {}) };
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
          const nextCompanies = lot.companies.map((c) => (c.id === id ? { ...c, ...updates } : c));
          // Seul le décochage explicite « Question(s) à poser » supprime le questionnaire de cette entreprise.
          // La validation des réponses (setReceptionMode) ne doit jamais effacer les Q&R ni passer hasQuestions à false.
          const patch: Record<string, unknown> = { companies: nextCompanies };
          if (updates.hasQuestions === false) {
            const version0 = lot.versions?.[0];
            if (version0?.questionnaire) {
              const questionnaires = version0.questionnaire.questionnaires.filter((q) => q.companyId !== id);
              patch.versions = lot.versions.map((v, i) =>
                i === 0 && v.questionnaire
                  ? { ...v, questionnaire: { ...v.questionnaire, questionnaires } }
                  : v
              );
            }
          }
          return setLot(state, patch);
        }),

      setCompanyStatus: (id, status) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            companies: lot.companies.map((c) => (c.id === id ? { ...c, status } : c)),
          });
        }),

      getVarianteTechnicalNote: (companyId, varianteLineId, criterionId, subCriterionId) => {
        const state = get();
        const lot = getLot(state);
        const company = lot.companies.find((c) => c.id === companyId);
        if (!company?.scoresTechniquesVariantes) return null;
        const byVariante = company.scoresTechniquesVariantes[String(varianteLineId)];
        if (!byVariante) return null;
        const key = subCriterionId ? `${criterionId}_${subCriterionId}` : criterionId;
        const val = byVariante[key];
        return val && (val === "tres_bien" || val === "bien" || val === "moyen" || val === "passable" || val === "insuffisant") ? val : null;
      },

      setVarianteTechnicalNote: (companyId, varianteLineId, criterionId, subCriterionId, notation) =>
        set((state) => {
          const lot = getLot(state);
          const company = lot.companies.find((c) => c.id === companyId);
          if (!company) return state;
          const key = subCriterionId ? `${criterionId}_${subCriterionId}` : criterionId;
          const varianteKey = String(varianteLineId);
          const prevByVariante = company.scoresTechniquesVariantes?.[varianteKey] ?? {};
          const nextByVariante = notation == null
            ? (() => {
                const { [key]: _, ...rest } = prevByVariante;
                return Object.keys(rest).length > 0 ? rest : undefined;
              })()
            : { ...prevByVariante, [key]: notation };
          const nextVariantes =
            nextByVariante == null
              ? (() => {
                  const { [varianteKey]: _, ...rest } = company.scoresTechniquesVariantes ?? {};
                  return Object.keys(rest).length > 0 ? rest : undefined;
                })()
              : { ...(company.scoresTechniquesVariantes ?? {}), [varianteKey]: nextByVariante };
          return setLot(state, {
            companies: lot.companies.map((c) =>
              c.id === companyId ? { ...c, scoresTechniquesVariantes: nextVariantes } : c
            ),
          });
        }),

      updateNoteVariante: (companyId, varianteId, critereId, note) =>
        set((state) => {
          const lot = getLot(state);
          const company = lot.companies.find((c) => c.id === companyId);
          if (!company) return state;
          const prevByVariante = company.scoresTechniquesVariantes?.[varianteId] ?? {};
          const nextByVariante =
            !note || note === "none"
              ? (() => {
                  const { [critereId]: _, ...rest } = prevByVariante;
                  return Object.keys(rest).length > 0 ? rest : undefined;
                })()
              : { ...prevByVariante, [critereId]: note };
          const nextVariantes =
            nextByVariante == null
              ? (() => {
                  const { [varianteId]: __, ...rest } = company.scoresTechniquesVariantes ?? {};
                  return Object.keys(rest).length > 0 ? rest : undefined;
                })()
              : { ...(company.scoresTechniquesVariantes ?? {}), [varianteId]: nextByVariante };
          return setLot(state, {
            companies: lot.companies.map((c) =>
              c.id === companyId ? { ...c, scoresTechniquesVariantes: nextVariantes } : c
            ),
          });
        }),

      updateStatutVariante: (companyId, varianteId, statut) =>
        set((state) => {
          const lot = getLot(state);
          const company = lot.companies.find((c) => c.id === companyId);
          if (!company) return state;
          const statutVariantes = { ...(company.statutVariantes ?? {}), [varianteId]: statut };
          return setLot(state, {
            companies: lot.companies.map((c) =>
              c.id === companyId ? { ...c, statutVariantes } : c
            ),
          });
        }),

      updateDecisionVariante: (companyId, varianteId, decision) =>
        set((state) => {
          const lot = getLot(state);
          const company = lot.companies.find((c) => c.id === companyId);
          if (!company) return state;
          const decisionVariantes = { ...(company.decisionVariantes ?? {}), [varianteId]: decision };
          return setLot(state, {
            companies: lot.companies.map((c) =>
              c.id === companyId ? { ...c, decisionVariantes } : c
            ),
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

      removeLotLine: (id) =>
        set((state) => {
          const lot = getLot(state);
          const lotLines = lot.lotLines.filter((l) => l.id !== id);
          if (lotLines.length < 1) {
            return state;
          }
          // Supprimer les données (prix) liées à cette ligne dans toutes les versions — pas conservées, pas exportées
          const versions = lot.versions.map((v) => ({
            ...v,
            priceEntries: (v.priceEntries ?? []).filter((e) => e.lotLineId !== id),
          }));
          return setLot(state, { lotLines, versions });
        }),

      addVarianteLine: () =>
        set((state) => {
          const lot = getLot(state);
          const varianteLines = [...(lot.varianteLines ?? [])];
          const nextId = varianteLines.length === 0 ? -1 : Math.min(...varianteLines.map((l) => l.id)) - 1;
          varianteLines.push({
            id: nextId,
            label: "",
            dpgfAssignment: "both",
            estimationDpgf1: null,
            estimationDpgf2: null,
          });
          return setLot(state, { varianteLines });
        }),

      updateVarianteLine: (id, updates) =>
        set((state) => {
          const lot = getLot(state);
          const varianteLines = [...(lot.varianteLines ?? [])];
          const idx = varianteLines.findIndex((l) => l.id === id);
          if (idx === -1) return state;
          varianteLines[idx] = { ...varianteLines[idx], ...updates };
          return setLot(state, { varianteLines });
        }),

      removeVarianteLine: (id) =>
        set((state) => {
          const lot = getLot(state);
          const varianteLines = (lot.varianteLines ?? []).filter((l) => l.id !== id);
          const key = String(id);
          // Supprimer les données (notes variante, statut, décision) pour cette ligne — pas conservées, pas exportées
          const companies = lot.companies.map((c) => {
            let nextScores: Record<string, Record<string, string>> | undefined;
            if (c.scoresTechniquesVariantes && key in c.scoresTechniquesVariantes) {
              const rest = { ...c.scoresTechniquesVariantes };
              delete rest[key];
              nextScores = Object.keys(rest).length > 0 ? rest : undefined;
            } else {
              nextScores = c.scoresTechniquesVariantes;
            }
            let nextStatut: Record<string, string> | undefined;
            if (c.statutVariantes && key in c.statutVariantes) {
              const rest = { ...c.statutVariantes };
              delete rest[key];
              nextStatut = Object.keys(rest).length > 0 ? rest : undefined;
            } else {
              nextStatut = c.statutVariantes;
            }
            let nextDecision: Record<string, string> | undefined;
            if (c.decisionVariantes && key in c.decisionVariantes) {
              const rest = { ...c.decisionVariantes };
              delete rest[key];
              nextDecision = Object.keys(rest).length > 0 ? rest : undefined;
            } else {
              nextDecision = c.decisionVariantes;
            }
            return { ...c, scoresTechniquesVariantes: nextScores, statutVariantes: nextStatut, decisionVariantes: nextDecision };
          });
          const versions = lot.versions.map((v) => ({
            ...v,
            priceEntries: (v.priceEntries ?? []).filter((e) => e.lotLineId !== id),
          }));
          return setLot(state, { varianteLines, companies, versions });
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
              const newSub = { id: crypto.randomUUID(), label: "", weight: 0, items: [] };
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

      // === Item actions (sub-criterion items) ===
      addItem: (criterionId, subId) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            weightingCriteria: lot.weightingCriteria.map((c) => {
              if (c.id !== criterionId) return c;
              return {
                ...c,
                subCriteria: c.subCriteria.map((s) => {
                  if (s.id !== subId) return s;
                  return { ...s, items: [...(s.items || []), { id: crypto.randomUUID(), label: "" }] };
                }),
              };
            }),
          });
        }),

      removeItem: (criterionId, subId, itemId) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            weightingCriteria: lot.weightingCriteria.map((c) => {
              if (c.id !== criterionId) return c;
              return {
                ...c,
                subCriteria: c.subCriteria.map((s) => {
                  if (s.id !== subId) return s;
                  return { ...s, items: (s.items || []).filter((it) => it.id !== itemId) };
                }),
              };
            }),
          });
        }),

      updateItemLabel: (criterionId, subId, itemId, label) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            weightingCriteria: lot.weightingCriteria.map((c) => {
              if (c.id !== criterionId) return c;
              return {
                ...c,
                subCriteria: c.subCriteria.map((s) => {
                  if (s.id !== subId) return s;
                  return { ...s, items: (s.items || []).map((it) => it.id === itemId ? { ...it, label } : it) };
                }),
              };
            }),
          });
        }),

      setItemNote: (companyId, criterionId, subCriterionId, itemId, notation, commentPositif, commentNegatif) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === lot.currentVersionId);
          if (!version) return state;
          const notes = [...version.technicalNotes];
          const idx = notes.findIndex(
            (n) => n.companyId === companyId && n.criterionId === criterionId &&
              n.subCriterionId === subCriterionId && n.itemId === itemId
          );
          const newNote: TechnicalNote = {
            companyId, criterionId, subCriterionId, itemId, notation,
            comment: "", commentPositif, commentNegatif,
          };
          if (idx >= 0) notes[idx] = newNote;
          else notes.push(newNote);
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === lot.currentVersionId ? { ...v, technicalNotes: notes } : v
            ),
          });
        }),

      getItemNote: (companyId, criterionId, subCriterionId, itemId) => {
        const state = get();
        const lot = getLot(state);
        const version = lot.versions.find((v) => v.id === lot.currentVersionId);
        if (!version) return undefined;
        return version.technicalNotes.find(
          (n) => n.companyId === companyId && n.criterionId === criterionId &&
            n.subCriterionId === subCriterionId && n.itemId === itemId
        );
      },

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

      setTechnicalNoteResponse: (companyId, criterionId, subCriterionId, response) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === lot.currentVersionId);
          if (!version) return state;
          const notes = [...version.technicalNotes];
          const idx = notes.findIndex(
            (n) => n.companyId === companyId && n.criterionId === criterionId &&
              (n.subCriterionId ?? undefined) === subCriterionId
          );
          if (idx >= 0) {
            notes[idx] = { ...notes[idx], questionResponse: response };
          } else {
            notes.push({ companyId, criterionId, subCriterionId, notation: null, comment: "", commentPositif: "", commentNegatif: "", questionResponse: response });
          }
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === lot.currentVersionId ? { ...v, technicalNotes: notes } : v
            ),
          });
        }),

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

      setCompanyProposedVariante: (companyId, value) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === lot.currentVersionId);
          if (!version) return state;
          const companyProposedVariante = { ...version.companyProposedVariante, [companyId]: value };
          // Décocher = supprimer les prix variante saisis pour cette entreprise — pas conservés, pas exportés
          const varianteLineIds = new Set([
            ...lot.lotLines.filter((l) => l.type === "VARIANTE").map((l) => l.id),
            ...(lot.varianteLines ?? []).map((l) => l.id),
          ]);
          const priceEntries =
            value === false
              ? (version.priceEntries ?? []).filter(
                  (e) => !(e.companyId === companyId && varianteLineIds.has(e.lotLineId))
                )
              : version.priceEntries;
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === lot.currentVersionId ? { ...v, companyProposedVariante, priceEntries } : v
            ),
          });
        }),

      getCompanyProposedVariante: (companyId) => {
        const state = get();
        const lot = getLot(state);
        const version = lot.versions.find((v) => v.id === lot.currentVersionId);
        return version?.companyProposedVariante?.[companyId] ?? false;
      },

      setScenarioEnabledLine: (lineId, enabled) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === lot.currentVersionId);
          if (!version) return state;
          const scenarioEnabledLines = { ...(version.scenarioEnabledLines ?? {}), [lineId]: enabled };
          // Décocher = supprimer les prix saisis pour cette ligne (tranche optionnelle etc.) — pas conservés, pas exportés
          const priceEntries = enabled ? version.priceEntries : (version.priceEntries ?? []).filter((e) => e.lotLineId !== lineId);
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === lot.currentVersionId ? { ...v, scenarioEnabledLines, priceEntries } : v
            ),
          });
        }),

      getScenarioEnabledLines: (activeLotLines) => {
        const state = get();
        const lot = getLot(state);
        const version = lot.versions.find((v) => v.id === lot.currentVersionId);
        const defaults: Record<number, boolean> = {};
        for (const l of activeLotLines) defaults[l.id] = l.type === "T_OPTIONNELLE";
        return { ...defaults, ...version?.scenarioEnabledLines };
      },

      setPseVarianteChoice: (lineId, choice) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === lot.currentVersionId);
          if (!version) return state;
          const prev = version.pseVarianteChoice ?? {};
          const pseVarianteChoice =
            choice === null
              ? (() => {
                  const next = { ...prev };
                  delete next[lineId];
                  return Object.keys(next).length > 0 ? next : undefined;
                })()
              : { ...prev, [lineId]: choice };
          const excludeFromScenario = choice === "non" || choice === null;
          // Décocher (non ou retirer) = supprimer prix et données variante pour cette ligne — pas conservés, pas exportés
          const priceEntries = excludeFromScenario
            ? (version.priceEntries ?? []).filter((e) => e.lotLineId !== lineId)
            : version.priceEntries;
          const key = String(lineId);
          const companies = excludeFromScenario
            ? lot.companies.map((c) => {
                let nextScores = c.scoresTechniquesVariantes;
                if (nextScores && key in nextScores) {
                  const rest = { ...nextScores };
                  delete rest[key];
                  nextScores = Object.keys(rest).length > 0 ? rest : undefined;
                }
                let nextStatut = c.statutVariantes;
                if (nextStatut && key in nextStatut) {
                  const rest = { ...nextStatut };
                  delete rest[key];
                  nextStatut = Object.keys(rest).length > 0 ? rest : undefined;
                }
                let nextDecision = c.decisionVariantes;
                if (nextDecision && key in nextDecision) {
                  const rest = { ...nextDecision };
                  delete rest[key];
                  nextDecision = Object.keys(rest).length > 0 ? rest : undefined;
                }
                return { ...c, scoresTechniquesVariantes: nextScores, statutVariantes: nextStatut, decisionVariantes: nextDecision };
              })
            : lot.companies;
          const patch: Parameters<typeof setLot>[1] = {
            versions: lot.versions.map((v) =>
              v.id === lot.currentVersionId ? { ...v, pseVarianteChoice, priceEntries } : v
            ),
          };
          if (excludeFromScenario) patch.companies = companies;
          return setLot(state, patch);
        }),

      getPseVarianteChoice: (lineId) => {
        const state = get();
        const lot = getLot(state);
        const version = lot.versions.find((v) => v.id === lot.currentVersionId);
        return version?.pseVarianteChoice?.[lineId];
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

          // Copy documentsToVerify from current version for retained companies
          const newDocsToVerify: Record<number, string> = {};
          for (const id of retainedIds) {
            if (currentVersion.documentsToVerify?.[id]) {
              newDocsToVerify[id] = currentVersion.documentsToVerify[id];
            }
          }

          // Don't copy questionnaire — each round starts fresh

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
            documentsToVerify: newDocsToVerify,
            companyProposedVariante: currentVersion.companyProposedVariante
              ? { ...currentVersion.companyProposedVariante } : undefined,
            scenarioEnabledLines: currentVersion.scenarioEnabledLines
              ? { ...currentVersion.scenarioEnabledLines } : undefined,
            pseVarianteChoice: currentVersion.pseVarianteChoice
              ? { ...currentVersion.pseVarianteChoice } : undefined,
            questionnaire: undefined,
          };

          // Lock the current version as read-only (frozen + validated)
          const versions = lot.versions.map((v) =>
            v.id === lot.currentVersionId
              ? { ...v, frozen: true, validated: true, validatedAt: v.validatedAt ?? new Date().toISOString() }
              : v
          );

          return setLot(state, {
            versions: [...versions, newVersion],
            currentVersionId: newVersionId,
          });
        }),

      switchVersion: (versionId) =>
        set((state) => setLot(state, { currentVersionId: versionId })),

      deleteVersion: (versionId) =>
        set((state) => {
          const lot = getLot(state);
          const idx = lot.versions.findIndex((v) => v.id === versionId);
          if (idx <= 0 || lot.versions.length <= 1) return state;
          const previousVersionId = lot.versions[idx - 1].id;
          const newVersions = lot.versions.filter((v) => v.id !== versionId);
          const newCurrentId = lot.currentVersionId === versionId ? previousVersionId : lot.currentVersionId;
          return setLot(state, {
            versions: newVersions,
            currentVersionId: newVersions.some((v) => v.id === newCurrentId) ? newCurrentId : newVersions[0]?.id ?? "",
          });
        }),

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

      // === Questionnaire actions ===
      activateQuestionnaire: (versionId, retainedCompanyIds) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === versionId);
          if (!version || version.questionnaire?.activated) return state;
          const questionnaire: NegotiationQuestionnaire = {
            deadlineDate: "",
            activated: true,
            questionnaires: retainedCompanyIds.map((companyId) => ({
              companyId,
              questions: [],
              receptionMode: false,
            })),
          };
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === versionId ? { ...v, questionnaire } : v
            ),
          });
        }),

      syncQuestionnaireCompanies: (versionId, retainedCompanyIds) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === versionId);
          const questionnaire = version?.questionnaire;
          if (!version || !questionnaire) return state;

          const existingIds = new Set(
            questionnaire.questionnaires.map((q) => q.companyId)
          );
          const newCompanyIds = retainedCompanyIds.filter(
            (id) => !existingIds.has(id)
          );
          if (newCompanyIds.length === 0) return state;

          const extra: CompanyQuestionnaire[] = newCompanyIds.map(
            (companyId) => ({
              companyId,
              questions: [],
              receptionMode: false,
            })
          );

          const updatedQuestionnaire: NegotiationQuestionnaire = {
            ...questionnaire,
            questionnaires: [...questionnaire.questionnaires, ...extra],
          };

          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === versionId ? { ...v, questionnaire: updatedQuestionnaire } : v
            ),
          });
        }),

      setQuestionnaireDealine: (versionId, date) =>
        set((state) => {
          const lot = getLot(state);
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === versionId
                ? { ...v, questionnaire: { ...(v.questionnaire!), deadlineDate: date } }
                : v
            ),
          });
        }),

      addQuestion: (versionId, companyId) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === versionId);
          if (!version?.questionnaire) return state;
          const newQuestion: NegotiationQuestion = {
            id: crypto.randomUUID(),
            text: "",
            response: "",
          };
          const questionnaires = version.questionnaire.questionnaires.map((q) =>
            q.companyId === companyId
              ? { ...q, questions: [...q.questions, newQuestion] }
              : q
          );
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === versionId
                ? { ...v, questionnaire: { ...v.questionnaire!, questionnaires } }
                : v
            ),
          });
        }),

      updateQuestion: (versionId, companyId, questionId, text) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === versionId);
          if (!version?.questionnaire) return state;
          const questionnaires = version.questionnaire.questionnaires.map((q) =>
            q.companyId === companyId
              ? {
                  ...q,
                  questions: q.questions.map((question) =>
                    question.id === questionId ? { ...question, text } : question
                  ),
                }
              : q
          );
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === versionId
                ? { ...v, questionnaire: { ...v.questionnaire!, questionnaires } }
                : v
            ),
          });
        }),

      removeQuestion: (versionId, companyId, questionId) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === versionId);
          if (!version?.questionnaire) return state;
          const questionnaires = version.questionnaire.questionnaires.map((q) =>
            q.companyId === companyId
              ? { ...q, questions: q.questions.filter((question) => question.id !== questionId) }
              : q
          );
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === versionId
                ? { ...v, questionnaire: { ...v.questionnaire!, questionnaires } }
                : v
            ),
          });
        }),

      /** Passe une entreprise en mode « réponses reçues / validées » (lecture seule) ou déverrouille.
       * Ne modifie jamais les questions/réponses ni hasQuestions : les données restent intactes. */
      setReceptionMode: (versionId, companyId, mode) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === versionId);
          if (!version?.questionnaire) return state;
          const questionnaires = version.questionnaire.questionnaires.map((q) =>
            q.companyId === companyId ? { ...q, receptionMode: mode } : q
          );
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === versionId
                ? { ...v, questionnaire: { ...v.questionnaire!, questionnaires } }
                : v
            ),
          });
        }),

      setQuestionResponse: (versionId, companyId, questionId, response) =>
        set((state) => {
          const lot = getLot(state);
          const version = lot.versions.find((v) => v.id === versionId);
          if (!version?.questionnaire) return state;
          const questionnaires = version.questionnaire.questionnaires.map((q) =>
            q.companyId === companyId
              ? {
                  ...q,
                  questions: q.questions.map((question) =>
                    question.id === questionId ? { ...question, response } : question
                  ),
                }
              : q
          );
          return setLot(state, {
            versions: lot.versions.map((v) =>
              v.id === versionId
                ? { ...v, questionnaire: { ...v.questionnaire!, questionnaires } }
                : v
            ),
          });
        }),

      /** Exporte l'intégralité de l'état project (aucun filtre, aucune destructuration). */
      exportToJson: () => {
        const projectData = get().project;
        const json = JSON.stringify(projectData, null, 2);
        return json;
      },

      /** Réinjecte l'intégralité des données parsées dans le state. migrateToMultiLot préserve tout lorsque le JSON a déjà la structure lots. */
      importFromJson: (jsonData: string) => {
        const parsed = JSON.parse(jsonData) as ProjectData;
        const project = migrateToMultiLot(parsed);
        set({ project });
      },
    }),
    {
      name: "procure-analyze-project",
      version: 6,
      /** Persiste tout le project sans filtrer de propriétés à l'intérieur. */
      partialize: (state) => ({ project: state.project }),
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as any;
        if (state?.project) {
          state.project = migrateToMultiLot(state.project);
        }
        return state;
      },
    }
  )
);
