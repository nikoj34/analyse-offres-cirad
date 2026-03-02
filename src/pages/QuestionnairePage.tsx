import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MessageSquare, Plus, Trash2, Download, Upload, Unlock, Euro } from "lucide-react";
import { useRef, useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAnalysisContext } from "@/hooks/useAnalysisContext";
import { getCompanyColor, getCompanyBgColor } from "@/lib/companyColors";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import type { LotLine } from "@/types/project";

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function getDeviationColor(offer: number, estimation: number, seuil: number): string {
  if (estimation === 0) return "";
  const ratio = (offer - estimation) / Math.abs(estimation);
  const absRatio = Math.abs(ratio);
  const halfSeuil = seuil / 2 / 100;
  const seuilRatio = seuil / 100;
  if (absRatio <= halfSeuil) return "text-green-600 dark:text-green-500";
  if (absRatio <= seuilRatio) return "text-orange-600 dark:text-orange-500";
  return "text-red-600 dark:text-red-400 font-semibold";
}

function getDeviationBg(offer: number, estimation: number, seuil: number): string {
  if (estimation === 0) return "";
  const ratio = (offer - estimation) / Math.abs(estimation);
  const absRatio = Math.abs(ratio);
  const halfSeuil = seuil / 2 / 100;
  const seuilRatio = seuil / 100;
  if (absRatio > seuilRatio) return "bg-red-50 dark:bg-red-950/30";
  if (absRatio <= halfSeuil) return "bg-green-50 dark:bg-green-950/30";
  return "bg-orange-50 dark:bg-orange-950/30";
}

function getAutoLabel(type: string | null, index: number): string {
  if (!type) return "";
  switch (type) {
    case "PSE": return `PSE ${index}`;
    case "VARIANTE": return `Variante ${index}`;
    case "T_OPTIONNELLE": return index === 1 ? "Tranche Optionnelle" : `Tranche Optionnelle ${index - 1}`;
    default: return "";
  }
}

function buildTypeCounters(lotLines: LotLine[]): Record<number, string> {
  const counters: Record<string, number> = {};
  const result: Record<number, string> = {};
  for (const line of lotLines) {
    if (line.type) {
      counters[line.type] = (counters[line.type] ?? 0) + 1;
      result[line.id] = getAutoLabel(line.type, counters[line.type]);
    }
  }
  return result;
}

