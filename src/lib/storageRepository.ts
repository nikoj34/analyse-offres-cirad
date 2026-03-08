/**
 * Storage Repository — Supabase
 *
 * Persistance des projets (projects, lots, offers, analyses) avec RLS.
 * Utilise auth.uid() pour que chaque utilisateur ne voie que ses propres projets.
 * Gestion d'erreur robuste pour éviter les crashs si la connexion est coupée.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ProjectData,
  LotData,
  Company,
  NegotiationVersion,
  NegotiationDecision,
} from "@/types/project";
import { createDefaultLot } from "@/types/project";

// ─── Types DB (alignés sur le schéma SQL) ───────────────────────────────────

interface DbProject {
  id: string;
  user_id: string;
  name: string;
  market_ref: string;
  analysis_date: string;
  author: string;
  number_of_lots: number;
  current_lot_index: number;
  created_at: string;
  updated_at: string;
  imported_at?: string | null;
}

interface DbLot {
  id: string;
  project_id: string;
  label: string;
  lot_number: string;
  lot_analyzed: string;
  has_dual_dpgf: boolean;
  estimation_dpgf1: number | null;
  estimation_dpgf2: number | null;
  tolerance_seuil: number;
  current_version_id: string | null;
  lot_lines: unknown;
  weighting_criteria: unknown;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface DbOffer {
  id: string;
  lot_id: string;
  company_id: number;
  name: string;
  status: "retenue" | "ecartee" | "non_defini";
  exclusion_reason: string;
  display_order: number;
}

interface DbAnalysis {
  id: string;
  lot_id: string;
  label: string;
  created_at: string;
  analysis_date: string;
  frozen: boolean;
  validated: boolean;
  validated_at: string | null;
  negotiation_decisions: unknown;
  documents_to_verify: unknown;
  questionnaire: unknown;
  technical_notes: unknown;
  price_entries: unknown;
  updated_at: string;
}

// ─── Interface publique (inchangée) ─────────────────────────────────────────

export interface ProjectLock {
  lockedBy: string;
  lockedAt: string;
}

export interface StorageRepository {
  loadAll(): Promise<Record<string, ProjectData>>;
  loadOne(id: string): Promise<ProjectData | null>;
  save(project: ProjectData): Promise<void>;
  remove(id: string): Promise<void>;

  acquireLock(projectId: string, userId: string): Promise<boolean>;
  releaseLock(projectId: string, userId: string): Promise<void>;
  getAllLocks(): Promise<Record<string, ProjectLock>>;
  heartbeat(projectId: string, userId: string): Promise<void>;
}

// ─── Client Supabase singleton ─────────────────────────────────────────────

let _client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définis dans .env"
    );
  }
  _client = createClient(url, key);
  return _client;
}

/** User id pour RLS (auth.uid()). Cached après première résolution. */
let _cachedUserId: string | null = null;

async function getCurrentUserId(): Promise<string> {
  if (_cachedUserId) return _cachedUserId;
  const supabase = getSupabase();
  let { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    const { data, error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) throw new Error("Auth Supabase: " + signInError.message);
    user = data?.user ?? null;
  }
  if (!user?.id) throw new Error("Aucun utilisateur Supabase connecté");
  _cachedUserId = user.id;
  return _cachedUserId;
}

/** Extrait un message lisible depuis une erreur Supabase ou Error. */
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

/** Gestion d'erreur centralisée : log et relance ou retourne valeur de repli. */
function handleError<T>(context: string, fallback: T): (err: unknown) => T {
  return (err: unknown) => {
    console.warn(`[StorageRepository] ${context}:`, getErrorMessage(err));
    return fallback;
  };
}

// ─── Conversion DB → ProjectData ───────────────────────────────────────────

function dbOfferToCompany(row: DbOffer): Company {
  return {
    id: row.company_id,
    name: row.name,
    status: row.status,
    exclusionReason: row.exclusion_reason ?? "",
  };
}

