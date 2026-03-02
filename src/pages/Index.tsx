import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/projectStore";
import { getAuthorizedPersons } from "@/lib/authorizedPersons";
import { Plus, Trash2, Package } from "lucide-react";
import type { LotData } from "@/types/project";

function getLotEstimationTotal(lot: LotData | undefined): number {
  if (!lot) return 0;
  const base = (lot.estimationDpgf1 ?? 0) + (lot.estimationDpgf2 ?? 0);
  const lines = (lot.lotLines ?? []).reduce(
    (sum, line) => sum + (line.estimationDpgf1 ?? 0) + (line.estimationDpgf2 ?? 0),
    0
  );
  return base + lines;
}

const fmtEuro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const Index = () => {
  const { project, updateInfo, addLot, removeLot, updateLotInfoByIndex, switchLot } = useProjectStore();
  const { info } = project;
  const lots = project.lots ?? [];
  const totalEstimation = lots.reduce((sum, lot) => sum + getLotEstimationTotal(lot), 0);
  const authorizedList = getAuthorizedPersons();
  const currentAuthor = info.author ?? "";
  const authorOptions =
    currentAuthor && !authorizedList.includes(currentAuthor)
      ? [currentAuthor, ...authorizedList]
      : authorizedList;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Données du projet</h1>
        <p className="text-sm text-muted-foreground">
          Informations générales et gestion des lots de l'opération.
        </p>
      </div>

      {/* Project info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Informations générales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project-name">Nom du projet</Label>
              <Input
                id="project-name"
                value={info.name}
                onChange={(e) => updateInfo({ name: e.target.value })}
                placeholder="Ex : Construction école primaire"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="author">Rédacteur</Label>
              <select
                id="author"
                value={currentAuthor}
                onChange={(e) => updateInfo({ author: e.target.value })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">— Aucun —</option>
                {authorOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="market-ref">Référence du marché</Label>
              <Input
                id="market-ref"
                value={info.marketRef}
                onChange={(e) => updateInfo({ marketRef: e.target.value })}
                placeholder="Ex : AO-2026-001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="analysis-date">Date d'analyse</Label>
              <Input
                id="analysis-date"
                type="date"
                value={info.analysisDate}
                onChange={(e) => updateInfo({ analysisDate: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lots management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            Gestion des lots ({(project.lots ?? []).length})
          </CardTitle>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={addLot}>
            <Plus className="h-3.5 w-3.5" />
            Ajouter un lot
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {lots.map((lot, idx) => (
              <div
                key={lot?.id ?? idx}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                  idx === project.currentLotIndex
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card hover:bg-muted/30"
                }`}
                onClick={() => switchLot(idx)}
                role="button"
                tabIndex={0}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                  {lot?.lotNumber ?? (idx + 1)}
                </div>
                <div className="grid flex-1 gap-2 sm:grid-cols-2" onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">N° de lot</Label>
                     <Input
                      value={lot?.lotNumber ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateLotInfoByIndex(idx, { lotNumber: val });
                      }}
                      placeholder="01"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Appellation</Label>
                    <Input
                      value={lot?.lotAnalyzed ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateLotInfoByIndex(idx, { lotAnalyzed: val, label: `Lot ${lot?.lotNumber ?? idx + 1} — ${val}` });
                      }}
                      placeholder="Ex : Gros-Œuvre"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right min-w-[100px]" onClick={(e) => e.stopPropagation()}>
                  <Label className="text-xs text-muted-foreground block">Estimation</Label>
                  <span className="text-sm font-semibold">{fmtEuro(getLotEstimationTotal(lot))}</span>
                </div>
                {lots.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeLot(idx);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            {lots.length > 0 && (
              <div className="flex items-center justify-end gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <span className="text-sm font-medium text-muted-foreground">Total estimations</span>
                <span className="text-sm font-bold text-muted-foreground">{fmtEuro(totalEstimation)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
