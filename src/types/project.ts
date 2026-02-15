// === ProcureAnalyze AI — Core Types ===

export type CompanyStatus = "retenue" | "ecartee" | "non_defini";

export interface Company {
  id: number; // 1-30
  name: string;
  status: CompanyStatus;
  exclusionReason: string;
}

export type LotType = "PSE" | "VARIANTE" | "T_OPTIONNELLE";

export type DpgfAssignment = "DPGF_1" | "DPGF_2" | "both";

export interface LotLine {
  id: number; // 1-12
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
  lotAnalyzed: string;
  lotNumber: string;
  analysisDate: string;
  author: string;
  estimationDpgf1: number | null;
  estimationDpgf2: number | null;
}

export interface TechnicalNote {
  companyId: number;
  criterionId: string;
  subCriterionId?: string;
  notation: NotationLevel | null;
  comment: string;
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

export interface NegotiationVersion {
  id: string;
  label: string; // V0, V1, V2
  createdAt: string;
  analysisDate: string; // date of analysis for this version
  technicalNotes: TechnicalNote[];
  priceEntries: PriceEntry[];
  frozen: boolean;
  validated: boolean; // true when attributaire confirmed
  validatedAt: string | null; // ISO date string of validation
  negotiationDecisions: Record<number, NegotiationDecision>;
  documentsToVerify: Record<number, string>;
}

export interface ProjectData {
  id: string;
  info: ProjectInfo;
  companies: Company[];
  lotLines: LotLine[];
  weightingCriteria: WeightingCriterion[];
  versions: NegotiationVersion[];
  currentVersionId: string;
}

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

export function createDefaultProject(): ProjectData {
  const versionId = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    info: {
      name: "",
      marketRef: "",
      lotAnalyzed: "",
      lotNumber: "",
      analysisDate: new Date().toISOString().split("T")[0],
      author: "",
      estimationDpgf1: null,
      estimationDpgf2: null,
    },
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
