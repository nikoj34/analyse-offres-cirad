import { useMultiProjectStore } from "@/store/multiProjectStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, FolderOpen, Trash2, Download, Upload, Lock } from "lucide-react";
import { useRef, useState, useEffect } from "react";
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
import { Footer } from "@/components/Footer";
import { ImportedProjectSchema } from "@/lib/projectValidation";
import { getRepository } from "@/lib/storageRepository";

function getProjectStatus(project: any): { label: string; color: string; detail: string; attributaire?: string } {
  const versions = project.versions ?? [];
  for (const v of versions) {
    if (v.validated && Object.values(v.negotiationDecisions ?? {}).some((d: string) => d === "attributaire")) {
      const date = v.validatedAt ? new Date(v.validatedAt).toLocaleDateString("fr-FR") : "";
      const attributaireId = Object.entries(v.negotiationDecisions ?? {}).find(([, d]) => d === "attributaire")?.[0];
      const companies = project.companies ?? [];
      const attributaireName = attributaireId
        ? companies.find((c: any) => c.id === Number(attributaireId))?.name ?? ""
        : "";
      return {
        label: "Terminé",
        color: "bg-green-600",
        detail: date ? `Validé le ${date}` : "",
        attributaire: attributaireName,
      };
    }
  }
  const lastVersion = versions[versions.length - 1];
  if (lastVersion) {
    const displayLabel = getVersionDisplayLabel(lastVersion.label);
    return { label: "En cours", color: "bg-blue-500", detail: displayLabel };
  }
  return { label: "En cours", color: "bg-blue-500", detail: "" };
}

const ProjectsPage = () => {
  const { getProjectList, createProject, openProject, deleteProject, refreshLocks, isLockedByOther, locks } = useMultiProjectStore();
  const projects = getProjectList();
  const { projects: allProjects } = useMultiProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Refresh locks periodically to detect other users
  useEffect(() => {
    refreshLocks();
    const interval = setInterval(refreshLocks, 10_000);
    return () => clearInterval(interval);
  }, [refreshLocks]);

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === projects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map((p) => p.id)));
    }
  };

  const handleOpenProject = async (id: string) => {
    const success = await openProject(id);
    if (!success) {
      const lock = locks[id];
      toast.error(`Ce projet est verrouillé par ${lock?.lockedBy ?? "un autre utilisateur"}.`);
    }
  };

  const handleExportSelected = () => {
    const idsToExport = selectedIds.size > 0 ? selectedIds : new Set(projects.map((p) => p.id));
    const data: Record<string, any> = {};
    for (const id of idsToExport) {
      if (allProjects[id]) data[id] = allProjects[id];
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cirad-analyses-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${Object.keys(data).length} analyse(s) exportée(s) !`);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string);
        if (typeof imported !== "object" || imported === null) {
          toast.error("Format de fichier invalide.");
          return;
        }
        const store = useMultiProjectStore.getState();
        const existingNames = new Set(
          Object.values(store.projects).map((p: any) => p.info?.name?.toLowerCase() ?? "")
        );
        let count = 0;
        let skipped = 0;
        for (const [, project] of Object.entries(imported)) {
          const parseResult = ImportedProjectSchema.safeParse(project);
          if (!parseResult.success) {
            skipped++;
            continue;
          }

          const newId = crypto.randomUUID();
          const cloned = JSON.parse(JSON.stringify(parseResult.data));
          cloned.id = newId;

          const originalName = cloned.info.name ?? "";
          if (existingNames.has(originalName.toLowerCase())) {
            const dateSuffix = new Date().toLocaleDateString("fr-FR");
            cloned.info.name = `${originalName} (Importé le ${dateSuffix})`;
          }
          existingNames.add(cloned.info.name.toLowerCase());

          for (const v of cloned.versions ?? []) {
            const oldVid = v.id;
            v.id = crypto.randomUUID();
            if (cloned.currentVersionId === oldVid) {
              cloned.currentVersionId = v.id;
            }
          }

          store.saveCurrentProject(cloned);
          count++;
        }
        // Reload from repository
        store.loadFromRepository();
        const msg = skipped > 0
          ? `${count} analyse(s) importée(s), ${skipped} ignorée(s) (format invalide).`
          : `${count} analyse(s) importée(s) avec succès !`;
        toast[count > 0 ? "success" : "warning"](msg);
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
          <img src={ciradLogo} alt="CIRAD" className="h-10" width="119" height="40" />
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
              <Button variant="outline" size="sm" onClick={handleExportSelected} className="gap-2">
                <Download className="h-4 w-4" />
                {selectedIds.size > 0 ? `Exporter (${selectedIds.size})` : "Exporter tout"}
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
          <div className="space-y-2">
            {projects.length > 1 && (
              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  checked={selectedIds.size === projects.length}
                  onCheckedChange={toggleAll}
                />
                <span className="text-xs text-muted-foreground">Tout sélectionner</span>
              </div>
            )}
            <div className="grid gap-3">
              {projects.map((p) => {
                const fullProject = allProjects[p.id];
                const status = fullProject ? getProjectStatus(fullProject) : { label: "En cours", color: "bg-blue-500", detail: "" };
                const locked = isLockedByOther(p.id);
                const lockInfo = locks[p.id];
                return (
                  <Card
                    key={p.id}
                    className={`cursor-pointer transition-all ${locked ? "opacity-70 border-destructive/30" : "hover:ring-2 hover:ring-primary/50"}`}
                    onClick={() => handleOpenProject(p.id)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Checkbox
                            checked={selectedIds.has(p.id)}
                            onCheckedChange={() => toggleSelection(p.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <CardTitle className="text-base">{p.name}</CardTitle>
                          <Badge className={`${status.color} text-white`}>
                            {status.label}
                          </Badge>
                          {locked && (
                            <Badge variant="outline" className="border-destructive text-destructive gap-1">
                              <Lock className="h-3 w-3" />
                              Verrouillé par {lockInfo?.lockedBy ?? "?"}
                            </Badge>
                          )}
                          {status.detail && (
                            <span className="text-xs text-muted-foreground">{status.detail}</span>
                          )}
                          {status.attributaire && (
                            <Badge variant="outline" className="border-green-600 text-green-700 dark:text-green-400">
                              Attributaire : {status.attributaire}
                            </Badge>
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
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default ProjectsPage;