const QuestionnairePage = () => {
  const { round } = useParams<{ round?: string }>();
  const { project, activateQuestionnaire, syncQuestionnaireCompanies, setQuestionnaireDealine, addQuestion, updateQuestion, removeQuestion, setReceptionMode, setQuestionResponse } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];
  const { activeCompanies } = useAnalysisContext();
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

  const lotLines = lot?.lotLines ?? [];
  const activeLotLines = useMemo(() => lotLines.filter((l) => l.label.trim() !== ""), [lotLines]);
  const hasDualDpgf = lot?.hasDualDpgf ?? false;
  const toleranceSeuil = lot?.toleranceSeuil ?? 20;
  const typeCounters = useMemo(() => buildTypeCounters(lotLines), [lotLines]);

  const getPriceEntry = (companyId: number, lotLineId: number) =>
    targetVersion?.priceEntries?.find((e) => e.companyId === companyId && e.lotLineId === lotLineId);

  const companyPriceTotal = useMemo(() => {
    if (!currentCq || !targetVersion?.priceEntries) return null;
    const companyId = currentCq.companyId;
    let dpgf1 = 0, dpgf2 = 0;
    const base = getPriceEntry(companyId, 0);
    dpgf1 += base?.dpgf1 ?? 0;
    dpgf2 += base?.dpgf2 ?? 0;
    for (const line of activeLotLines) {
      const e = getPriceEntry(companyId, line.id);
      dpgf1 += e?.dpgf1 ?? 0;
      dpgf2 += e?.dpgf2 ?? 0;
    }
    return { dpgf1, dpgf2, total: dpgf1 + dpgf2 };
  }, [currentCq, targetVersion?.priceEntries, activeLotLines]);

  const renderDeviationCell = (offer: number | null, estimation: number) => {
    const o = offer ?? 0;
    if (Math.abs(estimation) === 0 || o === 0) return <span className="text-muted-foreground">—</span>;
    const pct = ((o - estimation) / Math.abs(estimation)) * 100;
    const color = getDeviationColor(o, estimation, toleranceSeuil);
    return <span className={`font-medium ${color}`}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</span>;
  };

  const renderPriceReadOnly = (value: number | null, estimation: number | null) => {
    const est = estimation ?? 0;
    const val = value ?? 0;
    const devBg = est !== 0 && val !== 0 ? getDeviationBg(val, est, toleranceSeuil) : "";
    return (
      <div className={`space-y-0.5 rounded px-1 text-right text-sm ${devBg}`}>
        <div className="font-medium">{val !== 0 ? fmt(val) : "—"}</div>
        <div className="text-[10px] text-muted-foreground">
          Est. : {estimation != null && estimation !== 0 ? fmt(estimation) : "—"}
        </div>
      </div>
    );
  };

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
                  <div className="flex gap-2 ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => handleExport(currentCq.companyId, false)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export questions
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs"
                      onClick={() => handleExport(currentCq.companyId, true)}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export Q&R
                    </Button>
                    {!currentCq.receptionMode && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() =>
                            fileInputRefs.current[currentCq.companyId]?.click()
                          }
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Import réponses
                        </Button>
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          className="hidden"
                          ref={(el) => {
                            fileInputRefs.current[currentCq.companyId] = el;
                          }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleImport(currentCq.companyId, file);
                              e.target.value = "";
                            }
                          }}
                        />
                      </>
                    )}
                    {currentCq.receptionMode && (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          Réponses importées — non modifiable
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() =>
                            setReceptionMode(
                              versionId,
                              currentCq.companyId,
                              false
                            )
                          }
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
                {/* Tableau des prix (même type que Nego 1 / Prix) — lecture seule */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Euro className="h-4 w-4" />
                    Tableau des prix
                  </h3>
                  <div className={`grid ${hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]"} gap-2 text-xs font-medium text-muted-foreground px-1`}>
                    <span>Ligne</span>
                    <span className="text-right">DPGF 1 (€ HT)</span>
                    <span className="text-right">Écart</span>
                    {hasDualDpgf && <span className="text-right">DPGF 2 (€ HT)</span>}
                    {hasDualDpgf && <span className="text-right">Écart</span>}
                  </div>
                  {/* Ligne DPGF (Tranche ferme) */}
                  {(() => {
                    const entry = getPriceEntry(currentCq.companyId, 0);
                    const est1 = lot?.estimationDpgf1 ?? 0;
                    const est2 = lot?.estimationDpgf2 ?? 0;
                    return (
                      <div className={`grid ${hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]"} gap-2 items-center rounded-md border-2 border-primary/30 bg-primary/5 p-2`}>
                        <div className="text-sm font-semibold">DPGF (Tranche Ferme)</div>
                        <div>{renderPriceReadOnly(entry?.dpgf1 ?? null, est1 || null)}</div>
                        <div className="text-right text-xs">{renderDeviationCell(entry?.dpgf1 ?? null, est1)}</div>
                        {hasDualDpgf && (
                          <>
                            <div>{renderPriceReadOnly(entry?.dpgf2 ?? null, est2 || null)}</div>
                            <div className="text-right text-xs">{renderDeviationCell(entry?.dpgf2 ?? null, est2)}</div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                  {/* Lignes PSE / TO / variantes */}
                  {activeLotLines.map((line) => {
                    const entry = getPriceEntry(currentCq.companyId, line.id);
                    const showDpgf1 = line.dpgfAssignment === "DPGF_1" || line.dpgfAssignment === "both";
                    const showDpgf2 = hasDualDpgf && (line.dpgfAssignment === "DPGF_2" || line.dpgfAssignment === "both");
                    const autoNum = typeCounters[line.id];
                    return (
                      <div
                        key={line.id}
                        className={`grid ${hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]"} gap-2 items-center rounded-md border border-border p-2`}
                      >
                        <div className="text-sm">
                          <span className="font-medium">{line.label}</span>
                          {autoNum && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              {autoNum}
                            </Badge>
                          )}
                        </div>
                        {showDpgf1 ? (
                          <div>{renderPriceReadOnly(entry?.dpgf1 ?? null, line.estimationDpgf1 ?? null)}</div>
                        ) : (
                          <span className="text-center text-xs text-muted-foreground">—</span>
                        )}
                        <div className="text-right text-xs">
                          {showDpgf1 ? renderDeviationCell(entry?.dpgf1 ?? null, line.estimationDpgf1 ?? 0) : <span className="text-muted-foreground">—</span>}
                        </div>
                        {hasDualDpgf && (
                          showDpgf2 ? (
                            <>
                              <div>{renderPriceReadOnly(entry?.dpgf2 ?? null, line.estimationDpgf2 ?? null)}</div>
                              <div className="text-right text-xs">{renderDeviationCell(entry?.dpgf2 ?? null, line.estimationDpgf2 ?? 0)}</div>
                            </>
                          ) : (
                            <>
                              <span className="text-center text-xs text-muted-foreground">—</span>
                              <span className="text-muted-foreground">—</span>
                            </>
                          )
                        )}
                      </div>
                    );
                  })}
                  {companyPriceTotal && (
                    <div className={`grid ${hasDualDpgf ? "grid-cols-[1fr_160px_80px_160px_80px]" : "grid-cols-[1fr_160px_80px]"} gap-2 rounded-md bg-muted/50 p-2 text-sm font-semibold`}>
                      <span>Total</span>
                      <span className="text-right">{fmt(companyPriceTotal.dpgf1)}</span>
                      <span />
                      {hasDualDpgf && <span className="text-right">{fmt(companyPriceTotal.dpgf2)}</span>}
                      {hasDualDpgf && <span />}
                    </div>
                  )}
                </div>

                {currentCq.questions.map((q, qIdx) => (
                  <div
                    key={q.id}
                    className="space-y-1.5 border-b border-border pb-3 last:border-0"
                  >
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
                        onChange={(e) =>
                          updateQuestion(
                            versionId,
                            currentCq.companyId,
                            q.id,
                            e.target.value
                          )
                        }
                        readOnly={currentCq.receptionMode}
                        disabled={currentCq.receptionMode}
                      />
                      {!currentCq.receptionMode && (
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
                    <div className="ml-8">
                      <label className="text-xs text-blue-600 font-medium">
                        💬 Réponse :
                      </label>
                      <Textarea
                        className="text-sm border-blue-200 min-h-[40px] mt-1 bg-muted/50"
                        rows={2}
                        value={q.response}
                        maxLength={10000}
                        onChange={(e) =>
                          setQuestionResponse(
                            versionId,
                            currentCq.companyId,
                            q.id,
                            e.target.value
                          )
                        }
                        placeholder="Réponse de l'entreprise… (saisir manuellement ou importer via Excel)"
                        readOnly={currentCq.receptionMode}
                        disabled={currentCq.receptionMode}
                      />
                    </div>
                  </div>
                ))}
                {!currentCq.receptionMode && (
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
