import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProjectStore } from "@/store/projectStore";
import { Plus, Trash2, AlertTriangle } from "lucide-react";

function isValidWeight(value: number): boolean {
  return value >= 0.5 && value <= 99.5 && (value * 2) % 1 === 0;
}

export function WeightingForm() {
  const {
    project,
    updateCriterionWeight,
    updateCriterionLabel,
    addSubCriterion,
    removeSubCriterion,
    updateSubCriterion,
  } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];
  const { weightingCriteria } = lot;

  const totalWeight = weightingCriteria.reduce((sum, c) => sum + c.weight, 0);
  const isValidTotal = totalWeight === 100;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Pondérations des critères</CardTitle>
            <CardDescription>
              Pas de 0,5 — entre 0,5% et 99,5%. Total = 100%.
            </CardDescription>
            {!isValidTotal && (
              <div className="mt-2 rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Le total des pondérations doit être de 100% (Actuel : {totalWeight}%)
              </div>
            )}
          </div>
          <Badge variant={isValidTotal ? "default" : "destructive"}>
            Total : {totalWeight}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {weightingCriteria.map((criterion) => {
            const valid = isValidWeight(criterion.weight);
            return (
              <div key={criterion.id} className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Input
                    className="flex-1"
                    value={criterion.label}
                    onChange={(e) => updateCriterionLabel(criterion.id, e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-20 text-center"
                      value={criterion.weight}
                      min={0.5}
                      max={99.5}
                      step={0.5}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateCriterionWeight(criterion.id, val);
                      }}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  {!valid && criterion.weight !== 0 && (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                </div>

                {/* Sub-criteria */}
                {criterion.subCriteria.length > 0 && (
                  <div className="ml-6 space-y-2">
                    {criterion.subCriteria.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-2">
                        <Input
                          className="flex-1"
                          value={sub.label}
                          onChange={(e) =>
                            updateSubCriterion(criterion.id, sub.id, { label: e.target.value })
                          }
                          placeholder="Sous-critère"
                        />
                        <Input
                          type="number"
                          className="w-20 text-center"
                          value={sub.weight}
                          onChange={(e) =>
                            updateSubCriterion(criterion.id, sub.id, {
                              weight: parseInt(e.target.value) || 0,
                            })
                          }
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSubCriterion(criterion.id, sub.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {criterion.id !== "prix" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-6"
                    onClick={() => addSubCriterion(criterion.id)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Sous-critère
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