function jsonToRecordNumber<T>(obj: unknown): Record<number, T> {
  if (!obj || typeof obj !== "object") return {};
  const out: Record<number, T> = {};
  for (const [k, v] of Object.entries(obj)) {
    const n = Number(k);
    if (!Number.isNaN(n)) out[n] = v as T;
  }
  return out;
}

function dbAnalysisToVersion(row: DbAnalysis): NegotiationVersion {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.created_at,
    analysisDate: row.analysis_date,
    frozen: row.frozen,
    validated: row.validated,
    validatedAt: row.validated_at,
    negotiationDecisions: jsonToRecordNumber<NegotiationDecision>(row.negotiation_decisions),
    documentsToVerify: jsonToRecordNumber<string>(row.documents_to_verify),
    questionnaire: row.questionnaire as NegotiationVersion["questionnaire"],
    technicalNotes: Array.isArray(row.technical_notes) ? row.technical_notes : [],
    priceEntries: Array.isArray(row.price_entries) ? row.price_entries : [],
  };
}

function dbLotToLotData(
  row: DbLot,
  companies: Company[],
  versions: NegotiationVersion[]
): LotData {
  return {
    id: row.id,
    label: row.label ?? "Lot",
    lotNumber: row.lot_number ?? "",
    lotAnalyzed: row.lot_analyzed ?? "",
    hasDualDpgf: row.has_dual_dpgf ?? false,
    estimationDpgf1: row.estimation_dpgf1 ?? null,
    estimationDpgf2: row.estimation_dpgf2 ?? null,
    toleranceSeuil: row.tolerance_seuil ?? 20,
    companies,
    lotLines: Array.isArray(row.lot_lines) ? row.lot_lines : [],
    weightingCriteria: Array.isArray(row.weighting_criteria) ? row.weighting_criteria : [],
    versions,
    currentVersionId: row.current_version_id ?? versions[0]?.id ?? "",
  };
}

function dbProjectToProjectData(
  row: DbProject,
  lots: LotData[]
): ProjectData {
  return {
    id: row.id,
    info: {
      name: row.name,
      marketRef: row.market_ref,
      analysisDate: row.analysis_date,
      author: row.author,
      numberOfLots: row.number_of_lots,
    },
    lots,
    currentLotIndex: row.current_lot_index,
    ...(row.imported_at != null && row.imported_at !== "" ? { importedAt: row.imported_at } : {}),
  };
}

// ─── SupabaseRepository ─────────────────────────────────────────────────────

export class SupabaseRepository implements StorageRepository {
  async loadAll(): Promise<Record<string, ProjectData>> {
    const supabase = getSupabase();
    try {
      const userId = await getCurrentUserId();
      const { data: projectRows, error: projectError } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (projectError) throw projectError;
      const projects = (projectRows ?? []) as DbProject[];
      const result: Record<string, ProjectData> = {};

      for (const row of projects) {
        const projectData = await this.loadOne(row.id);
        if (projectData) result[projectData.id] = projectData;
      }
      return result;
    } catch (err) {
      handleError("loadAll", {})(err);
      return {};
    }
  }

  async loadOne(id: string): Promise<ProjectData | null> {
    const supabase = getSupabase();
    try {
      const userId = await getCurrentUserId();

      const { data: projectRow, error: projectError } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (projectError || !projectRow) return null;
      const project = projectRow as DbProject;

      const { data: lotRows, error: lotError } = await supabase
        .from("lots")
        .select("*")
        .eq("project_id", id)
        .order("display_order", { ascending: true });

      if (lotError) throw lotError;
      const lotsDb = (lotRows ?? []) as DbLot[];

      const lots: LotData[] = [];
      for (const lotRow of lotsDb) {
        const { data: offerRows } = await supabase
          .from("offers")
          .select("*")
          .eq("lot_id", lotRow.id)
          .order("display_order", { ascending: true });
        const companies = ((offerRows ?? []) as DbOffer[]).map(dbOfferToCompany);

        const { data: analysisRows } = await supabase
          .from("analyses")
          .select("*")
          .eq("lot_id", lotRow.id)
          .order("created_at", { ascending: true });
        const versions = ((analysisRows ?? []) as DbAnalysis[]).map(dbAnalysisToVersion);

        lots.push(dbLotToLotData(lotRow, companies, versions));
      }

      const result = dbProjectToProjectData(project, lots);
      if (result.lots.length === 0) {
        result.lots = [createDefaultLot("Lot 1")];
        result.info.numberOfLots = 1;
      }
      return result;
    } catch (err) {
      handleError("loadOne", null)(err);
      return null;
    }
  }

