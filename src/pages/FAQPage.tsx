import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpCircle } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function FAQPage() {
  return (
    <div className="mx-auto max-w-[800px] p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <HelpCircle className="h-7 w-7" />
          Foire aux questions
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Réponses aux questions fréquentes sur l&apos;application Analyse d&apos;offres CIRAD.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sauvegarde et import</CardTitle>
          <CardDescription>Export, import et restauration des analyses</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="sauvegarde-archive">
              <AccordionTrigger>À quoi sert la « Sauvegarde (archive) » dans Configuration ?</AccordionTrigger>
              <AccordionContent>
                Elle exporte tous vos projets dans un fichier JSON (même format que « Exporter tout » sur Analyses). Vous pouvez stocker ce fichier sur Alfresco ou ailleurs. En cas de perte de données ou d&apos;effacement de la base, réimportez-le via le bouton « Importer » sur la page Analyses pour restaurer vos analyses.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="importer">
              <AccordionTrigger>Comment réimporter des analyses ?</AccordionTrigger>
              <AccordionContent>
                Allez sur la page <strong>Analyses</strong>, cliquez sur le bouton <strong>Importer</strong>, puis sélectionnez le fichier JSON (celui généré par « Exporter tout » ou par « Sauvegarde (archive) » dans Configuration). Les projets du fichier sont ajoutés à votre liste. Les doublons de nom reçoivent un suffixe « (Importé le …) ».
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="format-import">
              <AccordionTrigger>Quel format de fichier pour l&apos;import ?</AccordionTrigger>
              <AccordionContent>
                Un fichier <strong>JSON</strong> produit par l&apos;application (Exporter tout ou Sauvegarde (archive)). Ne pas utiliser un fichier Excel ou un JSON modifié à la main : la structure doit correspondre à celle exportée par l&apos;app. Taille max recommandée : 10 Mo.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Variantes</CardTitle>
          <CardDescription>Configuration des variantes par lot</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="variante-interdite">
              <AccordionTrigger>Variante interdite, autorisée, exigée : quelle différence ?</AccordionTrigger>
              <AccordionContent>
                <strong>Variante interdite = OUI</strong> : les candidats ne peuvent pas proposer de variante ; si une entreprise en saisit une, l&apos;offre est signalée comme irrégulière. <strong>Variante autorisée = OUI</strong> : les candidats peuvent cocher « Cette entreprise a proposé une variante » et saisir des montants. <strong>Variante exigée = OUI</strong> : la variante est obligatoire pour tous ; le bloc variante et le total variante(s) s&apos;affichent pour chaque entreprise. Une seule des trois options peut être « active » à la fois (exigée prime sur les autres).
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="variante-incoherent">
              <AccordionTrigger>Pourquoi un message « Configuration incohérente » ou « Offre irrégulière » ?</AccordionTrigger>
              <AccordionContent>
                Si <strong>Variante interdite = NON</strong> et que <strong>Variante autorisée</strong> et <strong>Variante exigée</strong> sont aussi à NON, la configuration est incohérente : vous ne pouvez pas quitter la page Configuration du lot tant que vous n&apos;avez pas mis l&apos;une des trois à OUI. « Offre irrégulière » s&apos;affiche sur une entreprise qui a saisi une variante alors que les variantes sont interdites (ou que la variante est exigée mais sans prix saisi).
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Utilisation générale</CardTitle>
          <CardDescription>Projets, lots, synchronisation</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="verrou">
              <AccordionTrigger>Un projet est « verrouillé » : que faire ?</AccordionTrigger>
              <AccordionContent>
                Un projet ouvert par quelqu&apos;un est verrouillé pour les autres. Le verrou se libère à la fermeture du projet ou après une durée d&apos;inactivité (environ 30 min). Si vous devez y accéder et que l&apos;autre utilisateur a quitté, attendez l&apos;expiration du verrou ou demandez-lui de fermer le projet (Retour aux projets).
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="sync">
              <AccordionTrigger>Mes modifications sont-elles sauvegardées automatiquement ?</AccordionTrigger>
              <AccordionContent>
                Oui. Chaque modification dans les formulaires est envoyée au Cloud après une courte pause (quelques secondes). Aucune action de sauvegarde manuelle n&apos;est nécessaire. Un brouillon local est aussi enregistré toutes les 15 minutes dans le navigateur pour limiter les pertes en cas de crash.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="ponderation">
              <AccordionTrigger>La page Prix affiche une alerte « pondérations ≠ 100 % »</AccordionTrigger>
              <AccordionContent>
                Dans Configuration du lot, l&apos;onglet Pondérations doit totaliser exactement 100 %. Vérifiez les poids des critères (Prix, Technique, etc.) et ajustez-les jusqu&apos;à ce que le total soit 100 %. La page Prix reste utilisable mais l&apos;alerte reste affichée tant que ce n&apos;est pas corrigé.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration et maintenance</CardTitle>
          <CardDescription>Session, connexion Cloud, dépannage</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="session">
              <AccordionTrigger>À quoi correspond l&apos;identifiant de session ?</AccordionTrigger>
              <AccordionContent>
                C&apos;est l&apos;utilisateur courant (anonyme ou connecté) utilisé pour la synchronisation Cloud. La sécurité (RLS) fait que vous ne voyez que les projets auxquels vous avez accès. Cet identifiant s&apos;affiche dans Configuration pour information.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="reset-cloud">
              <AccordionTrigger>Quand utiliser « Réinitialiser la connexion Cloud » ?</AccordionTrigger>
              <AccordionContent>
                En cas de problème de synchronisation, de session bloquée ou de message d&apos;erreur lié au Cloud. L&apos;action réinitialise la connexion et recharge la page ; une nouvelle session est créée. Vos projets restent dans la base : vous les reverrez après rechargement.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
