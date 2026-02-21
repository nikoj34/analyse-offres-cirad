// === ProcureAnalyze AI — Core Types ===

export type CompanyStatus = "retenue" | "ecartee" | "non_defini";

export interface Company {
  id: number;
  name: string;
  status: CompanyStatus;
  exclusionReason: string;
}

export type LotType = "PSE" | "VARIANTE" | "T_OPTIONNELLE";

export type DpgfAssignment = "DPGF_1" | "DPGF_2" | "both";

export interface LotLine {
  id: number;
  label: string;
  type: LotType | null;
  dpgfAssignment: DpgfAssignment;
  estimationDpgf1: number | null;
  estimationDpgf2: number | null;
}

export type NotationLevel = "tres_bien" | "bien" | "moyen" | "passable" | "insuffisant";

export const NOTATION_LABELS: Record<NotationLevel, string> = {
  tres_bien: "Très bien",
  bien: "Bien",
  moyen: "Moyen",
  passable: "Passable",
  insuffisant: "Insuffisant",
};

export const NOTATION_VALUES: Record<NotationLevel, number> = {
  tres_bien: 5,
  bien: 4,
  moyen: 3,
  passable: 2,
  insuffisant: 1,
};

export interface WeightingCriterion {
  id: string;
  label: string;
  weight: number;
  subCriteria: SubCriterion[];
}

export interface SubCriterion {
  id: string;
  label: string;
  weight: number;
}

export interface ProjectInfo {
  name: string;
  marketRef: string;
  analysisDate: string;
  author: string;
  numberOfLots: number;
}

export interface TechnicalNote {
  companyId: number;
  criterionId: string;
  subCriterionId?: string;
  notation: NotationLevel | null;
  comment: string;
  commentPositif: string;
  commentNegatif: string;
  questionResponse?: string;
}

export interface PriceEntry {
  companyId: number;
  lotLineId: number;
  dpgf1: number | null;
  dpgf2: number | null;
}

export type NegotiationDecision = "non_defini" | "retenue" | "non_retenue" | "attributaire";

export const NEGOTIATION_DECISION_LABELS: Record<NegotiationDecision, string> = {
  non_defini: "—",
  retenue: "Retenue pour négociation",
  non_retenue: "Non retenue",
  attributaire: "Attributaire",
};

export const VERSION_DISPLAY_LABELS: Record<string, string> = {
  V0: "Analyse initiale",
  V1: "Analyse suite à négociation 1",
  V2: "Analyse suite à négociation 2",
};

export function getVersionDisplayLabel(label: string): string {
  return VERSION_DISPLAY_LABELS[label] ?? label;
}

export function getSyntheseLabel(lot: LotData, versionIndex: number): string {
  const totalVersions = lot.versions.length;
  const version = lot.versions[versionIndex];
  if (totalVersions === 1) {
    const decisions = version?.negotiationDecisions ?? {};
    const vals = Object.values(decisions);
    const hasAttrib = vals.some(d => d === "attributaire");
    const allDecided = vals.length > 0 && vals.every(d => d !== "non_defini");
    const hasRetenue = vals.some(d => d === "retenue");
    if (hasAttrib || (allDecided && !hasRetenue && vals.length > 0)) return "Synthèse finale";
    return "Synthèse";
  }
  if (versionIndex === 0) return "Synthèse initiale";
  if (versionIndex === totalVersions - 1) return "Synthèse finale";
  return "Synthèse intermédiaire";
}

// === Negotiation Questionnaire ===

export interface NegotiationQuestion {
  id: string;
  text: string;
  response: string;
}

export interface CompanyQuestionnaire {
  companyId: number;
  questions: NegotiationQuestion[];
  receptionMode: boolean; // true = mode réception des réponses (questions figées)
}

export interface NegotiationQuestionnaire {
  deadlineDate: string; // date limite de réponse
  questionnaires: CompanyQuestionnaire[]; // par entreprise
  activated: boolean; // si le questionnaire a été activé depuis la Synthèse
}

export interface NegotiationVersion {
  id: string;
  label: string;
  createdAt: string;
  analysisDate: string;
  technicalNotes: TechnicalNote[];
  priceEntries: PriceEntry[];
  frozen: boolean;
  validated: boolean;
  validatedAt: string | null;
  negotiationDecisions: Record<number, NegotiationDecision>;
  documentsToVerify: Record<number, string>;
  questionnaire?: NegotiationQuestionnaire;
}

// === Multi-Lot Types ===

export interface LotData {
  id: string;
  label: string;
  lotNumber: string;
  lotAnalyzed: string;
  hasDualDpgf: boolean;
  estimationDpgf1: number | null;
  estimationDpgf2: number | null;
  toleranceSeuil: number; // pourcentage ex: 20 = ±20%
  companies: Company[];
  lotLines: LotLine[];
  weightingCriteria: WeightingCriterion[];
  versions: NegotiationVersion[];
  currentVersionId: string;
}

export interface ProjectData {
  id: string;
  info: ProjectInfo;
  lots: LotData[];
  currentLotIndex: number;
}

// === Legacy view for backward compatibility (export, etc.) ===

export interface LegacyProjectView {
  info: ProjectInfo & {
    lotNumber: string;
    lotAnalyzed: string;
    hasDualDpgf: boolean;
    estimationDpgf1: number | null;
    estimationDpgf2: number | null;
  };
  companies: Company[];
  lotLines: LotLine[];
  weightingCriteria: WeightingCriterion[];
  versions: NegotiationVersion[];
  currentVersionId: string;
}

