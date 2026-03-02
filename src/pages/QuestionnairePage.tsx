import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MessageSquare, Plus, Trash2, Download, Upload, Unlock } from "lucide-react";
import { useRef } from "react";
import { useParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

const QuestionnairePage = () => {
  const { round } = useParams<{ round?: string }>();
  const { project, activateQuestionnaire, setQuestionnaireDealine, addQuestion, updateQuestion, removeQuestion, setReceptionMode, setQuestionResponse } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];
  const { toast } = useToast();
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Determine which version holds this round's questionnaire
  // /questions → v0 (initial), /questions/2 → v1 (nego 1)
  const roundNum = round ? parseInt(round) : 1;
  const versionIndex = roundNum - 1;
  const targetVersion = lot.versions[versionIndex];

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

  const retainedIds = Object.entries(targetVersion.negotiationDecisions ?? {})
    .filter(([, d]) => d === "retenue" || d === "questions_reponses")
    .map(([id]) => Number(id));

  if (retainedIds.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Questions de négociation</h1>
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            Aucune entreprise n'est retenue pour la négociation ou pour questions. Rendez-vous dans la Synthèse pour désigner des entreprises.
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

  // Dynamic title
  const totalVersions = lot.versions.length;
  const pageTitle = totalVersions >= 3
    ? `Questions négo ${roundNum}`
    : "Questions de négociation";

  const getCompanyName = (companyId: number) => {
    const company = lot.companies.find((c) => c.id === companyId);
    return company ? company.name || `Entreprise ${companyId}` : `Entreprise ${companyId}`;
  };

  const handleExport = async (companyId: number, includeResponses: boolean = false) => {
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

    // En-têtes style template : fond gris foncé, texte blanc, bordures noires
    const headerFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF595959" } };
    ["N°", "Question", "Réponse"].forEach((h, i) => {
      const cell = ws.getCell(1, i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      cell.fill = headerFill;
      cell.border = border;
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    ws.getRow(1).height = 22;

    // Lignes contenu : bordures noires, texte enveloppé (style image)
    cq.questions.forEach((q, i) => {
      const row = i + 2;
      ws.getCell(row, 1).value = i + 1;
      ws.getCell(row, 1).border = border;
      ws.getCell(row, 1).alignment = { horizontal: "center", vertical: "top" };
      ws.getCell(row, 2).value = q.text;
      ws.getCell(row, 2).border = border;
      ws.getCell(row, 2).alignment = { wrapText: true, vertical: "top" };
      ws.getCell(row, 3).value = includeResponses ? (q.response || "") : "";
      ws.getCell(row, 3).border = border;
      ws.getCell(row, 3).alignment = { wrapText: true, vertical: "top" };
      ws.getRow(row).height = 60;
    });

    const buffer = await wb.xlsx.writeBuffer();
    const safeName = companyName.replace(/[^a-zA-Z0-9À-ÿ_\- ]/g, "_");
    const prefix = includeResponses ? "QR" : "Questions";
    saveAs(new Blob([buffer]), `${prefix}_${safeName}.xlsx`);
    const desc = includeResponses ? "Questions-Réponses exportées" : "Questions exportées";
    toast({ title: "Export réussi", description: `${desc} pour ${companyName}.` });
  };

  const handleImport = async (companyId: number, file: File) => {
    try {
      const cq = questionnaire.questionnaires.find(q => q.companyId === companyId);
      if (!cq) return;

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
        if (rowNumber === 1) return;
        const response = (row.getCell(3).text || "").trim();
        const qIndex = rowNumber - 2;
        if (qIndex < cq.questions.length && response) {
          setQuestionResponse(versionId, companyId, cq.questions[qIndex].id, response);
          imported++;
        }
      });

      setReceptionMode(versionId, companyId, true);
      toast({ title: "Import réussi", description: `${imported} réponse${imported !== 1 ? "s" : ""} importée${imported !== 1 ? "s" : ""}. Questions et réponses sont désormais figées.` });
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
          Rédigez les questions pour chaque entreprise retenue. Exportez en Excel, faites compléter, puis importez les réponses.
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
        {questionnaire.questionnaires
          .filter((cq) => retainedIds.includes(cq.companyId))
          .map((cq) => (
            <Card key={cq.companyId}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  {cq.companyId}. {getCompanyName(cq.companyId)}
                  <Badge variant="secondary" className="text-xs">
                    {cq.questions.length} question{cq.questions.length !== 1 ? "s" : ""}
                  </Badge>
                  <div className="flex gap-2 ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => handleExport(cq.companyId, false)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export questions
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => handleExport(cq.companyId, true)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export Q&R
                    </Button>
                    {!cq.receptionMode && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => fileInputRefs.current[cq.companyId]?.click()}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Import réponses
                        </Button>
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          className="hidden"
                          ref={(el) => { fileInputRefs.current[cq.companyId] = el; }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleImport(cq.companyId, file);
                              e.target.value = "";
                            }
                          }}
                        />
                      </>
                    )}
                    {cq.receptionMode && (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          Réponses importées — non modifiable
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => setReceptionMode(versionId, cq.companyId, false)}
                        >
                          <Unlock className="h-3.5 w-3.5" />
                          Réouvrir les questions / réponses
                        </Button>
                      </div>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {cq.questions.map((q, qIdx) => (
                  <div key={q.id} className="space-y-1.5 border-b border-border pb-3 last:border-0">
                    <div className="flex gap-2 items-start">
                      <span className="text-sm font-semibold text-muted-foreground mt-2 w-8 shrink-0">
                        {qIdx + 1}.
                      </span>
                      <Textarea
                        className="flex-1 text-sm resize-y min-h-[60px] bg-muted/50"
                        rows={2}
                        placeholder={`Question ${qIdx + 1}…`}
                        value={q.text}
                        maxLength={10000}
                        onChange={(e) => updateQuestion(versionId, cq.companyId, q.id, e.target.value)}
                        readOnly={cq.receptionMode}
                        disabled={cq.receptionMode}
                      />
                      {!cq.receptionMode && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-destructive hover:text-destructive mt-1"
                          onClick={() => removeQuestion(versionId, cq.companyId, q.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="ml-8">
                      <label className="text-xs text-blue-600 font-medium">💬 Réponse :</label>
                      <Textarea
                        className="text-sm border-blue-200 min-h-[40px] mt-1 bg-muted/50"
                        rows={2}
                        value={q.response}
                        maxLength={10000}
                        onChange={(e) => setQuestionResponse(versionId, cq.companyId, q.id, e.target.value)}
                        placeholder="Réponse de l'entreprise… (saisir manuellement ou importer via Excel)"
                        readOnly={cq.receptionMode}
                        disabled={cq.receptionMode}
                      />
                    </div>
                  </div>
                ))}
                {!cq.receptionMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => addQuestion(versionId, cq.companyId)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter une question
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
};

export default QuestionnairePage;
