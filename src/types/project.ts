// === ProcureAnalyze AI — Core Types ===

export type CompanyStatus = "retenue" | "ecartee" | "non_defini";

export interface Company {
  id: number; // 1-16
  name: string;
  status: CompanyStatus;
  exclusionReason: string; // reason for exclusion if status is "ecartee"
}

export type LotType = "PSE" | "VARIANTE" | "T_OPTIONNELLE";

export type DpgfAssignment = "DPGF_1" | "DPGF_2" | "both";

export interface LotLine {
  id: number; // 1-12
  label: string;
  type: LotType | null;
  dpgfAssignment: DpgfAssignment; // which DPGF this line is assigned to
  estimation: number | null; // estimation amount in € HT
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
  weight: number; // multiple of 5, 5-70
  subCriteria: SubCriterion[];
}

export interface SubCriterion {
  id: string;
  label: string;
  weight: number; // percentage within parent criterion
}

export interface ProjectInfo {
  name: string;
  marketRef: string;
  lotAnalyzed: string;
  lotNumber: string;
  analysisDate: string;
  author: string;
  estimationDpgf1: number | null; // Estimation TF DPGF_1 (€ HT)
  estimationDpgf2: number | null; // Estimation TF DPGF_2 (€ HT)
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

export interface NegotiationVersion {
  id: string;
  label: string; // V0, V1, V2
  createdAt: string;
  technicalNotes: TechnicalNote[];
  priceEntries: PriceEntry[];
  frozen: boolean;
  negotiationRetained: number[]; // company IDs retained for negotiation
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

// Default weighting criteria
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
    lotLines: [{ id: 1, label: "", type: null, dpgfAssignment: "both", estimation: null }],
    weightingCriteria: DEFAULT_CRITERIA,
    versions: [
      {
        id: versionId,
        label: "V0",
        createdAt: new Date().toISOString(),
        technicalNotes: [],
        priceEntries: [],
        frozen: false,
        negotiationRetained: [],
      },
    ],
    currentVersionId: versionId,
  };
}
