import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useProjectStore } from "@/store/projectStore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LotType } from "@/types/project";

const LOT_TYPE_LABELS: Record<LotType, string> = {
  PSE: "PSE",
  VARIANTE: "Variante",
  T_OPTIONNELLE: "Tranche Optionnelle",
};

export function LotLinesForm() {
  const { project, updateLotLine } = useProjectStore();
  const { lotLines } = project;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Lots / PSE / Variantes / Tranches Optionnelles</CardTitle>
        <CardDescription>
          Système en cascade : la ligne suivante apparaît quand la précédente est remplie (max. 12)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {lotLines.map((line) => (
            <div key={line.id} className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {line.id}
              </span>
              <Input
                className="flex-1"
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
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun type</SelectItem>
                  <SelectItem value="PSE">PSE</SelectItem>
                  <SelectItem value="VARIANTE">Variante</SelectItem>
                  <SelectItem value="T_OPTIONNELLE">Tranche Optionnelle</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
