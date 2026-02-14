import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProjectStore } from "@/store/projectStore";

export function ProjectInfoForm() {
  const { project, updateInfo } = useProjectStore();
  const { info } = project;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Informations du projet</CardTitle>
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
            <Label htmlFor="market-ref">Référence du marché</Label>
            <Input
              id="market-ref"
              value={info.marketRef}
              onChange={(e) => updateInfo({ marketRef: e.target.value })}
              placeholder="Ex : AO-2026-001"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lot-analyzed">Lot analysé</Label>
            <Input
              id="lot-analyzed"
              value={info.lotAnalyzed}
              onChange={(e) => updateInfo({ lotAnalyzed: e.target.value })}
              placeholder="Ex : Gros œuvre"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lot-number">N° de lot</Label>
            <Input
              id="lot-number"
              value={info.lotNumber}
              onChange={(e) => updateInfo({ lotNumber: e.target.value })}
              placeholder="Ex : 01"
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
          <div className="space-y-2">
            <Label htmlFor="author">Rédacteur</Label>
            <Input
              id="author"
              value={info.author}
              onChange={(e) => updateInfo({ author: e.target.value })}
              placeholder="Ex : Jean Dupont"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