  async save(project: ProjectData): Promise<void> {
    const supabase = getSupabase();
    try {
      const userId = await getCurrentUserId();

      // Nettoyage préalable : supprimer le projet existant (cascade lots/offers/analyses)
      await supabase.from("projects").delete().eq("id", project.id).eq("user_id", userId);

      // ——— Phase 1 : Créer/Upsert le projet (IDs conservés pour les relations) ———
      const projectRow: Omit<DbProject, "created_at" | "updated_at"> & {
        created_at?: string;
        updated_at?: string;
      } = {
        id: project.id,
        user_id: userId,
        name: project.info.name,
        market_ref: project.info.marketRef,
        analysis_date: project.info.analysisDate,
        author: project.info.author,
        number_of_lots: project.info.numberOfLots,
        current_lot_index: project.currentLotIndex,
        ...(project.importedAt != null && project.importedAt !== "" ? { imported_at: project.importedAt } : {}),
      };
      const { error: projectError } = await supabase
        .from("projects")
        .upsert(projectRow, { onConflict: "id" });
      if (projectError) throw projectError;

      // ——— Phase 2 : Créer/Upsert les lots SANS current_version_id (évite FK sur analyses) ———
      const lots = project.lots ?? [];
      for (let i = 0; i < lots.length; i++) {
        const lot = lots[i];
        const lotRow = {
          id: lot.id,
          project_id: project.id,
          label: lot.label,
          lot_number: lot.lotNumber,
          lot_analyzed: lot.lotAnalyzed,
          has_dual_dpgf: lot.hasDualDpgf,
          estimation_dpgf1: lot.estimationDpgf1,
          estimation_dpgf2: lot.estimationDpgf2,
          tolerance_seuil: lot.toleranceSeuil,
          current_version_id: null as string | null,
          lot_lines: lot.lotLines,
          weighting_criteria: lot.weightingCriteria,
          display_order: i,
        };
        const { error: lotErr } = await supabase.from("lots").upsert(lotRow, { onConflict: "id" });
        if (lotErr) throw lotErr;
      }

      // ——— Phase 3 : Offres (entreprises) et Analyses (versions) ———
      for (const lot of lots) {
        // Offres : IDs métier (company_id) conservés pour cohérence
        const { error: delOffersErr } = await supabase
          .from("offers")
          .delete()
          .eq("lot_id", lot.id);
        if (delOffersErr) throw delOffersErr;
        const companies = lot.companies ?? [];
        if (companies.length > 0) {
          const offerRows = companies.map((c, idx) => ({
            lot_id: lot.id,
            company_id: c.id,
            name: c.name,
            status: c.status,
            exclusion_reason: c.exclusionReason ?? "",
            display_order: idx,
          }));
          const { error: offersErr } = await supabase
            .from("offers")
            .upsert(offerRows, { onConflict: "lot_id,company_id" });
          if (offersErr) throw offersErr;
        }
        // Analyses : IDs des versions (V0, V1…) conservés pour current_version_id
        for (const v of lot.versions ?? []) {
          const analysisRow = {
            id: v.id,
            lot_id: lot.id,
            label: v.label,
            created_at: v.createdAt,
            analysis_date: v.analysisDate,
            frozen: v.frozen,
            validated: v.validated,
            validated_at: v.validatedAt,
            negotiation_decisions: v.negotiationDecisions,
            documents_to_verify: v.documentsToVerify,
            questionnaire: v.questionnaire ?? null,
            technical_notes: v.technicalNotes,
            price_entries: v.priceEntries,
          };
          const { error: analysisErr } = await supabase
            .from("analyses")
            .upsert(analysisRow, { onConflict: "id" });
          if (analysisErr) throw analysisErr;
        }
      }

      // ——— Phase 4 : Mise à jour des lots pour remplir current_version_id ———
      for (const lot of lots) {
        const versionId = lot.currentVersionId || null;
        const { error: updateErr } = await supabase
          .from("lots")
          .update({ current_version_id: versionId })
          .eq("id", lot.id);
        if (updateErr) throw updateErr;
      }

      // Supprimer les lots qui ne sont plus dans le projet (cas mise à jour sans delete préalable)
      const newLotIds = new Set(lots.map((l) => l.id));
      const { data: existingRows } = await supabase
        .from("lots")
        .select("id")
        .eq("project_id", project.id);
      const existingLotIds = (existingRows ?? []) as { id: string }[];
      for (const { id: lid } of existingLotIds) {
        if (!newLotIds.has(lid)) {
          await supabase.from("lots").delete().eq("id", lid);
        }
      }
    } catch (err) {
      handleError("save", undefined)(err);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const supabase = getSupabase();
    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
    } catch (err) {
      handleError("remove", undefined)(err);
      throw err;
    }
  }

