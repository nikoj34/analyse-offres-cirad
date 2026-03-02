/**
 * Zod schemas for form-level validation before API submission.
 * Returns user-friendly error messages in French.
 */

import { z } from "zod";

// ─── Price validation ─────────────────────────────────────────────

export const PriceValueSchema = z
  .number({ invalid_type_error: "Le prix doit être un nombre" })
  .min(0, "Le prix ne peut pas être négatif")
  .max(999_999_999, "Le prix dépasse la limite autorisée")
  .nullable();

export const PriceEntryFormSchema = z.object({
  companyId: z.number().int().positive(),
  lotLineId: z.number().int().min(0),
  dpgf1: PriceValueSchema,
  dpgf2: PriceValueSchema,
});

// ─── Technical notes validation ───────────────────────────────────

export const NotationSchema = z
  .enum(["tres_bien", "bien", "moyen", "passable", "insuffisant"])
  .nullable();

export const TechnicalNoteFormSchema = z.object({
  companyId: z.number().int().positive(),
  criterionId: z.string().min(1).max(100),
  subCriterionId: z.string().max(100).optional(),
  notation: NotationSchema,
  comment: z.string().max(2000, "Le commentaire ne doit pas dépasser 2000 caractères"),
  commentPositif: z.string().max(2000, "Le texte ne doit pas dépasser 2000 caractères").optional(),
  commentNegatif: z.string().max(2000, "Le texte ne doit pas dépasser 2000 caractères").optional(),
});

// ─── Company validation ───────────────────────────────────────────

export const CompanyFormSchema = z.object({
  id: z.number().int().min(1).max(30),
  name: z.string().max(200, "Le nom ne doit pas dépasser 200 caractères"),
  status: z.enum(["retenue", "ecartee", "non_defini"]),
  exclusionReason: z.string().max(1000, "Le motif ne doit pas dépasser 1000 caractères"),
});

// ─── Project info validation ──────────────────────────────────────

export const ProjectInfoFormSchema = z.object({
  name: z.string().max(200, "Le nom ne doit pas dépasser 200 caractères"),
  marketRef: z.string().max(200, "La référence ne doit pas dépasser 200 caractères"),
  analysisDate: z.string().max(50),
  author: z.string().max(200, "Le nom de l'auteur ne doit pas dépasser 200 caractères"),
});

// ─── Weighting validation ─────────────────────────────────────────

export const WeightSchema = z
  .number({ invalid_type_error: "La pondération doit être un nombre" })
  .min(0, "La pondération ne peut pas être négative")
  .max(100, "La pondération ne peut pas dépasser 100%");

// ─── Helper: validate and return errors ───────────────────────────

export function validateForm<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.errors.map((e) => e.message),
  };
}

/**
 * Validate a price value (string from input) and return number or null.
 * Returns error string if invalid.
 */
export function validatePriceInput(value: string): { valid: true; price: number | null } | { valid: false; error: string } {
  if (value.trim() === "") return { valid: true, price: null };
  const num = Number(value);
  if (isNaN(num)) return { valid: false, error: "Valeur invalide : veuillez saisir un nombre" };
  if (num < 0) return { valid: false, error: "Le prix ne peut pas être négatif" };
  if (num > 999_999_999) return { valid: false, error: "Le prix dépasse la limite autorisée" };
  return { valid: true, price: num };
}
