import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Lock, ArrowRight } from "lucide-react";

const VersionsPage = () => {
  const { project, createVersion, switchVersion } = useProjectStore();
  const { versions, currentVersionId } = project;

  const nextLabel = `V${versions.length}`;
  const canCreate = versions.length < 3; // V0, V1, V2

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cycles de Négociation</h1>
        <p className="text-sm text-muted-foreground">
          Gérez les versions V0 (analyse initiale), V1 et V2 (négociations). Chaque version fige les données précédentes.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={() => createVersion(nextLabel)}
          disabled={!canCreate}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Créer {nextLabel}
        </Button>
        {!canCreate && (
          <span className="text-xs text-muted-foreground">
            Maximum 3 versions (V0, V1, V2)
          </span>
        )}
      </div>

      <div className="grid gap-4">
        {versions.map((version) => {
          const isCurrent = version.id === currentVersionId;
          const notesCount = version.technicalNotes.filter((n) => n.notation !== null).length;
          const pricesCount = version.priceEntries.filter((e) => (e.dpgf1 ?? 0) > 0 || (e.dpgf2 ?? 0) > 0).length;
          const retainedCount = (version.negotiationRetained ?? []).length;

          return (
            <Card key={version.id} className={isCurrent ? "ring-2 ring-primary" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg">{version.label}</CardTitle>
                    {isCurrent && <Badge variant="default">Active</Badge>}
                    {version.frozen && <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" /> Figée</Badge>}
                  </div>
                  {!isCurrent && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => switchVersion(version.id)}
                      className="gap-1"
                    >
                      <ArrowRight className="h-3 w-3" />
                      Basculer
                    </Button>
                  )}
                </div>
                <CardDescription>
                  Créée le {new Date(version.createdAt).toLocaleDateString("fr-FR")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-muted-foreground">Notes techniques : </span>
                    <span className="font-medium">{notesCount}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Saisies prix : </span>
                    <span className="font-medium">{pricesCount}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Retenues négo : </span>
                    <span className="font-medium">{retainedCount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default VersionsPage;
