import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { NOTATION_LABELS, NOTATION_VALUES, NotationLevel, WeightingCriterion, SubCriterion, NegotiationVersion, type VarianteLine } from "@/types/project";
import { useMemo, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAnalysisContext } from "@/hooks/useAnalysisContext";
import { Lock, AlertTriangle } from "lucide-react";
import { getCompanyColor, getCompanyBgColor } from "@/lib/companyColors";
import { useWeightingValid } from "@/hooks/useWeightingValid";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const NOTATION_OPTIONS: NotationLevel[] = ["tres_bien", "bien", "moyen", "passable", "insuffisant"];

/** Filter sub-criteria: only those with text AND weight > 0 */
function getVisibleSubCriteria(criterion: WeightingCriterion): SubCriterion[] {
  return criterion.subCriteria.filter((s) => s.label.trim() !== "" && s.weight > 0);
}

const TechniquePage = () => {
  const { project, setTechnicalNote, getTechnicalNote, setDocumentsToVerify, getDocumentsToVerify, updateCompany, getVarianteTechnicalNote, setVarianteTechnicalNote, updateNoteVariante } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];
  const { activeCompanies, version, isReadOnly, isNego, negoLabel, negoRound } = useAnalysisContext();
  const { weightingCriteria } = lot;
  const varianteExigee = lot?.varianteExigee ?? false;
  const varianteOptional = (lot?.varianteInterdite === false || (lot?.varianteAutorisee ?? false)) && !varianteExigee;
  const showVarianteSection = varianteExigee || varianteOptional;
  const varianteLinesFromConfig: VarianteLine[] = Array.isArray(lot?.varianteLines) ? lot.varianteLines : [];
  const { companyIndex: companyIndexParam } = useParams<{ companyIndex?: string; round?: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const basePath = location.pathname.replace(/\/\d+$/, "");
  const maxCompanyIndex = Math.max(0, activeCompanies.length - 1);
  const safeIndex = (() => {
    const n = parseInt(companyIndexParam ?? "", 10);
    if (!Number.isInteger(n) || n < 0) return 0;
    return Math.min(n, maxCompanyIndex);
  })();
  useEffect(() => {
    if (activeCompanies.length === 0) return;
    if (companyIndexParam === undefined) {
      navigate(`${basePath}/0`, { replace: true });
      return;
    }
    const n = parseInt(companyIndexParam, 10);
    if (!Number.isInteger(n) || n < 0 || n > maxCompanyIndex) {
      const clamped = Math.max(0, Math.min(maxCompanyIndex, n));
      navigate(`${basePath}/${clamped}`, { replace: true });
    }
  }, [activeCompanies.length, companyIndexParam, basePath, navigate, maxCompanyIndex]);

  const currentCompanies = activeCompanies.length > 0 ? [activeCompanies[safeIndex]] : [];
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < activeCompanies.length - 1 && activeCompanies.length > 1;

  const prevVersion = isNego && negoRound !== null && negoRound > 0
    ? lot.versions[negoRound - 1]
    : null;

  // Filter criteria with weight > 0 AND (has visible sub-criteria OR has label text for standalone criteria)
  const allTechnicalCriteria = weightingCriteria.filter((c) => c.id !== "prix" && c.weight > 0).filter((c) => {
    if (c.subCriteria.length > 0) return getVisibleSubCriteria(c).length > 0;
    return c.label.trim() !== "";
  });
  const valueTechniqueCriteria = allTechnicalCriteria.filter(
    (c) => c.id !== "environnemental" && c.id !== "planning"
  );
  const environnementalCriterion = allTechnicalCriteria.find((c) => c.id === "environnemental");
  const planningCriterion = allTechnicalCriteria.find((c) => c.id === "planning");

  const scores = useMemo(() => {
    if (!version) return {};
    const result: Record<number, {
      total: number;
      byCriterion: Record<string, number>;
      byCriterionDetail: Record<string, { subRawScores: { subId: string; rawScore: number; subWeight: number }[]; subTotal: number }>;
    }> = {};

    for (const company of activeCompanies) {
      if (company.status === "ecartee") continue;
      const byCriterion: Record<string, number> = {};
      const byCriterionDetail: Record<string, { subRawScores: { subId: string; rawScore: number; subWeight: number }[]; subTotal: number }> = {};
      let total = 0;

      for (const criterion of allTechnicalCriteria) {
        const visibleSubs = getVisibleSubCriteria(criterion);
        if (visibleSubs.length > 0) {
          const subTotalWeights = visibleSubs.reduce((s, sc) => s + sc.weight, 0);
          const subRawScores: { subId: string; rawScore: number; subWeight: number }[] = [];
          let totalRaw = 0;
          for (const sub of visibleSubs) {
            const note = version.technicalNotes.find(
              (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id && !n.itemId
            );
            const coef = note?.notation ? NOTATION_VALUES[note.notation] : 0;
            const rawScore = sub.weight * coef;
            subRawScores.push({ subId: sub.id, rawScore, subWeight: sub.weight });
            totalRaw += rawScore;
          }
          const weightedScore = subTotalWeights > 0 ? (totalRaw / subTotalWeights) * criterion.weight : 0;
          byCriterion[criterion.id] = weightedScore;
          byCriterionDetail[criterion.id] = { subRawScores, subTotal: subTotalWeights };
          total += weightedScore;
        } else {
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId && !n.itemId
          );
          if (note?.notation) {
            const weightedScore = NOTATION_VALUES[note.notation] * criterion.weight;
            byCriterion[criterion.id] = weightedScore;
            total += weightedScore;
          } else {
            byCriterion[criterion.id] = 0;
          }
        }
      }
      result[company.id] = { total, byCriterion, byCriterionDetail };
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

      {activeCompanies.length > 1 && (
        <div className="flex items-center rounded-lg border border-border bg-muted/30 px-4 py-2">
          <span className="text-sm font-medium text-muted-foreground">
            Entreprise {safeIndex + 1} / {activeCompanies.length}
          </span>
        </div>
      )}

      {currentCompanies.map((company) => (
        <Card
          key={company.id}
          className={company.status === "ecartee" ? "opacity-60" : ""}
          style={{
            borderLeft: `4px solid ${getCompanyColor(safeIndex)}`,
            backgroundColor: company.status !== "ecartee" ? getCompanyBgColor(safeIndex) : undefined,
          }}
        >
          <CardHeader className="bg-muted/40 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold text-foreground">
                {company.id}. {company.name}
              </CardTitle>
              {company.status === "ecartee" ? (
                <Badge variant="destructive">
                  Écartée{company.exclusionReason ? ` — ${company.exclusionReason}` : ""}
                </Badge>
              ) : (
                <Badge variant={scores[company.id]?.total > 0 ? "default" : "secondary"}>
                  {(scores[company.id]?.total ?? 0).toFixed(2)} / {maxTechnicalWeight}
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
                      criterionDetail={scores[company.id]?.byCriterionDetail[criterion.id]}
                      disabled={isReadOnly}
                      isNego={isNego}
                      prevVersion={prevVersion}
                      showVarianteSection={showVarianteSection}
                      varianteLines={varianteLinesFromConfig}
                      getVarianteTechnicalNote={getVarianteTechnicalNote}
                      setVarianteTechnicalNote={setVarianteTechnicalNote}
                      updateNoteVariante={updateNoteVariante}
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
                    criterionDetail={scores[company.id]?.byCriterionDetail[environnementalCriterion.id]}
                    disabled={isReadOnly}
                    isNego={isNego}
                    prevVersion={prevVersion}
                    showVarianteSection={showVarianteSection}
                    varianteLines={varianteLinesFromConfig}
                    getVarianteTechnicalNote={getVarianteTechnicalNote}
                    setVarianteTechnicalNote={setVarianteTechnicalNote}
                    updateNoteVariante={updateNoteVariante}
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
                    criterionDetail={scores[company.id]?.byCriterionDetail[planningCriterion.id]}
                    disabled={isReadOnly}
                    isNego={isNego}
                    prevVersion={prevVersion}
                    showVarianteSection={showVarianteSection}
                    varianteLines={varianteLinesFromConfig}
                    getVarianteTechnicalNote={getVarianteTechnicalNote}
                    setVarianteTechnicalNote={setVarianteTechnicalNote}
                    updateNoteVariante={updateNoteVariante}
                  />
                </div>
              )}

              {/* NOTE TECHNIQUE GLOBALE — somme des notes pondérées (Valeur technique + Env + Planning) */}
              {company.status !== "ecartee" && (
                <div className="rounded-md border-2 border-primary/30 bg-primary/5 px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-foreground">NOTE TECHNIQUE GLOBALE ( / {maxTechnicalWeight} )</span>
                  <span className="text-lg font-bold text-foreground">{(scores[company.id]?.total ?? 0).toFixed(2)}</span>
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

      {activeCompanies.length > 0 && activeCompanies[safeIndex] && (
        <div className="mt-6 mb-4 flex items-center space-x-2">
          <Checkbox
            id="has-questions-technique"
            checked={activeCompanies[safeIndex].hasQuestions ?? false}
            onCheckedChange={(checked) => updateCompany(activeCompanies[safeIndex].id, { hasQuestions: !!checked })}
          />
          <Label htmlFor="has-questions-technique">
            Question(s) à poser à {activeCompanies[safeIndex].name || "cette entreprise"}
          </Label>
        </div>
      )}

      {activeCompanies.length > 1 && (
        <div className="mt-6 flex items-center justify-end rounded-lg border border-border bg-muted/30 px-4 py-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!hasPrev}
              onClick={() => navigate(`${basePath}/${safeIndex - 1}`)}
            >
              Entreprise précédente
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNext}
              onClick={() => navigate(`${basePath}/${safeIndex + 1}`)}
            >
              Entreprise suivante
            </Button>
            {!hasNext && (
              <Button size="sm" onClick={() => navigate("/synthese")} className="ml-2">
                Page suivante
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function CriterionBlock({
  criterion,
  companyId,
  score,
  criterionDetail,
  disabled,
  isNego,
  prevVersion,
  showVarianteSection,
  varianteLines = [],
  getVarianteTechnicalNote,
  setVarianteTechnicalNote,
  updateNoteVariante,
}: {
  criterion: WeightingCriterion;
  companyId: number;
  score: number;
  criterionDetail?: { subRawScores: { subId: string; rawScore: number; subWeight: number }[]; subTotal: number };
  disabled: boolean;
  isNego: boolean;
  prevVersion?: NegotiationVersion | null;
  showVarianteSection?: boolean;
  varianteLines?: VarianteLine[];
  getVarianteTechnicalNote: (companyId: number, varianteLineId: number, criterionId: string, subCriterionId?: string) => string | null;
  setVarianteTechnicalNote: (companyId: number, varianteLineId: number, criterionId: string, subCriterionId: string | undefined, notation: NotationLevel | null) => void;
  updateNoteVariante?: (companyId: number, varianteId: string, critereId: string, note: string) => void;
}) {
  const { setTechnicalNote, getTechnicalNote, setTechnicalNoteResponse, setItemNote, getItemNote } = useProjectStore();

  /** Colonne des menus de notation : label au-dessus de chaque Select (Offre de base, puis Variante 1, 2, …). */
  const renderNotationColumn = (
    subCriterionId: string | undefined,
    baseValue: string,
    onBaseChange: (v: NotationLevel | null) => void
  ) => {
    const critereKey = subCriterionId ? `${criterion.id}_${subCriterionId}` : criterion.id;
    return (
    <div className="flex flex-col gap-3 w-40 shrink-0">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground block">Offre de base</label>
        <Select
          disabled={disabled}
          value={baseValue}
          onValueChange={(v) => onBaseChange(v === "none" ? null : (v as NotationLevel))}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Notation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {NOTATION_OPTIONS.map((n) => (
              <SelectItem key={n} value={n}>{NOTATION_LABELS[n]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {showVarianteSection && varianteLines.length > 0 && getVarianteTechnicalNote && (updateNoteVariante || setVarianteTechnicalNote) &&
        varianteLines.map((line, idx) => {
          const value = getVarianteTechnicalNote(companyId, line.id, criterion.id, subCriterionId) ?? "none";
          const varianteLabel = line.label?.trim() || "Sans nom";
          return (
            <div key={line.id} className="space-y-1">
              <label className="text-xs font-medium text-destructive block">{`Variante ${idx + 1} : ${varianteLabel}`}</label>
              <Select
                disabled={disabled}
                value={value}
                onValueChange={(v) => {
                  const note = v === "none" ? null : (v as NotationLevel);
                  if (updateNoteVariante) {
                    updateNoteVariante(companyId, String(line.id), critereKey, note ?? "none");
                  } else if (setVarianteTechnicalNote) {
                    setVarianteTechnicalNote(companyId, line.id, criterion.id, subCriterionId, note);
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Notation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {NOTATION_OPTIONS.map((n) => (
                    <SelectItem key={n} value={n}>{NOTATION_LABELS[n]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
    </div>
  );
  };

  const getPrevNote = (subId?: string) => {
    if (!prevVersion) return undefined;
    return prevVersion.technicalNotes.find(
      (n) => n.companyId === companyId && n.criterionId === criterion.id &&
        (subId ? n.subCriterionId === subId : !n.subCriterionId) && !n.itemId
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
        <span className="line-through text-destructive">{NOTATION_LABELS[prevNotation]} ({(prevValue * 100)} %)</span>
        <span className="mx-1">→</span>
        {currentNotation && (
          <span className="text-green-600 font-medium">{NOTATION_LABELS[currentNotation]} ({(currValue * 100)} %)</span>
        )}
      </span>
    );
  };

  const renderFieldDiff = (currentValue: string, prevValue: string, label?: string) => {
    if (!prevVersion) return null;
    if (prevValue === currentValue || (!prevValue && !currentValue)) return null;
    const hasDeleted = prevValue && prevValue !== currentValue;
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

  const visibleSubs = getVisibleSubCriteria(criterion);

  if (visibleSubs.length > 0) {
    const totalRaw = criterionDetail?.subRawScores.reduce((s, x) => s + x.rawScore, 0) ?? 0;
    const subTotalWeights = criterionDetail?.subTotal ?? visibleSubs.reduce((s, sc) => s + sc.weight, 0);

    return (
      <div className="rounded-md border border-border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">
            {criterion.label} ({criterion.weight}%)
          </h4>
        </div>
        {visibleSubs.map((sub, subIdx) => {
          const note = getTechnicalNote(companyId, criterion.id, sub.id);
          const rawEntry = criterionDetail?.subRawScores.find((e) => e.subId === sub.id);
          const rawScore = rawEntry?.rawScore ?? 0;
          const subWeight = rawEntry?.subWeight ?? sub.weight;
          const visibleItems = (sub.items || []).filter((it) => it.label.trim() !== "");
          return (
            <div key={sub.id} className="ml-4 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Sous-critère {subIdx + 1} — {sub.label} ({sub.weight}%)
                {renderNotationDiff(note?.notation, sub.id)}
                <span className="ml-2 font-normal text-foreground">
                  (Note / {subWeight} : <strong>{rawScore.toFixed(2)}</strong>)
                </span>
              </label>
              <div className="flex gap-4">
                {renderNotationColumn(
                  sub.id,
                  note?.notation ?? "none",
                  (v) => setTechnicalNote(companyId, criterion.id, sub.id, v, note?.comment ?? "")
                )}
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

              {/* Items : alignement à gauche = bloc texte sous-critères ; largeur réduite, hauteur agrandissable */}
              {visibleItems.length > 0 && (
                <div className="ml-0 mt-2 space-y-3 border-l-2 border-muted pl-4">
                  {visibleItems.map((item) => {
                    const itemNote = getItemNote(companyId, criterion.id, sub.id, item.id);
                    return (
                      <div key={item.id} className="space-y-1.5">
                        <div className="flex gap-2">
                          <div className="w-40 shrink-0" aria-hidden />
                          <span className="text-xs font-medium text-muted-foreground">Item — {item.label}</span>
                        </div>
                        <div className="flex gap-2">
                          <div className="w-40 shrink-0" aria-hidden />
                          <div className="min-w-0 flex-1 max-w-3xl pl-8">
                            <label className="text-[10px] text-red-600 font-medium">❌ Négatif — échange à avoir en négociation</label>
                            <Textarea
                              disabled={disabled || isNego}
                              className={`min-h-[40px] resize-y text-xs border-red-200 w-full ${isNego ? 'opacity-60' : ''}`}
                              rows={2}
                              value={itemNote?.commentNegatif ?? ""}
                              onChange={(e) =>
                                setItemNote(companyId, criterion.id, sub.id, item.id, itemNote?.notation ?? null, itemNote?.commentPositif ?? "", e.target.value)
                              }
                              placeholder="Échange à avoir en négociation…"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {/* Total Interne (avant pondération) */}
        <div className="ml-4 pt-2 border-t border-border flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Total interne (avant pondération)
          </span>
          <span className="text-xs font-medium text-foreground">
            {totalRaw.toFixed(2)} / {subTotalWeights}
          </span>
        </div>
        {/* Note technique pondérée */}
        <div className="ml-4 flex items-center justify-between rounded bg-muted/50 px-3 py-2">
          <span className="text-xs font-semibold text-foreground">
            Note technique pondérée sur {criterion.weight} %
          </span>
          <span className="text-sm font-bold text-foreground">
            {score.toFixed(2)} / {criterion.weight}
          </span>
        </div>
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
        <span className="text-xs text-muted-foreground">{score.toFixed(2)} pts</span>
      </div>
      <div className="space-y-2">
        <div className="flex gap-4">
          {renderNotationColumn(
            undefined,
            note?.notation ?? "none",
            (v) => setTechnicalNote(companyId, criterion.id, undefined, v, note?.comment ?? "")
          )}
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
    </div>
  );
}

export default TechniquePage;
