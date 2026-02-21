import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NOTATION_LABELS, NOTATION_VALUES, NotationLevel, WeightingCriterion, NegotiationVersion } from "@/types/project";
import { useMemo } from "react";
import { useAnalysisContext } from "@/hooks/useAnalysisContext";
import { Lock, AlertTriangle } from "lucide-react";
import { getCompanyColor, getCompanyBgColor } from "@/lib/companyColors";
import { useWeightingValid } from "@/hooks/useWeightingValid";

const NOTATION_OPTIONS: NotationLevel[] = ["tres_bien", "bien", "moyen", "passable", "insuffisant"];

const TechniquePage = () => {
  const { project, setTechnicalNote, getTechnicalNote, setDocumentsToVerify, getDocumentsToVerify } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];
  const { activeCompanies, version, isReadOnly, isNego, negoLabel, negoRound } = useAnalysisContext();
  const { weightingCriteria } = lot;

  // Get previous version for visual diff in nego rounds
  const prevVersion = isNego && negoRound !== null && negoRound > 0
    ? lot.versions[negoRound - 1]
    : null;

  const allTechnicalCriteria = weightingCriteria.filter((c) => c.id !== "prix" && c.weight > 0);
  const valueTechniqueCriteria = allTechnicalCriteria.filter(
    (c) => c.id !== "environnemental" && c.id !== "planning"
  );
  const environnementalCriterion = weightingCriteria.find((c) => c.id === "environnemental" && c.weight > 0);
  const planningCriterion = weightingCriteria.find((c) => c.id === "planning" && c.weight > 0);

  const scores = useMemo(() => {
    if (!version) return {};
    const result: Record<number, { total: number; byCriterion: Record<string, number> }> = {};

    for (const company of activeCompanies) {
      if (company.status === "ecartee") continue;
      const byCriterion: Record<string, number> = {};
      let total = 0;

      for (const criterion of allTechnicalCriteria) {
        if (criterion.subCriteria.length > 0) {
          let criterionScore = 0;
          const subTotal = criterion.subCriteria.reduce((s, sc) => s + sc.weight, 0);
          for (const sub of criterion.subCriteria) {
            const note = version.technicalNotes.find(
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
          const note = version.technicalNotes.find(
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
  }, [activeCompanies, allTechnicalCriteria, version]);

  const { isValid: weightingValid, total: weightingTotal } = useWeightingValid();

  if (!weightingValid) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isNego ? `Analyse Technique — ${negoLabel}` : "Analyse Technique"}
          </h1>
          <div className="mt-4 rounded-md border border-destructive bg-destructive/10 p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive font-medium">
              Le total des pondérations doit être de 100% (Actuel : {weightingTotal}%). 
              Veuillez corriger dans « Données du projet » avant de continuer.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (activeCompanies.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isNego ? `Analyse Technique — ${negoLabel}` : "Analyse Technique"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isNego
              ? "Aucune entreprise retenue pour cette phase de négociation."
              : "Veuillez d'abord saisir des entreprises dans « Données du projet »."}
          </p>
        </div>
      </div>
    );
  }

  const maxTechnicalWeight = allTechnicalCriteria.reduce((s, c) => s + c.weight, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          {isNego ? `Analyse Technique — ${negoLabel}` : "Analyse Technique"}
          {isReadOnly && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" /> Figée
            </Badge>
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          Notation par critère pour chaque entreprise. Note technique pondérée sur {maxTechnicalWeight} pts.
        </p>
      </div>

      {activeCompanies.map((company, companyIndex) => (
        <Card
          key={company.id}
          className={company.status === "ecartee" ? "opacity-60" : ""}
          style={{
            borderLeft: `4px solid ${getCompanyColor(companyIndex)}`,
            backgroundColor: company.status !== "ecartee" ? getCompanyBgColor(companyIndex) : undefined,
          }}
        >
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
            <CardContent className="space-y-6">
              {valueTechniqueCriteria.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-foreground border-b border-border pb-2">Valeur Technique</h3>
                  {valueTechniqueCriteria.map((criterion) => (
                    <CriterionBlock
                      key={criterion.id}
                      criterion={criterion}
                      companyId={company.id}
                      score={scores[company.id]?.byCriterion[criterion.id] ?? 0}
                      disabled={isReadOnly}
                      isNego={isNego}
                      prevVersion={prevVersion}
                    />
                  ))}
                </div>
              )}
              {environnementalCriterion && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-foreground border-b border-border pb-2">Critère Environnemental</h3>
                  <CriterionBlock
                    criterion={environnementalCriterion}
                    companyId={company.id}
                    score={scores[company.id]?.byCriterion[environnementalCriterion.id] ?? 0}
                    disabled={isReadOnly}
                    isNego={isNego}
                    prevVersion={prevVersion}
                  />
                </div>
              )}
              {planningCriterion && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-foreground border-b border-border pb-2">Critère Planning</h3>
                  <CriterionBlock
                    criterion={planningCriterion}
                    companyId={company.id}
                    score={scores[company.id]?.byCriterion[planningCriterion.id] ?? 0}
                    disabled={isReadOnly}
                    isNego={isNego}
                    prevVersion={prevVersion}
                  />
                </div>
              )}

              {/* Documents à vérifier */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-foreground border-b border-border pb-2">Documents à vérifier</h3>
                <Textarea
                  disabled={isReadOnly}
                  className="min-h-[80px] text-sm"
                  rows={4}
                  value={getDocumentsToVerify(company.id)}
                  onChange={(e) => setDocumentsToVerify(company.id, e.target.value)}
                  placeholder="Lister les documents à vérifier pour cette entreprise..."
                  maxLength={3000}
                />
              </div>
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
  disabled,
  isNego,
  prevVersion,
}: {
  criterion: WeightingCriterion;
  companyId: number;
  score: number;
  disabled: boolean;
  isNego: boolean;
  prevVersion?: NegotiationVersion | null;
}) {
  const { setTechnicalNote, getTechnicalNote, setTechnicalNoteResponse } = useProjectStore();

  // Helper to get previous note for diff
  const getPrevNote = (subId?: string) => {
    if (!prevVersion) return undefined;
    return prevVersion.technicalNotes.find(
      (n) => n.companyId === companyId && n.criterionId === criterion.id &&
        (subId ? n.subCriterionId === subId : !n.subCriterionId)
    );
  };

  const renderNotationDiff = (currentNotation: NotationLevel | null | undefined, subId?: string) => {
    if (!prevVersion) return null;
    const prev = getPrevNote(subId);
    const prevNotation = prev?.notation;
    if (!prevNotation || prevNotation === currentNotation) return null;
    const prevValue = NOTATION_VALUES[prevNotation];
    const currValue = currentNotation ? NOTATION_VALUES[currentNotation] : 0;
    if (prevValue === currValue) return null;
    return (
      <span className="ml-2 text-xs">
        <span className="line-through text-destructive">{NOTATION_LABELS[prevNotation]} ({prevValue}/5)</span>
        <span className="mx-1">→</span>
        {currentNotation && (
          <span className="text-green-600 font-medium">{NOTATION_LABELS[currentNotation]} ({currValue}/5)</span>
        )}
      </span>
    );
  };

  const renderFieldDiff = (currentValue: string, prevValue: string, label?: string) => {
    if (!prevVersion) return null;
    if (prevValue === currentValue || (!prevValue && !currentValue)) return null;
    // Deletion: text was removed
    const hasDeleted = prevValue && prevValue !== currentValue;
    // Addition: new text added or changed
    const hasAdded = currentValue && currentValue !== prevValue;
    if (!hasDeleted && !hasAdded) return null;
    return (
      <div className="mt-1 text-xs rounded border border-border bg-muted/30 p-2 space-y-1">
        {label && <span className="font-medium text-muted-foreground">{label}</span>}
        {hasDeleted && (
          <div><span className="line-through text-destructive">{prevValue}</span></div>
        )}
        {hasAdded && (
          <div><span className="text-green-600 font-medium">{currentValue}</span></div>
        )}
      </div>
    );
  };

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
                {renderNotationDiff(note?.notation, sub.id)}
              </label>
              <div className="flex gap-2">
                <Select
                  disabled={disabled}
                  value={note?.notation ?? "none"}
                  onValueChange={(v) =>
                    setTechnicalNote(companyId, criterion.id, sub.id, v === "none" ? null : (v as NotationLevel), note?.comment ?? "")
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Notation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {NOTATION_OPTIONS.map((n) => (
                      <SelectItem key={n} value={n}>{NOTATION_LABELS[n]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex-1 space-y-2">
                  <div>
                    <label className="text-xs text-green-700 font-medium">✅ Points Positifs</label>
                    <Textarea
                      disabled={disabled || isNego}
                      className={`min-h-[60px] text-sm border-green-200 ${isNego ? 'opacity-60' : ''}`}
                      rows={3}
                      value={note?.commentPositif ?? ""}
                      onChange={(e) =>
                        setTechnicalNote(companyId, criterion.id, sub.id, note?.notation ?? null, note?.comment ?? "", e.target.value, undefined)
                      }
                      placeholder="Points positifs…"
                      maxLength={2000}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-red-600 font-medium">❌ Points Négatifs</label>
                    <Textarea
                      disabled={disabled || isNego}
                      className={`min-h-[60px] text-sm border-red-200 ${isNego ? 'opacity-60' : ''}`}
                      rows={3}
                      value={note?.commentNegatif ?? ""}
                      onChange={(e) =>
                        setTechnicalNote(companyId, criterion.id, sub.id, note?.notation ?? null, note?.comment ?? "", undefined, e.target.value)
                      }
                      placeholder="Points négatifs…"
                      maxLength={2000}
                    />
                  </div>
                  {isNego && (
                    <div>
                      <label className="text-xs text-blue-600 font-medium">💬 Réponses aux questions</label>
                      <Textarea
                        disabled={disabled}
                        className="min-h-[60px] text-sm border-blue-200"
                        rows={3}
                        value={note?.questionResponse ?? ""}
                        onChange={(e) =>
                          setTechnicalNoteResponse(companyId, criterion.id, sub.id, e.target.value)
                        }
                        placeholder="Réponses du candidat aux questions posées…"
                      />
                    </div>
                  )}
                  {renderFieldDiff(note?.commentPositif ?? "", getPrevNote(sub.id)?.commentPositif ?? "", "Points Positifs")}
                  {renderFieldDiff(note?.commentNegatif ?? "", getPrevNote(sub.id)?.commentNegatif ?? "", "Points Négatifs")}
                </div>
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
          {renderNotationDiff(note?.notation)}
        </h4>
        <span className="text-xs text-muted-foreground">{score.toFixed(1)} pts</span>
      </div>
      <div className="flex gap-2">
        <Select
          disabled={disabled}
          value={note?.notation ?? "none"}
          onValueChange={(v) =>
            setTechnicalNote(companyId, criterion.id, undefined, v === "none" ? null : (v as NotationLevel), note?.comment ?? "")
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Notation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {NOTATION_OPTIONS.map((n) => (
              <SelectItem key={n} value={n}>{NOTATION_LABELS[n]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1 space-y-2">
          <div>
            <label className="text-xs text-green-700 font-medium">✅ Points Positifs</label>
            <Textarea
              disabled={disabled || isNego}
              className={`min-h-[60px] text-sm border-green-200 ${isNego ? 'opacity-60' : ''}`}
              rows={3}
              value={note?.commentPositif ?? ""}
              onChange={(e) =>
                setTechnicalNote(companyId, criterion.id, undefined, note?.notation ?? null, note?.comment ?? "", e.target.value, undefined)
              }
              placeholder="Points positifs…"
              maxLength={2000}
            />
          </div>
          <div>
            <label className="text-xs text-red-600 font-medium">❌ Points Négatifs</label>
            <Textarea
              disabled={disabled || isNego}
              className={`min-h-[60px] text-sm border-red-200 ${isNego ? 'opacity-60' : ''}`}
              rows={3}
              value={note?.commentNegatif ?? ""}
              onChange={(e) =>
                setTechnicalNote(companyId, criterion.id, undefined, note?.notation ?? null, note?.comment ?? "", undefined, e.target.value)
              }
              placeholder="Points négatifs…"
              maxLength={2000}
            />
          </div>
          {isNego && (
            <div>
              <label className="text-xs text-blue-600 font-medium">💬 Réponses aux questions</label>
              <Textarea
                disabled={disabled}
                className="min-h-[60px] text-sm border-blue-200"
                rows={3}
                value={note?.questionResponse ?? ""}
                onChange={(e) =>
                  setTechnicalNoteResponse(companyId, criterion.id, undefined, e.target.value)
                }
                placeholder="Réponses du candidat aux questions posées…"
              />
            </div>
          )}
          {renderFieldDiff(note?.commentPositif ?? "", getPrevNote()?.commentPositif ?? "", "Points Positifs")}
          {renderFieldDiff(note?.commentNegatif ?? "", getPrevNote()?.commentNegatif ?? "", "Points Négatifs")}
        </div>
      </div>
    </div>
  );
}

export default TechniquePage;