export function buildLotView(project: ProjectData, lot: LotData): LegacyProjectView {
  return {
    info: {
      ...project.info,
      lotNumber: lot.lotNumber,
      lotAnalyzed: lot.lotAnalyzed,
      hasDualDpgf: lot.hasDualDpgf,
      estimationDpgf1: lot.estimationDpgf1,
      estimationDpgf2: lot.estimationDpgf2,
    },
    companies: lot.companies,
    lotLines: lot.lotLines,
    weightingCriteria: lot.weightingCriteria,
    versions: lot.versions,
    currentVersionId: lot.currentVersionId,
  };
}

// === Defaults ===

export const DEFAULT_CRITERIA: WeightingCriterion[] = [
  { id: "prix", label: "Prix", weight: 40, subCriteria: [] },
  {
    id: "technique",
    label: "Valeur technique",
    weight: 40,
    subCriteria: [
      { id: "tech_1", label: "Sous-critère 1", weight: 50 },
      { id: "tech_2", label: "Sous-critère 2", weight: 50 },
    ],
  },
  { id: "environnemental", label: "Environnemental", weight: 10, subCriteria: [] },
  { id: "planning", label: "Planning", weight: 10, subCriteria: [] },
];

export function createDefaultLot(label: string = "Lot 1"): LotData {
  const versionId = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    label,
    lotNumber: "",
    lotAnalyzed: "",
    hasDualDpgf: false,
    estimationDpgf1: null,
    estimationDpgf2: null,
    toleranceSeuil: 20,
    companies: [{ id: 1, name: "", status: "non_defini", exclusionReason: "" }],
    lotLines: [{ id: 1, label: "", type: null, dpgfAssignment: "both", estimationDpgf1: null, estimationDpgf2: null }],
    weightingCriteria: DEFAULT_CRITERIA,
    versions: [
      {
        id: versionId,
        label: "V0",
        createdAt: new Date().toISOString(),
        analysisDate: new Date().toISOString().split("T")[0],
        technicalNotes: [],
        priceEntries: [],
        frozen: false,
        validated: false,
        validatedAt: null,
        negotiationDecisions: {},
        documentsToVerify: {},
      },
    ],
    currentVersionId: versionId,
  };
}

export function createDefaultProject(): ProjectData {
  return {
    id: crypto.randomUUID(),
    info: {
      name: "",
      marketRef: "",
      analysisDate: new Date().toISOString().split("T")[0],
      author: "",
      numberOfLots: 1,
    },
    lots: [createDefaultLot()],
    currentLotIndex: 0,
  };
}

// === Migration helper ===

export function migrateToMultiLot(data: any): ProjectData {
  if (data?.lots && Array.isArray(data.lots)) return data as ProjectData;

  // Migrate v5 tech notes
  const migrateVersions = (versions: any[]) =>
    (versions ?? []).map((v: any) => ({
      ...v,
      analysisDate: v.analysisDate ?? data?.info?.analysisDate ?? new Date().toISOString().split("T")[0],
      validated: v.validated ?? false,
      validatedAt: v.validatedAt ?? null,
      negotiationDecisions: v.negotiationDecisions ??
        Object.fromEntries((v.negotiationRetained ?? []).map((id: number) => [id, "retenue" as const])),
      documentsToVerify: v.documentsToVerify ?? {},
      technicalNotes: (v.technicalNotes ?? []).map((n: any) => ({
        ...n,
        commentPositif: n.commentPositif ?? "",
        commentNegatif: n.commentNegatif ?? "",
      })),
    }));

  const versions = migrateVersions(data?.versions ?? []);
  const versionId = versions[0]?.id ?? crypto.randomUUID();

  // Migrate lot lines
  const lotLines = (data?.lotLines ?? [{ id: 1, label: "", type: null, dpgfAssignment: "both", estimationDpgf1: null, estimationDpgf2: null }])
    .map((l: any) => ({
      ...l,
      estimationDpgf1: l.estimationDpgf1 ?? l.estimation ?? null,
      estimationDpgf2: l.estimationDpgf2 ?? null,
    }));

  const hasEst2 = (data?.info?.estimationDpgf2 ?? 0) !== 0;

  const lot: LotData = {
    id: crypto.randomUUID(),
    label: "Lot 1",
    lotNumber: data?.info?.lotNumber ?? "",
    lotAnalyzed: data?.info?.lotAnalyzed ?? "",
    hasDualDpgf: data?.info?.hasDualDpgf ?? hasEst2,
    estimationDpgf1: data?.info?.estimationDpgf1 ?? null,
    estimationDpgf2: data?.info?.estimationDpgf2 ?? null,
    toleranceSeuil: data?.toleranceSeuil ?? 20,
    companies: data?.companies ?? [{ id: 1, name: "", status: "non_defini", exclusionReason: "" }],
    lotLines,
    weightingCriteria: data?.weightingCriteria ?? DEFAULT_CRITERIA,
    versions: versions.length > 0 ? versions : [{
      id: versionId,
      label: "V0",
      createdAt: new Date().toISOString(),
      analysisDate: new Date().toISOString().split("T")[0],
      technicalNotes: [],
      priceEntries: [],
      frozen: false,
      validated: false,
      validatedAt: null,
      negotiationDecisions: {},
      documentsToVerify: {},
    }],
    currentVersionId: data?.currentVersionId ?? versionId,
  };

  return {
    id: data?.id ?? crypto.randomUUID(),
    info: {
      name: data?.info?.name ?? "",
      marketRef: data?.info?.marketRef ?? "",
      analysisDate: data?.info?.analysisDate ?? new Date().toISOString().split("T")[0],
      author: data?.info?.author ?? "",
      numberOfLots: 1,
    },
    lots: [lot],
    currentLotIndex: 0,
  };
}
