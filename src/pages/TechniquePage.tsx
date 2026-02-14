import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NOTATION_LABELS, NOTATION_VALUES, NotationLevel, WeightingCriterion } from "@/types/project";
import { useMemo } from "react";

const NOTATION_OPTIONS: NotationLevel[] = ["tres_bien", "bien", "moyen", "passable", "insuffisant"];

function cleanText(text: string): string {
  // Trim spaces, fix common misspellings
  let cleaned = text.trim().replace(/\s+/g, " ");
  const corrections: Record<string, string> = {
    "insufisant": "insuffisant",
    "insufissant": "insuffisant",
    "insuffisent": "insuffisant",
    "passabe": "passable",
    "moye": "moyen",
    "tres bien": "très bien",
  };
  const lower = cleaned.toLowerCase();
  for (const [wrong, correct] of Object.entries(corrections)) {
    if (lower.includes(wrong)) {
      cleaned = cleaned.replace(new RegExp(wrong, "gi"), correct);
    }
  }
  return cleaned;
}

const TechniquePage = () => {
  const { project, setTechnicalNote, getTechnicalNote } = useProjectStore();
  const { companies, weightingCriteria, versions, currentVersionId } = project;

  const activeCompanies = companies.filter((c) => c.name.trim() !== "");
  const technicalCriteria = weightingCriteria.filter((c) => c.id !== "prix");

  const currentVersion = versions.find((v) => v.id === currentVersionId);

  // Compute weighted scores per company
  const scores = useMemo(() => {
    if (!currentVersion) return {};
    const result: Record<number, { total: number; byCriterion: Record<string, number> }> = {};

    for (const company of activeCompanies) {
      const byCriterion: Record<string, number> = {};
      let total = 0;

      for (const criterion of technicalCriteria) {
        if (criterion.subCriteria.length > 0) {
          let criterionScore = 0;
          const subTotal = criterion.subCriteria.reduce((s, sc) => s + sc.weight, 0);
          for (const sub of criterion.subCriteria) {
            const note = currentVersion.technicalNotes.find(
              (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
            );
            if (note?.notation) {
              const subWeight = subTotal > 0 ? sub.weight / subTotal : 0;
              criterionScore += NOTATION_VALUES[note.notation] * subWeight;
            }
          }
          const weightedScore = (criterionScore / 5) * criterion.weight;
          byCriterion[criterion.id] = weightedScore;
          total += weightedScore;
        } else {
          const note = currentVersion.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
          );
          if (note?.notation) {
            const weightedScore = (NOTATION_VALUES[note.notation] / 5) * criterion.weight;
            byCriterion[criterion.id] = weightedScore;
            total += weightedScore;
          } else {
            byCriterion[criterion.id] = 0;
          }
        }
      }

      result[company.id] = { total, byCriterion };
    }
    return result;
  }, [activeCompanies, technicalCriteria, currentVersion]);

  if (activeCompanies.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analyse Technique</h1>
          <p className="text-sm text-muted-foreground">
            Veuillez d'abord saisir des entreprises dans la Page de Garde.
          </p>
        </div>
      </div>
    );
  }

  const maxTechnicalWeight = technicalCriteria.reduce((s, c) => s + c.weight, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analyse Technique</h1>
        <p className="text-sm text-muted-foreground">
          Notation par critère pour chaque entreprise. Note technique pondérée sur {maxTechnicalWeight} pts.
        </p>
      </div>

      {activeCompanies.map((company) => (
        <Card key={company.id} className={company.status === "ecartee" ? "opacity-60" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {company.id}. {company.name}
              </CardTitle>
              {company.status === "ecartee" ? (
                <Badge variant="destructive">
                  Écartée{company.exclusionReason ? ` — ${company.exclusionReason}` : ""}
                </Badge>
              ) : (
                <Badge variant={scores[company.id]?.total > 0 ? "default" : "secondary"}>
                  {(scores[company.id]?.total ?? 0).toFixed(1)} / {maxTechnicalWeight}
                </Badge>
              )}
            </div>
          </CardHeader>
          {company.status !== "ecartee" && (
            <CardContent className="space-y-4">
              {technicalCriteria.map((criterion) => (
                <CriterionBlock
                  key={criterion.id}
                  criterion={criterion}
                  companyId={company.id}
                  score={scores[company.id]?.byCriterion[criterion.id] ?? 0}
                />
              ))}
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
};

function CriterionBlock({
  criterion,
  companyId,
  score,
}: {
  criterion: WeightingCriterion;
  companyId: number;
  score: number;
}) {
  const { setTechnicalNote, getTechnicalNote } = useProjectStore();

  if (criterion.subCriteria.length > 0) {
    return (
      <div className="rounded-md border border-border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">
            {criterion.label} ({criterion.weight}%)
          </h4>
          <span className="text-xs text-muted-foreground">{score.toFixed(1)} pts</span>
        </div>
        {criterion.subCriteria.map((sub) => {
          const note = getTechnicalNote(companyId, criterion.id, sub.id);
          return (
            <div key={sub.id} className="ml-4 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {sub.label} ({sub.weight}%)
              </label>
              <div className="flex gap-2">
                <Select
                  value={note?.notation ?? "none"}
                  onValueChange={(v) =>
                    setTechnicalNote(
                      companyId,
                      criterion.id,
                      sub.id,
                      v === "none" ? null : (v as NotationLevel),
                      note?.comment ?? ""
                    )
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Notation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {NOTATION_OPTIONS.map((n) => (
                      <SelectItem key={n} value={n}>
                        {NOTATION_LABELS[n]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  className="flex-1 min-h-[60px] text-sm"
                  rows={3}
                  value={note?.comment ?? ""}
                  onChange={(e) =>
                    setTechnicalNote(
                      companyId,
                      criterion.id,
                      sub.id,
                      note?.notation ?? null,
                      cleanText(e.target.value)
                    )
                  }
                  placeholder="Commentaire / justification"
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const note = getTechnicalNote(companyId, criterion.id);
  return (
    <div className="rounded-md border border-border p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">
          {criterion.label} ({criterion.weight}%)
        </h4>
        <span className="text-xs text-muted-foreground">{score.toFixed(1)} pts</span>
      </div>
      <div className="flex gap-2">
        <Select
          value={note?.notation ?? "none"}
          onValueChange={(v) =>
            setTechnicalNote(
              companyId,
              criterion.id,
              undefined,
              v === "none" ? null : (v as NotationLevel),
              note?.comment ?? ""
            )
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Notation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {NOTATION_OPTIONS.map((n) => (
              <SelectItem key={n} value={n}>
                {NOTATION_LABELS[n]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          className="flex-1 min-h-[60px] text-sm"
          rows={3}
          value={note?.comment ?? ""}
          onChange={(e) =>
            setTechnicalNote(
              companyId,
              criterion.id,
              undefined,
              note?.notation ?? null,
              cleanText(e.target.value)
            )
          }
          placeholder="Commentaire / justification"
        />
      </div>
    </div>
  );
}

export default TechniquePage;
