import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/projectStore";
import { Plus, Trash2, Package, FileText } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";

const AUTHOR_OPTIONS = ["Valérie CHANCERELLE", "Jérôme FORESTIER", "Maxime GREAL", "Nicolas JAMET"];
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
  const currentAuthor = info.author ?? "";
  const authorOptions =
    currentAuthor && !AUTHOR_OPTIONS.includes(currentAuthor)
      ? [currentAuthor, ...AUTHOR_OPTIONS]
      : AUTHOR_OPTIONS;

  const [newDoc, setNewDoc] = useState("");
  const adminConfig = project?.info?.adminConfig ?? {
    requireDecennale: true,
    requireBiennale: true,
    requireRC: true,
    customDocs: [],
  };

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

      {/* Admin Docs Config */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Pièces administratives à exiger
          </CardTitle>
          <CardDescription>
            Sélectionnez les documents que les entreprises doivent fournir pour ce projet. Ces éléments seront vérifiés dans l'onglet "Administratif".
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Assurance Décennale</Label>
                <p className="text-xs text-muted-foreground">Exiger une attestation de garantie décennale</p>
              </div>
              <Switch
                checked={adminConfig.requireDecennale}
                onCheckedChange={(c) => updateInfo({ adminConfig: { ...adminConfig, requireDecennale: c } })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Assurance Biennale</Label>
                <p className="text-xs text-muted-foreground">Exiger une garantie de bon fonctionnement</p>
              </div>
              <Switch
                checked={adminConfig.requireBiennale}
                onCheckedChange={(c) => updateInfo({ adminConfig: { ...adminConfig, requireBiennale: c } })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Responsabilité Civile</Label>
                <p className="text-xs text-muted-foreground">Exiger une attestation RC pro</p>
              </div>
              <Switch
                checked={adminConfig.requireRC}
                onCheckedChange={(c) => updateInfo({ adminConfig: { ...adminConfig, requireRC: c } })}
              />
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-border">
            <Label>Autres documents personnalisés</Label>
            <div className="flex gap-2">
              <Input
                value={newDoc}
                onChange={(e) => setNewDoc(e.target.value)}
                placeholder="Ex : KBIS, Planning prévisionnel..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newDoc.trim()) {
                    e.preventDefault();
                    updateInfo({ adminConfig: { ...adminConfig, customDocs: [...(adminConfig.customDocs || []), newDoc.trim()] } });
                    setNewDoc("");
                  }
                }}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  if (newDoc.trim()) {
                    updateInfo({ adminConfig: { ...adminConfig, customDocs: [...(adminConfig.customDocs || []), newDoc.trim()] } });
                    setNewDoc("");
                  }
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Ajouter
              </Button>
            </div>
            <div className="space-y-2 mt-2">
              {(adminConfig.customDocs || []).map((doc, i) => (
                <div key={i} className="flex items-center justify-between bg-muted/40 px-3 py-2 rounded-md">
                  <span className="text-sm font-medium">{doc}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10"
                    onClick={() => {
                      const newDocs = [...(adminConfig.customDocs || [])];
                      newDocs.splice(i, 1);
                      updateInfo({ adminConfig: { ...adminConfig, customDocs: newDocs } });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
