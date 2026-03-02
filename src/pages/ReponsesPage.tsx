import { useMemo, useState, useEffect, useCallback } from "react";
import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  NOTATION_LABELS,
  type NegotiationVersion,
  type WeightingCriterion,
  type SubCriterion,
} from "@/types/project";
import { getCompanyColor, getCompanyBgColor } from "@/lib/companyColors";
import { Reply, Euro, Wrench, MessageSquare } from "lucide-react";
import { getCompanyScenarioTotal, getCompanyTotalIncludingPseAndTo } from "@/lib/scenarioTotal";

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

function getVisibleSubCriteria(criterion: WeightingCriterion): SubCriterion[] {
  return (criterion.subCriteria ?? []).filter(
    (s) => (s.label ?? "").trim() !== "" && (s.weight ?? 0) > 0
  );
}

/** Montant scénario pour une entreprise (même formule que la Synthèse : TF + options activées + PSE/Variantes retenues). */
function getCompanyScenarioTotalInVersion(
  version: NegotiationVersion | undefined,
  activeLotLines: { id: number; type: string | null }[],
  companyId: number
): number {
  return getCompanyScenarioTotal(version, activeLotLines, companyId);
}

/** Total calculé à partir des lignes (TF + PSE, TO, …) et des ajustements saisis. */
function getTotalFromLineAdjustments(
  version: NegotiationVersion | undefined,
  activeLotLines: { id: number; type: string | null }[],
  companyId: number,
  lineAdjustments: Record<string, string>
): number {
  if (!version?.priceEntries) return 0;
  let total = 0;
  const key0 = `${companyId}:0`;
  const entry0 = version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === 0);
  const base0 = (entry0?.dpgf1 ?? 0) + (entry0?.dpgf2 ?? 0);
  const raw0 = lineAdjustments[key0] ?? "";
  const delta0 = raw0.trim() === "" ? 0 : parseFloat(raw0.replace(",", "."));
  total += base0 + (Number.isNaN(delta0) ? 0 : delta0);
  for (const line of activeLotLines) {
    const entry = version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === line.id);
    const lineTotal = (entry?.dpgf1 ?? 0) + (entry?.dpgf2 ?? 0);
    const key = `${companyId}:${line.id}`;
    const raw = lineAdjustments[key] ?? "";
    const delta = raw.trim() === "" ? 0 : parseFloat(raw.replace(",", "."));
    total += lineTotal + (Number.isNaN(delta) ? 0 : delta);
  }
  return total;
}

