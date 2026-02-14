import { useState } from "react";
import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Lock, Unlock, ArrowRight, AlertTriangle, CheckCircle, ShieldCheck } from "lucide-react";
import { getVersionDisplayLabel } from "@/types/project";
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
  const {
    project,
    createVersion,
    switchVersion,
    unfreezeVersion,
    validateVersion,
    unvalidateVersion,
    hasAttributaire,
  } = useProjectStore();
  const { versions, currentVersionId } = project;
  const [negoDate, setNegoDate] = useState(new Date().toISOString().split("T")[0]);

  const nextIndex = versions.length;
  const nextLabel = `V${nextIndex}`;
  const nextDisplayLabel = getVersionDisplayLabel(nextLabel);
  const canCreate = versions.length < 3;

  // Current version check
  const currentVersion = versions.find((v) => v.id === currentVersionId);
  const currentHasAttributaire = currentVersion ? hasAttributaire(currentVersion.id) : false;
  const currentIsValidated = currentVersion?.validated ?? false;
  // Block nego if current version has attributaire OR is validated with attributaire
  const blockNego = currentHasAttributaire || (currentIsValidated && currentHasAttributaire);
  // Can only create nego if current version is validated (with retenue pour nego, not attributaire)
  const canCreateNego = canCreate && currentIsValidated && !currentHasAttributaire;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cycles de Négociation</h1>
        <p className="text-sm text-muted-foreground">
          Gérez les phases : Analyse initiale, puis Négociation 1 et 2. Chaque phase fige les données précédentes.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {canCreateNego ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Créer {nextDisplayLabel}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Attention — Blocage définitif
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>
                      La création de <strong>{nextDisplayLabel}</strong> va <strong>figer définitivement</strong> la
                      version actuelle. Les saisies (technique, prix, synthèse) de la version en cours ne pourront plus
                      être modifiées. Seules les entreprises retenues seront reprises avec leurs données.
                    </p>
                    <div>
                      <Label htmlFor="nego-date" className="text-sm font-medium">
                        Date de l'analyse (obligatoire)
                      </Label>
                      <Input
                        id="nego-date"
                        type="date"
                        value={negoDate}
                        onChange={(e) => setNegoDate(e.target.value)}
                        className="mt-1 w-48"
                      />
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => createVersion(nextLabel, negoDate)}
                  disabled={!negoDate}
                >
                  Confirmer et créer {nextDisplayLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : currentHasAttributaire ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-green-600" />
            <span>
              Une entreprise est attributaire. Impossible de créer une négociation.
            </span>
          </div>
        ) : !currentIsValidated && canCreate ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            <span>Validez l'analyse en cours dans la Synthèse pour pouvoir créer une négociation.</span>
          </div>
        ) : !canCreate ? (
          <span className="text-xs text-muted-foreground">
            Maximum 3 phases (Analyse initiale, Négo 1, Négo 2)
          </span>
        ) : null}
      </div>

      <div className="grid gap-4">
        {versions.map((version, idx) => {
          const isCurrent = version.id === currentVersionId;
          const notesCount = version.technicalNotes.filter((n) => n.notation !== null).length;
          const pricesCount = version.priceEntries.filter((e) => (e.dpgf1 ?? 0) > 0 || (e.dpgf2 ?? 0) > 0).length;
          const decisions = version.negotiationDecisions ?? {};
          const retainedCount = Object.values(decisions).filter(
            (d) => d === "retenue" || d === "attributaire"
          ).length;
          const versionHasAttributaire = hasAttributaire(version.id);
          const displayLabel = getVersionDisplayLabel(version.label);

          // A version should be shown as frozen if it's not the current one and a later version exists
          const isEffectivelyFrozen = version.frozen || version.validated || (!isCurrent && idx < versions.length - 1);

          return (
            <Card key={version.id} className={isCurrent ? "ring-2 ring-primary" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-wrap">
                    <CardTitle className="text-lg">{displayLabel}</CardTitle>
                    {isCurrent && <Badge variant="default">Active</Badge>}
                    {version.validated && (
                      <Badge variant="default" className="bg-green-600">
                        <CheckCircle className="h-3 w-3 mr-1" /> Validée
                        {version.validatedAt && (
                          <span className="ml-1 font-normal text-xs">
                            le {new Date(version.validatedAt).toLocaleDateString("fr-FR")}
                          </span>
                        )}
                      </Badge>
                    )}
                    {isEffectivelyFrozen && !version.validated && (
                      <Badge variant="secondary">
                        <Lock className="h-3 w-3 mr-1" /> Figée
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Validate button */}
                    {isCurrent && versionHasAttributaire && !version.validated && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="default" size="sm" className="gap-1 bg-green-600 hover:bg-green-700">
                            <CheckCircle className="h-3 w-3" />
                            Valider l'analyse
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <ShieldCheck className="h-5 w-5 text-green-600" />
                              Valider l'analyse ?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Une entreprise est <strong>attributaire</strong>. Valider l'analyse va figer
                              définitivement cette phase.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={() => validateVersion(version.id)}>
                              Confirmer la validation
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    {/* Unvalidate */}
                    {version.validated && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1">
                            <Unlock className="h-3 w-3" />
                            Débloquer
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 text-destructive" />
                              Débloquer {displayLabel} ?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              L'analyse sera déverrouillée. Vous pourrez modifier les données.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={() => unvalidateVersion(version.id)}>
                              Confirmer le déblocage
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    {/* Unfreeze (for frozen but not validated, not current) */}
                    {version.frozen && !version.validated && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1">
                            <Unlock className="h-3 w-3" />
                            Débloquer
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 text-destructive" />
                              Débloquer {displayLabel} ?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Vous allez pouvoir modifier les saisies de <strong>{displayLabel}</strong>.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={() => unfreezeVersion(version.id)}>
                              Confirmer le déblocage
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
                  Date d'analyse : {version.analysisDate || "Non renseignée"} — Créée le{" "}
                  {new Date(version.createdAt).toLocaleDateString("fr-FR")}
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
                    <span className="text-muted-foreground">Retenues : </span>
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
