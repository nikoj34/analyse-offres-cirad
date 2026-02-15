import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useProjectStore } from "@/store/projectStore";
import { useMemo } from "react";

export function EstimationForm() {
  const { project, updateInfo } = useProjectStore();
  const { info, lotLines } = project;
  const hasDualDpgf = info.hasDualDpgf ?? false;

  const computed = useMemo(() => {
    const lotEstimations = lotLines.filter((l) => l.label.trim() !== "");

    const sumDpgf1 = (lines: typeof lotEstimations) =>
      lines.reduce((s, l) => s + (l.estimationDpgf1 ?? 0), 0);
    const sumDpgf2 = (lines: typeof lotEstimations) =>
      lines.reduce((s, l) => s + (l.estimationDpgf2 ?? 0), 0);

    const pse = lotEstimations.filter((l) => l.type === "PSE");
    const variante = lotEstimations.filter((l) => l.type === "VARIANTE");
    const to = lotEstimations.filter((l) => l.type === "T_OPTIONNELLE");

    const estDpgf1 = info.estimationDpgf1 ?? 0;
    const estDpgf2 = info.estimationDpgf2 ?? 0;
    const estTF = estDpgf1 + estDpgf2;

    const estPSE = sumDpgf1(pse) + sumDpgf2(pse);
    const estVariante = sumDpgf1(variante) + sumDpgf2(variante);
    const estTO = sumDpgf1(to) + sumDpgf2(to);

    return {
      estTF,
      estTFplusPSE: estTF + estPSE,
      estTFplusVariante: estTF + estVariante,
      estTFplusTO: estTF + estTO,
      estTotal: estTF + estPSE + estVariante + estTO,
    };
  }, [info.estimationDpgf1, info.estimationDpgf2, lotLines]);

  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Synthèse Financière — Estimations</CardTitle>
        <CardDescription>
          Saisie des estimations de la tranche ferme par DPGF. Les totaux se calculent automatiquement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className={`grid grid-cols-1 gap-4 ${hasDualDpgf ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Estimation DPGF 1 (€ HT)
            </label>
            <Input
              type="number"
              step="0.01"
              value={info.estimationDpgf1 ?? ""}
              onChange={(e) =>
                updateInfo({
                  estimationDpgf1: e.target.value ? Number(e.target.value) : null,
                })
              }
              placeholder="0"
            />
          </div>
          {hasDualDpgf && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Estimation DPGF 2 (€ HT)
              </label>
              <Input
                type="number"
                step="0.01"
                value={info.estimationDpgf2 ?? ""}
                onChange={(e) =>
                  updateInfo({
                    estimationDpgf2: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="0"
              />
            </div>
          )}
        </div>

        <div className="rounded-md border border-border bg-muted/50 p-4">
          <h4 className="mb-3 text-sm font-semibold text-foreground">Récapitulatif</h4>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <SummaryItem label="Estimation TF" value={fmt(computed.estTF)} />
            <SummaryItem label="TF + PSE" value={fmt(computed.estTFplusPSE)} />
            <SummaryItem label="TF + Variante" value={fmt(computed.estTFplusVariante)} />
            <SummaryItem label="TF + TO" value={fmt(computed.estTFplusTO)} />
            <SummaryItem label="Total global" value={fmt(computed.estTotal)} highlight />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md p-2 ${highlight ? "bg-primary/10 ring-1 ring-primary/20" : "bg-background"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-semibold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}
