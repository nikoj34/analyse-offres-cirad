import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Settings, FileJson, Users, Shield, RefreshCw } from "lucide-react";
import { useMultiProjectStore } from "@/store/multiProjectStore";
import { getSessionUser, resetCloudConnection } from "@/lib/storageRepository";
import { getAuthorizedPersons, setAuthorizedPersons } from "@/lib/authorizedPersons";
import { toast } from "sonner";

export default function ConfigurationPage() {
  const { projects: allProjects, locks, refreshLocks } = useMultiProjectStore();
  const [authorizedPersonsText, setAuthorizedPersonsText] = useState("");

  useEffect(() => {
    refreshLocks();
  }, [refreshLocks]);

  useEffect(() => {
    setAuthorizedPersonsText(getAuthorizedPersons().join("\n"));
  }, []);

  const saveAuthorizedPersons = () => {
    const persons = authorizedPersonsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    setAuthorizedPersons(persons);
    toast.success("Liste des personnes autorisées enregistrée.");
  };

  /** Même format que « Exporter tout » dans Analyses : objet id → projet, réimportable via Importer. */
  const handleSnapshotJson = () => {
    try {
      const data: Record<string, typeof allProjects[string]> = {};
      for (const id of Object.keys(allProjects)) {
        if (allProjects[id]) data[id] = allProjects[id];
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cirad-analyses-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      const count = Object.keys(data).length;
      toast.success(count > 0 ? `${count} analyse(s) exportée(s). Réimportez via « Importer » sur Analyses.` : "Aucun projet à exporter.");
    } catch (e) {
      toast.error("Impossible de générer le fichier.");
    }
  };

  const handleResetCloudConnection = async () => {
    try {
      await resetCloudConnection();
      toast.success("Connexion Cloud réinitialisée. Rechargement…");
      window.location.reload();
    } catch (e) {
      toast.error("Impossible de réinitialiser la connexion Cloud.");
    }
  };

  const activeUsers = Object.values(locks ?? {})
    .map((l) => l.lockedBy)
    .filter(Boolean) as string[];
  const uniqueUsers = Array.from(new Set(activeUsers));

  return (
    <div className="mx-auto max-w-[1600px] p-6 lg:p-8 space-y-6">
      <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm font-medium text-green-700 dark:text-green-400 dark:border-green-500/40 dark:bg-green-500/10">
        🟢 Connecté au Cloud CIRAD
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="h-7 w-7" />
          Configuration
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paramètres globaux : sauvegarde, synchronisation, utilisateurs actifs et maintenance.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5" />
            Personnes autorisées
          </CardTitle>
          <CardDescription>
            Liste des personnes autorisées à utiliser l&apos;application. Cette liste alimente le menu « Rédacteur » dans les données de chaque projet. Un nom par ligne.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="authorized-persons">Noms (un par ligne)</Label>
          <Textarea
            id="authorized-persons"
            value={authorizedPersonsText}
            onChange={(e) => setAuthorizedPersonsText(e.target.value)}
            placeholder={"Jean Dupont\nMarie Martin\nPierre Durand"}
            rows={6}
            className="font-mono text-sm"
          />
          <Button onClick={saveAuthorizedPersons} size="sm">
            Enregistrer la liste
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Sauvegarde (archive)
          </CardTitle>
          <CardDescription>
            Exporte tous les projets au même format que « Exporter tout » sur Analyses. Stockez le fichier (ex. Alfresco) puis réimportez-le via le bouton « Importer » sur la page Analyses en cas de besoin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleSnapshotJson} className="w-full gap-2" size="lg">
            <FileJson className="h-4 w-4" />
            Exporter toutes les analyses (JSON)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Session
          </CardTitle>
          <CardDescription>
            Identifiant de l&apos;utilisateur actuel (anonyme ou connecté). La sécurité RLS garantit que vous ne voyez que vos propres projets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-sm break-all rounded-md bg-muted px-3 py-2">
            {getSessionUser() || "—"}
          </p>
        </CardContent>
      </Card>

      <Card className="border-muted/50">
        <CardHeader>
          <CardTitle className="text-base text-muted-foreground font-medium">Auto-Sync</CardTitle>
          <CardDescription>
            Chaque modification dans les formulaires est envoyée vers la base après une courte pause (debounce). Aucune action requise.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-muted/50">
        <CardHeader>
          <CardTitle className="text-base text-muted-foreground font-medium">Anti-Crash local</CardTitle>
          <CardDescription>
            Un brouillon du projet en cours est sauvegardé automatiquement dans le navigateur (localStorage) toutes les 15 minutes. Si vous rechargez la page après un crash, une proposition « Restaurer le brouillon » s'affichera.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5" />
            Utilisateurs actifs
          </CardTitle>
          <CardDescription>
            Utilisateurs ayant actuellement un projet ouvert (verrous).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {uniqueUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun utilisateur avec un projet ouvert.</p>
          ) : (
            <ul className="space-y-2">
              {uniqueUsers.map((userId) => (
                <li key={userId} className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" aria-hidden />
                  <span>{userId}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Maintenance
          </CardTitle>
          <CardDescription>
            En cas de problème de synchronisation ou de session, réinitialiser la connexion au Cloud pour obtenir une nouvelle session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleResetCloudConnection} className="gap-2" size="lg">
            <RefreshCw className="h-4 w-4" />
            Réinitialiser la connexion Cloud
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            La page sera rechargée. Une nouvelle session anonyme sera créée automatiquement.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
