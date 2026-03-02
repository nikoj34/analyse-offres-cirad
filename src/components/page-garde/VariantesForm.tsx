import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useProjectStore } from "@/store/projectStore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Plus } from "lucide-react";
import { DpgfAssignment } from "@/types/project";

const OUI_NON = ["oui", "non"] as const;
type OuiNon = (typeof OUI_NON)[number];

function toBool(v: OuiNon): boolean {
  return v === "oui";
}

function fromBool(b: boolean | undefined, defaultVal: boolean): OuiNon {
  if (b === undefined) return defaultVal ? "oui" : "non";
  return b ? "oui" : "non";
}

export function VariantesForm() {
  const { project, updateLotInfo, addVarianteLine, updateVarianteLine, removeVarianteLine } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];
  const varianteInterdite = fromBool(lot.varianteInterdite, true);
  const varianteAutorisee = fromBool(lot.varianteAutorisee, false);
  const varianteExigee = fromBool(lot.varianteExigee, false);
  const hasDualDpgf = lot.hasDualDpgf ?? false;
  const varianteLines = lot.varianteLines ?? [];
  // Déblocage : si variante interdite = NON, ou autorisée = OUI, ou exigée = OUI, la saisie des variantes est possible
  const showVarianteLines =
    lot.varianteInterdite === false ||
    (lot.varianteAutorisee ?? false) ||
    (lot.varianteExigee ?? false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Variantes</CardTitle>
        <CardDescription>
          Configuration des variantes pour ce lot. Répondez par OUI ou NON à chaque question.
          {showVarianteLines && " Si une variante est autorisée ou exigée, saisissez les lignes de variantes ci‑dessous (intitulé, DPGF, estimations)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-sm font-medium">« Variante interdite »</Label>
            <Select
              value={lot.varianteExigee || lot.varianteAutorisee ? "non" : varianteInterdite}
              onValueChange={(v) => updateLotInfo({ varianteInterdite: toBool(v as OuiNon) })}
              disabled={!!(lot.varianteExigee || lot.varianteAutorisee)}
            >
              <SelectTrigger className={lot.varianteExigee || lot.varianteAutorisee ? "opacity-60" : undefined}>
                <SelectValue placeholder="OUI / NON" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oui">OUI</SelectItem>
                <SelectItem value="non">NON</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">OUI par défaut{(lot.varianteExigee || lot.varianteAutorisee) ? " — désactivé si variante exigée ou autorisée" : ""}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">« Variante autorisée »</Label>
            <Select
              value={varianteAutorisee}
              onValueChange={(v) => {
                const autorisee = toBool(v as OuiNon);
                updateLotInfo(autorisee ? { varianteAutorisee: true, varianteInterdite: false } : { varianteAutorisee: false, ...(lot.varianteExigee ? {} : { varianteInterdite: true }) });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="OUI / NON" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oui">OUI</SelectItem>
                <SelectItem value="non">NON</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">NON par défaut</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">« Variante exigée »</Label>
            <Select
              value={varianteExigee}
              onValueChange={(v) => {
                const exigee = toBool(v as OuiNon);
                updateLotInfo(exigee ? { varianteExigee: true, varianteInterdite: false } : { varianteExigee: false, ...(lot.varianteAutorisee ? {} : { varianteInterdite: true }) });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="OUI / NON" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="oui">OUI</SelectItem>
                <SelectItem value="non">NON</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">NON par défaut</p>
          </div>
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
