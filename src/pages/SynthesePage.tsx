import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NOTATION_VALUES, NegotiationDecision, NEGOTIATION_DECISION_LABELS, getVersionDisplayLabel } from "@/types/project";
import { useMemo, useState } from "react";
import {
  Lock, CheckCircle, ShieldCheck, Unlock, AlertTriangle, Award,
  Settings2, MessageSquare, Plus, GitBranch, ArrowRight,
} from "lucide-react";
import { useAnalysisContext } from "@/hooks/useAnalysisContext";
import { useNavigate } from "react-router-dom";
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
    activateQuestionnaire, createVersion, switchVersion,
  } = useProjectStore();
  const navigate = useNavigate();
  const lot = project.lots[project.currentLotIndex];
  const { activeCompanies, version, isReadOnly, isNego, negoLabel, negoRound } = useAnalysisContext();
  const { isValid: weightingValid, total: weightingTotal } = useWeightingValid();
  const { weightingCriteria, lotLines } = lot;

  const technicalCriteria = weightingCriteria.filter((c) => c.id !== "prix");
  const prixCriterion = weightingCriteria.find((c) => c.id === "prix");
  const prixWeight = prixCriterion?.weight ?? 40;
  const activeLotLines = lotLines.filter((l) => l.label.trim() !== "");

  const valueTechnique = technicalCriteria.filter((c) => c.id !== "environnemental" && c.id !== "planning");
  const envCriterion = technicalCriteria.find((c) => c.id === "environnemental");
  const planCriterion = technicalCriteria.find((c) => c.id === "planning");

  // Option line groups
  const baseLines = activeLotLines.filter((l) => !l.type);
  const pseLines = activeLotLines.filter((l) => l.type === "PSE");
  const varianteLines = activeLotLines.filter((l) => l.type === "VARIANTE");
  const toLines = activeLotLines.filter((l) => l.type === "T_OPTIONNELLE");

  const getLineLabel = (line: typeof activeLotLines[0]) => {
    if (!line.type) return line.label;
    const group = activeLotLines.filter((l) => l.type === line.type);
    const idx = group.indexOf(line) + 1;
    const prefix = line.type === "PSE" ? "PSE" : line.type === "VARIANTE" ? "Variante" : "TO";
    return `${prefix} ${idx}${line.label ? ` — ${line.label}` : ""}`;
  };

  // enabledLines = which options are active in the main scenario (base = always included via lotLineId=0)
  const [enabledLines, setEnabledLines] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    for (const l of activeLotLines) {
      // TCs enabled by default, PSE/Variantes excluded by default
      init[l.id] = l.type === "T_OPTIONNELLE";
    }
    return init;
  });

  const [compareLines, setCompareLines] = useState<Record<number, boolean>>({});
  const [negoDate, setNegoDate] = useState(new Date().toISOString().split("T")[0]);
  const [attributaireDialogOpen, setAttributaireDialogOpen] = useState(false);
  const [validationComment, setValidationComment] = useState("");
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [evictionMotif, setEvictionMotif] = useState("");
  // Choix OUI / NON explicite pour chaque PSE et Variante
  const [pseVarianteChoice, setPseVarianteChoice] = useState<Record<number, "oui" | "non" | null>>({});

  const toggleLine = (id: number, lineType?: string | null) => {
    setEnabledLines((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const hasPSE = pseLines.length > 0;
  const hasVariante = varianteLines.length > 0;
  const hasTO = toLines.length > 0;
  const hasScenarioOptions = hasPSE || hasVariante || hasTO;

  const versionHasAttributaire = version ? hasAttributaire(version.id) : false;
  const isValidated = version?.validated ?? false;
  const displayLabel = version ? getVersionDisplayLabel(version.label) : "";

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

  // Bloque la validation attributaire si PSE ou Variantes non renseignées (OUI/NON)
  // Cas négociation : pas de blocage — seule la phase finale avec attributaire bloque.
  const pseVarianteBlocksValidation = useMemo(() => {
    if (!hasAnyAttributaire) return false;
    if (pseLines.length === 0 && varianteLines.length === 0) return false;
    // Bloque si au moins une ligne PSE ou Variante n'a pas de choix OUI/NON explicite
    const allPseVarianteLines = [...pseLines, ...varianteLines];
    return allPseVarianteLines.some((l) => !pseVarianteChoice[l.id]);
  }, [hasAnyAttributaire, pseLines, varianteLines, pseVarianteChoice]);

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

  // Compute TF total (sum of base lines) + enabled TCs
  const getCompanyScenarioTotal = (companyId: number) => {
    if (!version) return 0;
    // Sum all base (non-typed) lines
    let total = baseLines.reduce((sum, l) => sum + getLinePrice(companyId, l.id), 0);
    // Fallback: old storage uses lotLineId=0 for the global TF total
    if (total === 0) {
      const entry = version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === 0);
      total = (entry?.dpgf1 ?? 0) + (entry?.dpgf2 ?? 0);
    }
    // Add enabled option lines (PSE/Variante/TO)
    for (const line of activeLotLines) {
      if (line.type && enabledLines[line.id]) {
        total += getLinePrice(companyId, line.id);
      }
    }
    return total;
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

    const companyPriceTotals: Record<number, number> = {};
    const missingPrices: Record<number, string[]> = {};

    for (const company of activeCompanies) {
      if (company.status === "ecartee") continue;
      const scenarioTotal = getCompanyScenarioTotal(company.id);
      const missing: string[] = [];

      for (const line of activeLotLines) {
        if (line.type && enabledLines[line.id]) {
          if (!hasPrice(company.id, line.id)) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanies, technicalCriteria, version, prixWeight, activeLotLines, enabledLines]);

  const sorted = useMemo(() => {
    return [...results].sort((a, b) => {
      if (a.company.status === "ecartee" && b.company.status !== "ecartee") return 1;
      if (a.company.status !== "ecartee" && b.company.status === "ecartee") return -1;
      return b.globalScore - a.globalScore;
    });
  }, [results]);

  // Active options from compareLines toggles (PSE + Variantes only, no TO)
  const activeCompareLines = useMemo(() => {
    return [...pseLines, ...varianteLines].filter((l) => !!compareLines[l.id]);
  }, [pseLines, varianteLines, compareLines]);

  // Results augmentés avec les options actives des toggles de comparaison
  const scenarioResults = useMemo(() => {
    if (!version || activeCompareLines.length === 0) return results;

    // Recalculate price totals with active compare lines added
    const eligibleCompanies = activeCompanies.filter((c) => c.status !== "ecartee");
    const augmentedTotals: Record<number, number> = {};
    const augmentedMissing: Record<number, string[]> = {};

    for (const company of eligibleCompanies) {
      const baseTotal = getCompanyScenarioTotal(company.id);
      let extra = 0;
      const missing: string[] = [];
      for (const line of activeCompareLines) {
        extra += getLinePrice(company.id, line.id);
        if (!hasPrice(company.id, line.id)) missing.push(getLineLabel(line));
      }
      augmentedTotals[company.id] = baseTotal + extra;
      augmentedMissing[company.id] = missing;
    }

    const validPrices = Object.values(augmentedTotals).filter((v) => v > 0);
    const minP = validPrices.length > 0 ? Math.min(...validPrices) : 0;

    return results.map((row) => {
      if (row.company.status === "ecartee") return row;
      const pt = augmentedTotals[row.company.id] ?? row.priceTotal;
      const ps = pt > 0 ? (minP / pt) * prixWeight : 0;
      const gs = row.techScore + ps;
      return {
        ...row,
        priceTotal: pt,
        priceScore: ps,
        globalScore: gs,
        missingPrices: augmentedMissing[row.company.id] ?? row.missingPrices,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, activeCompareLines, version, prixWeight]);

  // Rang recalculé depuis scenarioResults (sans déplacer les lignes)
  const scenarioSorted = useMemo(() => {
    return [...scenarioResults].sort((a, b) => {
      if (a.company.status === "ecartee" && b.company.status !== "ecartee") return 1;
      if (a.company.status !== "ecartee" && b.company.status === "ecartee") return -1;
      return b.globalScore - a.globalScore;
    });
  }, [scenarioResults]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attributaireResult, activeLotLines, enabledLines]);

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

  return (
    <div className="space-y-6">

      {/* ═══════════════════════════════════════════════════ */}
      {/* TITRE + BADGES                                      */}
      {/* ═══════════════════════════════════════════════════ */}
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
          Classement global (technique + prix). Total sur {maxTotal} pts.{" "}
          {hasScenarioOptions && "Total = Base + Σ(Tranches Conditionnelles actives)."}
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* SECTION 6.1 — CLASSEMENT GÉNÉRAL                   */}
      {/* ═══════════════════════════════════════════════════ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classement Général</CardTitle>
          <CardDescription>
            Règle de calcul : TF + Σ(Tranches Conditionnelles). Les entreprises écartées sont affichées mais non classées.
          </CardDescription>
        </CardHeader>


        <CardContent className="overflow-x-auto pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rang</TableHead>
                <TableHead>Entreprise</TableHead>
                <TableHead className="text-right">Technique / {valueTechWeight}</TableHead>
                {envWeight > 0 && <TableHead className="text-right">Enviro. / {envWeight}</TableHead>}
                {planWeight > 0 && <TableHead className="text-right">Planning / {planWeight}</TableHead>}
                <TableHead className="text-right">Prix / {prixWeight}</TableHead>
                <TableHead className="text-right">Montant scénario</TableHead>
                <TableHead className="text-right">Globale / {maxTotal}</TableHead>
                <TableHead className="text-center">Statut / Décision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenarioResults.map((row) => {
                const isExcluded = row.company.status === "ecartee";
                // Rang recalculé depuis scenarioSorted (réactif aux toggles)
                const rankInSorted = isExcluded
                  ? null
                  : scenarioSorted.filter((r) => r.company.status !== "ecartee").findIndex((r) => r.company.id === row.company.id) + 1;
                const decision = getNegotiationDecision(row.company.id);
                const availableDecisions = getAvailableDecisions(row.company.id);
                return (
                  <TableRow key={row.company.id} className={isExcluded ? "opacity-50" : ""}>
                    <TableCell className="font-semibold">{isExcluded ? "—" : rankInSorted}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-0.5">
                        <span>{row.company.id}. {row.company.name}</span>
                        {activeCompareLines.length > 0 && !isExcluded && (
                          <span className="text-xs text-muted-foreground italic">
                            Base{activeCompareLines.map((l) => ` + ${getLineLabel(l)}`).join("")}
                          </span>
                        )}
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
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════ */}
      {/* SECTION 6.2 — SCÉNARIOS DE COMPARAISON             */}
      {/* ═══════════════════════════════════════════════════ */}
      {(hasPSE || hasVariante) && (
        <Card className="border-blue-200 dark:border-blue-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-800 dark:text-blue-300">
              <Settings2 className="h-4 w-4" />
              Comparaison de Scénarios
            </CardTitle>
            <CardDescription className="text-xs">
              Simulez l'impact des PSE et Variantes sur le classement. Les Tranches Optionnelles sont intégrées à l'analyse de base uniquement.
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
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* DÉCISION PSE / VARIANTES — OUI / NON               */}
      {/* Affiché si PSE ou Variantes existent               */}
      {/* ═══════════════════════════════════════════════════ */}
      {(hasPSE || hasVariante) && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <CheckCircle className="h-4 w-4" />
              Décision PSE / Variantes — Retenues au marché ?
            </CardTitle>
            <CardDescription className="text-xs">
              Indiquez pour chaque PSE et Variante si elle est retenue (OUI) ou non retenue (NON) dans le marché final.
              Ce choix est obligatoire avant la validation lorsqu'un attributaire est désigné.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {hasPSE && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">PSE</span>
                  <div className="flex flex-col gap-2">
                    {pseLines.map((l) => {
                      const choice = pseVarianteChoice[l.id] ?? null;
                      return (
                        <div key={l.id} className="flex items-center gap-3">
                          <span className="text-sm min-w-[220px]">{getLineLabel(l)}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => !isReadOnly && !isValidated && setPseVarianteChoice((prev) => ({ ...prev, [l.id]: prev[l.id] === "oui" ? null : "oui" }))}
                              disabled={isReadOnly || isValidated}
                              className={`rounded-md border px-4 py-1.5 text-xs font-semibold transition-colors ${
                                choice === "oui"
                                  ? "border-green-500 bg-green-500 text-white"
                                  : "border-border bg-background text-muted-foreground hover:bg-muted"
                              } ${isReadOnly || isValidated ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                            >
                              OUI
                            </button>
                            <button
                              onClick={() => !isReadOnly && !isValidated && setPseVarianteChoice((prev) => ({ ...prev, [l.id]: prev[l.id] === "non" ? null : "non" }))}
                              disabled={isReadOnly || isValidated}
                              className={`rounded-md border px-4 py-1.5 text-xs font-semibold transition-colors ${
                                choice === "non"
                                  ? "border-destructive bg-destructive text-destructive-foreground"
                                  : "border-border bg-background text-muted-foreground hover:bg-muted"
                              } ${isReadOnly || isValidated ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                            >
                              NON
                            </button>
                          </div>
                          {choice === null && hasAnyAttributaire && (
                            <span className="text-xs text-orange-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> À renseigner
                            </span>
                          )}
                          {choice !== null && (
                            <span className={`text-xs font-medium ${choice === "oui" ? "text-green-700" : "text-destructive"}`}>
                              {choice === "oui" ? "✓ Retenue" : "✗ Non retenue"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {hasVariante && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Variantes</span>
                  <div className="flex flex-col gap-2">
                    {varianteLines.map((l) => {
                      const choice = pseVarianteChoice[l.id] ?? null;
                      return (
                        <div key={l.id} className="flex items-center gap-3">
                          <span className="text-sm min-w-[220px]">{getLineLabel(l)}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => !isReadOnly && !isValidated && setPseVarianteChoice((prev) => ({ ...prev, [l.id]: prev[l.id] === "oui" ? null : "oui" }))}
                              disabled={isReadOnly || isValidated}
                              className={`rounded-md border px-4 py-1.5 text-xs font-semibold transition-colors ${
                                choice === "oui"
                                  ? "border-green-500 bg-green-500 text-white"
                                  : "border-border bg-background text-muted-foreground hover:bg-muted"
                              } ${isReadOnly || isValidated ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                            >
                              OUI
                            </button>
                            <button
                              onClick={() => !isReadOnly && !isValidated && setPseVarianteChoice((prev) => ({ ...prev, [l.id]: prev[l.id] === "non" ? null : "non" }))}
                              disabled={isReadOnly || isValidated}
                              className={`rounded-md border px-4 py-1.5 text-xs font-semibold transition-colors ${
                                choice === "non"
                                  ? "border-destructive bg-destructive text-destructive-foreground"
                                  : "border-border bg-background text-muted-foreground hover:bg-muted"
                              } ${isReadOnly || isValidated ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                            >
                              NON
                            </button>
                          </div>
                          {choice === null && hasAnyAttributaire && (
                            <span className="text-xs text-orange-600 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> À renseigner
                            </span>
                          )}
                          {choice !== null && (
                            <span className={`text-xs font-medium ${choice === "oui" ? "text-green-700" : "text-destructive"}`}>
                              {choice === "oui" ? "✓ Retenue" : "✗ Non retenue"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* SECTION VALIDATION DE LA PHASE               */}
      {/* ═══════════════════════════════════════════════════ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-600" />
            Validation de la phase
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Avertissement aucune attribution */}
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

          {/* Alerte blocage PSE/Variantes non renseignées pour attributaire */}
          {pseVarianteBlocksValidation && !isValidated && !isReadOnly && (
            <div className="rounded-md border border-orange-300 bg-orange-50 p-4 mb-2">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
                <span className="text-sm font-semibold text-orange-800">Choix PSE / Variantes obligatoire</span>
              </div>
              <p className="text-xs text-orange-700">
                Un attributaire est désigné. Veuillez renseigner OUI ou NON pour chaque PSE et Variante dans le pavé « Décision PSE / Variantes » ci-dessus avant de valider.
              </p>
            </div>
          )}

          {/* Boutons d'action */}
          <div className="flex items-center gap-3 flex-wrap">
            {version && allDecided && !isValidated && !isReadOnly && (
              <Button
                className="gap-2 bg-green-600 hover:bg-green-700"
                onClick={() => setValidationDialogOpen(true)}
                disabled={pseVarianteBlocksValidation}
                title={pseVarianteBlocksValidation ? "Renseignez OUI/NON pour chaque PSE et Variante d'abord" : undefined}
              >
                <CheckCircle className="h-4 w-4" />
                {versionHasAttributaire ? "Valider et clôturer la phase — Attribuer" : "Valider la Synthèse et clôturer la phase"}
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

            {/* Bouton questionnaire de négociation */}
            {version && !isNego && hasAnyRetenue && !isValidated && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  const retainedIds = Object.entries(version.negotiationDecisions ?? {})
                    .filter(([, d]) => d === "retenue")
                    .map(([id]) => Number(id));
                  activateQuestionnaire(version.id, retainedIds);
                }}
              >
                <MessageSquare className="h-4 w-4" />
                Préparer le questionnaire de négociation
              </Button>
            )}

            {/* Lien direct questionnaire si déjà en négo */}
            {version && isNego && version.questionnaire?.activated && negoRound && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => navigate(`/nego/${negoRound}/questions`)}
              >
                <MessageSquare className="h-4 w-4" />
                Voir le questionnaire de négociation
              </Button>
            )}

            {!allDecided && !isValidated && !isReadOnly && (
              <p className="text-xs text-muted-foreground">
                Attribuez une décision à chaque entreprise éligible pour pouvoir valider.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ═══════════════════════════════════════════════════ */}
      {/* SECTION 6.4 — CYCLES DE NÉGOCIATION                */}
      {/* Visible uniquement si une négociation est en cours */}
      {/* ═══════════════════════════════════════════════════ */}
      {(() => {
        const { versions, currentVersionId } = lot;
        const currentVersion = versions.find((v) => v.id === currentVersionId);
        const currentHasAttributaire = currentVersion ? hasAttributaire(currentVersion.id) : false;
        const currentIsValidated = currentVersion?.validated ?? false;
        const canCreate = versions.length < 3;
        const canCreateNego = canCreate && currentIsValidated && !currentHasAttributaire;
        const nextIndex = versions.length;
        const nextLabel = `V${nextIndex}`;
        const nextDisplayLabel = getVersionDisplayLabel(nextLabel);
        const negoVersions = versions.slice(1);

        // N'afficher que si une négo existe déjà ou peut être créée
        if (negoVersions.length === 0 && !canCreateNego) return null;

        return (
          <Card className="border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                <GitBranch className="h-4 w-4" />
                Gestion des cycles de négociation
              </CardTitle>
              <CardDescription className="text-xs">
                Créez une phase de négociation après validation de l'analyse. Les données précédentes seront figées en lecture seule.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canCreateNego && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button className="gap-2" size="sm">
                      <Plus className="h-4 w-4" />
                      Créer {nextDisplayLabel}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Attention — Blocage définitif de la phase actuelle
                      </AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-3">
                          <p>
                            La création de <strong>{nextDisplayLabel}</strong> va <strong>verrouiller définitivement en lecture seule</strong> la
                            phase actuelle. Seules les entreprises retenues seront reprises dans la nouvelle phase.
                          </p>
                          <div>
                            <Label htmlFor="nego-date-synth" className="text-sm font-medium">
                              Date de l'analyse (obligatoire)
                            </Label>
                            <Input
                              id="nego-date-synth"
                              type="date"
                              value={negoDate}
                              onChange={(e) => setNegoDate(e.target.value)}
                              className="mt-1 w-48"
                            />
                          </div>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => createVersion(nextLabel, negoDate)}
                        disabled={!negoDate}
                      >
                        Confirmer et créer {nextDisplayLabel}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {/* Timeline des versions */}
              {(negoVersions.length > 0 || versions.length > 0) && (
                <div className="grid gap-3">
                  {versions.map((v, idx) => {
                    const isCurrent = v.id === currentVersionId;
                    const vHasAttributaire = hasAttributaire(v.id);
                    const displayLbl = getVersionDisplayLabel(v.label);
                    return (
                      <div
                        key={v.id}
                        className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                          isCurrent ? "ring-2 ring-primary bg-primary/5" : "bg-background"
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{displayLbl}</span>
                          {isCurrent && <Badge variant="default" className="text-xs">Active</Badge>}
                          {v.validated && (
                            <Badge variant="default" className="bg-green-600 text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />Validée
                            </Badge>
                          )}
                          {v.frozen && !v.validated && (
                            <Badge variant="secondary" className="text-xs">
                              <Lock className="h-3 w-3 mr-1" />Figée
                            </Badge>
                          )}
                          {vHasAttributaire && <Badge className="text-xs bg-amber-500">Attributaire</Badge>}
                          {idx > 0 && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              Négociation {idx}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{v.analysisDate || "—"}</span>
                          {!isCurrent && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-xs"
                              onClick={() => {
                                switchVersion(v.id);
                                if (idx > 0) navigate(`/nego/${idx}/synthese`);
                                else navigate("/synthese");
                              }}
                            >
                              <ArrowRight className="h-3 w-3" />
                              Basculer
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* ═══════════════════════════════════════════════════ */}
      {/* MODALES                                             */}
      {/* ═══════════════════════════════════════════════════ */}

      {/* Validation dialog */}
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

          {attributaireResult && (
            <div className="space-y-3">
              <div className="rounded-md border border-green-300 bg-green-50 p-4 text-sm leading-relaxed">
                <p className="font-semibold mb-2 text-green-800">🏆 Attribution pressentie</p>
                <p>{scenarioDescription}</p>
                <p className="mt-2 text-muted-foreground">
                  Classée au rang n°1 avec une note globale de {attributaireResult.globalScore.toFixed(1)} / {maxTotal} pts.
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
                <p className="font-semibold mb-1">Détail du scénario retenu :</p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  <li>Solution de Base (Tranche Ferme)</li>
                  {activeLotLines.filter((l) => l.type && enabledLines[l.id]).map((l) => (
                    <li key={l.id}>{getLineLabel(l)} — {fmt(getLinePrice(attributaireResult.company.id, l.id))}</li>
                  ))}
                </ul>
                <p className="mt-2 font-semibold">Montant final HT : {fmt(attributaireResult.priceTotal)}</p>
              </div>
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

          {nobodyRetained && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-destructive">Motif de non-attribution (obligatoire)</label>
              <Textarea
                className="text-sm border-destructive"
                rows={3}
                placeholder="Conformément à l'article L2152-4 du Code de la commande publique..."
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

      {/* Attributaire dialog */}
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

    </div>
  );
};

export default SynthesePage;
