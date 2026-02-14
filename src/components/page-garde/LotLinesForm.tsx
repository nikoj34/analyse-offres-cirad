import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useProjectStore } from "@/store/projectStore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LotType, DpgfAssignment } from "@/types/project";

export function LotLinesForm() {
  const { project, updateLotLine } = useProjectStore();
  const { lotLines } = project;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Lots / PSE / Variantes / Tranches Optionnelles</CardTitle>
        <CardDescription>
          Système en cascade : la ligne suivante apparaît quand la précédente est remplie (max. 12).
          Choisissez l'affectation DPGF et saisissez les estimations correspondantes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Header */}
          <div className="grid grid-cols-[28px_1fr_160px_140px_120px_120px] gap-2 text-xs font-medium text-muted-foreground px-1">
            <span></span>
            <span>Intitulé</span>
            <span>Type</span>
            <span>Affectation</span>
            <span className="text-right">Est. DPGF 1 (€)</span>
            <span className="text-right">Est. DPGF 2 (€)</span>
          </div>

          {lotLines.map((line) => {
            const showDpgf1 = line.dpgfAssignment === "DPGF_1" || line.dpgfAssignment === "both";
            const showDpgf2 = line.dpgfAssignment === "DPGF_2" || line.dpgfAssignment === "both";

            return (
              <div
                key={line.id}
                className="grid grid-cols-[28px_1fr_160px_140px_120px_120px] gap-2 items-center"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {line.id}
                </span>
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
                    <SelectItem value="VARIANTE">Variante</SelectItem>
                    <SelectItem value="T_OPTIONNELLE">Tranche Optionnelle</SelectItem>
                  </SelectContent>
                </Select>
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
                {showDpgf2 ? (
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
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
