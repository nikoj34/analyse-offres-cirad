import { z } from "zod";

const SubCriterionItemSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(500),
});

const SubCriterionSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(500),
  weight: z.number().min(0).max(100),
  items: z.array(SubCriterionItemSchema).max(50).optional().default([]),
});

const WeightingCriterionSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(500),
  weight: z.number().min(0).max(100),
  subCriteria: z.array(SubCriterionSchema).max(20),
});

const CompanySchema = z.object({
  id: z.number().int().min(1).max(30),
  name: z.string().max(200),
  status: z.enum(["retenue", "ecartee", "non_defini"]),
  exclusionReason: z.string().max(1000),
});

const LotLineSchema = z.object({
  id: z.number().int().min(1).max(50),
  label: z.string().max(500),
  type: z.enum(["PSE", "VARIANTE", "T_OPTIONNELLE"]).nullable(),
  dpgfAssignment: z.enum(["DPGF_1", "DPGF_2", "both"]),
  estimationDpgf1: z.number().nullable(),
  estimationDpgf2: z.number().nullable(),
});

const TechnicalNoteSchema = z.object({
  companyId: z.number().int(),
  criterionId: z.string().max(100),
  subCriterionId: z.string().max(100).optional(),
  itemId: z.string().max(100).optional(),
  notation: z.enum(["tres_bien", "bien", "moyen", "passable", "insuffisant"]).nullable(),
  comment: z.string().max(5000),
  commentPositif: z.string().max(5000).optional().default(""),
  commentNegatif: z.string().max(5000).optional().default(""),
  questionResponse: z.string().max(10000).optional(),
});

const PriceEntrySchema = z.object({
  companyId: z.number().int(),
  lotLineId: z.number().int().min(0),
  dpgf1: z.number().min(0).max(999999999).nullable(),
  dpgf2: z.number().min(0).max(999999999).nullable(),
});

const NegotiationQuestionSchema = z.object({
  id: z.string().max(100),
  text: z.string().max(10000),
  response: z.string().max(10000),
});

const CompanyQuestionnaireSchema = z.object({
  companyId: z.number().int(),
  questions: z.array(NegotiationQuestionSchema).max(200),
  receptionMode: z.boolean(),
});

const NegotiationQuestionnaireSchema = z.object({
  deadlineDate: z.string().max(50),
  questionnaires: z.array(CompanyQuestionnaireSchema).max(30),
  activated: z.boolean(),
});

const NegotiationVersionSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(20),
  createdAt: z.string().max(50),
  analysisDate: z.string().max(50),
  technicalNotes: z.array(TechnicalNoteSchema).max(5000),
  priceEntries: z.array(PriceEntrySchema).max(5000),
  frozen: z.boolean(),
  validated: z.boolean(),
  validatedAt: z.string().max(50).nullable(),
  negotiationDecisions: z.record(z.string(), z.enum(["non_defini", "retenue", "non_retenue", "questions_reponses", "attributaire"])),
  documentsToVerify: z.record(z.string(), z.string().max(5000)),
  questionnaire: NegotiationQuestionnaireSchema.optional(),
});

const LotDataSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(200),
  lotNumber: z.string().max(50),
  lotAnalyzed: z.string().max(500),
  hasDualDpgf: z.boolean(),
  estimationDpgf1: z.number().nullable(),
  estimationDpgf2: z.number().nullable(),
  toleranceSeuil: z.number().min(0).max(100).optional().default(20),
  companies: z.array(CompanySchema).max(30),
  lotLines: z.array(LotLineSchema).max(50),
  weightingCriteria: z.array(WeightingCriterionSchema).max(20),
  versions: z.array(NegotiationVersionSchema).max(10),
  currentVersionId: z.string().max(100),
});

const ProjectInfoSchema = z.object({
  name: z.string().max(200),
  marketRef: z.string().max(200),
  analysisDate: z.string().max(50),
  author: z.string().max(200),
  numberOfLots: z.number().int().min(1).max(20).optional(),
});

// Main schema for current project format
const ProjectDataSchema = z.object({
  id: z.string().max(100),
  info: ProjectInfoSchema,
  lots: z.array(LotDataSchema).max(20),
  currentLotIndex: z.number().int().min(0),
});

// Schema for imports (with backward compat legacy fields)
export const ImportedProjectSchema = z.object({
  id: z.string().max(100),
  info: ProjectInfoSchema,
  lots: z.array(LotDataSchema).max(20).optional(),
  currentLotIndex: z.number().int().min(0).optional(),
  // Legacy fields
  companies: z.array(CompanySchema).max(30).optional(),
  lotLines: z.array(LotLineSchema).max(50).optional(),
  weightingCriteria: z.array(WeightingCriterionSchema).max(20).optional(),
  versions: z.array(NegotiationVersionSchema).max(10).optional(),
  currentVersionId: z.string().max(100).optional(),
});

export { ProjectDataSchema };
