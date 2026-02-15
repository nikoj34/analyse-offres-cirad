import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { useAnalysisContext } from "@/hooks/useAnalysisContext";
import { Lock } from "lucide-react";
import { getCompanyColor } from "@/lib/companyColors";

const PrixPage = () => {
  const { project, setPriceEntry, getPriceEntry } = useProjectStore();
  const { activeCompanies, version, isReadOnly, isNego, negoLabel } = useAnalysisContext();
  const { lotLines, weightingCriteria } = project;

  const activeLotLines = lotLines.filter((l) => l.label.trim() !== "");
  const prixCriterion = weightingCriteria.find((c) => c.id === "prix");
  const prixWeight = prixCriterion?.weight ?? 40;

  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

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

  const pageTitle = isNego ? `Module Prix — ${negoLabel}` : "Module Prix";

  if (activeCompanies.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {isNego
              ? "Aucune entreprise retenue pour cette phase de négociation."
              : "Veuillez d'abord saisir des entreprises dans la Page de Garde."}
          </p>
        </div>
      </div>
    );
  }

  if (activeLotLines.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground">
            Veuillez d'abord saisir des lignes de lot dans la Page de Garde.
          </p>
        </div>
      </div>
    );
  }

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
        </p>
      </div>

      {activeCompanies.map((company, companyIndex) => (
        <Card
          key={company.id}
          className={company.status === "ecartee" ? "opacity-60" : ""}
          style={{ borderLeft: `4px solid ${getCompanyColor(companyIndex)}` }}
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
                <div className="grid grid-cols-[1fr_120px_120px] gap-2 text-xs font-medium text-muted-foreground px-1">
                  <span>Ligne</span>
                  <span className="text-right">DPGF 1 (€ HT)</span>
                  <span className="text-right">DPGF 2 (€ HT)</span>
                </div>
                {/* Base DPGF row */}
                {(() => {
                  const dpgfEntry = getPriceEntry(company.id, 0);
                  return (
                    <div className="grid grid-cols-[1fr_120px_120px] gap-2 items-center rounded-md border-2 border-primary/30 bg-primary/5 p-2">
                      <div className="text-sm">
                        <span className="font-semibold">DPGF (Tranche Ferme)</span>
                      </div>
                      <Input
                        type="number"
                        className="text-right text-sm"
                        value={dpgfEntry?.dpgf1 ?? ""}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          setPriceEntry(
                            company.id,
                            0,
                            e.target.value ? Number(e.target.value) : null,
                            dpgfEntry?.dpgf2 ?? null
                          )
                        }
                        placeholder="0"
                      />
                      <Input
                        type="number"
                        className="text-right text-sm"
                        value={dpgfEntry?.dpgf2 ?? ""}
                        disabled={isReadOnly}
                        onChange={(e) =>
                          setPriceEntry(
                            company.id,
                            0,
                            dpgfEntry?.dpgf1 ?? null,
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        placeholder="0"
                      />
                    </div>
                  );
                })()}
                {activeLotLines.map((line) => {
                  const entry = getPriceEntry(company.id, line.id);
                  const showDpgf1 = line.dpgfAssignment === "DPGF_1" || line.dpgfAssignment === "both";
                  const showDpgf2 = line.dpgfAssignment === "DPGF_2" || line.dpgfAssignment === "both";
                  return (
                    <div
                      key={line.id}
                      className="grid grid-cols-[1fr_120px_120px] gap-2 items-center rounded-md border border-border p-2"
                    >
                      <div className="text-sm">
                        <span className="font-medium">{line.label}</span>
                        {line.type && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {line.type === "PSE" ? "PSE" : line.type === "VARIANTE" ? "Variante" : "TO"}
                          </Badge>
                        )}
                      </div>
                      {showDpgf1 ? (
                        <Input
                          type="number"
                          className="text-right text-sm"
                          value={entry?.dpgf1 ?? ""}
                          disabled={isReadOnly}
                          onChange={(e) =>
                            setPriceEntry(
                              company.id,
                              line.id,
                              e.target.value ? Number(e.target.value) : null,
                              entry?.dpgf2 ?? null
                            )
                          }
                          placeholder="0"
                        />
                      ) : (
                        <span className="text-center text-xs text-muted-foreground">—</span>
                      )}
                      {showDpgf2 ? (
                        <Input
                          type="number"
                          className="text-right text-sm"
                          value={entry?.dpgf2 ?? ""}
                          disabled={isReadOnly}
                          onChange={(e) =>
                            setPriceEntry(
                              company.id,
                              line.id,
                              entry?.dpgf1 ?? null,
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                          placeholder="0"
                        />
                      ) : (
                        <span className="text-center text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  );
                })}
                {companyTotals[company.id] && (
                  <div className="grid grid-cols-[1fr_120px_120px] gap-2 rounded-md bg-muted/50 p-2 text-sm font-semibold">
                    <span>Total</span>
                    <span className="text-right">{fmt(companyTotals[company.id].dpgf1)}</span>
                    <span className="text-right">{fmt(companyTotals[company.id].dpgf2)}</span>
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
