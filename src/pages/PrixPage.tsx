import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useMemo, useState, useCallback, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAnalysisContext } from "@/hooks/useAnalysisContext";
import { Lock, AlertTriangle } from "lucide-react";
import { getCompanyColor, getCompanyBgColor } from "@/lib/companyColors";
import { useWeightingValid } from "@/hooks/useWeightingValid";
import { LotLine } from "@/types/project";
import { validatePriceInput } from "@/lib/formValidation";
import { toast } from "@/components/ui/sonner";

/** Couleur du pourcentage d'écart : on utilise la valeur absolue pour que ±10% et ±20% soient cohérents. */
function getDeviationColor(offer: number, estimation: number, seuil: number): string {
  if (estimation === 0) return "";
  const ratio = (offer - estimation) / Math.abs(estimation);
  const absRatio = Math.abs(ratio);
  const halfSeuil = seuil / 2 / 100;   // ex. 10% pour seuil 20%
  const seuilRatio = seuil / 100;       // ex. 20%
  if (absRatio <= halfSeuil) return "text-green-600 dark:text-green-500";
  if (absRatio <= seuilRatio) return "text-orange-600 dark:text-orange-500";
  return "text-red-600 dark:text-red-400 font-semibold";
}

/** Fond de la cellule prix : même logique en valeur absolue pour cohérence avec la légende. */
function getDeviationBg(offer: number, estimation: number, seuil: number): string {
  if (estimation === 0) return "";
  const ratio = (offer - estimation) / Math.abs(estimation);
  const absRatio = Math.abs(ratio);
  const halfSeuil = seuil / 2 / 100;
  const seuilRatio = seuil / 100;
  if (absRatio > seuilRatio) return "bg-red-50 dark:bg-red-950/30";
  if (absRatio <= halfSeuil) return "bg-green-50 dark:bg-green-950/30";
  return "bg-orange-50 dark:bg-orange-950/30";
}

/** True si le prix est inférieur à l'estimation de plus que le taux de tolérance (prix anormalement bas). */
function isAbnormallyLow(value: number, estimation: number, toleranceSeuil: number): boolean {
  if (estimation <= 0 || value <= 0) return false;
  const ratio = (value - estimation) / Math.abs(estimation);
  return ratio < -toleranceSeuil / 100;
}

/** Réservé pour la ligne « Variante » (saisie unique, 1 ou 2 DPGF selon config). Non incluse dans l'offre de base. */
const VARIANTE_LINE_ID = -1;

function getAutoLabel(type: string | null, index: number): string {
  if (!type) return "";
  switch (type) {
    case "PSE": return `PSE ${index}`;
    case "VARIANTE": return `Variante ${index}`;
    case "T_OPTIONNELLE": return index === 1 ? "Tranche Optionnelle" : `Tranche Optionnelle ${index - 1}`;
    default: return "";
  }
}

