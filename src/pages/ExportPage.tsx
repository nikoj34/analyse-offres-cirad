import { useProjectStore } from "@/store/projectStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, FileSpreadsheet } from "lucide-react";
import { exportToExcel } from "@/lib/excelExport";
import { buildLotView } from "@/types/project";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const ExportPage = () => {
  const { project } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = buildLotView(project, lot);
      await exportToExcel(data as any);
      toast({ title: "Export réussi", description: "Le fichier Excel a été téléchargé." });
    } catch (err) {
      console.error(err);
      toast({ title: "Erreur", description: "Impossible de générer le fichier.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const activeCompanies = lot.companies.filter((c) => c.name.trim() !== "");
  const currentVersion = lot.versions.find((v) => v.id === lot.currentVersionId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Export Excel</h1>
        <p className="text-sm text-muted-foreground">
          Génération .xlsx pour <strong>{lot.label || "Lot courant"}</strong> — Onglets : Données du projet, Analyse des prix, Analyse Technique, Synthèse, Méthodologie.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Résumé avant export — {lot.label}
          </CardTitle>
          <CardDescription>Version : {currentVersion?.label ?? "—"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Projet : </span>
              <span className="font-medium">{project.info.name || "Non défini"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Lot : </span>
              <span className="font-medium">{lot.lotNumber || "—"} — {lot.lotAnalyzed || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Entreprises : </span>
              <span className="font-medium">{activeCompanies.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Lignes de lot : </span>
              <span className="font-medium">{lot.lotLines.filter((l) => l.label.trim() !== "").length}</span>
            </div>
          </div>

          <Button onClick={handleExport} disabled={exporting} className="w-full gap-2 mt-4" size="lg">
            <Download className="h-4 w-4" />
            {exporting ? "Génération en cours…" : `Télécharger l'Excel — ${lot.label}`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExportPage;
