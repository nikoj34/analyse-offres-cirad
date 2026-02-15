import { z } from "zod";

const CompanySchema = z.object({
  id: z.number().int().min(1).max(30),
  name: z.string().max(200),
  status: z.enum(["retenue", "ecartee", "non_defini"]),
  exclusionReason: z.string().max(1000),
});

const LotLineSchema = z.object({
  id: z.number().int().min(1).max(50),
  label: z.string().max(200),
  type: z.enum(["PSE", "VARIANTE", "T_OPTIONNELLE"]).nullable(),
  dpgfAssignment: z.enum(["DPGF_1", "DPGF_2", "both"]),
  estimationDpgf1: z.number().nullable(),
  estimationDpgf2: z.number().nullable(),
});

const SubCriterionSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(200),
  weight: z.number().min(0).max(100),
});

const WeightingCriterionSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(200),
  weight: z.number().min(0).max(100),
  subCriteria: z.array(SubCriterionSchema).max(20),
});

const TechnicalNoteSchema = z.object({
  companyId: z.number().int(),
  criterionId: z.string().max(100),
  subCriterionId: z.string().max(100).optional(),
  notation: z.enum(["tres_bien", "bien", "moyen", "passable", "insuffisant"]).nullable(),
  comment: z.string().max(2000),
});

const PriceEntrySchema = z.object({
  companyId: z.number().int(),
  lotLineId: z.number().int(),
  dpgf1: z.number().nullable(),
  dpgf2: z.number().nullable(),
});

const NegotiationVersionSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(20),
  createdAt: z.string().max(50),
  analysisDate: z.string().max(50),
  technicalNotes: z.array(TechnicalNoteSchema).max(1000),
  priceEntries: z.array(PriceEntrySchema).max(1000),
  frozen: z.boolean(),
  validated: z.boolean(),
  validatedAt: z.string().max(50).nullable(),
  negotiationDecisions: z.record(z.string(), z.enum(["non_defini", "retenue", "non_retenue", "attributaire"])),
  documentsToVerify: z.record(z.string(), z.string().max(2000)),
});

const ProjectInfoSchema = z.object({
  name: z.string().max(200),
  marketRef: z.string().max(200),
  lotAnalyzed: z.string().max(200),
  lotNumber: z.string().max(50),
  analysisDate: z.string().max(50),
  author: z.string().max(200),
  hasDualDpgf: z.boolean(),
  estimationDpgf1: z.number().nullable(),
  estimationDpgf2: z.number().nullable(),
});

export const ImportedProjectSchema = z.object({
  id: z.string().max(100),
  info: ProjectInfoSchema,
  companies: z.array(CompanySchema).max(30),
  lotLines: z.array(LotLineSchema).max(50),
  weightingCriteria: z.array(WeightingCriterionSchema).max(20),
  versions: z.array(NegotiationVersionSchema).max(10),
  currentVersionId: z.string().max(100),
});
