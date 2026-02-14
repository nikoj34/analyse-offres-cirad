import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Lock, Unlock, ArrowRight, AlertTriangle } from "lucide-react";
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

const VersionsPage = () => {
  const { project, createVersion, switchVersion, unfreezeVersion } = useProjectStore();
  const { versions, currentVersionId } = project;

  const nextLabel = `V${versions.length}`;
  const canCreate = versions.length < 3;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cycles de Négociation</h1>
        <p className="text-sm text-muted-foreground">
          Gérez les versions V0 (analyse initiale), V1 et V2 (négociations). Chaque version fige les données précédentes.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {canCreate ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Créer {nextLabel}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Attention — Blocage définitif
                </AlertDialogTitle>
                <AlertDialogDescription>
                  La création de <strong>{nextLabel}</strong> va <strong>figer définitivement</strong> la version
                  actuelle. Les saisies (technique, prix, synthèse) de la version en cours ne pourront plus être
                  modifiées. Les données seront copiées dans la nouvelle version pour permettre une nouvelle analyse
                  des entreprises retenues.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={() => createVersion(nextLabel)}>
                  Confirmer et créer {nextLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
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
          const decisions = version.negotiationDecisions ?? {};
          const retainedCount = Object.values(decisions).filter(
            (d) => d === "retenue" || d === "attributaire"
          ).length;

          return (
            <Card key={version.id} className={isCurrent ? "ring-2 ring-primary" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-lg">{version.label}</CardTitle>
                    {isCurrent && <Badge variant="default">Active</Badge>}
                    {version.frozen && (
                      <Badge variant="secondary">
                        <Lock className="h-3 w-3 mr-1" /> Figée
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {version.frozen && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1">
                            <Unlock className="h-3 w-3" />
                            Défiger
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 text-destructive" />
                              Défiger {version.label} ?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Vous allez pouvoir modifier les saisies de <strong>{version.label}</strong>.
                              Attention : les modifications peuvent affecter la cohérence des versions suivantes.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={() => unfreezeVersion(version.id)}>
                              Confirmer le dégel
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
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
