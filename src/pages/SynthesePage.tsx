import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NOTATION_VALUES, NegotiationDecision, NEGOTIATION_DECISION_LABELS, getVersionDisplayLabel } from "@/types/project";
import { useMemo, useState } from "react";
import { Lock, CheckCircle, ShieldCheck, Unlock, AlertTriangle, Award, Settings2 } from "lucide-react";
import { useAnalysisContext } from "@/hooks/useAnalysisContext";
import { useWeightingValid } from "@/hooks/useWeightingValid";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const DECISION_OPTIONS: NegotiationDecision[] = ["non_defini", "retenue", "non_retenue", "attributaire"];

const SynthesePage = () => {
  const {
    project, setNegotiationDecision, getNegotiationDecision,
    validateVersion, unvalidateVersion, hasAttributaire,
  } = useProjectStore();
  const { activeCompanies, version, isReadOnly, isNego, negoLabel } = useAnalysisContext();
  const { isValid: weightingValid, total: weightingTotal } = useWeightingValid();
  const { weightingCriteria, lotLines } = project;

  const technicalCriteria = weightingCriteria.filter((c) => c.id !== "prix");
  const prixCriterion = weightingCriteria.find((c) => c.id === "prix");
  const prixWeight = prixCriterion?.weight ?? 40;
  const activeLotLines = lotLines.filter((l) => l.label.trim() !== "");

  const valueTechnique = technicalCriteria.filter((c) => c.id !== "environnemental" && c.id !== "planning");
  const envCriterion = technicalCriteria.find((c) => c.id === "environnemental");
  const planCriterion = technicalCriteria.find((c) => c.id === "planning");

  // Scenario toggles
  const pseLines = activeLotLines.filter((l) => l.type === "PSE");
  const varianteLines = activeLotLines.filter((l) => l.type === "VARIANTE");
  const toLines = activeLotLines.filter((l) => l.type === "T_OPTIONNELLE");

  // Auto-numbering helper
  const getLineLabel = (line: typeof activeLotLines[0]) => {
    if (!line.type) return line.label;
    const group = activeLotLines.filter((l) => l.type === line.type);
    const idx = group.indexOf(line) + 1;
    const prefix = line.type === "PSE" ? "PSE" : line.type === "VARIANTE" ? "Variante" : "TO";
    return `${prefix} ${idx}${line.label ? ` — ${line.label}` : ""}`;
  };

  const [enabledLines, setEnabledLines] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    for (const l of activeLotLines) {
      init[l.id] = !l.type; // base lines enabled by default
    }
    return init;
  });

  const [compareLines, setCompareLines] = useState<Record<number, boolean>>({});
  const [attributaireDialogOpen, setAttributaireDialogOpen] = useState(false);
  const [validationComment, setValidationComment] = useState("");
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [evictionMotif, setEvictionMotif] = useState("");

  const toggleLine = (id: number) => {
    setEnabledLines((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const hasPSE = pseLines.length > 0;
  const hasVariante = varianteLines.length > 0;
  const hasTO = toLines.length > 0;
  const hasScenarioOptions = hasPSE || hasVariante || hasTO;

  const versionHasAttributaire = version ? hasAttributaire(version.id) : false;
  const isValidated = version?.validated ?? false;
  const displayLabel = version ? getVersionDisplayLabel(version.label) : "";

  // Attribution exclusivity checks
  const decisions = useMemo(() => {
    if (!version) return {};
    return version.negotiationDecisions ?? {};
  }, [version]);

  const hasAnyAttributaire = useMemo(() =>
    Object.values(decisions).some((d) => d === "attributaire"), [decisions]);
  const hasAnyRetenue = useMemo(() =>
    Object.values(decisions).some((d) => d === "retenue"), [decisions]);

  const allDecided = useMemo(() => {
    const eligibleCompanies = activeCompanies.filter((c) => c.status !== "ecartee");
    if (eligibleCompanies.length === 0) return false;
    return eligibleCompanies.every((c) => {
      const d = decisions[c.id];
      return d && d !== "non_defini";
    });
  }, [activeCompanies, decisions]);

  const nobodyRetained = useMemo(() => {
    const eligibleCompanies = activeCompanies.filter((c) => c.status !== "ecartee");
    if (eligibleCompanies.length === 0) return false;
    return allDecided && !hasAnyAttributaire && !hasAnyRetenue;
  }, [activeCompanies, allDecided, hasAnyAttributaire, hasAnyRetenue]);

  // --- Compute results ---
  // Helper: get price for a company on a specific lot line
  const getLinePrice = (companyId: number, lineId: number) => {
    if (!version) return 0;
    const entry = version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === lineId);
    return (entry?.dpgf1 ?? 0) + (entry?.dpgf2 ?? 0);
  };

  const hasPrice = (companyId: number, lineId: number) => {
    if (!version) return false;
    const entry = version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === lineId);
    return entry !== undefined && ((entry.dpgf1 ?? 0) !== 0 || (entry.dpgf2 ?? 0) !== 0);
  };

  const results = useMemo(() => {
    if (!version) return [];

    const techScores: Record<number, { total: number; technique: number; env: number; planning: number }> = {};
    for (const company of activeCompanies) {
      if (company.status === "ecartee") {
        techScores[company.id] = { total: 0, technique: 0, env: 0, planning: 0 };
        continue;
      }
      let total = 0, technique = 0, env = 0, planning = 0;

      for (const criterion of technicalCriteria) {
        let criterionScore = 0;
        if (criterion.subCriteria.length > 0) {
          let raw = 0;
          const subTotal = criterion.subCriteria.reduce((s, sc) => s + sc.weight, 0);
          for (const sub of criterion.subCriteria) {
            const note = version.technicalNotes.find(
              (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
            );
            if (note?.notation) {
              const subWeight = subTotal > 0 ? sub.weight / subTotal : 0;
              raw += NOTATION_VALUES[note.notation] * subWeight;
            }
          }
          criterionScore = (raw / 5) * criterion.weight;
        } else {
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
          );
          if (note?.notation) {
            criterionScore = (NOTATION_VALUES[note.notation] / 5) * criterion.weight;
          }
        }

        if (criterion.id === "environnemental") env = criterionScore;
        else if (criterion.id === "planning") planning = criterionScore;
        else technique += criterionScore;
        total += criterionScore;
      }
      techScores[company.id] = { total, technique, env, planning };
    }

    // Compute scenario total: Base + sum of enabled option lines
    const companyPriceTotals: Record<number, number> = {};
    const missingPrices: Record<number, string[]> = {};

    for (const company of activeCompanies) {
      if (company.status === "ecartee") continue;
      const baseDpgf = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === 0);
      const baseTotal = (baseDpgf?.dpgf1 ?? 0) + (baseDpgf?.dpgf2 ?? 0);

      let scenarioTotal = baseTotal;
      const missing: string[] = [];

      for (const line of activeLotLines) {
        if (enabledLines[line.id]) {
          const lineTotal = getLinePrice(company.id, line.id);
          scenarioTotal += lineTotal;
          // Check for missing price on enabled option
          if (line.type && !hasPrice(company.id, line.id)) {
            missing.push(getLineLabel(line));
          }
        }
      }

      companyPriceTotals[company.id] = scenarioTotal;
      missingPrices[company.id] = missing;
    }

    const validPrices = Object.values(companyPriceTotals).filter((v) => v > 0);
    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;

    const priceScores: Record<number, number> = {};
    for (const [id, total] of Object.entries(companyPriceTotals)) {
      priceScores[Number(id)] = total > 0 ? (minPrice / total) * prixWeight : 0;
    }

    return activeCompanies.map((company) => {
      const ts = techScores[company.id] ?? { total: 0, technique: 0, env: 0, planning: 0 };
      const priceScore = company.status === "ecartee" ? 0 : (priceScores[company.id] ?? 0);
      const priceTotal = company.status === "ecartee" ? 0 : (companyPriceTotals[company.id] ?? 0);
      const globalScore = ts.total + priceScore;
      const missing = missingPrices[company.id] ?? [];

      return {
        company, techScore: ts.total, techniqueScore: ts.technique,
        envScore: ts.env, planningScore: ts.planning,
        priceScore, priceTotal, globalScore, missingPrices: missing,
      };
    });
  }, [activeCompanies, technicalCriteria, version, prixWeight, activeLotLines, enabledLines]);

  const sorted = useMemo(() => {
    return [...results].sort((a, b) => {
      if (a.company.status === "ecartee" && b.company.status !== "ecartee") return 1;
      if (a.company.status !== "ecartee" && b.company.status === "ecartee") return -1;
      return b.globalScore - a.globalScore;
    });
  }, [results]);

  // --- Comparison rows: individual option lines with recalculated price scores ---
  const comparisonRows = useMemo(() => {
    if (!version) return [];
    const rows: {
      key: string;
      companyName: string;
      optionLabel: string;
      techScore: number;
      techniqueScore: number;
      envScore: number;
      planningScore: number;
      priceTotal: number;
      priceScore: number;
      globalScore: number;
      hasMissing: boolean;
    }[] = [];

    const optionLines = [...pseLines, ...varianteLines, ...toLines].filter(
      (l) => !!compareLines[l.id]
    );

    if (optionLines.length === 0) return [];

    const eligibleCompanies = activeCompanies.filter((c) => c.status !== "ecartee");

    for (const line of optionLines) {
      // Compute "Base + this option" for all companies
      const totals: Record<number, number> = {};
      for (const company of eligibleCompanies) {
        const baseDpgf = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === 0);
        const baseTotal = (baseDpgf?.dpgf1 ?? 0) + (baseDpgf?.dpgf2 ?? 0);
        const optionPrice = getLinePrice(company.id, line.id);
        totals[company.id] = baseTotal + optionPrice;
      }

      const validPrices = Object.values(totals).filter((v) => v > 0);
      const minP = validPrices.length > 0 ? Math.min(...validPrices) : 0;

      for (const company of eligibleCompanies) {
        const result = results.find((r) => r.company.id === company.id);
        if (!result) continue;
        const pt = totals[company.id] ?? 0;
        const ps = pt > 0 ? (minP / pt) * prixWeight : 0;
        const gs = result.techScore + ps;
        const missing = !hasPrice(company.id, line.id);

        rows.push({
          key: `cmp-${line.id}-${company.id}`,
          companyName: `${company.id}. ${company.name}`,
          optionLabel: getLineLabel(line),
          techScore: result.techScore,
          techniqueScore: result.techniqueScore,
          envScore: result.envScore,
          planningScore: result.planningScore,
          priceTotal: pt,
          priceScore: ps,
          globalScore: gs,
          hasMissing: missing,
        });
      }
    }

    // Sort comparison rows by globalScore desc
    rows.sort((a, b) => b.globalScore - a.globalScore);
    return rows;
  }, [version, compareLines, pseLines, varianteLines, toLines, activeCompanies, results, prixWeight]);

  const valueTechWeight = valueTechnique.reduce((s, c) => s + c.weight, 0);
  const envWeight = envCriterion?.weight ?? 0;
  const planWeight = planCriterion?.weight ?? 0;
  const maxTotal = valueTechWeight + envWeight + planWeight + prixWeight;

  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const pageTitle = isNego ? `Synthèse — ${negoLabel}` : `Synthèse & Classement — ${displayLabel}`;

  const attributaireResult = sorted.find(
    (r) => r.company.status !== "ecartee" && getNegotiationDecision(r.company.id) === "attributaire"
  );
  const scenarioDescription = useMemo(() => {
    if (!attributaireResult) return "";
    const enabledOptions = activeLotLines
      .filter((l) => l.type && enabledLines[l.id])
      .map((l) => getLineLabel(l))
      .join(", ");
    return `L'entreprise ${attributaireResult.company.name} est retenue pour un montant de ${fmt(attributaireResult.priceTotal)} HT, incluant la Solution de Base${enabledOptions ? ` + ${enabledOptions}` : ""}.`;
  }, [attributaireResult, activeLotLines, enabledLines]);

  // Get available decision options based on exclusivity rules
  const getAvailableDecisions = (companyId: number): NegotiationDecision[] => {
    const currentDecision = decisions[companyId] ?? "non_defini";
    return DECISION_OPTIONS.filter((d) => {
      if (d === "attributaire" && hasAnyAttributaire && currentDecision !== "attributaire") return false;
      if (d === "retenue" && hasAnyAttributaire && currentDecision !== "attributaire") return false;
      if (d === "attributaire" && hasAnyRetenue && currentDecision !== "retenue") return false;
      return true;
    });
  };

  if (!weightingValid) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
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
          <h1 className="text-2xl font-bold text-foreground">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {isNego
              ? "Aucune entreprise retenue pour cette phase de négociation."
              : "Veuillez d'abord saisir des entreprises dans « Données du projet »."}
          </p>
        </div>
      </div>
    );
  }

  let rank = 0;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          {pageTitle}
          {isReadOnly && !isValidated && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" /> Figée
            </Badge>
          )}
          {isValidated && (
            <Badge variant="default" className="gap-1 bg-green-600">
              <CheckCircle className="h-3 w-3" /> Validée
              {version?.validatedAt && (
                <span className="ml-1 font-normal text-xs">
                  le {new Date(version.validatedAt).toLocaleDateString("fr-FR")}
                </span>
              )}
            </Badge>
          )}
        </h1>
        <p className="text-sm text-muted-foreground">
          Classement global des entreprises (technique + prix). Total sur {maxTotal} pts.
          {hasScenarioOptions && " Total = Base + Σ(Options actives)."}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        {version && allDecided && !isValidated && !isReadOnly && (
          <Button
            className="gap-2 bg-green-600 hover:bg-green-700"
            onClick={() => setValidationDialogOpen(true)}
          >
            <CheckCircle className="h-4 w-4" />
            {versionHasAttributaire ? "Valider l'analyse — Attribuer" : "Valider l'analyse"}
          </Button>
        )}

        {version && isValidated && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Unlock className="h-4 w-4" />
                Débloquer l'analyse
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Débloquer l'analyse ?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  L'analyse sera déverrouillée. Vous pourrez modifier les données et éventuellement créer
                  une nouvelle phase de négociation.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={() => unvalidateVersion(version.id)}>
                  Confirmer le déblocage
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {attributaireResult && (
          <Button className="gap-2" variant="default" onClick={() => setAttributaireDialogOpen(true)}>
            <Award className="h-4 w-4" />
            Déclarer l'attributaire
          </Button>
        )}
      </div>

      {/* Non-attribution warning */}
      {nobodyRetained && !isValidated && (
        <div className="rounded-md border border-orange-300 bg-orange-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-semibold text-orange-800">Aucune entreprise retenue ni attributaire</span>
          </div>
          <p className="text-xs text-orange-700 mb-2">Un motif de non-attribution est obligatoire pour valider.</p>
          <Textarea
            className="text-sm"
            rows={2}
            placeholder="Motif de non-attribution..."
            value={validationComment}
            onChange={(e) => setValidationComment(e.target.value)}
            maxLength={2000}
          />
        </div>
      )}

      {/* Validation modal */}
      <Dialog open={validationDialogOpen} onOpenChange={setValidationDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              Valider l'analyse
            </DialogTitle>
            <DialogDescription>
              {versionHasAttributaire
                ? "L'entreprise attributaire sera confirmée et cette phase sera figée."
                : "La validation va figer cette phase."}
            </DialogDescription>
          </DialogHeader>

          {/* Attribution pressentie */}
          {attributaireResult && (
            <div className="space-y-3">
              <div className="rounded-md border border-green-300 bg-green-50 p-4 text-sm leading-relaxed">
                <p className="font-semibold mb-2 text-green-800">🏆 Attribution pressentie</p>
                <p>{scenarioDescription}</p>
                <p className="mt-2 text-muted-foreground">
                  Classée au rang n°1 avec une note globale de {attributaireResult.globalScore.toFixed(1)} / {maxTotal} pts.
                </p>
              </div>

              {/* Scenario detail */}
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
                <p className="font-semibold mb-1">Détail du scénario retenu :</p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  <li>Solution de Base (Tranche Ferme)</li>
                  {activeLotLines.filter((l) => l.type && enabledLines[l.id]).map((l) => (
                    <li key={l.id}>{getLineLabel(l)} — {fmt(getLinePrice(attributaireResult.company.id, l.id))}</li>
                  ))}
                </ul>
                <p className="mt-2 font-semibold">
                  Montant final HT : {fmt(attributaireResult.priceTotal)}
                </p>
              </div>

              {/* Variante info if any variante enabled */}
              {activeLotLines.some((l) => l.type === "VARIANTE" && enabledLines[l.id]) && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
                  <p className="font-semibold text-blue-800 mb-1">📋 Variante retenue</p>
                  <p className="text-blue-700">
                    Le scénario retenu inclut une variante proposée par le candidat. L'analyse confirme que cette variante
                    présente un avantage technique et/ou économique par rapport à la solution de base.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Motif d'éviction for excluded companies */}
          {(() => {
            const excludedCompanies = activeCompanies.filter((c) => c.status === "ecartee");
            const nonRetenues = activeCompanies.filter((c) => c.status !== "ecartee" && getNegotiationDecision(c.id) === "non_retenue");
            if (excludedCompanies.length === 0 && nonRetenues.length === 0) return null;
            return (
              <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm">
                <p className="font-semibold text-orange-800 mb-2">⚠️ Motifs d'éviction / non-attribution</p>
                {excludedCompanies.map((c) => (
                  <p key={c.id} className="text-orange-700">
                    <span className="font-medium">{c.name}</span> — Écartée : {c.exclusionReason || "Motif non précisé"}
                  </p>
                ))}
                {nonRetenues.map((c) => (
                  <p key={c.id} className="text-orange-700">
                    <span className="font-medium">{c.name}</span> — Non retenue
                  </p>
                ))}
              </div>
            );
          })()}

          {/* Non-attribution motif */}
          {nobodyRetained && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-destructive">Motif de non-attribution (obligatoire)</label>
              <Textarea
                className="text-sm border-destructive"
                rows={3}
                placeholder="Conformément à l'article L2152-4 du Code de la commande publique, le pouvoir adjudicateur déclare sans suite la présente consultation..."
                value={evictionMotif}
                onChange={(e) => setEvictionMotif(e.target.value)}
                maxLength={3000}
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Commentaire technique (optionnel)</label>
            <Textarea
              className="text-sm"
              rows={3}
              placeholder="Commentaire libre sur la décision..."
              value={validationComment}
              onChange={(e) => setValidationComment(e.target.value)}
              maxLength={3000}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setValidationDialogOpen(false)}>Annuler</Button>
            <Button
              onClick={() => {
                if (version) {
                  validateVersion(version.id);
                  setValidationDialogOpen(false);
                }
              }}
              disabled={nobodyRetained && !evictionMotif.trim()}
            >
              Confirmer la validation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attributaire declaration dialog */}
      <Dialog open={attributaireDialogOpen} onOpenChange={setAttributaireDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-green-600" />
              Déclaration de l'attributaire
            </DialogTitle>
            <DialogDescription>Récapitulatif du scénario retenu</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-muted/30 p-4 text-sm leading-relaxed">
            {scenarioDescription}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAttributaireDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === PHASE 1: Comparaison visuelle === */}
      {hasScenarioOptions && (
        <Card className="border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-800">
              <Settings2 className="h-4 w-4" />
              Phase 1 — Comparaison visuelle
            </CardTitle>
            <CardDescription className="text-xs">
              Comparez l'impact de chaque option sur le classement. Ces lignes apparaissent en bas du tableau à titre indicatif uniquement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6">
              {hasPSE && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">PSE</span>
                  {pseLines.map((l) => (
                    <div key={l.id} className="flex items-center gap-2">
                      <Switch
                        checked={!!compareLines[l.id]}
                        onCheckedChange={(v) => setCompareLines((prev) => ({ ...prev, [l.id]: v }))}
                      />
                      <span className="text-sm">{getLineLabel(l)}</span>
                    </div>
                  ))}
                </div>
              )}
              {hasVariante && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Variantes</span>
                  {varianteLines.map((l) => (
                    <div key={l.id} className="flex items-center gap-2">
                      <Switch
                        checked={!!compareLines[l.id]}
                        onCheckedChange={(v) => setCompareLines((prev) => ({ ...prev, [l.id]: v }))}
                      />
                      <span className="text-sm">{getLineLabel(l)}</span>
                    </div>
                  ))}
                </div>
              )}
              {hasTO && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tranches Optionnelles</span>
                  {toLines.map((l) => (
                    <div key={l.id} className="flex items-center gap-2">
                      <Switch
                        checked={!!compareLines[l.id]}
                        onCheckedChange={(v) => setCompareLines((prev) => ({ ...prev, [l.id]: v }))}
                      />
                      <span className="text-sm">{getLineLabel(l)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* === PHASE 2: Scénario d'attribution retenu === */}
      {hasScenarioOptions && (
        <Card className="border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-green-800">
              <Award className="h-4 w-4" />
              Phase 2 — Scénario d'attribution retenu
            </CardTitle>
            <CardDescription className="text-xs">
              Décidez quelles options sont retenues pour l'attribution. Le classement officiel et le montant global sont recalculés en temps réel.
              <span className="block mt-1 font-semibold">Total = Base + Σ(Options retenues)</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[...pseLines, ...varianteLines, ...toLines].map((l) => {
                const enabled = !!enabledLines[l.id];
                return (
                  <div
                    key={l.id}
                    className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                      enabled
                        ? "border-green-300 bg-green-50"
                        : "border-border bg-background"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{getLineLabel(l)}</span>
                      <span className="text-xs text-muted-foreground">
                        {l.type === "PSE" ? "Plus-value" : l.type === "VARIANTE" ? "Variante" : "Tranche optionnelle"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={enabled ? "default" : "outline"}
                        className={`cursor-pointer select-none text-xs px-3 py-1 ${
                          enabled
                            ? "bg-green-600 hover:bg-green-700"
                            : "hover:bg-muted"
                        }`}
                        onClick={() => !isReadOnly && !isValidated && toggleLine(l.id)}
                      >
                        {enabled ? "OUI" : "NON"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Résumé du scénario */}
            <div className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <span className="font-semibold">Scénario actuel : </span>
              <span className="text-muted-foreground">
                Solution de Base
                {[...pseLines, ...varianteLines, ...toLines]
                  .filter((l) => enabledLines[l.id])
                  .map((l) => ` + ${getLineLabel(l)}`)
                  .join("")}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classement Général</CardTitle>
          <CardDescription>Les entreprises écartées sont affichées mais non classées.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rang</TableHead>
                <TableHead>Entreprise</TableHead>
                <TableHead className="text-right">Technique / {valueTechWeight}</TableHead>
                {envWeight > 0 && <TableHead className="text-right">Enviro. / {envWeight}</TableHead>}
                {planWeight > 0 && <TableHead className="text-right">Planning / {planWeight}</TableHead>}
                <TableHead className="text-right">Prix / {prixWeight}</TableHead>
                <TableHead className="text-right">Montant Scénario</TableHead>
                <TableHead className="text-right">Globale / {maxTotal}</TableHead>
                <TableHead className="text-center">Statut / Décision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => {
                const isExcluded = row.company.status === "ecartee";
                if (!isExcluded) rank++;
                const decision = getNegotiationDecision(row.company.id);
                const availableDecisions = getAvailableDecisions(row.company.id);
                return (
                  <TableRow key={row.company.id} className={isExcluded ? "opacity-50" : ""}>
                    <TableCell className="font-semibold">{isExcluded ? "—" : rank}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-0.5">
                        <span>{row.company.id}. {row.company.name}</span>
                        {row.missingPrices.length > 0 && (
                          <span className="text-xs text-orange-600 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Prix manquant : {row.missingPrices.join(", ")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{isExcluded ? "—" : row.techniqueScore.toFixed(1)}</TableCell>
                    {envWeight > 0 && (
                      <TableCell className="text-right">{isExcluded ? "—" : row.envScore.toFixed(1)}</TableCell>
                    )}
                    {planWeight > 0 && (
                      <TableCell className="text-right">{isExcluded ? "—" : row.planningScore.toFixed(1)}</TableCell>
                    )}
                    <TableCell className="text-right">{isExcluded ? "—" : row.priceScore.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{isExcluded ? "—" : fmt(row.priceTotal)}</TableCell>
                    <TableCell className="text-right font-bold">{isExcluded ? "—" : row.globalScore.toFixed(1)}</TableCell>
                    <TableCell className="text-center">
                      {isExcluded ? (
                        <HoverCard>
                          <HoverCardTrigger asChild>
                            <Badge variant="destructive" className="cursor-help max-w-[180px] truncate">
                              Écartée{row.company.exclusionReason ? ` — ${row.company.exclusionReason.substring(0, 20)}${row.company.exclusionReason.length > 20 ? "…" : ""}` : ""}
                            </Badge>
                          </HoverCardTrigger>
                          {row.company.exclusionReason && (
                            <HoverCardContent className="text-sm">
                              <p className="font-semibold mb-1">Motif d'éviction :</p>
                              <p>{row.company.exclusionReason}</p>
                            </HoverCardContent>
                          )}
                        </HoverCard>
                      ) : (
                        <Select
                          value={decision}
                          onValueChange={(v) => setNegotiationDecision(row.company.id, v as NegotiationDecision)}
                          disabled={isReadOnly || isValidated}
                        >
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableDecisions.map((d) => (
                              <SelectItem key={d} value={d}>
                                {NEGOTIATION_DECISION_LABELS[d]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Comparison rows — individual option lines */}
              {comparisonRows.length > 0 && (
                <>
                  <TableRow className="bg-muted/20">
                    <TableCell colSpan={7 + (envWeight > 0 ? 1 : 0) + (planWeight > 0 ? 1 : 0)} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider py-2">
                      Lignes de comparaison (Base + Option individuelle)
                    </TableCell>
                  </TableRow>
                  {comparisonRows.map((row) => (
                    <TableRow key={row.key} className="bg-muted/10 italic text-muted-foreground">
                      <TableCell className="font-semibold">—</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col gap-0.5">
                          <span>{row.companyName} — {row.optionLabel}</span>
                          {row.hasMissing && (
                            <span className="text-xs text-orange-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Prix manquant
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{row.techniqueScore.toFixed(1)}</TableCell>
                      {envWeight > 0 && <TableCell className="text-right">{row.envScore.toFixed(1)}</TableCell>}
                      {planWeight > 0 && <TableCell className="text-right">{row.planningScore.toFixed(1)}</TableCell>}
                      <TableCell className="text-right">{row.priceScore.toFixed(1)}</TableCell>
                      <TableCell className="text-right">{fmt(row.priceTotal)}</TableCell>
                      <TableCell className="text-right font-bold">{row.globalScore.toFixed(1)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-xs">Comparaison</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SynthesePage;