const ReponsesPage = () => {
  const { project } = useProjectStore();

  const lotIndex = Math.max(
    0,
    Math.min(project?.currentLotIndex ?? 0, (project?.lots?.length ?? 1) - 1)
  );

  const lot = useMemo(
    () => project?.lots?.[lotIndex] ?? null,
    [project?.lots, lotIndex]
  );

  const versions = lot?.versions ?? [];

  const version = useMemo(
    () =>
      versions.find((v) => v.id === lot?.currentVersionId) ??
      versions[0] ??
      null,
    [versions, lot?.currentVersionId]
  );

  const v0 = useMemo(() => versions[0] ?? null, [versions]);

  const retainedIds = useMemo(() => {
    if (!version?.negotiationDecisions) return [];
    return Object.entries(version.negotiationDecisions)
      .filter(
        ([, d]) => d === "retenue" || d === "questions_reponses"
      )
      .map(([id]) => Number(id));
  }, [version?.negotiationDecisions]);

  const companies = useMemo(
    () =>
      (lot?.companies ?? []).filter(
        (c) => (c?.name ?? "").trim() !== "" && retainedIds.includes(c.id)
      ),
    [lot?.companies, retainedIds]
  );

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (companies.length === 0) {
      if (currentIndex !== 0) setCurrentIndex(0);
      return;
    }
    if (currentIndex > companies.length - 1) {
      setCurrentIndex(companies.length - 1);
    }
  }, [companies.length, currentIndex]);

  const companyIdsKey = useMemo(
    () => companies.map((c) => c.id).join(","),
    [companies]
  );

  const lotLines = lot?.lotLines ?? [];
  const activeLotLines = useMemo(
    () => lotLines.filter((l) => l.label.trim() !== ""),
    [lot?.lotLines]
  );

  const [localPriceByCompany, setLocalPriceByCompany] = useState<Record<number, string>>({});
  const [lineAdjustments, setLineAdjustments] = useState<Record<string, string>>({});

  // Total "Nouveau prix" = somme des lignes (TF + PSE, TO, …) + ajustements ; se met à jour quand on modifie une ligne
  useEffect(() => {
    if (!version || companies.length === 0) return;
    setLocalPriceByCompany((prev) => {
      const next = { ...prev };
      for (const c of companies) {
        const total = getTotalFromLineAdjustments(version, activeLotLines, c.id, lineAdjustments);
        next[c.id] = total > 0 ? String(total) : "";
      }
      return next;
    });
  }, [lineAdjustments, version?.id, companyIdsKey, companies.length, activeLotLines]);

  const estimationTotale =
    (lot?.estimationDpgf1 ?? 0) + (lot?.estimationDpgf2 ?? 0);
  const hasDualDpgf = lot?.hasDualDpgf ?? false;
  const weightingCriteria = lot?.weightingCriteria ?? [];

  const technicalCriteria = useMemo(
    () =>
      weightingCriteria.filter(
        (c) => c.id !== "prix" && (c.weight ?? 0) > 0
      ),
    [weightingCriteria]
  );

  const handleValidatePrice = useCallback(
    (companyId: number) => {
      const raw = localPriceByCompany[companyId] ?? "";
      if (raw.trim() === "") return;
      const val = parseFloat(raw.replace(",", "."));
      if (Number.isNaN(val) || val < 0) return;
      const normalised = val.toFixed(2).replace(".", ",");
      setLocalPriceByCompany((prev) => ({
        ...prev,
        [companyId]: normalised,
      }));
    },
    [localPriceByCompany]
  );

  const handleBlurPrice = useCallback(
    (companyId: number) => {
      handleValidatePrice(companyId);
    },
    [handleValidatePrice]
  );

  if (!lot) {
    return (
      <div className="space-y-6 p-4">
        <h1 className="text-2xl font-bold text-foreground">Réponses</h1>
        <p className="text-sm text-muted-foreground">Aucun lot disponible.</p>
      </div>
    );
  }

  if (!version) {
    return (
      <div className="space-y-6 p-4">
        <h1 className="text-2xl font-bold text-foreground">Réponses</h1>
        <p className="text-sm text-destructive">
          Cette phase de négociation n&apos;existe pas.
        </p>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="space-y-6 p-4">
        <h1 className="text-2xl font-bold text-foreground">Réponses</h1>
        <p className="text-sm text-muted-foreground">
          Aucune entreprise retenue pour la négociation ou pour questions.
          Rendez-vous dans la Synthèse pour désigner les entreprises.
        </p>
      </div>
    );
  }

  const questionnaire = version.questionnaire;

  const company = companies[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < companies.length - 1;

  const companyIndexForColors = Math.max(
    0,
    (lot.companies ?? []).findIndex((c) => c.id === company.id)
  );

  const ancienPrix = getCompanyTotalIncludingPseAndTo(v0, activeLotLines, company.id);
  const nouveauPrix = getCompanyScenarioTotalInVersion(version, activeLotLines, company.id);
  const localVal = localPriceByCompany[company.id] ?? "";
  const displayPrix =
    localVal !== "" ? parseFloat(localVal.replace(",", ".")) : nouveauPrix;

  const ecartPctInitial =
    ancienPrix > 0 ? ((displayPrix - ancienPrix) / ancienPrix) * 100 : 0;

  const ecartPctEstimation =
    estimationTotale > 0
      ? ((displayPrix - estimationTotale) / estimationTotale) * 100
      : 0;

  const notesTechniqueV0 = (v0?.technicalNotes ?? []).filter(
    (n) => n.companyId === company.id
  );

  const cq = questionnaire?.questionnaires?.find(
    (q) => q.companyId === company.id
  );

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Reply className="h-7 w-7" />
          Réponses
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Récapitulatif par soumissionnaire : ancien prix (V0), nouveau prix
          négocié, analyse technique initiale et questions/réponses.
        </p>
      </div>

      {companies.length > 1 && (
        <div className="flex items-center rounded-lg border border-border bg-muted/30 px-4 py-2">
          <span className="text-sm font-medium text-muted-foreground">
            Entreprise {currentIndex + 1} / {companies.length}
          </span>
        </div>
      )}

      <Card
        key={company.id}
        style={{
          borderLeft: `4px solid ${getCompanyColor(companyIndexForColors)}`,
          backgroundColor: getCompanyBgColor(companyIndexForColors),
        }}
      >
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{company.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Section ANALYSE FINANCIÈRE (Prix global) */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Euro className="h-4 w-4" />
              Analyse financière
            </h3>
            <p className="text-xs text-muted-foreground">
              Ancien prix (V0), nouveau prix après négociation et indicateurs d&apos;écart.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  Ancien prix (V0)
                </Label>
                <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm text-muted-foreground select-none">
                  {fmt(ancienPrix)}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`new-price-${company.id}`}>
                  Nouveau prix
                </Label>
                <Input
                  id={`new-price-${company.id}`}
                  type="text"
                  inputMode="decimal"
                  value={localVal}
                  onChange={(e) =>
                    setLocalPriceByCompany((prev) => ({
                      ...prev,
                      [company.id]: e.target.value,
                    }))
                  }
                  onBlur={() => handleBlurPrice(company.id)}
                  placeholder="0,00"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  Écart % (V0 → nouveau prix)
                </Label>
                <div
                  className={`rounded-md border px-3 py-2 text-sm font-medium ${
                    ecartPctInitial >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {ecartPctInitial >= 0 ? "+" : ""}
                  {ecartPctInitial.toFixed(2)} %
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  Écart vs estimation projet
                </Label>
                <div
                  className={`rounded-md border px-3 py-2 text-sm font-medium ${
                    ecartPctEstimation >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {ecartPctEstimation >= 0 ? "+" : ""}
                  {ecartPctEstimation.toFixed(2)} %
                </div>
              </div>
            </div>
          </div>

          {/* Section ANALYSE DES PRIX PAR LIGNE (lecture seule + ajustements locaux) */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Euro className="h-4 w-4" />
              Détail des prix (DPGF, PSE, TO, variantes)
            </h3>
            <p className="text-xs text-muted-foreground">
              Les montants ci-dessous sont ceux saisis dans « Analyse des prix » (figés). Vous pouvez saisir en face un ajustement de négociation sans modifier les prix initiaux.
            </p>

            <div className={`grid ${hasDualDpgf ? "grid-cols-[1fr_120px_120px_140px_140px]" : "grid-cols-[1fr_140px_140px]"} gap-2 text-xs font-medium text-muted-foreground px-1`}>
              <span>Ligne</span>
              {hasDualDpgf ? (
                <>
                  <span className="text-right">DPGF 1 (€ HT)</span>
                  <span className="text-right">DPGF 2 (€ HT)</span>
                </>
              ) : (
                <span className="text-right">Prix initial (€ HT)</span>
              )}
              <span className="text-right">Ajustement (€)</span>
              {hasDualDpgf && <span className="text-right">Nouveau total indicatif</span>}
            </div>

            {/* Ligne DPGF (Tranche ferme) — mêmes colonnes qu'en Analyse des prix */}
            {(() => {
              const entry = version.priceEntries.find(
                (e) => e.companyId === company.id && e.lotLineId === 0
              );
              const dpgf1 = entry?.dpgf1 ?? 0;
              const dpgf2 = entry?.dpgf2 ?? 0;
              const baseTotal = dpgf1 + dpgf2;
              const key = `${company.id}:0`;
              const rawDelta = lineAdjustments[key] ?? "";
              const delta = rawDelta.trim() === "" ? 0 : parseFloat(rawDelta.replace(",", "."));
              const newTotal = baseTotal + (Number.isNaN(delta) ? 0 : delta);
              return (
                <div
                  className={`grid ${hasDualDpgf ? "grid-cols-[1fr_120px_120px_140px_140px]" : "grid-cols-[1fr_140px_140px]"} gap-2 items-center rounded-md border border-border p-2 bg-muted/40`}
                >
                  <div className="text-sm font-semibold">DPGF (Tranche ferme)</div>
                  {hasDualDpgf ? (
                    <>
                      <div className="text-right text-sm font-medium text-muted-foreground">
                        {dpgf1 > 0 ? fmt(dpgf1) : "—"}
                      </div>
                      <div className="text-right text-sm font-medium text-muted-foreground">
                        {dpgf2 > 0 ? fmt(dpgf2) : "—"}
                      </div>
                    </>
                  ) : (
                    <div className="text-right text-sm font-medium text-muted-foreground">
                      {baseTotal > 0 ? fmt(baseTotal) : "—"}
                    </div>
                  )}
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="text-right text-sm"
                    value={rawDelta}
                    onChange={(e) =>
                      setLineAdjustments((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    placeholder="0,00"
                  />
                  {hasDualDpgf && (
                    <div className="text-right text-xs text-muted-foreground">
                      {baseTotal > 0 || delta !== 0 ? fmt(Number.isNaN(newTotal) ? baseTotal : newTotal) : "—"}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Lignes PSE / TO / autres (lotLines actifs) — mêmes colonnes et montants qu'en Analyse des prix */}
            {activeLotLines.map((line) => {
              const entry = version.priceEntries.find(
                (e) => e.companyId === company.id && e.lotLineId === line.id
              );
              const showDpgf1 = line.dpgfAssignment === "DPGF_1" || line.dpgfAssignment === "both";
              const showDpgf2 = hasDualDpgf && (line.dpgfAssignment === "DPGF_2" || line.dpgfAssignment === "both");
              const dpgf1 = entry?.dpgf1 ?? 0;
              const dpgf2 = entry?.dpgf2 ?? 0;
              const lineTotal = dpgf1 + dpgf2;
              const key = `${company.id}:${line.id}`;
              const rawDelta = lineAdjustments[key] ?? "";
              const delta = rawDelta.trim() === "" ? 0 : parseFloat(rawDelta.replace(",", "."));
              const newTotal = lineTotal + (Number.isNaN(delta) ? 0 : delta);
              const badgeLabel =
                line.type === "PSE"
                  ? "PSE"
                  : line.type === "T_OPTIONNELLE"
                  ? "Tranche optionnelle"
                  : line.type === "VARIANTE"
                  ? "Variante"
                  : undefined;
              return (
                <div
                  key={line.id}
                  className={`grid ${hasDualDpgf ? "grid-cols-[1fr_120px_120px_140px_140px]" : "grid-cols-[1fr_140px_140px]"} gap-2 items-center rounded-md border border-border p-2`}
                >
                  <div className="text-sm">
                    <span className="font-medium">{line.label}</span>
                    {badgeLabel && (
                      <span className="ml-2 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {badgeLabel}
                      </span>
                    )}
                  </div>
                  {hasDualDpgf ? (
                    <>
                      <div className="text-right text-sm font-medium text-muted-foreground">
                        {showDpgf1 && dpgf1 > 0 ? fmt(dpgf1) : "—"}
                      </div>
                      <div className="text-right text-sm font-medium text-muted-foreground">
                        {showDpgf2 && dpgf2 > 0 ? fmt(dpgf2) : "—"}
                      </div>
                    </>
                  ) : (
                    <div className="text-right text-sm font-medium text-muted-foreground">
                      {lineTotal > 0 ? fmt(lineTotal) : "—"}
                    </div>
                  )}
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="text-right text-sm"
                    value={rawDelta}
                    onChange={(e) =>
                      setLineAdjustments((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    placeholder="0,00"
                  />
                  {hasDualDpgf && (
                    <div className="text-right text-xs text-muted-foreground col-span-1">
                      {lineTotal > 0 || delta !== 0 ? fmt(Number.isNaN(newTotal) ? lineTotal : newTotal) : "—"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Section ANALYSE TECHNIQUE (Lecture seule — notes V0) */}
          <div className="space-y-3 opacity-60 bg-muted/30 rounded-lg p-4 pointer-events-none">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Analyse technique
            </h3>
            <p className="text-xs text-muted-foreground">
              Récapitulatif des sous-critères avec la note initiale (V0). Données figées.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Sous-critère</TableHead>
                  <TableHead className="text-right">Note initiale (V0)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {technicalCriteria.map((criterion) => {
                  const visibleSubs = getVisibleSubCriteria(criterion);
                  if (visibleSubs.length === 0) {
                    const note = notesTechniqueV0.find(
                      (n) =>
                        n.criterionId === criterion.id &&
                        !n.subCriterionId &&
                        !n.itemId
                    );
                    return (
                      <TableRow key={criterion.id}>
                        <TableCell className="font-medium">
                          {criterion.label}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {note?.notation
                            ? NOTATION_LABELS[note.notation]
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return visibleSubs.map((sub) => {
                    const note = notesTechniqueV0.find(
                      (n) =>
                        n.criterionId === criterion.id &&
                        n.subCriterionId === sub.id &&
                        !n.itemId
                    );
                    return (
                      <TableRow key={`${criterion.id}-${sub.id}`}>
                        <TableCell className="font-medium">
                          {sub.label}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {note?.notation
                            ? NOTATION_LABELS[note.notation]
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  });
                })}
              </TableBody>
            </Table>
          </div>

          {/* Section QUESTIONS & RÉPONSES (Lecture seule — données historiques) */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Questions &amp; Réponses
            </h3>
            <p className="text-xs text-muted-foreground italic">
              Consultation des questions posées dans l&apos;onglet Questions et des réponses de l&apos;entreprise.
            </p>
            {!cq || (cq.questions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Aucune question pour cette entreprise.
              </p>
            ) : (
              <ul className="space-y-3">
                {(cq.questions ?? []).map((q, idx) => (
                  <li
                    key={q.id}
                    className="border-b border-border pb-2 last:border-0"
                  >
                    <p className="text-sm font-medium text-muted-foreground">
                      {idx + 1}. {q.text || "—"}
                    </p>
                    <p className="text-sm text-muted-foreground italic mt-1 pl-4">
                      Réponse : {q.response || "—"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {companies.length > 1 && (
        <div className="mt-6 flex items-center justify-end rounded-lg border border-border bg-muted/30 px-4 py-2">
          <div className="flex gap-2">
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50"
              disabled={!hasPrev}
              onClick={() =>
                setCurrentIndex((idx) => Math.max(0, idx - 1))
              }
            >
              Entreprise précédente
            </button>
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50"
              disabled={!hasNext}
              onClick={() =>
                setCurrentIndex((idx) =>
                  Math.min(companies.length - 1, idx + 1)
                )
              }
            >
              Entreprise suivante
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReponsesPage;

