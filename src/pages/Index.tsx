import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/projectStore";
import { Plus, Trash2, Package } from "lucide-react";

const Index = () => {
  const { project, updateInfo, addLot, removeLot, updateLotInfo, switchLot } = useProjectStore();
  const { info } = project;

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
              <Input
                id="author"
                value={info.author}
                onChange={(e) => updateInfo({ author: e.target.value })}
                placeholder="Ex : Jean Dupont"
              />
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
            Gestion des lots ({project.lots.length})
          </CardTitle>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={addLot}>
            <Plus className="h-3.5 w-3.5" />
            Ajouter un lot
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {project.lots.map((lot, idx) => (
              <div
                key={lot.id}
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
                  {lot.lotNumber || idx + 1}
                </div>
                <div className="grid flex-1 gap-2 sm:grid-cols-2" onClick={(e) => e.stopPropagation()}>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">N° de lot</Label>
                    <Input
                      value={lot.lotNumber}
                      onChange={(e) => {
                        switchLot(idx);
                        setTimeout(() => updateLotInfo({ lotNumber: e.target.value }), 0);
                      }}
                      placeholder="01"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Appellation</Label>
                    <Input
                      value={lot.lotAnalyzed}
                      onChange={(e) => {
                        switchLot(idx);
                        setTimeout(() => updateLotInfo({ lotAnalyzed: e.target.value, label: `Lot ${lot.lotNumber || idx + 1} — ${e.target.value}` }), 0);
                      }}
                      placeholder="Ex : Gros-Œuvre"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                {project.lots.length > 1 && (
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
