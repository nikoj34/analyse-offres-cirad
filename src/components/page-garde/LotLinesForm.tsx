import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useProjectStore } from "@/store/projectStore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LotType, DpgfAssignment } from "@/types/project";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

function SummaryItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md p-2 ${highlight ? "bg-primary/10 ring-1 ring-primary/20" : "bg-background"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-semibold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function getAutoLabel(type: LotType | null, index: number): string {
  if (!type) return "";
  switch (type) {
    case "PSE": return `PSE ${index}`;
    case "T_OPTIONNELLE": return index === 1 ? "Tranche Optionnelle" : `Tranche Optionnelle ${index - 1}`;
    default: return "";
  }
}

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function LotLinesForm() {
  const { project, updateLotLine, removeLotLine } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];
  const { lotLines } = lot;
  const hasDualDpgf = lot.hasDualDpgf ?? false;

  // Récapitulatif des estimations (TF, PSE, TO)
  const recapComputed = useMemo(() => {
    const lotEstimations = lot.lotLines.filter((l) => (l?.label ?? "").trim() !== "");
    const sumDpgf1 = (lines: typeof lotEstimations) =>
      lines.reduce((s, l) => s + (l.estimationDpgf1 ?? 0), 0);
    const sumDpgf2 = (lines: typeof lotEstimations) =>
      lines.reduce((s, l) => s + (l.estimationDpgf2 ?? 0), 0);
    const pse = lotEstimations.filter((l) => l.type === "PSE");
    const to = lotEstimations.filter((l) => l.type === "T_OPTIONNELLE");
    const estDpgf1 = lot.estimationDpgf1 ?? 0;
    const estDpgf2 = lot.estimationDpgf2 ?? 0;
    const estTF = estDpgf1 + estDpgf2;
    const estPSE = sumDpgf1(pse) + sumDpgf2(pse);
    const estTO = sumDpgf1(to) + sumDpgf2(to);
    return {
      estTF,
      estPSE,
      estTO,
      estTFplusPSE: estTF + estPSE,
      estTFplusTO: estTF + estTO,
      estTotal: estTF + estPSE + estTO,
    };
  }, [lot.estimationDpgf1, lot.estimationDpgf2, lot.lotLines]);

  // Compute auto-numbering per type
  const typeCounters = useMemo(() => {
    const counters: Record<string, number> = {};
    const result: Record<number, string> = {};
    for (const line of lotLines) {
      if (line.type) {
        counters[line.type] = (counters[line.type] ?? 0) + 1;
        result[line.id] = getAutoLabel(line.type, counters[line.type]);
      }
    }
    return result;
  }, [lotLines]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Estimation PSE / Tranches Optionnelles</CardTitle>
        <CardDescription>
          Système en cascade : la ligne suivante apparaît quand la précédente est remplie (max. 12).
          Numérotation automatique par catégorie (PSE 1, PSE 2…, Tranche Optionnelle, Tranche Optionnelle 1…).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Header */}
          <div className={`grid ${hasDualDpgf ? "grid-cols-[28px_80px_1fr_160px_140px_120px_120px_40px]" : "grid-cols-[28px_80px_1fr_160px_120px_40px]"} gap-2 text-xs font-medium text-muted-foreground px-1`}>
            <span></span>
            <span>Auto N°</span>
            <span>Intitulé</span>
            <span>Type</span>
            {hasDualDpgf && <span>Sur quel(s) DPGF</span>}
            <span className="text-right">Est. DPGF 1 (€)</span>
            {hasDualDpgf && <span className="text-right">Est. DPGF 2 (€)</span>}
            <span></span>
          </div>

          {lotLines.map((line) => {
            const showDpgf1 = !hasDualDpgf || line.dpgfAssignment === "DPGF_1" || line.dpgfAssignment === "both";
            const showDpgf2 = hasDualDpgf && (line.dpgfAssignment === "DPGF_2" || line.dpgfAssignment === "both");
            const autoNum = typeCounters[line.id] ?? "";

            return (
              <div
                key={line.id}
                className={`grid ${hasDualDpgf ? "grid-cols-[28px_80px_1fr_160px_140px_120px_120px_40px]" : "grid-cols-[28px_80px_1fr_160px_120px_40px]"} gap-2 items-center`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {line.id}
                </span>
                <span className="text-xs font-medium text-muted-foreground truncate">{autoNum}</span>
                <Input
                  value={line.label}
                  onChange={(e) => updateLotLine(line.id, { label: e.target.value })}
                  placeholder={`Libellé ligne ${line.id}`}
                />
                <Select
                  value={line.type ?? "none"}
                  onValueChange={(v) =>
                    updateLotLine(line.id, { type: v === "none" ? null : (v as LotType) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun type</SelectItem>
                    <SelectItem value="PSE">PSE</SelectItem>
                    <SelectItem value="T_OPTIONNELLE">Tranche Optionnelle</SelectItem>
                  </SelectContent>
                </Select>
                {hasDualDpgf && (
                  <Select
                    value={line.dpgfAssignment}
                    onValueChange={(v) =>
                      updateLotLine(line.id, { dpgfAssignment: v as DpgfAssignment })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="DPGF" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">Les deux</SelectItem>
                      <SelectItem value="DPGF_1">DPGF 1 seul</SelectItem>
                      <SelectItem value="DPGF_2">DPGF 2 seul</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {showDpgf1 ? (
                  <Input
                    type="number"
                    className="text-right"
                    value={line.estimationDpgf1 ?? ""}
                    onChange={(e) =>
                      updateLotLine(line.id, {
                        estimationDpgf1: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="0"
                  />
                ) : (
                  <span className="text-center text-xs text-muted-foreground">—</span>
                )}
                {hasDualDpgf && (showDpgf2 ? (
                  <Input
                    type="number"
                    className="text-right"
                    value={line.estimationDpgf2 ?? ""}
                    onChange={(e) =>
                      updateLotLine(line.id, {
                        estimationDpgf2: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="0"
                  />
                ) : (
                  <span className="text-center text-xs text-muted-foreground">—</span>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeLotLine(line.id)}
                  disabled={lotLines.length <= 1}
                  aria-label="Supprimer la ligne"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        {/* Récapitulatif — placé sous PSE / Tranches Optionnelles */}
        <div className="mt-6 rounded-md border border-border bg-muted/50 p-4">
          <h4 className="mb-3 text-sm font-semibold text-foreground">Récapitulatif</h4>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <SummaryItem label="Estimation TF" value={fmt(recapComputed.estTF)} />
            <SummaryItem label="Montant PSE (total)" value={fmt(recapComputed.estPSE)} />
            <SummaryItem label="Montant Tranches optionnelles (total)" value={fmt(recapComputed.estTO)} />
            <SummaryItem label="Tranche ferme + PSE(s)" value={fmt(recapComputed.estTFplusPSE)} />
            <SummaryItem label="Tranche ferme + Tranches optionnelle(s)" value={fmt(recapComputed.estTFplusTO)} />
            <SummaryItem label="Total global" value={fmt(recapComputed.estTotal)} highlight />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
