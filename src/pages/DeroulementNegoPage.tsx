import { useParams } from "react-router-dom";
import { useProjectStore } from "@/store/projectStore";
import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { NegotiationPrepQuestion } from "@/pages/PreparationNegoPage";
import { getCompanyColor, getCompanyBgColor } from "@/lib/companyColors";

const DeroulementNegoPage = () => {
  const { vIndex, companyId } = useParams<{ vIndex?: string; companyId?: string }>();
  const { project, updateNegotiationExecution } = useProjectStore();
  const lotIndex = Math.max(0, project?.currentLotIndex ?? 0);
  const lot = project?.lots?.[lotIndex];
  const vIndexNum = vIndex != null ? parseInt(vIndex, 10) : 0;
  const version = Number.isNaN(vIndexNum) ? lot?.versions?.[0] : lot?.versions?.[vIndexNum];
  const companyIdNum = companyId != null ? parseInt(companyId, 10) : NaN;
  const company = lot?.companies?.find((c) => c.id === companyIdNum);

  const preparedQuestions: NegotiationPrepQuestion[] = useMemo(
    () =>
      (version?.negotiationData?.[companyIdNum]?.prep?.questions as NegotiationPrepQuestion[] | undefined) ?? [],
    [version?.negotiationData, companyIdNum]
  );
  const sortedQuestions = useMemo(
    () => [...preparedQuestions].sort((a, b) => a.order - b.order),
    [preparedQuestions]
  );

  const [date, setDate] = useState("");
  const [attendees, setAttendees] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState("");
  const lastHydrationKey = useRef<string | null>(null);
  const hydrationKey = `${version?.id ?? ""}-${companyIdNum}`;

  /** Au montage et à chaque changement version/company : pré-remplir l'état local depuis version.negotiationData[companyId].execution. */
  useEffect(() => {
    if (!Number.isInteger(companyIdNum)) return;
    if (lastHydrationKey.current === hydrationKey) return;
    lastHydrationKey.current = hydrationKey;
    const stored = version?.negotiationData?.[companyIdNum]?.execution as
      | { date: string; attendees: string; answers: Record<string, string>; freeText: string }
      | undefined;
    if (stored) {
      setDate(stored.date ?? "");
      setAttendees(stored.attendees ?? "");
      setAnswers(stored.answers ? { ...stored.answers } : {});
      setFreeText(stored.freeText ?? "");
    } else {
      setDate("");
      setAttendees("");
      setAnswers({});
      setFreeText("");
    }
  }, [hydrationKey, companyIdNum, version?.id, version?.negotiationData]);

  const setAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSave = () => {
    if (!Number.isInteger(companyIdNum)) {
      toast.error("Entreprise invalide.");
      return;
    }
    if (!version) {
      toast.error("Version introuvable.");
      return;
    }
    updateNegotiationExecution(companyIdNum, {
      date,
      attendees,
      answers: { ...answers },
      freeText,
    }, version.id);
    toast.success("Compte-rendu enregistré.");
  };

  const handleExportWord = () => {
    toast.info("Export Word en cours de développement.");
  };

  const companyName = company?.name?.trim() ? company.name : `Entreprise ${companyId ?? "—"}`;

  const importanceLabel: Record<string, string> = {
    faible: "Faible",
    moyen: "Moyen",
    fort: "Fort",
  };

  if (!lot) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Déroulement de la négociation</h1>
        <p className="text-muted-foreground">Aucun lot disponible.</p>
      </div>
    );
  }

  const companyIndexInLot = (lot?.companies ?? []).findIndex((c) => c.id === companyIdNum);
  const companyColor = getCompanyColor(companyIndexInLot >= 0 ? companyIndexInLot : 0);
  const companyBgColor = getCompanyBgColor(companyIndexInLot >= 0 ? companyIndexInLot : 0);

  return (
    <div
      className="rounded-r-lg border-l-4 min-h-0"
      style={{ backgroundColor: companyBgColor, borderColor: companyColor }}
    >
      <div className="p-4 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">
          Déroulement de la négociation — {companyName}
        </h1>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <span className="text-sm font-medium text-muted-foreground">Informations générales</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="exec-date">Date de la réunion</Label>
            <Input
              id="exec-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="max-w-[200px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="exec-attendees">Personnes présentes</Label>
            <Textarea
              id="exec-attendees"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="Noms des participants..."
              className="min-h-[80px]"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {sortedQuestions.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Questions / Réponses</h2>
          {sortedQuestions.map((q, index) => (
            <Card key={q.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Question {index + 1}
                  </span>
                  <Badge variant="secondary" className="capitalize">
                    {importanceLabel[q.importance] ?? q.importance}
                  </Badge>
                </div>
                <p className="text-base font-medium mt-1">{q.text || "—"}</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor={`answer-${q.id}`}>Réponse de l&apos;entreprise</Label>
                  <Textarea
                    id={`answer-${q.id}`}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    placeholder="Saisir la réponse..."
                    className="min-h-[80px]"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Aucune question préparée. Rendez-vous dans la section &quot;Préparation&quot; pour ajouter des questions.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <span className="text-sm font-medium text-muted-foreground">Conclusion</span>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="exec-freetext">Compte-rendu global / Notes libres</Label>
            <Textarea
              id="exec-freetext"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Compte-rendu, points clés, engagements..."
              className="min-h-[160px]"
              rows={6}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={handleSave}>
          Enregistrer le compte-rendu
        </Button>
        <Button type="button" variant="secondary" onClick={handleExportWord}>
          Éditer le compte-rendu Word
        </Button>
      </div>
      </div>
    </div>
  );
};

export default DeroulementNegoPage;
