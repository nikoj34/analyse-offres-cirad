import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useProjectStore } from "@/store/projectStore";
import { Minus, Plus } from "lucide-react";

export function EstimationForm() {
  const { project, updateLotInfo } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];
  const hasDualDpgf = lot.hasDualDpgf ?? false;
  const toleranceSeuil = lot.toleranceSeuil ?? 20;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Estimation Tranche Ferme</CardTitle>
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
              value={lot.estimationDpgf1 ?? ""}
              onChange={(e) =>
                updateLotInfo({
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
                value={lot.estimationDpgf2 ?? ""}
                onChange={(e) =>
                  updateLotInfo({
                    estimationDpgf2: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="0"
              />
            </div>
          )}
        </div>

        {/* Seuil de tolérance */}
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
          <label className="text-sm font-medium text-foreground whitespace-nowrap">
            Seuil de tolérance estimation :
          </label>
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-foreground px-1" aria-hidden="true">±</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-md border-2"
              onClick={() =>
                updateLotInfo({
                  toleranceSeuil: Math.max(0, toleranceSeuil - 1),
                })
              }
              aria-label="Diminuer le seuil"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              className="w-16 text-center font-medium"
              value={toleranceSeuil}
              onChange={(e) =>
                updateLotInfo({
                  toleranceSeuil: e.target.value ? Math.max(0, Math.min(100, Number(e.target.value))) : 20,
                })
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-md border-2"
              onClick={() =>
                updateLotInfo({
                  toleranceSeuil: Math.min(100, toleranceSeuil + 1),
                })
              }
              aria-label="Augmenter le seuil"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-foreground">%</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Au-delà de ce seuil, l'écart s'affiche en grisé dans l'Analyse prix.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
