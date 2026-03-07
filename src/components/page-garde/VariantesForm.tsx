import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useProjectStore } from "@/store/projectStore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { DpgfAssignment } from "@/types/project";

type VarianteStatut = "interdites" | "autorisees" | "exigees";

function getVarianteStatut(lot: { varianteInterdite?: boolean; varianteAutorisee?: boolean; varianteExigee?: boolean }): VarianteStatut {
  if (lot.varianteExigee) return "exigees";
  if (lot.varianteAutorisee) return "autorisees";
  return "interdites";
}

export function VariantesForm() {
  const { project, updateLotInfo, addVarianteLine, updateVarianteLine, removeVarianteLine } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];
  const statut = getVarianteStatut(lot);
  const hasDualDpgf = lot.hasDualDpgf ?? false;
  const varianteLines = lot.varianteLines ?? [];
  const showVarianteLines =
    lot.varianteInterdite === false ||
    (lot.varianteAutorisee ?? false) ||
    (lot.varianteExigee ?? false);

  const handleStatutChange = (value: VarianteStatut) => {
    if (value === "interdites") {
      updateLotInfo({ varianteInterdite: true, varianteAutorisee: false, varianteExigee: false });
    } else if (value === "autorisees") {
      updateLotInfo({ varianteInterdite: false, varianteAutorisee: true, varianteExigee: false });
    } else {
      updateLotInfo({ varianteInterdite: false, varianteAutorisee: false, varianteExigee: true });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Variantes</CardTitle>
        <CardDescription>
          Choisissez le statut des variantes pour ce lot.
          {showVarianteLines && " Si les variantes sont autorisées ou exigées, saisissez les lignes de variantes ci‑dessous (intitulé, DPGF, estimations)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-md">
          <Label className="text-sm font-medium">Statut des variantes pour ce lot</Label>
          <Select value={statut} onValueChange={(v) => handleStatutChange(v as VarianteStatut)}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="interdites">Variantes Interdites</SelectItem>
              <SelectItem value="autorisees">Variantes Autorisées</SelectItem>
              <SelectItem value="exigees">Variantes Exigées</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Option par défaut : Variantes Interdites</p>
        </div>

        {showVarianteLines && (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Lignes de variantes</h4>
            <div className={`grid ${hasDualDpgf ? "grid-cols-[28px_80px_1fr_140px_120px_120px_40px]" : "grid-cols-[28px_80px_1fr_120px_40px]"} gap-2 text-xs font-medium text-muted-foreground px-1`}>
              <span></span>
              <span>Auto N°</span>
              <span>Intitulé</span>
              {hasDualDpgf && <span>Sur quel(s) DPGF</span>}
              <span className="text-right">Est. DPGF 1 (€)</span>
              {hasDualDpgf && <span className="text-right">Est. DPGF 2 (€)</span>}
              <span></span>
            </div>
            {varianteLines.map((line, index) => {
              const showDpgf1 = !hasDualDpgf || line.dpgfAssignment === "DPGF_1" || line.dpgfAssignment === "both";
              const showDpgf2 = hasDualDpgf && (line.dpgfAssignment === "DPGF_2" || line.dpgfAssignment === "both");
              const autoNum = `Variante ${index + 1}`;
              return (
                <div
                  key={line.id}
                  className={`grid ${hasDualDpgf ? "grid-cols-[28px_80px_1fr_140px_120px_120px_40px]" : "grid-cols-[28px_80px_1fr_120px_40px]"} gap-2 items-center`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground truncate">{autoNum}</span>
                  <Input
                    value={line.label}
                    onChange={(e) => updateVarianteLine(line.id, { label: e.target.value })}
                    placeholder="Intitulé de la variante"
                  />
                  {hasDualDpgf && (
                    <Select
                      value={line.dpgfAssignment}
                      onValueChange={(v) => updateVarianteLine(line.id, { dpgfAssignment: v as DpgfAssignment })}
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
                        updateVarianteLine(line.id, {
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
                        updateVarianteLine(line.id, {
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
                    onClick={() => removeVarianteLine(line.id)}
                    aria-label="Supprimer la variante"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => addVarianteLine()}
            >
              <Plus className="h-4 w-4" />
              Ajouter une variante
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
