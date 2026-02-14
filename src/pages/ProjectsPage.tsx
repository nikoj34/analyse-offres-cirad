import { useMultiProjectStore } from "@/store/multiProjectStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FolderOpen, Trash2 } from "lucide-react";
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

const ProjectsPage = () => {
  const { getProjectList, createProject, openProject, deleteProject } = useMultiProjectStore();
  const projects = getProjectList();

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
          <Button onClick={() => createProject()} className="gap-2">
            <Plus className="h-4 w-4" />
            Créer une analyse
          </Button>
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
            {projects.map((p) => (
              <Card
                key={p.id}
                className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                onClick={() => openProject(p.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{p.name}</CardTitle>
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
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default ProjectsPage;