  async acquireLock(_projectId: string, _userId: string): Promise<boolean> {
    return true;
  }

  async releaseLock(_projectId: string, _userId: string): Promise<void> {}

  async getAllLocks(): Promise<Record<string, ProjectLock>> {
    return {};
  }

  async heartbeat(_projectId: string, _userId: string): Promise<void> {}
}

// ─── Singleton & initialisation ─────────────────────────────────────────────

let _repo: StorageRepository | null = null;

/**
 * Initialise le dépôt : utilise Supabase si les variables d'env sont présentes
 * et que l'utilisateur est authentifié. Sinon aucun fallback (l'app doit gérer l'auth).
 */
export async function initRepository(): Promise<StorageRepository> {
  if (_repo) return _repo;

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définis dans .env"
    );
  }

  try {
    const supabase = getSupabase();
    let { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }
    if (session?.user?.id) _cachedUserId = session.user.id;
  } catch (e) {
    console.warn("[StorageRepository] Supabase session / signInAnonymously:", getErrorMessage(e));
  }

  _repo = new SupabaseRepository();
  console.log("[StorageRepository] Mode Supabase (RLS actif)");
  return _repo;
}

export function getRepository(): StorageRepository {
  if (!_repo) {
    throw new Error(
      "Repository non initialisé. Appelez initRepository() au démarrage (après auth Supabase)."
    );
  }
  return _repo;
}

export function setRepository(repo: StorageRepository): void {
  _repo = repo;
}

// ─── Session user (compatible avec le reste de l'app) ────────────────────────

const SESSION_KEY = "cirad-session-user";

/**
 * Retourne l'identifiant utilisateur pour les locks / affichage.
 * Avec Supabase : retourne auth.uid() (cached après initRepository ou premier appel async).
 * Sans Supabase : fallback sessionStorage.
 */
export function getSessionUser(): string {
  if (_cachedUserId) return _cachedUserId;
  const fallback = sessionStorage.getItem(SESSION_KEY);
  if (fallback) return fallback;
  const generated = `user-${crypto.randomUUID().slice(0, 8)}`;
  sessionStorage.setItem(SESSION_KEY, generated);
  return generated;
}

/** Définit l'id utilisateur en cache (ex. après connexion Supabase). */
export function setSessionUser(id: string): void {
  _cachedUserId = id;
  sessionStorage.setItem(SESSION_KEY, id);
}

/** Réinitialise le cache user (ex. après déconnexion). */
export function clearSessionUser(): void {
  _cachedUserId = null;
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Réinitialise la connexion Cloud : déconnexion Supabase, purge du cache session
 * et du dépôt. Après rechargement, initRepository() fera un nouveau signInAnonymously().
 */
export async function resetCloudConnection(): Promise<void> {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (url && key) {
      const supabase = getSupabase();
      await supabase.auth.signOut();
    }
  } catch (e) {
    console.warn("[StorageRepository] resetCloudConnection signOut:", getErrorMessage(e));
  }
  clearSessionUser();
  _repo = null;
}
