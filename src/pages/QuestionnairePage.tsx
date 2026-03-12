import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MessageSquare, Plus, Trash2, Download, Upload, CheckCircle, LockOpen } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAnalysisContext } from "@/hooks/useAnalysisContext";
import { getCompanyColor, getCompanyBgColor } from "@/lib/companyColors";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

const QuestionnairePage = () => {
  const { round } = useParams<{ round?: string }>();
  const { project, activateQuestionnaire, syncQuestionnaireCompanies, setQuestionnaireDealine, addQuestion, updateQuestion, removeQuestion, setQuestionResponse, setReceptionMode } = useProjectStore();
  const lot = project.lots?.[project.currentLotIndex ?? 0];
  const { activeCompanies } = useAnalysisContext();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [generalComment, setGeneralComment] = useState("");

  // Determine which version holds this round's questionnaire
  // /questions → v0 (initial), /questions/2 → v1 (nego 1)
  const roundNum = round ? parseInt(round) : 1;
  const versionIndex = roundNum - 1;
  const targetVersion = lot?.versions?.[versionIndex];

  if (!targetVersion) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Questions de négociation</h1>
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            Cette phase de négociation n'existe pas encore.
          </p>
        </div>
      </div>
    );
  }

  // Entreprises à afficher : case cochée OU déjà des questions enregistrées pour cette version (conservation après validation)
  const fromCheck = (lot?.companies ?? []).filter((c) => c.hasQuestions === true).map((c) => c.id);
  const fromData = (targetVersion.questionnaire?.questionnaires ?? [])
    .filter((cq) => (cq.questions?.length ?? 0) > 0)
    .map((cq) => cq.companyId);
  const retainedIds = [...new Set([...fromCheck, ...fromData])];

  if (retainedIds.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Questions</h1>
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            Aucune entreprise avec la case « Question(s) à poser » cochée. Cochez-la dans Analyse prix ou Analyse technique pour une ou plusieurs entreprises.
          </p>
        </div>
      </div>
    );
  }

  if (!targetVersion.questionnaire?.activated) {
    activateQuestionnaire(targetVersion.id, retainedIds);
  }

  const questionnaire = targetVersion.questionnaire;
  if (!questionnaire) return null;

  const versionId = targetVersion.id;

  useEffect(() => {
    if (!versionId) return;
    syncQuestionnaireCompanies(versionId, retainedIds);
  }, [versionId, retainedIds, syncQuestionnaireCompanies]);

  const retainedQuestionnaires = questionnaire.questionnaires.filter((cq) =>
    retainedIds.includes(cq.companyId)
  );
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (retainedQuestionnaires.length === 0) {
      if (currentIndex !== 0) setCurrentIndex(0);
      return;
    }
    if (currentIndex > retainedQuestionnaires.length - 1) {
      setCurrentIndex(retainedQuestionnaires.length - 1);
    }
  }, [retainedQuestionnaires.length, currentIndex]);

  const currentCq = retainedQuestionnaires[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < retainedQuestionnaires.length - 1;

  const pageTitle = "Questions";

  const getCompanyName = (companyId: number) => {
    const company = lot.companies.find((c) => c.id === companyId);
    return company ? company.name || `Entreprise ${companyId}` : `Entreprise ${companyId}`;
  };

  const consultationName = project?.info?.name ?? "";
  const lotName = lot?.label ?? "";

  const handleExport = async (companyId: number) => {
    const cq = questionnaire.questionnaires.find(q => q.companyId === companyId);
    if (!cq || cq.questions.length === 0) {
      toast({ title: "Aucune question", description: "Ajoutez des questions avant d'exporter.", variant: "destructive" });
      return;
    }
    const companyName = getCompanyName(companyId);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Questions");
    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 60;
    ws.getColumn(3).width = 60;

    const border: Partial<ExcelJS.Borders> = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };

    // Ligne 1 : Rappel nom consultation / lot et nom de l'entreprise
    const line1 = `Consultation : ${consultationName} — Lot : ${lotName} — Entreprise : ${companyName}`;
    ws.getCell(1, 1).value = line1;
    ws.getCell(1, 1).border = border;
    ws.getCell(1, 1).alignment = { wrapText: true, vertical: "middle" };
    ws.mergeCells(1, 1, 1, 3);
    ws.getRow(1).height = 28;

    // Ligne 2 : en-têtes (Numéro, Question, Réponse attendue)
    ws.getCell(2, 1).value = "Numéro";
    ws.getCell(2, 2).value = "Question";
    ws.getCell(2, 3).value = "Réponse attendue";
    [1, 2, 3].forEach((col) => {
      ws.getCell(2, col).border = border;
      ws.getCell(2, col).font = { bold: true };
      ws.getCell(2, col).alignment = { horizontal: "center", vertical: "middle" };
    });
    ws.getRow(2).height = 22;

    // Lignes 3 et suivantes : question numérotée, colonne 2 = la question, colonne 3 = champ vide à remplir par l'entreprise
    cq.questions.forEach((q, i) => {
      const row = i + 3;
      ws.getCell(row, 1).value = i + 1;
      ws.getCell(row, 1).border = border;
      ws.getCell(row, 1).alignment = { horizontal: "center", vertical: "top" };
      ws.getCell(row, 2).value = q.text;
      ws.getCell(row, 2).border = border;
      ws.getCell(row, 2).alignment = { wrapText: true, vertical: "top" };
      ws.getCell(row, 3).value = "";
      ws.getCell(row, 3).border = border;
      ws.getCell(row, 3).alignment = { wrapText: true, vertical: "top" };
      ws.getRow(row).height = 60;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const safeName = companyName.replace(/[^a-zA-Z0-9À-ÿ_\- ]/g, "_");
    saveAs(new Blob([buffer]), `Questions_${safeName}.xlsx`);
    toast({ title: "Export réussi", description: `Questions exportées pour ${companyName}.` });
  };

  const handleImport = async (companyId: number, file: File) => {
    try {
      const cq = questionnaire.questionnaires.find((q) => q.companyId === companyId);
      if (!cq || cq.questions.length === 0) return;

      const wb = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await wb.xlsx.load(buffer);
      const ws = wb.getWorksheet(1);
      if (!ws) {
        toast({ title: "Erreur", description: "Impossible de lire le fichier Excel.", variant: "destructive" });
        return;
      }

      let imported = 0;
      ws.eachRow((row, rowNumber) => {
        if (rowNumber <= 2) return; // ligne 1 = consultation/lot/entreprise, ligne 2 = en-têtes (Numéro, Question, Réponse attendue)
        const response = (row.getCell(3).text || "").trim();
        const qIndex = rowNumber - 3;
        if (qIndex >= 0 && qIndex < cq.questions.length && response) {
          setQuestionResponse(versionId, companyId, cq.questions[qIndex].id, response);
          imported++;
        }
      });

      toast({
        title: "Import réussi",
        description: `${imported} réponse${imported !== 1 ? "s" : ""} importée${imported !== 1 ? "s" : ""}.`,
      });
    } catch (err) {
      console.error(err);
      toast({ title: "Erreur d'import", description: "Le fichier n'a pas pu être lu.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
        <p className="text-sm text-muted-foreground">
          Rédigez les questions pour chaque entreprise (case « Question(s) à poser » cochée). Exportez en Excel pour transmission aux entreprises.
        </p>
      </div>

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
              onChange={(e) => setQuestionnaireDealine(versionId, e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {retainedQuestionnaires.length > 1 && (
          <div className="flex items-center rounded-lg border border-border bg-muted/30 px-4 py-2">
            <span className="text-sm font-medium text-muted-foreground">
              Entreprise {currentIndex + 1} / {retainedQuestionnaires.length}
            </span>
          </div>
        )}

        {currentCq && (() => {
          const companyIndex = Math.max(
            0,
            activeCompanies.findIndex((c) => c.id === currentCq.companyId)
          );
          const isLocked = currentCq.receptionMode === true;
          return (
            <Card
              key={currentCq.companyId}
              style={{
                borderLeft: `4px solid ${getCompanyColor(companyIndex)}`,
                backgroundColor: getCompanyBgColor(companyIndex),
              }}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  {currentCq.companyId}. {getCompanyName(currentCq.companyId)}
                  <Badge variant="secondary" className="text-xs">
                    {currentCq.questions.length} question
                    {currentCq.questions.length !== 1 ? "s" : ""}
                  </Badge>
                  {isLocked && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      Saisie verrouillée
                    </Badge>
                  )}
                {currentCq.questions.length > 0 && !isLocked && (
                  <div className="flex gap-2 ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => handleExport(currentCq.companyId)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export question(s)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Import réponses
                    </Button>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleImport(currentCq.companyId, file);
                          e.target.value = "";
                        }
                      }}
                    />
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => {
                        setReceptionMode(versionId, currentCq.companyId, true);
                        toast({
                          title: "Saisie validée",
                          description: `Les réponses de l'entreprise ${getCompanyName(currentCq.companyId)} sont validées.`,
                        });
                      }}
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Valider la saisie ou import des réponses de l'entreprise {getCompanyName(currentCq.companyId)}
                    </Button>
                  </div>
                )}
                  {isLocked && (
                    <div className="flex gap-2 ml-auto">
                      {currentCq.questions.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => handleExport(currentCq.companyId)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Export question(s)
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => {
                          setReceptionMode(versionId, currentCq.companyId, false);
                          toast({ title: "Déblocage", description: "Les questions et réponses sont à nouveau modifiables pour cette entreprise." });
                        }}
                      >
                        <LockOpen className="h-3.5 w-3.5" />
                        Débloquer les questions/réponses
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className={`space-y-3 ${isLocked ? "opacity-90" : ""}`}>
                {currentCq.questions.length === 0 && !isLocked && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => addQuestion(versionId, currentCq.companyId)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Question 1
                  </Button>
                )}
                {currentCq.questions.map((q, qIdx) => (
                  <div
                    key={q.id}
                    className={`space-y-1.5 border-b border-border pb-3 last:border-0 ${isLocked ? "bg-muted/30 rounded-md px-2 py-2" : ""}`}
                  >
                    <div className="flex gap-2 items-start">
                      <span className="text-sm font-semibold text-muted-foreground mt-2 w-8 shrink-0">
                        {qIdx + 1}.
                      </span>
                      <Textarea
                        className={`flex-1 text-sm resize-y min-h-[60px] ${isLocked ? "bg-muted cursor-not-allowed" : "bg-muted/50"}`}
                        rows={2}
                        placeholder={`Question ${qIdx + 1}…`}
                        value={q.text}
                        readOnly={isLocked}
                        onChange={(e) =>
                          !isLocked &&
                          updateQuestion(
                            versionId,
                            currentCq.companyId,
                            q.id,
                            e.target.value
                          )
                        }
                      />
                      {!isLocked && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-destructive hover:text-destructive mt-1"
                          onClick={() =>
                            removeQuestion(
                              versionId,
                              currentCq.companyId,
                              q.id
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="ml-10">
                      <label className="text-xs text-muted-foreground font-medium">
                        Réponse :
                      </label>
                      <Textarea
                        className={`text-sm mt-1 min-h-[40px] ${isLocked ? "bg-muted cursor-not-allowed" : "bg-muted/50"}`}
                        rows={2}
                        value={q.response}
                        placeholder="Saisie manuelle ou après import Excel…"
                        readOnly={isLocked}
                        onChange={(e) =>
                          !isLocked &&
                          setQuestionResponse(
                            versionId,
                            currentCq.companyId,
                            q.id,
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
                {currentCq.questions.length > 0 && !isLocked && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() =>
                      addQuestion(versionId, currentCq.companyId)
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter une question
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })()}

        <Card className="mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Commentaire général</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              className="min-h-[80px] resize-y"
              placeholder="Commentaire optionnel…"
              value={generalComment}
              onChange={(e) => setGeneralComment(e.target.value)}
            />
          </CardContent>
        </Card>

        {retainedQuestionnaires.length > 1 && (
          <div className="mt-6 flex items-center justify-end rounded-lg border border-border bg-muted/30 px-4 py-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasPrev}
                onClick={() =>
                  setCurrentIndex((idx) => Math.max(0, idx - 1))
                }
              >
                Entreprise précédente
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasNext}
                onClick={() =>
                  setCurrentIndex((idx) =>
                    Math.min(retainedQuestionnaires.length - 1, idx + 1)
                  )
                }
              >
                Entreprise suivante
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default QuestionnairePage;
