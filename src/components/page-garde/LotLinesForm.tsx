import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useProjectStore } from "@/store/projectStore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LotType, DpgfAssignment } from "@/types/project";
import { useMemo } from "react";

function getAutoLabel(type: LotType | null, index: number): string {
  if (!type) return "";
  switch (type) {
    case "PSE": return `PSE ${index}`;
    case "VARIANTE": return `Variante ${index}`;
    case "T_OPTIONNELLE": return `TO${index}`;
  }
}

export function LotLinesForm() {
  const { project, updateLotLine } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];
  const { lotLines } = lot;
  const hasDualDpgf = lot.hasDualDpgf ?? false;

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
        <CardTitle className="text-lg">PSE / Variantes / Tranches Optionnelles</CardTitle>
        <CardDescription>
          Système en cascade : la ligne suivante apparaît quand la précédente est remplie (max. 12).
          Numérotation automatique par catégorie (PSE 1, PSE 2…, Variante 1…, TO1…).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Header */}
          <div className={`grid ${hasDualDpgf ? "grid-cols-[28px_80px_1fr_160px_140px_120px_120px]" : "grid-cols-[28px_80px_1fr_160px_120px]"} gap-2 text-xs font-medium text-muted-foreground px-1`}>
            <span></span>
            <span>Auto N°</span>
            <span>Intitulé</span>
            <span>Type</span>
            {hasDualDpgf && <span>Affectation</span>}
            <span className="text-right">Est. DPGF 1 (€)</span>
            {hasDualDpgf && <span className="text-right">Est. DPGF 2 (€)</span>}
          </div>

          {lotLines.map((line) => {
            const showDpgf1 = !hasDualDpgf || line.dpgfAssignment === "DPGF_1" || line.dpgfAssignment === "both";
            const showDpgf2 = hasDualDpgf && (line.dpgfAssignment === "DPGF_2" || line.dpgfAssignment === "both");
            const autoNum = typeCounters[line.id] ?? "";

            return (
              <div
                key={line.id}
                className={`grid ${hasDualDpgf ? "grid-cols-[28px_80px_1fr_160px_140px_120px_120px]" : "grid-cols-[28px_80px_1fr_160px_120px]"} gap-2 items-center`}
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
                    <SelectItem value="VARIANTE">Variante</SelectItem>
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
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
