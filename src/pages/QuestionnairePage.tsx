import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MessageSquare, Plus, Trash2 } from "lucide-react";

const QuestionnairePage = () => {
  const { project, activateQuestionnaire, setQuestionnaireDealine, addQuestion, updateQuestion, removeQuestion } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];

  // Find the first version (V0) that has retained companies
  const v0 = lot.versions[0];
  const retainedIds = v0
    ? Object.entries(v0.negotiationDecisions ?? {})
        .filter(([, d]) => d === "retenue")
        .map(([id]) => Number(id))
    : [];

  if (retainedIds.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Questions de négociation</h1>
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            Aucune entreprise n'est retenue pour la négociation. Rendez-vous dans la Synthèse pour désigner des entreprises.
          </p>
        </div>
      </div>
    );
  }

  // Auto-activate questionnaire if not done
  if (!v0.questionnaire?.activated) {
    activateQuestionnaire(v0.id, retainedIds);
  }

  const questionnaire = v0.questionnaire;
  if (!questionnaire) return null;

  const getCompanyName = (companyId: number) => {
    const company = lot.companies.find((c) => c.id === companyId);
    return company ? `${company.id}. ${company.name}` : `Entreprise ${companyId}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Questions de négociation</h1>
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
              onChange={(e) => setQuestionnaireDealine(v0.id, e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Questions par entreprise */}
      <div className="space-y-6">
        {questionnaire.questionnaires
          .filter((cq) => retainedIds.includes(cq.companyId))
          .map((cq) => (
            <Card key={cq.companyId}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  {getCompanyName(cq.companyId)}
                  <Badge variant="secondary" className="text-xs">
                    {cq.questions.length} question{cq.questions.length !== 1 ? "s" : ""}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {cq.questions.map((q, qIdx) => (
                  <div key={q.id} className="flex gap-2 items-start">
                    <span className="text-sm font-semibold text-muted-foreground mt-2 w-8 shrink-0">
                      {qIdx + 1}.
                    </span>
                    <Textarea
                      className="flex-1 text-sm resize-y min-h-[60px]"
                      rows={2}
                      placeholder={`Question ${qIdx + 1}…`}
                      value={q.text}
                      onChange={(e) => updateQuestion(v0.id, cq.companyId, q.id, e.target.value)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive mt-1"
                      onClick={() => removeQuestion(v0.id, cq.companyId, q.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => addQuestion(v0.id, cq.companyId)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter une question
                </Button>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
};

export default QuestionnairePage;
