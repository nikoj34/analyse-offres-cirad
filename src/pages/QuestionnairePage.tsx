import { useProjectStore } from "@/store/projectStore";
import { useAnalysisContext } from "@/hooks/useAnalysisContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MessageSquare } from "lucide-react";

const QuestionnairePage = () => {
  const { project, setQuestionnaireDealine, updateQuestion } = useProjectStore();
  const { version, negoRound } = useAnalysisContext();

  if (!version || !negoRound) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Questionnaire de négociation</h1>
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Cette page n'est accessible que depuis une phase de négociation.</p>
        </div>
      </div>
    );
  }

  const questionnaire = version.questionnaire;

  if (!questionnaire?.activated) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Questionnaire — Négociation {negoRound}</h1>
        <div className="rounded-md border border-muted bg-muted/30 p-6 text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Le questionnaire n'a pas encore été activé. Rendez-vous sur la page{" "}
            <strong>Synthèse</strong> de la phase précédente et cliquez sur{" "}
            <strong>"Préparer le questionnaire de négociation"</strong>.
          </p>
        </div>
      </div>
    );
  }

  const lot = project.lots[project.currentLotIndex];
  const getCompanyName = (companyId: number) => {
    const company = lot.companies.find((c) => c.id === companyId);
    return company ? `${company.id}. ${company.name}` : `Entreprise ${companyId}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Questionnaire — Négociation {negoRound}</h1>
        <p className="text-sm text-muted-foreground">
          Rédigez les questions techniques et financières pour chaque entreprise retenue.
        </p>
      </div>

      {/* Date limite */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <Label htmlFor="deadline" className="text-sm font-medium whitespace-nowrap">
              Date limite de réponse attendue :
            </Label>
            <Input
              id="deadline"
              type="date"
              className="w-44"
              value={questionnaire.deadlineDate}
              onChange={(e) => setQuestionnaireDealine(version.id, e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Questions par entreprise */}
      <div className="space-y-6">
        {questionnaire.questionnaires.map((cq) => {
          const companyQuestion = cq.questions[0] ?? { id: "default", text: "", response: "" };
          // We use a single textarea per company (up to 10 000 chars)
          return (
            <Card key={cq.companyId}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  {getCompanyName(cq.companyId)}
                  {cq.questions[0]?.text?.trim() && (
                    <Badge variant="secondary" className="text-xs">
                      {cq.questions[0].text.length} / 10 000 car.
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Questions techniques et financières (numérotez-les librement)
                  </Label>
                  <Textarea
                    rows={8}
                    maxLength={10000}
                    placeholder={"1. Question technique...\n2. Question financière...\n3. ..."}
                    value={cq.questions[0]?.text ?? ""}
                    onChange={(e) => {
                      if (cq.questions.length === 0) {
                        // Initialiser une première question si vide
                        updateQuestion(version.id, cq.companyId, "default", e.target.value);
                      } else {
                        updateQuestion(version.id, cq.companyId, cq.questions[0].id, e.target.value);
                      }
                    }}
                    className="text-sm resize-y min-h-[160px]"
                  />
                  <p className="text-right text-xs text-muted-foreground">
                    {(cq.questions[0]?.text?.length ?? 0).toLocaleString("fr-FR")} / 10 000
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {questionnaire.questionnaires.length === 0 && (
        <div className="rounded-md border border-muted bg-muted/20 p-6 text-center">
          <p className="text-sm text-muted-foreground">Aucune entreprise retenue dans ce questionnaire.</p>
        </div>
      )}
    </div>
  );
};

export default QuestionnairePage;
