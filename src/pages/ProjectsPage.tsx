import { useMultiProjectStore } from "@/store/multiProjectStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FolderOpen, Trash2, Download, Upload } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import ciradLogo from "@/assets/cirad-logo.png";
import { getVersionDisplayLabel } from "@/types/project";

function getProjectStatus(project: any): { label: string; color: string; detail: string } {
  const versions = project.versions ?? [];
  // Check if any version has attributaire validated
  for (const v of versions) {
    if (v.validated && Object.values(v.negotiationDecisions ?? {}).some((d: string) => d === "attributaire")) {
      const date = v.validatedAt ? new Date(v.validatedAt).toLocaleDateString("fr-FR") : "";
      return { label: "Terminé", color: "bg-green-600", detail: date ? `Validé le ${date}` : "" };
    }
  }
  // In progress - find current phase
  const lastVersion = versions[versions.length - 1];
  if (lastVersion) {
    const displayLabel = getVersionDisplayLabel(lastVersion.label);
    return { label: "En cours", color: "bg-blue-500", detail: displayLabel };
  }
  return { label: "En cours", color: "bg-blue-500", detail: "" };
}

const ProjectsPage = () => {
  const { getProjectList, createProject, openProject, deleteProject } = useMultiProjectStore();
  const projects = getProjectList();
  const { projects: allProjects } = useMultiProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportAll = () => {
    const data = JSON.stringify(allProjects, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cirad-analyses-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export réussi !");
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string);
        const store = useMultiProjectStore.getState();
        let count = 0;
        for (const [id, project] of Object.entries(imported)) {
          if ((project as any)?.info && (project as any)?.versions) {
            store.saveCurrentProject(project as any);
            count++;
          }
        }
        toast.success(`${count} analyse(s) importée(s) avec succès !`);
      } catch {
        toast.error("Fichier invalide. Veuillez sélectionner un fichier JSON exporté.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center gap-3">
          <img src={ciradLogo} alt="CIRAD" className="h-10" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Analyse d'offres CIRAD</h1>
            <p className="text-xs text-muted-foreground">Gestion des analyses de marchés publics</p>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-4xl w-full p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Mes analyses</h2>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-2">
              <Upload className="h-4 w-4" />
              Importer
            </Button>
            {projects.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportAll} className="gap-2">
                <Download className="h-4 w-4" />
                Exporter tout
              </Button>
            )}
            <Button onClick={() => createProject()} className="gap-2">
              <Plus className="h-4 w-4" />
              Créer une analyse
            </Button>
          </div>
        </div>

        {projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-sm">Aucune analyse pour le moment.</p>
              <Button onClick={() => createProject()} variant="outline" className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Créer votre première analyse
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {projects.map((p) => {
              const fullProject = allProjects[p.id];
              const status = fullProject ? getProjectStatus(fullProject) : { label: "En cours", color: "bg-blue-500", detail: "" };
              return (
                <Card
                  key={p.id}
                  className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                  onClick={() => openProject(p.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-base">{p.name}</CardTitle>
                        <Badge className={`${status.color} text-white`}>
                          {status.label}
                        </Badge>
                        {status.detail && (
                          <span className="text-xs text-muted-foreground">{status.detail}</span>
                        )}
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer cette analyse ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              L'analyse « {p.name} » sera définitivement supprimée. Cette action est irréversible.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteProject(p.id)}>
                              Supprimer
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    <CardDescription>
                      {p.marketRef && `Réf. ${p.marketRef} — `}
                      {p.lotAnalyzed && `${p.lotAnalyzed} — `}
                      Mis à jour le {new Date(p.updatedAt).toLocaleDateString("fr-FR")}
                    </CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default ProjectsPage;
