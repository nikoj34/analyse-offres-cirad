import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { useAnalysisContext } from "@/hooks/useAnalysisContext";
import { Lock, AlertTriangle } from "lucide-react";
import { getCompanyColor, getCompanyBgColor } from "@/lib/companyColors";
import { useWeightingValid } from "@/hooks/useWeightingValid";
import { LotLine } from "@/types/project";

function getDeviationColor(offer: number, estimation: number): string {
  if (estimation === 0) return "";
  const ratio = (offer - estimation) / Math.abs(estimation);
  if (ratio <= 0.10) return "text-green-600";
  if (ratio <= 0.20) return "text-orange-500";
  return "text-red-600";
}

function getDeviationBg(offer: number, estimation: number): string {
  if (estimation === 0) return "";
  const ratio = (offer - estimation) / Math.abs(estimation);
  if (ratio <= 0.10) return "bg-green-50";
  if (ratio <= 0.20) return "bg-orange-50";
  return "bg-red-50";
}

function getAutoLabel(type: string | null, index: number): string {
  if (!type) return "";
  switch (type) {
    case "PSE": return `PSE ${index}`;
    case "VARIANTE": return `Variante ${index}`;
    case "T_OPTIONNELLE": return `TO${index}`;
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
  const { project, setPriceEntry, getPriceEntry } = useProjectStore();
  const { activeCompanies, version, isReadOnly, isNego, negoLabel } = useAnalysisContext();
  const { lotLines, weightingCriteria } = project;
  const { isValid: weightingValid, total: weightingTotal } = useWeightingValid();

  const activeLotLines = lotLines.filter((l) => l.label.trim() !== "");
  const prixCriterion = weightingCriteria.find((c) => c.id === "prix");
  const prixWeight = prixCriterion?.weight ?? 40;
  const hasDualDpgf = project.info.hasDualDpgf ?? false;

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

      for (const line of activeLotLines) {
        const entry = version.priceEntries.find(
          (e) => e.companyId === company.id && e.lotLineId === line.id
        );
        dpgf1Sum += entry?.dpgf1 ?? 0;
        dpgf2Sum += entry?.dpgf2 ?? 0;
      }

      result[company.id] = { dpgf1: dpgf1Sum, dpgf2: dpgf2Sum, total: dpgf1Sum + dpgf2Sum };
    }
    return result;
  }, [activeCompanies, activeLotLines, version]);

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

  const pageTitle = isNego ? `Analyse des prix — ${negoLabel}` : "Analyse des prix";

  if (!weightingValid) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
          <div className="mt-4 rounded-md border border-destructive bg-destructive/10 p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive font-medium">
              Le total des pondérations doit être de 100% (Actuel : {weightingTotal}%). 
              Veuillez corriger dans « Données du projet » avant de continuer.
            </p>
          </div>
        </div>
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
    const color = getDeviationColor(o, estimation);
    return <span className={`font-medium ${color}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</span>;
  };

  const renderPriceWithEstimation = (
    value: number | null,
    estimation: number | null,
    disabled: boolean,
    onChange: (val: number | null) => void
  ) => {
    const est = estimation ?? 0;
    const val = value ?? 0;
    const devBg = est !== 0 && val !== 0 ? getDeviationBg(val, est) : "";
    return (
      <div className={`space-y-0.5 rounded px-1 ${devBg}`}>
        <Input
          type="number"
          step="0.01"
          className="text-right text-sm"
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          placeholder="0"
        />
        {est !== 0 && (
          <div className="text-right text-[10px] text-muted-foreground">
            Est. : {fmt(est)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
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
            <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300" /> ≤ +10%
            <span className="inline-block w-3 h-3 rounded bg-orange-100 border border-orange-300" /> +10-20%
            <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300" /> &gt; +20%
          </span>
        </p>
      </div>

      {activeCompanies.map((company, companyIndex) => (
        <Card
          key={company.id}
          className={company.status === "ecartee" ? "opacity-60" : ""}
          style={{
            borderLeft: `4px solid ${getCompanyColor(companyIndex)}`,
            backgroundColor: company.status !== "ecartee" ? getCompanyBgColor(companyIndex) : undefined,
          }}
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {company.id}. {company.name}
              </CardTitle>
              {company.status === "ecartee" ? (
                <Badge variant="destructive">
                  Écartée{company.exclusionReason ? ` — ${company.exclusionReason}` : ""}
                </Badge>
              ) : (
                <div className="flex items-center gap-2">
                  {companyTotals[company.id] && (
                    <Badge variant="outline">
                      Total: {fmt(companyTotals[company.id].total)}
                    </Badge>
                  )}
                  <Badge variant={priceScores[company.id] ? "default" : "secondary"}>
                    {(priceScores[company.id] ?? 0).toFixed(1)} / {prixWeight}
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>
          {company.status !== "ecartee" && (
            <CardContent>
              <div className="space-y-3">
                <div className={`grid ${hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]"} gap-2 text-xs font-medium text-muted-foreground px-1`}>
                  <span>Ligne</span>
                  <span className="text-right">DPGF 1 (€ HT)</span>
                  <span className="text-right">Écart</span>
                  {hasDualDpgf && <span className="text-right">DPGF 2 (€ HT)</span>}
                  {hasDualDpgf && <span className="text-right">Écart</span>}
                </div>
                {/* Base DPGF row */}
                {(() => {
                  const dpgfEntry = getPriceEntry(company.id, 0);
                  const est1 = project.info.estimationDpgf1 ?? 0;
                  const est2 = project.info.estimationDpgf2 ?? 0;
                  return (
                    <div className={`grid ${hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]"} gap-2 items-center rounded-md border-2 border-primary/30 bg-primary/5 p-2`}>
                      <div className="text-sm font-semibold">DPGF (Tranche Ferme)</div>
                      <div>
                        {renderPriceWithEstimation(
                          dpgfEntry?.dpgf1 ?? null,
                          est1 || null,
                          isReadOnly,
                          (val) => setPriceEntry(company.id, 0, val, dpgfEntry?.dpgf2 ?? null)
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
                            (val) => setPriceEntry(company.id, 0, dpgfEntry?.dpgf1 ?? null, val)
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
                {activeLotLines.map((line) => {
                  const entry = getPriceEntry(company.id, line.id);
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
                            (val) => setPriceEntry(company.id, line.id, val, entry?.dpgf2 ?? null)
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
                            (val) => setPriceEntry(company.id, line.id, entry?.dpgf1 ?? null, val)
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
                    <span>Total</span>
                    <span className="text-right">{fmt(companyTotals[company.id].dpgf1)}</span>
                    <span></span>
                    {hasDualDpgf && <span className="text-right">{fmt(companyTotals[company.id].dpgf2)}</span>}
                    {hasDualDpgf && <span></span>}
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
};

export default PrixPage;
