import { useProjectStore } from "@/store/projectStore";
import { useAnalysisContext } from "@/hooks/useAnalysisContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  Plus,
  Trash2,
  MessageSquare,
  Inbox,
  ChevronDown,
  ChevronRight,
  Lock,
  Unlock,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CompanyQuestionnaire } from "@/types/project";

const QuestionnairePage = () => {
  const {
    project,
    addQuestion,
    updateQuestion,
    removeQuestion,
    setReceptionMode,
    setQuestionResponse,
    setQuestionnaireDealine,
  } = useProjectStore();

  const { version, negoRound, activeCompanies } = useAnalysisContext();
  const [openCompanies, setOpenCompanies] = useState<Record<number, boolean>>({});

  const questionnaire = version?.questionnaire;

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

  const toggleCompany = (companyId: number) => {
    setOpenCompanies((prev) => ({ ...prev, [companyId]: !prev[companyId] }));
  };

  const getCompanyName = (companyId: number) => {
    const company = project.lots[project.currentLotIndex].companies.find((c) => c.id === companyId);
    return company ? `${company.id}. ${company.name}` : `Entreprise ${companyId}`;
  };

  const totalQuestions = questionnaire.questionnaires.reduce((sum, q) => sum + q.questions.length, 0);
  const answeredQuestions = questionnaire.questionnaires.reduce(
    (sum, q) => sum + q.questions.filter((question) => question.response.trim() !== "").length,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Questionnaire — Négociation {negoRound}</h1>
        <p className="text-sm text-muted-foreground">
          Rédigez vos questions par entreprise, puis passez en mode réception pour saisir les réponses.
        </p>
      </div>

      {/* Header: date limite */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Paramètres du questionnaire
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <Label htmlFor="deadline" className="text-sm font-medium whitespace-nowrap">
              Date limite de réponse :
            </Label>
            <Input
              id="deadline"
              type="date"
              className="w-44"
              value={questionnaire.deadlineDate}
              onChange={(e) => setQuestionnaireDealine(version.id, e.target.value)}
            />
          </div>
          {totalQuestions > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <MessageSquare className="h-3 w-3" />
                {totalQuestions} question{totalQuestions > 1 ? "s" : ""}
              </Badge>
              {answeredQuestions > 0 && (
                <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800">
                  <Inbox className="h-3 w-3" />
                  {answeredQuestions} réponse{answeredQuestions > 1 ? "s" : ""} reçue{answeredQuestions > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Company questionnaires */}
      <div className="space-y-4">
        {questionnaire.questionnaires.map((cq: CompanyQuestionnaire) => {
          const isOpen = openCompanies[cq.companyId] !== false; // open by default
          const isReception = cq.receptionMode;
          const answeredCount = cq.questions.filter((q) => q.response.trim() !== "").length;

          return (
            <Card key={cq.companyId} className={cn("border", isReception ? "border-blue-200" : "border-border")}>
              <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleCompany(cq.companyId)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <CardTitle className="text-base">{getCompanyName(cq.companyId)}</CardTitle>
                    <Badge variant={isReception ? "secondary" : "outline"} className={cn("text-xs", isReception && "bg-blue-100 text-blue-800")}>
                      {isReception ? (
                        <><Inbox className="h-3 w-3 mr-1" />Mode réception</>
                      ) : (
                        <><MessageSquare className="h-3 w-3 mr-1" />Mode saisie</>
                      )}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {cq.questions.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {cq.questions.length} question{cq.questions.length > 1 ? "s" : ""}
                        {isReception && answeredCount > 0 && ` — ${answeredCount} réponse${answeredCount > 1 ? "s" : ""}`}
                      </span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn("gap-1.5 text-xs", isReception ? "border-blue-300 text-blue-700 hover:bg-blue-50" : "")}
                      onClick={() => setReceptionMode(version.id, cq.companyId, !isReception)}
                    >
                      {isReception ? (
                        <><Unlock className="h-3 w-3" />Retour saisie</>
                      ) : (
                        <><Lock className="h-3 w-3" />Mode réception</>
                      )}
                    </Button>
                  </div>
                </div>
                {isReception && (
                  <CardDescription className="text-xs text-blue-700 mt-1 ml-6">
                    Les questions sont figées. Saisissez les réponses reçues de l'entreprise.
                  </CardDescription>
                )}
              </CardHeader>

              {isOpen && (
                <CardContent className="space-y-4 pt-0">
                  {cq.questions.length === 0 && !isReception && (
                    <p className="text-sm text-muted-foreground italic py-2">
                      Aucune question. Cliquez sur "Ajouter une question" pour commencer.
                    </p>
                  )}

                  {cq.questions.map((question, idx) => (
                    <div
                      key={question.id}
                      className={cn(
                        "rounded-lg border p-4 space-y-3",
                        isReception ? "bg-muted/20 border-muted" : "bg-background border-border"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-2.5 text-xs font-bold text-muted-foreground w-5 shrink-0">{idx + 1}.</span>
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs text-muted-foreground">Question</Label>
                          <Textarea
                            rows={2}
                            placeholder={`Question ${idx + 1}...`}
                            value={question.text}
                            onChange={(e) => updateQuestion(version.id, cq.companyId, question.id, e.target.value)}
                            disabled={isReception}
                            className={cn(
                              "text-sm resize-none",
                              isReception && "bg-muted/40 text-muted-foreground cursor-not-allowed"
                            )}
                            maxLength={2000}
                          />
                        </div>
                        {!isReception && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0 mt-5 text-muted-foreground hover:text-destructive"
                            onClick={() => removeQuestion(version.id, cq.companyId, question.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>

                      {/* Réponse reçue — visible en mode réception ou si déjà remplie */}
                      {(isReception || question.response.trim() !== "") && (
                        <div className="ml-8 space-y-1">
                          <Label className="text-xs font-medium text-blue-700 flex items-center gap-1">
                            <Inbox className="h-3 w-3" />
                            Réponse reçue
                          </Label>
                          <Textarea
                            rows={2}
                            placeholder="Saisissez la réponse de l'entreprise..."
                            value={question.response}
                            onChange={(e) => setQuestionResponse(version.id, cq.companyId, question.id, e.target.value)}
                            disabled={!isReception}
                            className={cn(
                              "text-sm resize-none border-blue-200 focus-visible:ring-blue-400",
                              !isReception && "bg-muted/40 text-muted-foreground cursor-not-allowed"
                            )}
                            maxLength={3000}
                          />
                        </div>
                      )}
                    </div>
                  ))}

                  {!isReception && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 w-full border-dashed"
                      onClick={() => addQuestion(version.id, cq.companyId)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Ajouter une question
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {questionnaire.questionnaires.length === 0 && (
        <div className="rounded-md border border-muted bg-muted/20 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Aucune entreprise retenue dans ce questionnaire.
          </p>
        </div>
      )}
    </div>
  );
};

export default QuestionnairePage;