function buildTypeCounters(lotLines: LotLine[]): Record<number, string> {
  const counters: Record<string, number> = {};
  const result: Record<number, string> = {};
  for (const line of lotLines) {
    if (line.type) {
      counters[line.type] = (counters[line.type] ?? 0) + 1;
      result[line.id] = getAutoLabel(line.type, counters[line.type]);
    }
  }
  return result;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const PrixPage = () => {
  const { project, setPriceEntry, getPriceEntry, setCompanyProposedVariante, getCompanyProposedVariante, updateCompany } = useProjectStore();
  const lotIndex = Math.max(0, Math.min(project?.currentLotIndex ?? 0, (project?.lots?.length ?? 1) - 1));
  const lot = project?.lots?.[lotIndex];
  const { activeCompanies, version, versionIndex, isReadOnly, isNego, negoLabel, negoRound } = useAnalysisContext();
  const lotLines = lot?.lotLines ?? [];
  const weightingCriteria = lot?.weightingCriteria ?? [];
  const { isValid: weightingValid, total: weightingTotal } = useWeightingValid();
  const { vIndex, companyId: companyIdParam } = useParams<{ vIndex?: string; companyId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const basePath = `/version/${vIndex ?? "0"}/prix`;
  const companyIdNum = companyIdParam != null ? parseInt(companyIdParam, 10) : NaN;
  const resolvedCompany = Number.isInteger(companyIdNum)
    ? activeCompanies.find((c) => c.id === companyIdNum)
    : activeCompanies[0];
  const safeIndex = resolvedCompany ? activeCompanies.findIndex((c) => c.id === resolvedCompany.id) : 0;
  const currentCompanies = resolvedCompany ? [resolvedCompany] : [];

  useEffect(() => {
    if (activeCompanies.length === 0) return;
    if (!companyIdParam || !Number.isInteger(companyIdNum) || !activeCompanies.some((c) => c.id === companyIdNum)) {
      const first = activeCompanies[0];
      if (first) navigate(`${basePath}/${first.id}`, { replace: true });
      return;
    }
  }, [activeCompanies, companyIdParam, companyIdNum, basePath, navigate]);

  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < activeCompanies.length - 1 && activeCompanies.length > 1;
  /** Index absolu dans lot.companies pour persistance des couleurs entre initiale et négo */
  const companyIndexInLot = (lot?.companies ?? []).findIndex((c) => c.id === resolvedCompany?.id);
  const colorIndex = companyIndexInLot >= 0 ? companyIndexInLot : safeIndex;

  const activeLotLines = lotLines.filter((l) => l.label.trim() !== "");
  /** Lignes "offre de base" : DPGF + PSE + TO (exclut les lignes de type VARIANTE, gérées dans le bloc Variantes) */
  const baseLotLines = activeLotLines.filter((l) => l.type !== "VARIANTE");
  const varianteLinesFromConfig = Array.isArray(lot?.varianteLines) ? lot.varianteLines : [];
  const varianteExigee = lot?.varianteExigee ?? false;
  const varianteInterdite = lot?.varianteInterdite === true;
  const varianteOptional = (lot?.varianteInterdite === false || (lot?.varianteAutorisee ?? false)) && !varianteExigee;
  /** Section variante visible : si exigée (saisie obligatoire), si autorisée (case + prix), ou si interdite (case pour signaler une offre irrégulière). */
  const showVarianteSection = varianteExigee || varianteOptional || varianteInterdite;
  const hasVarianteLines = varianteLinesFromConfig.length > 0;
  const prixCriterion = weightingCriteria.find((c) => c.id === "prix");
  const prixWeight = prixCriterion?.weight ?? 40;
  const hasDualDpgf = lot?.hasDualDpgf ?? false;
  const toleranceSeuil = lot?.toleranceSeuil ?? 20;

  // Negotiation: reference versions for price comparison
  const lotVersions = lot?.versions ?? [];
  const initialVersion = isNego ? lotVersions[0] : null;
  const prevPhaseVersion = isNego && negoRound !== null && negoRound > 1 ? lotVersions[negoRound - 1] : initialVersion;

  const getRefPrice = (companyId: number, lotLineId: number, dpgfNum: 1 | 2): number | null => {
    if (!prevPhaseVersion) return null;
    const entry = prevPhaseVersion.priceEntries.find(e => e.companyId === companyId && e.lotLineId === lotLineId);
    return dpgfNum === 1 ? (entry?.dpgf1 ?? null) : (entry?.dpgf2 ?? null);
  };

  const getInitialTotal = (companyId: number): number => {
    if (!initialVersion) return 0;
    let total = 0;
    const baseEntry = initialVersion.priceEntries.find(e => e.companyId === companyId && e.lotLineId === 0);
    total += (baseEntry?.dpgf1 ?? 0) + (baseEntry?.dpgf2 ?? 0);
    for (const line of baseLotLines) {
      const entry = initialVersion.priceEntries.find(e => e.companyId === companyId && e.lotLineId === line.id);
      total += (entry?.dpgf1 ?? 0) + (entry?.dpgf2 ?? 0);
    }
    return total;
  };

  /** Total variante(s) : uniquement les montants des Variantes 1, 2, 3… (DPGF 1 + DPGF 2 de chaque ligne variante). */
  const getVarianteTotal = (companyId: number): number => {
    let sum = 0;
    for (const line of varianteLinesFromConfig) {
      const e = getPriceEntry(companyId, line.id, version?.id);
      if (e) sum += (e.dpgf1 ?? 0) + (e.dpgf2 ?? 0);
    }
    return sum;
  };

  const typeCounters = useMemo(() => buildTypeCounters(lotLines), [lotLines]);

  const companyTotals = useMemo(() => {
    if (!version) return {};
    const result: Record<number, { dpgf1: number; dpgf2: number; total: number }> = {};

    for (const company of activeCompanies) {
      if (company.status === "ecartee") continue;
      const baseDpgf = version.priceEntries.find(
        (e) => e.companyId === company.id && e.lotLineId === 0
      );
      let dpgf1Sum = baseDpgf?.dpgf1 ?? 0;
      let dpgf2Sum = baseDpgf?.dpgf2 ?? 0;

      for (const line of baseLotLines) {
        const entry = version.priceEntries.find(
          (e) => e.companyId === company.id && e.lotLineId === line.id
        );
        dpgf1Sum += entry?.dpgf1 ?? 0;
        dpgf2Sum += entry?.dpgf2 ?? 0;
      }
      result[company.id] = { dpgf1: dpgf1Sum, dpgf2: dpgf2Sum, total: dpgf1Sum + dpgf2Sum };
    }
    return result;
  }, [activeCompanies, baseLotLines, version]);

  const priceScores = useMemo(() => {
    const totals = Object.entries(companyTotals)
      .filter(([, v]) => v.total > 0)
      .map(([id, v]) => ({ id: Number(id), total: v.total }));

    if (totals.length === 0) return {};

    const minTotal = Math.min(...totals.map((t) => t.total));
    const result: Record<number, number> = {};
    for (const t of totals) {
      result[t.id] = (minTotal / t.total) * prixWeight;
    }
    return result;
  }, [companyTotals, prixWeight]);

  /** Estimation globale (Base + PSE + TO) pour la ligne Écart / Estimation Globale */
  const estimationGlobale = useMemo(() => {
    const base = (lot?.estimationDpgf1 ?? 0) + (lot?.estimationDpgf2 ?? 0);
    const rest = baseLotLines
      .filter((l) => l.id !== 0)
      .reduce((s, l) => s + (l.estimationDpgf1 ?? 0) + (l.estimationDpgf2 ?? 0), 0);
    return base + rest;
  }, [lot?.estimationDpgf1, lot?.estimationDpgf2, baseLotLines]);

  const pageTitle = isNego ? `Analyse des prix — ${negoLabel}` : "Analyse des prix";

  if (!lot) {
    return (
      <div className="space-y-6 p-4">
        <h1 className="text-2xl font-bold text-foreground">Analyse des prix</h1>
        <p className="text-sm text-muted-foreground">Aucun lot disponible. Ouvrez un projet ou ajoutez un lot dans la configuration.</p>
      </div>
    );
  }

  if (activeCompanies.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {isNego
              ? "Aucune entreprise retenue pour cette phase de négociation."
              : "Veuillez d'abord saisir des entreprises dans « Données du projet »."}
          </p>
        </div>
      </div>
    );
  }

  // No longer block when there are no lot lines - base DPGF alone is sufficient

  const renderDeviationCell = (offer: number | null, estimation: number) => {
    const o = offer ?? 0;
    if (Math.abs(estimation) === 0 || o === 0) return <span className="text-muted-foreground">—</span>;
    const pct = ((o - estimation) / Math.abs(estimation)) * 100;
    const color = getDeviationColor(o, estimation, toleranceSeuil);
    return <span className={`font-medium ${color}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</span>;
  };

  const renderPriceWithEstimation = (
    value: number | null,
    estimation: number | null,
    disabled: boolean,
    onChange: (val: number | null) => void,
    prevPhasePrice?: number | null,
  ) => {
    const est = estimation ?? 0;
    const val = value ?? 0;
    const devBg = est !== 0 && val !== 0 ? getDeviationBg(val, est, toleranceSeuil) : "";
    const abnormallyLow = est !== 0 && val !== 0 && isAbnormallyLow(val, est, toleranceSeuil);
    return (
      <div className={`space-y-0.5 rounded px-1 ${devBg}`}>
        <Input
          type="number"
          step="0.01"
          className="text-right text-sm"
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => {
            const r = validatePriceInput(e.target.value);
            if ('price' in r) {
              onChange(r.price);
            } else {
              toast.error(r.error);
            }
          }}
          placeholder="0"
        />
        <div className="text-right text-[10px] text-muted-foreground">
          Est. : {estimation != null && estimation !== 0 ? fmt(estimation) : "—"}
        </div>
        {prevPhasePrice != null && prevPhasePrice !== 0 && (
          <div className="text-right text-[10px] text-muted-foreground opacity-60 italic">
            Phase préc. : {fmt(prevPhasePrice)}
          </div>
        )}
        {abnormallyLow && (
          <div className="flex items-center gap-1 text-[10px] font-medium text-destructive">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Prix anormalement bas
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="rounded-r-lg border-l-4 min-h-0"
      style={{
        backgroundColor: getCompanyBgColor(colorIndex),
        borderColor: getCompanyColor(colorIndex),
      }}
    >
      <div className="p-4 space-y-6">
      {!weightingValid && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive font-medium">
            Le total des pondérations doit être de 100% (Actuel : {weightingTotal}%). Corrigez dans « Données du projet » si besoin.
          </p>
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          {pageTitle}
          {isReadOnly && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" /> Figée
            </Badge>
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          Saisie des prix par entreprise et par ligne de lot. Note prix pondérée sur {prixWeight} pts.
          <span className="ml-2 inline-flex items-center gap-3 text-xs">
            <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300" /> Écart ≤ ±{toleranceSeuil / 2}%
            <span className="inline-block w-3 h-3 rounded bg-orange-100 border border-orange-300" /> ±{toleranceSeuil / 2}% à ±{toleranceSeuil}%
            <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300" /> Écart &gt; ±{toleranceSeuil}%
          </span>
        </p>
      </div>

      {activeCompanies.length > 1 && (
        <div className="flex items-center rounded-lg border border-border bg-muted/30 px-4 py-2">
          <span className="text-sm font-medium text-muted-foreground">
            Entreprise {safeIndex + 1} / {activeCompanies.length}
          </span>
        </div>
      )}

      {currentCompanies.map((company) => (
        <Card
          key={company.id}
          className={company.status === "ecartee" ? "opacity-60" : ""}
          style={{
            borderLeft: `4px solid ${getCompanyColor(colorIndex)}`,
            backgroundColor: company.status !== "ecartee" ? getCompanyBgColor(colorIndex) : undefined,
          }}
        >
          <CardHeader className="bg-muted/40 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold text-foreground">
                {company.id}. {company.name}
              </CardTitle>
              {company.status === "ecartee" ? (
                <Badge variant="destructive">
                  Écartée{company.exclusionReason ? ` — ${company.exclusionReason}` : ""}
                </Badge>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {varianteInterdite && !varianteExigee && (getCompanyProposedVariante(company.id) || getVarianteTotal(company.id) > 0) && (
                    <Badge variant="destructive">Offre irrégulière</Badge>
                  )}
                  {companyTotals[company.id] && (
                    <Badge variant="outline">
                      Total: {fmt(companyTotals[company.id].total)}
                    </Badge>
                  )}
                  <Badge variant={priceScores[company.id] ? "default" : "secondary"}>
                    {(priceScores[company.id] ?? 0).toFixed(2)} / {prixWeight}
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>
          {company.status !== "ecartee" && (
            <CardContent>
              <div className="space-y-3">
                {/* ——— Offre de base (DPGF, PSE, TO) ——— */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-2">Offre de base</h3>
                  <div className={`grid ${hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]"} gap-2 text-xs font-medium text-muted-foreground px-1`}>
                    <span>Ligne</span>
                    <span className="text-right">DPGF 1 (€ HT)</span>
                    <span className="text-right">Écart</span>
                    {hasDualDpgf && <span className="text-right">DPGF 2 (€ HT)</span>}
                    {hasDualDpgf && <span className="text-right">Écart</span>}
                  </div>
                </div>
                {/* Base DPGF row */}
                {(() => {
                  const dpgfEntry = getPriceEntry(company.id, 0, version?.id);
                  const est1 = lot.estimationDpgf1 ?? 0;
                  const est2 = lot.estimationDpgf2 ?? 0;
                  return (
                    <div className={`grid ${hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]"} gap-2 items-center rounded-md border-2 border-primary/30 bg-primary/5 p-2`}>
                      <div className="text-sm font-semibold">DPGF (Tranche Ferme)</div>
                      <div>
                        {renderPriceWithEstimation(
                          dpgfEntry?.dpgf1 ?? null,
                          est1 || null,
                          isReadOnly,
                          (val) => setPriceEntry(company.id, 0, val, dpgfEntry?.dpgf2 ?? null, version?.id),
                          isNego ? getRefPrice(company.id, 0, 1) : undefined
                        )}
                      </div>
                      <div className="text-right text-xs">
                        {renderDeviationCell(dpgfEntry?.dpgf1, est1)}
                      </div>
                      {hasDualDpgf && (
                        <div>
                          {renderPriceWithEstimation(
                            dpgfEntry?.dpgf2 ?? null,
                            est2 || null,
                            isReadOnly,
                            (val) => setPriceEntry(company.id, 0, dpgfEntry?.dpgf1 ?? null, val, version?.id),
                            isNego ? getRefPrice(company.id, 0, 2) : undefined
                          )}
                        </div>
                      )}
                      {hasDualDpgf && (
                        <div className="text-right text-xs">
                          {renderDeviationCell(dpgfEntry?.dpgf2, est2)}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {baseLotLines.map((line) => {
                  const entry = getPriceEntry(company.id, line.id, version?.id);
                  const showDpgf1 = line.dpgfAssignment === "DPGF_1" || line.dpgfAssignment === "both";
                  const showDpgf2 = hasDualDpgf && (line.dpgfAssignment === "DPGF_2" || line.dpgfAssignment === "both");
                  const autoNum = typeCounters[line.id];
                  return (
                    <div
                      key={line.id}
                      className={`grid ${hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]"} gap-2 items-center rounded-md border border-border p-2`}
                    >
                      <div className="text-sm">
                        <span className="font-medium">{line.label}</span>
                        {autoNum && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {autoNum}
                          </Badge>
                        )}
                      </div>
                      {showDpgf1 ? (
                        <div>
                          {renderPriceWithEstimation(
                            entry?.dpgf1 ?? null,
                            line.estimationDpgf1,
                            isReadOnly,
                            (val) => setPriceEntry(company.id, line.id, val, entry?.dpgf2 ?? null, version?.id),
                            isNego ? getRefPrice(company.id, line.id, 1) : undefined
                          )}
                        </div>
                      ) : (
                        <span className="text-center text-xs text-muted-foreground">—</span>
                      )}
                      <div className="text-right text-xs">
                        {showDpgf1
                          ? renderDeviationCell(entry?.dpgf1, line.estimationDpgf1 ?? 0)
                          : <span className="text-muted-foreground">—</span>}
                      </div>
                      {hasDualDpgf && (showDpgf2 ? (
                        <div>
                          {renderPriceWithEstimation(
                            entry?.dpgf2 ?? null,
                            line.estimationDpgf2,
                            isReadOnly,
                            (val) => setPriceEntry(company.id, line.id, entry?.dpgf1 ?? null, val, version?.id),
                            isNego ? getRefPrice(company.id, line.id, 2) : undefined
                          )}
                        </div>
                      ) : (
                        <span className="text-center text-xs text-muted-foreground">—</span>
                      ))}
                      {hasDualDpgf && (
                        <div className="text-right text-xs">
                          {showDpgf2
                            ? renderDeviationCell(entry?.dpgf2, line.estimationDpgf2 ?? 0)
                            : <span className="text-muted-foreground">—</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
                {companyTotals[company.id] && (
                  <div className={`grid ${hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]"} gap-2 rounded-md bg-muted/50 p-2 text-sm font-semibold`}>
                    <span>Total Global Évalué{showVarianteSection ? " (Base + PSE + TO)" : ""}</span>
                    <span className="text-right">{fmt(companyTotals[company.id].dpgf1)}</span>
                    <span></span>
                    {hasDualDpgf && <span className="text-right">{fmt(companyTotals[company.id].dpgf2)}</span>}
                    {hasDualDpgf && <span></span>}
                  </div>
                )}
                {/* Écart / Estimation Globale (en % et en €) */}
                {companyTotals[company.id] && estimationGlobale > 0 && (
                  <div className={`grid ${hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]"} gap-2 rounded-md border border-border bg-muted/30 p-2 text-sm`}>
                    <span className="text-muted-foreground">Écart / Estimation Globale ({fmt(estimationGlobale)})</span>
                    <span className={`text-right font-medium ${getDeviationColor(companyTotals[company.id].total, estimationGlobale, toleranceSeuil)}`}>
                      {((companyTotals[company.id].total - estimationGlobale) / estimationGlobale * 100 >= 0 ? "+" : "")}
                      {((companyTotals[company.id].total - estimationGlobale) / estimationGlobale * 100).toFixed(2)}%
                      {" "}
                      ({companyTotals[company.id].total - estimationGlobale >= 0 ? "+" : ""}{fmt(companyTotals[company.id].total - estimationGlobale)})
                    </span>
                    <span></span>
                    {hasDualDpgf && <span></span>}
                    {hasDualDpgf && <span></span>}
                  </div>
                )}
                {/* Note Prix Globale ( / poidsPrix ) — calculée sur Total Global Évalué, 2 décimales */}
                <div className={`grid ${hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]"} gap-2 rounded-md bg-primary/10 border border-primary/20 p-2 text-sm font-semibold`}>
                  <span>Note Prix Globale ( / {prixWeight} )</span>
                  <span className="text-right">
                    {company.status === "ecartee" ? "—" : (priceScores[company.id] ?? 0).toFixed(2)}
                  </span>
                  <span></span>
                  {hasDualDpgf && <span></span>}
                  {hasDualDpgf && <span></span>}
                </div>

                {showVarianteSection && (
                  <>
                    <Separator className="my-6" />
                    <div>
                      <h3 className="text-sm font-semibold text-muted-foreground mb-2">Variantes</h3>
                {/* Variante exigée : tout avec estimations et total variante(s) */}
                {varianteExigee && (() => {
                  const est1 = lot?.estimationDpgf1 ?? null;
                  const est2 = lot?.estimationDpgf2 ?? null;
                  const gridClass = hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]";
                  return (
                    <div
                      className="rounded-md border-2 p-3 space-y-2"
                      style={{
                        borderColor: getCompanyColor(colorIndex),
                        backgroundColor: getCompanyBgColor(colorIndex),
                      }}
                    >
                      {hasVarianteLines ? (
                        <>
                          {varianteLinesFromConfig.map((line, idx) => {
                            const entry = getPriceEntry(company.id, line.id, version?.id);
                            const showDpgf1 = line.dpgfAssignment === "DPGF_1" || line.dpgfAssignment === "both";
                            const showDpgf2 = hasDualDpgf && (line.dpgfAssignment === "DPGF_2" || line.dpgfAssignment === "both");
                            return (
                              <div key={line.id} className={`grid ${gridClass} gap-2 items-center`}>
                                <div className="text-sm">
                                  <span className="font-medium">{line.label || `Variante ${idx + 1}`}</span>
                                  <Badge variant="outline" className="ml-2 text-xs">Variante {idx + 1}</Badge>
                                </div>
                                {showDpgf1 ? (
                                  <div>
                                    {renderPriceWithEstimation(entry?.dpgf1 ?? null, line.estimationDpgf1, isReadOnly, (val) => setPriceEntry(company.id, line.id, val, entry?.dpgf2 ?? null, version?.id), isNego ? getRefPrice(company.id, line.id, 1) : undefined)}
                                  </div>
                                ) : <span className="text-center text-xs text-muted-foreground">—</span>}
                                <div className="text-right text-xs">{showDpgf1 ? renderDeviationCell(entry?.dpgf1 ?? 0, line.estimationDpgf1 ?? 0) : <span className="text-muted-foreground">—</span>}</div>
                                {hasDualDpgf && (showDpgf2 ? (
                                  <div>
                                    {renderPriceWithEstimation(entry?.dpgf2 ?? null, line.estimationDpgf2, isReadOnly, (val) => setPriceEntry(company.id, line.id, entry?.dpgf1 ?? null, val, version?.id), isNego ? getRefPrice(company.id, line.id, 2) : undefined)}
                                  </div>
                                ) : <span className="text-center text-xs text-muted-foreground">—</span>)}
                                {hasDualDpgf && <div className="text-right text-xs">{showDpgf2 ? renderDeviationCell(entry?.dpgf2 ?? 0, line.estimationDpgf2 ?? 0) : <span className="text-muted-foreground">—</span>}</div>}
                              </div>
                            );
                          })}
                          <div className={`grid ${gridClass} gap-2 items-center rounded-md bg-muted/50 p-2 text-sm font-semibold`}>
                            <span>Total variante(s)</span>
                            <span className="text-right">{fmt(getVarianteTotal(company.id))}</span>
                            <span></span>
                            {hasDualDpgf && <span></span>}
                            {hasDualDpgf && <span></span>}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={`grid ${gridClass} gap-2 items-center`}>
                            <div className="text-sm font-medium">Variante (exigée)</div>
                            <div>
                              {renderPriceWithEstimation(getPriceEntry(company.id, VARIANTE_LINE_ID, version?.id)?.dpgf1 ?? null, est1, isReadOnly, (val) => setPriceEntry(company.id, VARIANTE_LINE_ID, val, getPriceEntry(company.id, VARIANTE_LINE_ID, version?.id)?.dpgf2 ?? null, version?.id), isNego ? getRefPrice(company.id, VARIANTE_LINE_ID, 1) : undefined)}
                            </div>
                            <div className="text-right text-xs">{est1 != null ? renderDeviationCell(getPriceEntry(company.id, VARIANTE_LINE_ID, version?.id)?.dpgf1 ?? 0, est1) : <span className="text-muted-foreground">—</span>}</div>
                            {hasDualDpgf && (
                              <>
                                <div>
                                  {renderPriceWithEstimation(getPriceEntry(company.id, VARIANTE_LINE_ID, version?.id)?.dpgf2 ?? null, est2, isReadOnly, (val) => setPriceEntry(company.id, VARIANTE_LINE_ID, getPriceEntry(company.id, VARIANTE_LINE_ID, version?.id)?.dpgf1 ?? null, val, version?.id), isNego ? getRefPrice(company.id, VARIANTE_LINE_ID, 2) : undefined)}
                                </div>
                                <div className="text-right text-xs">{est2 != null ? renderDeviationCell(getPriceEntry(company.id, VARIANTE_LINE_ID, version?.id)?.dpgf2 ?? 0, est2) : <span className="text-muted-foreground">—</span>}</div>
                              </>
                            )}
                          </div>
                          <div className={`grid ${gridClass} gap-2 items-center rounded-md bg-muted/50 p-2 text-sm font-semibold`}>
                            <span>Total variante(s)</span>
                            <span className="text-right">{fmt(getVarianteTotal(company.id))}</span>
                            <span></span>
                            {hasDualDpgf && <span></span>}
                            {hasDualDpgf && <span></span>}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
                {/* Variante : coche "a proposé une variante" affichée même si variante interdite ; si variante interdite et prix saisi → offre irrégulière */}
                {!varianteExigee && (
                  <div
                    className="rounded-md border-2 p-3 space-y-2"
                    style={{
                      borderColor: getCompanyColor(colorIndex),
                      backgroundColor: getCompanyBgColor(colorIndex),
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`variante-proposed-${company.id}`}
                        checked={getCompanyProposedVariante(company.id)}
                        onCheckedChange={(checked) => setCompanyProposedVariante(company.id, !!checked)}
                        disabled={isReadOnly}
                      />
                      <Label htmlFor={`variante-proposed-${company.id}`} className="text-sm font-medium cursor-pointer">
                        Cette entreprise a proposé une variante
                      </Label>
                    </div>
                    {getCompanyProposedVariante(company.id) && (() => {
                      const gridClass = hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]";
                      const est1 = lot?.estimationDpgf1 ?? null;
                      const est2 = lot?.estimationDpgf2 ?? null;
                      return (
                        <div className="space-y-2 pt-1">
                          {hasVarianteLines ? (
                            <>
                              {varianteLinesFromConfig.map((line, idx) => {
                                const entry = getPriceEntry(company.id, line.id, version?.id);
                                const showDpgf1 = line.dpgfAssignment === "DPGF_1" || line.dpgfAssignment === "both";
                                const showDpgf2 = hasDualDpgf && (line.dpgfAssignment === "DPGF_2" || line.dpgfAssignment === "both");
                                return (
                                  <div key={line.id} className={`grid ${gridClass} gap-2 items-center`}>
                                    <div className="text-sm">
                                      <span className="font-medium">{line.label || `Variante ${idx + 1}`}</span>
                                      <Badge variant="outline" className="ml-2 text-xs">Variante {idx + 1}</Badge>
                                    </div>
                                    {showDpgf1 ? (
                                      <div>
                                        {renderPriceWithEstimation(entry?.dpgf1 ?? null, line.estimationDpgf1, isReadOnly, (val) => setPriceEntry(company.id, line.id, val, entry?.dpgf2 ?? null, version?.id), isNego ? getRefPrice(company.id, line.id, 1) : undefined)}
                                      </div>
                                    ) : <span className="text-center text-xs text-muted-foreground">—</span>}
                                    <div className="text-right text-xs">{showDpgf1 ? renderDeviationCell(entry?.dpgf1 ?? 0, line.estimationDpgf1 ?? 0) : <span className="text-muted-foreground">—</span>}</div>
                                    {hasDualDpgf && (showDpgf2 ? (
                                      <div>
                                        {renderPriceWithEstimation(entry?.dpgf2 ?? null, line.estimationDpgf2, isReadOnly, (val) => setPriceEntry(company.id, line.id, entry?.dpgf1 ?? null, val, version?.id), isNego ? getRefPrice(company.id, line.id, 2) : undefined)}
                                      </div>
                                    ) : <span className="text-center text-xs text-muted-foreground">—</span>)}
                                    {hasDualDpgf && <div className="text-right text-xs">{showDpgf2 ? renderDeviationCell(entry?.dpgf2 ?? 0, line.estimationDpgf2 ?? 0) : <span className="text-muted-foreground">—</span>}</div>}
                                  </div>
                                );
                              })}
                              <div className={`grid ${gridClass} gap-2 items-center rounded-md bg-muted/50 p-2 text-sm font-semibold`}>
                                <span>Total variante(s)</span>
                                <span className="text-right">{fmt(getVarianteTotal(company.id))}</span>
                                <span></span>
                                {hasDualDpgf && <span></span>}
                                {hasDualDpgf && <span></span>}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className={`grid ${gridClass} gap-2 items-center`}>
                                <div className="text-sm font-medium">Variante</div>
                                <div>
                                  {renderPriceWithEstimation(getPriceEntry(company.id, VARIANTE_LINE_ID, version?.id)?.dpgf1 ?? null, est1, isReadOnly, (val) => setPriceEntry(company.id, VARIANTE_LINE_ID, val, getPriceEntry(company.id, VARIANTE_LINE_ID, version?.id)?.dpgf2 ?? null, version?.id), isNego ? getRefPrice(company.id, VARIANTE_LINE_ID, 1) : undefined)}
                                </div>
                                <div className="text-right text-xs">{est1 != null ? renderDeviationCell(getPriceEntry(company.id, VARIANTE_LINE_ID, version?.id)?.dpgf1 ?? 0, est1) : <span className="text-muted-foreground">—</span>}</div>
                                {hasDualDpgf && (
                                  <>
                                    <div>
                                      {renderPriceWithEstimation(getPriceEntry(company.id, VARIANTE_LINE_ID, version?.id)?.dpgf2 ?? null, est2, isReadOnly, (val) => setPriceEntry(company.id, VARIANTE_LINE_ID, getPriceEntry(company.id, VARIANTE_LINE_ID, version?.id)?.dpgf1 ?? null, val, version?.id), isNego ? getRefPrice(company.id, VARIANTE_LINE_ID, 2) : undefined)}
                                    </div>
                                    <div className="text-right text-xs">{est2 != null ? renderDeviationCell(getPriceEntry(company.id, VARIANTE_LINE_ID, version?.id)?.dpgf2 ?? 0, est2) : <span className="text-muted-foreground">—</span>}</div>
                                  </>
                                )}
                              </div>
                              <div className={`grid ${gridClass} gap-2 items-center rounded-md bg-muted/50 p-2 text-sm font-semibold`}>
                                <span>Total variante(s)</span>
                                <span className="text-right">{fmt(getVarianteTotal(company.id))}</span>
                                <span></span>
                                {hasDualDpgf && <span></span>}
                                {hasDualDpgf && <span></span>}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
                    </div>
                  </>
                )}

                {isNego && companyTotals[company.id] && (() => {
                  const initTotal = getInitialTotal(company.id);
                  const currentTotal = companyTotals[company.id].total;
                  if (initTotal === 0 || currentTotal === 0) return null;
                  const gainPct = ((initTotal - currentTotal) / initTotal) * 100;
                  return (
                    <div className={`grid ${hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]"} gap-2 rounded-md border border-blue-200 bg-blue-50 p-2 text-sm`}>
                      <span className="font-semibold text-blue-800">Gain négociation {negoRound} (vs initial)</span>
                      <span className={`text-right font-bold ${gainPct >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(2)}%
                      </span>
                      <span></span>
                      {hasDualDpgf && <span></span>}
                      {hasDualDpgf && <span></span>}
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          )}
        </Card>
      ))}

      {activeCompanies.length > 0 && activeCompanies[safeIndex] && (
        <div className="mt-6 mb-4 flex items-center space-x-2">
          <Checkbox
            id="has-questions-prix"
            checked={activeCompanies[safeIndex].hasQuestions ?? false}
            onCheckedChange={(checked) => updateCompany(activeCompanies[safeIndex].id, { hasQuestions: !!checked })}
          />
          <Label htmlFor="has-questions-prix">
            Question(s) à poser à {activeCompanies[safeIndex].name || "cette entreprise"}
          </Label>
        </div>
      )}

      {activeCompanies.length > 1 && (
        <div className="mt-6 flex items-center justify-end rounded-lg border border-border bg-muted/30 px-4 py-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!hasPrev}
              onClick={() => navigate(`${basePath}/${activeCompanies[safeIndex - 1].id}`)}
            >
              Entreprise précédente
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNext}
              onClick={() => navigate(`${basePath}/${activeCompanies[safeIndex + 1].id}`)}
            >
              Entreprise suivante
            </Button>
            {!hasNext && (
              <Button size="sm" onClick={() => navigate(basePath.replace("/prix", "/technique"))} className="ml-2">
                Page suivante
              </Button>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default PrixPage;
