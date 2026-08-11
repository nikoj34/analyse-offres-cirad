import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NOTATION_VALUES, NegotiationDecision, NEGOTIATION_DECISION_LABELS, getVersionDisplayLabel, getSyntheseLabel, type Company, type VarianteLine } from "@/types/project";
import React, { useEffect, useMemo, useState } from "react";
import {
  Lock, CheckCircle, ShieldCheck, Unlock, AlertTriangle, Award,
  Settings2, MessageSquare, Plus, GitBranch, ArrowRight, Trash2, FileText,
} from "lucide-react";
import { useAnalysisContext } from "@/hooks/useAnalysisContext";
import { getCompanyColor, getCompanyBgColor } from "@/lib/companyColors";
import { useNavigate } from "react-router-dom";
import { useWeightingValid } from "@/hooks/useWeightingValid";
import { getCompanyTotalGlobalEvalue } from "@/lib/scenarioTotal";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { exportRaoWord } from "@/lib/exportRaoWord";

const DECISION_OPTIONS: NegotiationDecision[] = ["non_defini", "retenue", "non_retenue", "questions_reponses", "attributaire", "rejete_oab", "rejete_irreguliere", "rejete_inacceptable", "retenue_nego_2"];

const SynthesePage = () => {
  const {
    project, setNegotiationDecision, getNegotiationDecision,
    validateVersion, unvalidateVersion, hasAttributaire,
    activateQuestionnaire, createVersion, createNextNegotiationPhase, switchVersion, deleteVersion,
    updateStatutVariante,
    updateDecisionVariante,
    setAttributionDetails,
    updateCompany,
  } = useProjectStore();
  const navigate = useNavigate();
  const lot = project.lots[project.currentLotIndex];
  const { activeCompanies, version, versionIndex, isReadOnly, isNego, negoLabel, negoRound } = useAnalysisContext();
  const { isValid: weightingValid, total: weightingTotal } = useWeightingValid();
  const { weightingCriteria, lotLines } = lot;

  const technicalCriteria = weightingCriteria.filter((c) => c.id !== "prix" && c.weight > 0);
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
    const toLabel = line.type === "T_OPTIONNELLE"
      ? (idx === 1 ? "Tranche Optionnelle" : `Tranche Optionnelle ${idx - 1}`)
      : null;
    const prefix = toLabel !== null ? toLabel : (line.type === "PSE" ? `PSE ${idx}` : `Variante ${idx}`);
    return `${prefix}${line.label ? ` — ${line.label}` : ""}`;
  };

  /** Libellé court pour le Classement général uniquement (PSE 1, PSE 2… sans le nom de la prestation) */
  const getLineLabelShort = (line: typeof activeLotLines[0]) => {
    if (!line.type) return line.label;
    const group = activeLotLines.filter((l) => l.type === line.type);
    const idx = group.indexOf(line) + 1;
    const toLabel = line.type === "T_OPTIONNELLE"
      ? (idx === 1 ? "Tranche Optionnelle" : `Tranche Optionnelle ${idx - 1}`)
      : null;
    const prefix = toLabel !== null ? toLabel : (line.type === "PSE" ? `PSE ${idx}` : `Variante ${idx}`);
    if (line.type === "PSE") return prefix;
    return `${prefix}${line.label ? ` — ${line.label}` : ""}`;
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

  const [negoDate, setNegoDate] = useState(new Date().toISOString().split("T")[0]);
  const [attributaireDialogOpen, setAttributaireDialogOpen] = useState(false);
  const [attributaireBlockedDialogOpen, setAttributaireBlockedDialogOpen] = useState(false);
  /** Modale obligatoire : choix PSE/TO avant d'enregistrer la décision Attributaire */
  const [isPseAttributionModalOpen, setIsPseAttributionModalOpen] = useState(false);
  const [pendingAttributionCompanyId, setPendingAttributionCompanyId] = useState<number | null>(null);
  const [pendingAttributionChoices, setPendingAttributionChoices] = useState<Record<number, "oui" | "non">>({});
  const [validationComment, setValidationComment] = useState("");
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [evictionMotif, setEvictionMotif] = useState("");
  const [exportingRao, setExportingRao] = useState(false);
  // Choix OUI / NON pour chaque PSE et Variante : détermine ce qui est inclus dans la comparaison (montant scénario, notes, classement). OUI par défaut = toutes incluses.
  const [pseVarianteChoice, setPseVarianteChoice] = useState<Record<number, "oui" | "non" | null>>(() => {
    const init: Record<number, "oui" | "non" | null> = {};
    for (const l of [...pseLines, ...varianteLines]) {
      init[l.id] = "oui";
    }
    return init;
  });

  const handleExportRao = async () => {
    if (!version) return;
    setExportingRao(true);
    try {
      await exportRaoWord({
        projectName: project.info.name,
        marketRef: project.info.marketRef,
        analysisDate: project.info.analysisDate,
        author: project.info.author,
        lotLabel: lot.label,
        lotNumber: lot.lotNumber,
        lotAnalyzed: lot.lotAnalyzed,
        versionLabel: version.label,
        weightingCriteria,
        companies: activeCompanies,
        sortedResults: scenarioSorted.map((r) => ({
          company: r.company,
          techScore: r.techScore,
          priceScore: r.priceScore,
          priceTotal: r.priceTotal,
          globalScore: r.globalScore,
        })),
        technicalNotes: version.technicalNotes,
        decisions: version.negotiationDecisions ?? {},
        attributaireResult: attributaireResult
          ? {
              company: attributaireResult.company,
              techScore: attributaireResult.techScore,
              priceScore: attributaireResult.priceScore,
              priceTotal: attributaireResult.priceTotal,
              globalScore: attributaireResult.globalScore,
            }
          : undefined,
        scenarioDescription,
        hasQuestionnaire: !!(version.questionnaire?.activated),
      });
    } finally {
      setExportingRao(false);
    }
  };

  const toggleLine = (id: number, lineType?: string | null) => {
    setEnabledLines((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Lors d’un changement de lot, mettre OUI par défaut pour les PSE/Variantes du lot courant
  useEffect(() => {
    const allPseVar = [...pseLines, ...varianteLines];
    if (allPseVar.length === 0) return;
    setPseVarianteChoice((prev) => {
      let next: Record<number, "oui" | "non" | null> | null = null;
      for (const l of allPseVar) {
        if (prev[l.id] === undefined || prev[l.id] === null) {
          if (!next) next = { ...prev };
          next[l.id] = "oui";
        }
      }
      return next ?? prev;
    });
  }, [lot.id, pseLines.length, varianteLines.length]);

  const hasPSE = pseLines.length > 0;
  const hasVariante = varianteLines.length > 0;
  const hasTO = toLines.length > 0;
  const hasScenarioOptions = hasPSE || hasVariante || hasTO;

  /** Lignes à afficher dans la modale d'attribution : PSE uniquement (les tranches optionnelles sont incluses d'office au contrat). */
  const attributionModalLines = useMemo(
    () => [...pseLines],
    [pseLines]
  );
  const hasAttributionModalLines = attributionModalLines.length > 0;

  /** Libellé PSE pour la règle de calcul du classement général */
  const pseRuleLabel = useMemo(() => {
    if (!hasPSE) return null;
    const enabledCount = pseLines.filter((l) => enabledLines[l.id]).length;
    if (enabledCount === pseLines.length) return "PSE (toutes par défaut)";
    return "PSE cochées";
  }, [hasPSE, pseLines, enabledLines]);

  /** Lignes de variantes (config lot, id négatifs) pour les lignes Synthèse par variante */
  const varianteLinesConfig: VarianteLine[] = lot.varianteLines ?? [];
  const showVarianteRows = (lot.varianteAutorisee || lot.varianteExigee) && varianteLinesConfig.length > 0;

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
  const hasAnyQuestions = useMemo(() =>
    Object.values(decisions).some((d) => d === "questions_reponses"), [decisions]);
  const hasAnyWithQuestionsStatus = useMemo(() =>
    hasAnyQuestions || activeCompanies.some((c) => c.hasQuestions ?? false),
    [hasAnyQuestions, activeCompanies]);

  /** Pour chaque entreprise, true si la saisie/import des réponses a été validée (réouvre le statut décision sur Synthèse) */
  const receptionModeByCompany = useMemo(() => {
    const questionnaires = version?.questionnaire?.questionnaires ?? [];
    return Object.fromEntries(questionnaires.map((cq) => [cq.companyId, cq.receptionMode === true]));
  }, [version?.questionnaire?.questionnaires]);

  /** Au moins une entreprise avec « Question(s) à poser » n'a pas encore validé la saisie/import des réponses → blocage de l'attribution */
  const hasPendingQuestions = useMemo(
    () => activeCompanies.some(
      (c) => c.hasQuestions === true && receptionModeByCompany[c.id] !== true
    ),
    [activeCompanies, receptionModeByCompany]
  );

  const eligibleCompanies = useMemo(
    () => activeCompanies.filter((c) => c.status !== "ecartee"),
    [activeCompanies]
  );

  const allDecided = useMemo(() => {
    if (eligibleCompanies.length === 0) return false;
    return eligibleCompanies.every((c) => {
      const d = decisions[c.id];
      return d && d !== "non_defini";
    });
  }, [eligibleCompanies, decisions]);

  const companiesWithoutDecision = useMemo(() => {
    return eligibleCompanies.filter((c) => {
      const d = decisions[c.id];
      return !d || d === "non_defini";
    });
  }, [eligibleCompanies, decisions]);

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

  /** True si toutes les PSE et Variantes ont un choix OUI ou NON (nécessaire pour pouvoir choisir Attributaire) */
  const allPseVarianteRenseignes = useMemo(() => {
    const allLines = [...pseLines, ...varianteLines];
    if (allLines.length === 0) return true;
    return allLines.every((l) => pseVarianteChoice[l.id] != null);
  }, [pseLines, varianteLines, pseVarianteChoice]);

  // Helper: get price for a company on a specific lot line
  const getLinePrice = (companyId: number, lineId: number) => {
    if (!version) return 0;
    const entry = version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === lineId);
    return (entry?.dpgf1 ?? 0) + (entry?.dpgf2 ?? 0);
  };

  /** Score technique d'une variante (même pondération que l'offre de base : Très bien=100%, Bien=75%, etc.) */
  const getVarianteTechScore = (company: Company, varianteId: string) => {
    const byVariante = company.scoresTechniquesVariantes?.[varianteId];
    if (!byVariante) return { total: 0, technique: 0, env: 0, planning: 0 };
    let total = 0, technique = 0, env = 0, planning = 0;
    for (const criterion of technicalCriteria) {
      let criterionScore = 0;
      if (criterion.subCriteria.length > 0) {
        let raw = 0;
        const subTotal = criterion.subCriteria.reduce((s, sc) => s + sc.weight, 0);
        for (const sub of criterion.subCriteria) {
          const noteVal = byVariante[`${criterion.id}_${sub.id}`];
          const notation = noteVal && (noteVal === "tres_bien" || noteVal === "bien" || noteVal === "moyen" || noteVal === "passable" || noteVal === "insuffisant") ? noteVal : null;
          if (notation) {
            const subWeight = subTotal > 0 ? sub.weight / subTotal : 0;
            raw += NOTATION_VALUES[notation as keyof typeof NOTATION_VALUES] * subWeight;
          }
        }
        criterionScore = raw * criterion.weight;
      } else {
        const noteVal = byVariante[criterion.id];
        const notation = noteVal && (noteVal === "tres_bien" || noteVal === "bien" || noteVal === "moyen" || noteVal === "passable" || noteVal === "insuffisant") ? noteVal : null;
        if (notation) {
          criterionScore = NOTATION_VALUES[notation as keyof typeof NOTATION_VALUES] * criterion.weight;
        }
      }
      if (criterion.id === "environnemental") env = criterionScore;
      else if (criterion.id === "planning") planning = criterionScore;
      else technique += criterionScore;
      total += criterionScore;
    }
    return { total, technique, env, planning };
  };

  const hasPrice = (companyId: number, lineId: number) => {
    if (!version) return false;
    const entry = version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === lineId);
    return entry !== undefined && ((entry.dpgf1 ?? 0) !== 0 || (entry.dpgf2 ?? 0) !== 0);
  };

  /** Toutes les cases affichées dans Analyse prix (ligne + colonne) avec libellé : chaque entreprise doit y mettre un prix (non vide et ≠ 0). */
  const requiredPriceCells = useMemo(() => {
    const hasDualDpgf = lot.hasDualDpgf ?? false;
    const cells: { lotLineId: number; needDpgf1: boolean; needDpgf2: boolean; label: string }[] = [];
    cells.push({
      lotLineId: 0,
      needDpgf1: true,
      needDpgf2: hasDualDpgf,
      label: "DPGF (Tranche Ferme)",
    });
    const baseLotLines = activeLotLines.filter((l) => l.type !== "VARIANTE");
    for (const line of baseLotLines) {
      const showDpgf1 = line.dpgfAssignment === "DPGF_1" || line.dpgfAssignment === "both";
      const showDpgf2 = hasDualDpgf && (line.dpgfAssignment === "DPGF_2" || line.dpgfAssignment === "both");
      const existing = cells.find((c) => c.lotLineId === line.id);
      const lineLabel = getLineLabel(line);
      if (existing) {
        if (showDpgf1) existing.needDpgf1 = true;
        if (showDpgf2) existing.needDpgf2 = true;
      } else {
        cells.push({
          lotLineId: line.id,
          needDpgf1: showDpgf1,
          needDpgf2: showDpgf2,
          label: lineLabel,
        });
      }
    }
    varianteLinesConfig.forEach((line, idx) => {
      const showDpgf1 = line.dpgfAssignment === "DPGF_1" || line.dpgfAssignment === "both";
      const showDpgf2 = hasDualDpgf && (line.dpgfAssignment === "DPGF_2" || line.dpgfAssignment === "both");
      const existing = cells.find((c) => c.lotLineId === line.id);
      const lineLabel = line.label?.trim() ? `Variante ${idx + 1} : ${line.label}` : `Variante ${idx + 1}`;
      if (existing) {
        if (showDpgf1) existing.needDpgf1 = true;
        if (showDpgf2) existing.needDpgf2 = true;
      } else {
        cells.push({
          lotLineId: line.id,
          needDpgf1: showDpgf1,
          needDpgf2: showDpgf2,
          label: lineLabel,
        });
      }
    });
    return cells;
  }, [lot.hasDualDpgf, activeLotLines, varianteLinesConfig]);

  /** true si la valeur est absente ou nulle (sans prix ou à 0) */
  const isPriceMissingOrZero = (val: number | null | undefined): boolean =>
    val == null || Number(val) === 0;

  const varianteLineIds = useMemo(() => new Set(varianteLinesConfig.map((l) => l.id)), [varianteLinesConfig]);

  /** Libellés des prix manquants pour une liste de cells (helper interne). */
  const getMissingLabelsForCells = (companyId: number, cells: { lotLineId: number; needDpgf1: boolean; needDpgf2: boolean; label: string }[]): string[] => {
    if (!version) return [];
    const labels: string[] = [];
    for (const cell of cells) {
      const entry = version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === cell.lotLineId);
      const miss1 = cell.needDpgf1 && isPriceMissingOrZero(entry?.dpgf1);
      const miss2 = cell.needDpgf2 && isPriceMissingOrZero(entry?.dpgf2);
      if (miss1 || miss2) {
        if (miss1 && miss2) {
          labels.push(cell.label);
        } else if (miss1) {
          labels.push(cell.needDpgf2 ? `${cell.label} (DPGF 1)` : cell.label);
        } else {
          labels.push(`${cell.label} (DPGF 2)`);
        }
      }
    }
    return labels;
  };

  /** Prix manquants pour l’offre de base uniquement (DPGF, PSE, TO — pas les variantes). */
  const getMissingRequiredPriceLabelsBase = (companyId: number): string[] => {
    const baseCells = requiredPriceCells.filter((c) => !varianteLineIds.has(c.lotLineId));
    return getMissingLabelsForCells(companyId, baseCells);
  };

  /** Prix manquants pour une variante donnée uniquement. */
  const getMissingRequiredPriceLabelsVariante = (companyId: number, varianteLineId: number): string[] => {
    const varianteCells = requiredPriceCells.filter((c) => c.lotLineId === varianteLineId);
    return getMissingLabelsForCells(companyId, varianteCells);
  };

  // Compute scenario total for comparison: TF + TO (enabledLines) + PSE/Variante uniquement si pseVarianteChoice === "oui"
  const getCompanyScenarioTotal = (companyId: number) => {
    if (!version) return 0;
    let total = baseLines.reduce((sum, l) => sum + getLinePrice(companyId, l.id), 0);
    if (total === 0) {
      const entry = version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === 0);
      total = (entry?.dpgf1 ?? 0) + (entry?.dpgf2 ?? 0);
    }
    for (const line of activeLotLines) {
      if (!line.type) continue;
      if (line.type === "T_OPTIONNELLE" && enabledLines[line.id]) {
        total += getLinePrice(companyId, line.id);
      }
      if ((line.type === "PSE" || line.type === "VARIANTE") && pseVarianteChoice[line.id] === "oui") {
        total += getLinePrice(companyId, line.id);
      }
    }
    return total;
  };

  /** Classement dynamique V1/V2 : recalcul en temps réel à partir des notes techniques, technicalOverrides (notes forcées) et prix de cette version. */
  const results = useMemo(() => {
    if (!version) return [];

    const techScores: Record<number, { total: number; technique: number; env: number; planning: number }> = {};
    for (const company of activeCompanies) {
      if (company.status === "ecartee") {
        techScores[company.id] = { total: 0, technique: 0, env: 0, planning: 0 };
        continue;
      }
      const override = version.technicalOverrides?.[company.id];
      if (override && typeof override.total === "number" && [override.technique, override.env, override.planning].every((x) => typeof x === "number")) {
        techScores[company.id] = {
          total: override.total,
          technique: override.technique ?? 0,
          env: override.env ?? 0,
          planning: override.planning ?? 0,
        };
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
        criterionScore = raw * criterion.weight;
      } else {
        const note = version.technicalNotes.find(
          (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
        );
        if (note?.notation) {
          criterionScore = NOTATION_VALUES[note.notation] * criterion.weight;
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
      const totalGlobal = getCompanyTotalGlobalEvalue(version, activeLotLines, company.id);
      const missing: string[] = [];

      for (const line of activeLotLines) {
        if (line.type && enabledLines[line.id]) {
          if (!hasPrice(company.id, line.id)) {
            missing.push(getLineLabel(line));
          }
        }
      }

      companyPriceTotals[company.id] = totalGlobal;
      missingPrices[company.id] = missing;
    }

    const missingRequiredPriceLabels: Record<number, string[]> = {};
    for (const company of activeCompanies) {
      if (company.status === "ecartee") continue;
      missingRequiredPriceLabels[company.id] = getMissingRequiredPriceLabelsBase(company.id);
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
      const missingRequired = missingRequiredPriceLabels[company.id] ?? [];

      return {
        company, techScore: ts.total, techniqueScore: ts.technique,
        envScore: ts.env, planningScore: ts.planning,
        priceScore, priceTotal, globalScore, missingPrices: missing,
        missingRequiredPriceLabels: missingRequired,
      };
    });
  }, [activeCompanies, technicalCriteria, version, version?.technicalNotes, version?.priceEntries, version?.technicalOverrides, prixWeight, activeLotLines, enabledLines, requiredPriceCells]);

  const sorted = useMemo(() => {
    return [...results].sort((a, b) => {
      if (a.company.status === "ecartee" && b.company.status !== "ecartee") return 1;
      if (a.company.status !== "ecartee" && b.company.status === "ecartee") return -1;
      return b.globalScore - a.globalScore;
    });
  }, [results]);

  // Active options from pseVarianteChoice toggles (OUI = inclus dans la comparaison)
  const activeCompareLines = useMemo(() => {
    return [...pseLines, ...varianteLines].filter((l) => pseVarianteChoice[l.id] === "oui");
  }, [pseLines, varianteLines, pseVarianteChoice]);

  // Results du classement : montant scénario et notes basés sur getCompanyScenarioTotal (TF + TO + PSE/Variante en OUI)
  const scenarioResults = useMemo(() => {
    if (!version) return results;

    const eligibleCompanies = activeCompanies.filter((c) => c.status !== "ecartee");
    const augmentedTotals: Record<number, number> = {};
    const augmentedMissing: Record<number, string[]> = {};

    for (const company of eligibleCompanies) {
      const total = getCompanyScenarioTotal(company.id);
      augmentedTotals[company.id] = total;
      const missing: string[] = [];
      for (const line of activeLotLines) {
        if (!line.type) continue;
        const included = (line.type === "T_OPTIONNELLE" && enabledLines[line.id]) ||
          ((line.type === "PSE" || line.type === "VARIANTE") && pseVarianteChoice[line.id] === "oui");
        if (included && !hasPrice(company.id, line.id)) {
          missing.push(getLineLabelShort(line));
        }
      }
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
        missingRequiredPriceLabels: row.missingRequiredPriceLabels,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, version, prixWeight, pseVarianteChoice, enabledLines, activeCompanies, activeLotLines]);

  // Rang recalculé depuis scenarioResults (sans déplacer les lignes)
  const scenarioSorted = useMemo(() => {
    return [...scenarioResults].sort((a, b) => {
      if (a.company.status === "ecartee" && b.company.status !== "ecartee") return 1;
      if (a.company.status !== "ecartee" && b.company.status === "ecartee") return -1;
      return b.globalScore - a.globalScore;
    });
  }, [scenarioResults]);

  /** Montant minimum parmi toutes les offres (base + variantes) pour le calcul note prix variantes */
  const minPriceAllOffers = useMemo(() => {
    if (!version || !showVarianteRows) return 0;
    const amounts: number[] = [];
    for (const company of activeCompanies) {
      if (company.status === "ecartee") continue;
      amounts.push(getCompanyScenarioTotal(company.id));
      for (const line of varianteLinesConfig) {
        const p = getLinePrice(company.id, line.id);
        if (p > 0) amounts.push(p);
      }
    }
    return amounts.length > 0 ? Math.min(...amounts) : 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, activeCompanies, showVarianteRows, varianteLinesConfig, scenarioResults]);

  /** Données par ligne variante (company + varianteLine) pour le tableau Synthèse */
  const varianteRowsData = useMemo(() => {
    if (!showVarianteRows) return [];
    const rows: { company: Company; varianteLine: VarianteLine; idx: number; techScore: number; techniqueScore: number; envScore: number; planningScore: number; priceTotal: number; priceScore: number; globalScore: number }[] = [];
    for (const company of activeCompanies) {
      if (company.status === "ecartee") continue;
      varianteLinesConfig.forEach((line, idx) => {
        const ts = getVarianteTechScore(company, String(line.id));
        const priceTotal = getLinePrice(company.id, line.id);
        const priceScore = minPriceAllOffers > 0 && priceTotal > 0 ? (minPriceAllOffers / priceTotal) * prixWeight : 0;
        const globalScore = ts.total + priceScore;
        rows.push({
          company,
          varianteLine: line,
          idx,
          techScore: ts.total,
          techniqueScore: ts.technique,
          envScore: ts.env,
          planningScore: ts.planning,
          priceTotal,
          priceScore,
          globalScore,
        });
      });
    }
    return rows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVarianteRows, activeCompanies, varianteLinesConfig, minPriceAllOffers, prixWeight, version]);

  /** Rang global : offres de base + variantes mélangées par score global (1 = meilleur). Utilisé pour afficher le rang à gauche des variantes comme pour l'offre de base. */
  const globalRankByKey = useMemo(() => {
    const items: { key: string; globalScore: number }[] = [];
    for (const row of scenarioResults) {
      if (row.company.status === "ecartee") continue;
      items.push({ key: `base-${row.company.id}`, globalScore: row.globalScore });
    }
    for (const vr of varianteRowsData) {
      items.push({ key: `variante-${vr.company.id}-${vr.varianteLine.id}`, globalScore: vr.globalScore });
    }
    items.sort((a, b) => b.globalScore - a.globalScore);
    const rankByKey = new Map<string, number>();
    items.forEach((item, index) => {
      rankByKey.set(item.key, index + 1);
    });
    return rankByKey;
  }, [scenarioResults, varianteRowsData]);

  const valueTechWeight = valueTechnique.reduce((s, c) => s + c.weight, 0);
  const envWeight = envCriterion?.weight ?? 0;
  const planWeight = planCriterion?.weight ?? 0;
  const maxTotal = valueTechWeight + envWeight + planWeight + prixWeight;

  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const pageTitle = `${getSyntheseLabel(lot, versionIndex)} & Classement`;

  const attributaireResult = sorted.find(
    (r) => r.company.status !== "ecartee" && getNegotiationDecision(r.company.id, version?.id) === "attributaire"
  );

  const scenarioDescription = useMemo(() => {
    if (!attributaireResult) return "";
    const details = version?.attributionDetails?.[attributaireResult.company.id];
    const finalAmount = details?.finalAmount ?? attributaireResult.priceTotal;
    const retainedIds = details?.retainedLineIds ?? [];
    const baseLabelDetail = hasTO ? "Tranche Ferme" : "Solution de base";
    if (retainedIds.length === 0) {
      return `L'entreprise ${attributaireResult.company.name} est retenue pour un montant de ${fmt(finalAmount)} € HT (${baseLabelDetail} uniquement).`;
    }
    const pseNames = retainedIds
      .map((id) => activeLotLines.find((l) => l.id === id))
      .filter(Boolean)
      .map((l) => getLineLabel(l!))
      .join(", ");
    return `L'entreprise ${attributaireResult.company.name} est retenue pour un montant de ${fmt(finalAmount)} € HT incluant la ${baseLabelDetail.toLowerCase()} et les PSE suivantes : ${pseNames}.`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attributaireResult, version?.attributionDetails, activeLotLines, hasTO]);

  const getAvailableDecisions = (companyId: number): NegotiationDecision[] => {
    const company = activeCompanies.find((c) => c.id === companyId);
    const hasQuestions = company?.hasQuestions ?? false;
    const currentDecision = decisions[companyId] ?? "non_defini";
    if (hasAnyAttributaire && currentDecision !== "attributaire") {
      return ["non_defini", "non_retenue", "rejete_oab", "rejete_irreguliere", "rejete_inacceptable"];
    }
    const baseDecisions: NegotiationDecision[] =
      versionIndex >= 1
        ? ["non_defini", "non_retenue", "rejete_oab", "rejete_irreguliere", "rejete_inacceptable"]
        : ["non_defini", "non_retenue", "rejete_oab", "rejete_irreguliere", "rejete_inacceptable", "retenue"];
    // Blocage attribution uniquement : si questions en attente, on n'ajoute pas "attributaire". Les autres décisions restent possibles.
    let withAttributaire = allPseVarianteRenseignes ? [...baseDecisions, "attributaire"] : baseDecisions;
    if (hasPendingQuestions) {
      withAttributaire = baseDecisions;
    }
    if (versionIndex === 1) {
      withAttributaire = [...withAttributaire, "retenue_nego_2"];
    }
    if (hasQuestions || hasAnyWithQuestionsStatus) {
      withAttributaire = withAttributaire.includes("questions_reponses") ? withAttributaire : ["questions_reponses", ...withAttributaire];
    }
    return withAttributaire;
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
          {hasScenarioOptions && "Total = Base + PSE + Σ(Tranches Optionnelles actives)."}
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* SECTION 6.2 — COMPARAISON DE SCÉNARIOS + DÉCISION  */}
      {/* ═══════════════════════════════════════════════════ */}
      {(hasPSE || hasVariante) && (
        <Card className="border-blue-200 dark:border-blue-900">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-800 dark:text-blue-300">
              <Settings2 className="h-4 w-4" />
              Comparaison de Scénarios — PSE retenues au marché ?
            </CardTitle>
            <CardDescription className="text-xs">
              Cliquez sur <strong>OUI</strong> pour inclure une PSE dans le classement et la retenir au marché. <strong>NON</strong> = non retenue. Un second clic désélectionne.
              Le choix OUI / NON est obligatoire pour chaque PSE avant la validation lorsqu'un attributaire est désigné.
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
                                  ? hasAnyAttributaire
                                    ? "border-green-500 bg-green-500 text-white"
                                    : "border-border bg-muted text-foreground"
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
                          {choice === "oui" && hasAnyAttributaire && (
                            <span className="text-xs font-medium text-green-700">✓ Retenue</span>
                          )}
                          {choice === "non" && (
                            <span className="text-xs font-medium text-destructive">✗ Non retenue</span>
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
                                  ? hasAnyAttributaire
                                    ? "border-green-500 bg-green-500 text-white"
                                    : "border-border bg-muted text-foreground"
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
                          {choice === "oui" && hasAnyAttributaire && (
                            <span className="text-xs font-medium text-green-700">✓ Retenue</span>
                          )}
                          {choice === "non" && (
                            <span className="text-xs font-medium text-destructive">✗ Non retenue</span>
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
      {/* SECTION 6.1 — CLASSEMENT GÉNÉRAL                   */}
      {/* ═══════════════════════════════════════════════════ */}
      {hasPendingQuestions && !isValidated && (
        <Alert className="border-amber-500 bg-amber-50 text-amber-900 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-500">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Attribution bloquée</AlertTitle>
          <AlertDescription>
            Une ou plusieurs demandes d&apos;éclaircissement sont en attente. Pour débloquer l&apos;attribution, vous devez cliquer sur &quot;Valider la saisie ou import des réponses&quot; pour toutes les entreprises concernées.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classement Général</CardTitle>
          <CardDescription>
            Règle de calcul : TF{pseRuleLabel ? ` + ${pseRuleLabel}` : ""} + Σ(Tranches Optionnelles). Les entreprises écartées sont affichées mais non classées.
          </CardDescription>
        </CardHeader>


        <CardContent className="overflow-x-auto pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rang</TableHead>
                <TableHead>Entreprise</TableHead>
                <TableHead className="text-right">Montant scénario</TableHead>
                <TableHead className="text-right">Prix / {prixWeight}</TableHead>
                <TableHead className="text-right">Technique / {valueTechWeight}</TableHead>
                {envWeight > 0 && <TableHead className="text-right">Enviro. / {envWeight}</TableHead>}
                {planWeight > 0 && <TableHead className="text-right">Planning / {planWeight}</TableHead>}
                <TableHead className="text-right">Globale / {maxTotal}</TableHead>
                <TableHead className="text-center min-w-[260px]">Statut / Décision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenarioResults.map((row) => {
                const isExcluded = row.company.status === "ecartee";
                const companyIndexInLot = (lot?.companies ?? []).findIndex((c) => c.id === row.company.id);
                const companyIndex = companyIndexInLot >= 0 ? companyIndexInLot : Math.max(0, activeCompanies.findIndex((c) => c.id === row.company.id));
                const rankInSorted = isExcluded
                  ? null
                  : (showVarianteRows ? globalRankByKey.get(`base-${row.company.id}`) : scenarioSorted
                      .filter((r) => r.company.status !== "ecartee")
                      .findIndex((r) => r.company.id === row.company.id) + 1);
                const decision = getNegotiationDecision(row.company.id, version?.id);
                const availableDecisions = getAvailableDecisions(row.company.id);
                const companyVarianteRows = showVarianteRows ? varianteRowsData.filter((vr) => vr.company.id === row.company.id) : [];
                return (
                  <React.Fragment key={row.company.id}>
                    <TableRow className={isExcluded ? "opacity-50" : ""}>
                      <TableCell className="font-semibold">{isExcluded ? "—" : (rankInSorted ?? "—")}</TableCell>
                      <TableCell
                        className="font-medium"
                        style={
                          isExcluded
                            ? undefined
                            : {
                                borderLeft: `4px solid ${getCompanyColor(companyIndex)}`,
                                backgroundColor: getCompanyBgColor(companyIndex),
                              }
                        }
                      >
                        <div className="flex flex-col gap-0.5">
                          <span>{row.company.id}. {row.company.name}</span>
                          {activeCompareLines.length > 0 && !isExcluded && (
                            <span className="text-xs text-muted-foreground italic">
                              Base{activeCompareLines.map((l) => ` + ${getLineLabelShort(l)}`).join("")}
                            </span>
                          )}
                          {row.missingRequiredPriceLabels?.length > 0 && (
                            <span className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Prix manquant : {row.missingRequiredPriceLabels.join(", ")}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{isExcluded ? "—" : fmt(row.priceTotal)}</TableCell>
                      <TableCell className="text-right">{isExcluded ? "—" : row.priceScore.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{isExcluded ? "—" : row.techniqueScore.toFixed(2)}</TableCell>
                      {envWeight > 0 && (
                        <TableCell className="text-right">{isExcluded ? "—" : row.envScore.toFixed(2)}</TableCell>
                      )}
                      {planWeight > 0 && (
                        <TableCell className="text-right">{isExcluded ? "—" : row.planningScore.toFixed(2)}</TableCell>
                      )}
                      <TableCell className="text-right font-bold">{isExcluded ? "—" : row.globalScore.toFixed(2)}</TableCell>
                      <TableCell className="text-center min-w-[260px]">
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
                          (() => {
                            const attributionFinalAmount = version?.attributionDetails?.[row.company.id]?.finalAmount;
                            return (
                              <div className="flex flex-col gap-1 items-center">
                                <Select
                                  value={decision}
                                  onValueChange={(v) => {
                                    if (v === "attributaire") {
                                      if (hasAttributionModalLines) {
                                        if (!allPseVarianteRenseignes) {
                                          setAttributaireBlockedDialogOpen(true);
                                          return;
                                        }
                                        setPendingAttributionCompanyId(row.company.id);
                                        setPendingAttributionChoices(
                                          Object.fromEntries(
                                            attributionModalLines.map((l) => [
                                              l.id,
                                              (pseVarianteChoice[l.id] === "oui" ? "oui" : "non") as const,
                                            ])
                                          )
                                        );
                                        setIsPseAttributionModalOpen(true);
                                        return;
                                      }
                                      if (version) {
                                        const baseAmount = getLinePrice(row.company.id, 0);
                                        setAttributionDetails(row.company.id, { baseAmount, retainedLineIds: [], finalAmount: baseAmount }, version.id);
                                      }
                                    }
                                    setNegotiationDecision(row.company.id, v as NegotiationDecision, version?.id);
                                  }}
                                  disabled={isReadOnly || isValidated}
                                >
                                  <SelectTrigger className="w-[260px]">
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
                                {decision === "attributaire" && attributionFinalAmount != null && (
                                  <span className="text-xs text-muted-foreground font-medium">
                                    Montant final retenu : {fmt(attributionFinalAmount)} HT
                                  </span>
                                )}
                                {(decision === "rejete_oab" || decision === "rejete_irreguliere" || decision === "rejete_inacceptable") && (
                                  <div className="w-[260px] mt-2 flex flex-col gap-1">
                                    <Textarea
                                      placeholder="Motif du rejet (Obligatoire)"
                                      className={`text-xs min-h-[60px] resize-none ${!row.company.exclusionReason ? "border-destructive ring-destructive focus-visible:ring-destructive" : ""}`}
                                      value={row.company.exclusionReason || ""}
                                      onChange={(e) => updateCompany(row.company.id, { exclusionReason: e.target.value })}
                                      disabled={isReadOnly || isValidated}
                                    />
                                    {!row.company.exclusionReason && (
                                      <span className="text-[10px] text-destructive font-medium text-left">Le motif est requis.</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()
                        )}
                      </TableCell>
                    </TableRow>
                    {companyVarianteRows.map((vr) => {
                      const varianteId = String(vr.varianteLine.id);
                      const decisionVariante = (row.company.decisionVariantes?.[varianteId] ?? "non_defini") as NegotiationDecision;
                      const varianteRank = globalRankByKey.get(`variante-${row.company.id}-${vr.varianteLine.id}`) ?? "—";
                      return (
                        <TableRow key={`variante-${row.company.id}-${vr.varianteLine.id}`} className="bg-muted/20">
                          <TableCell className="font-semibold">{varianteRank}</TableCell>
                          <TableCell
                            className="font-medium text-muted-foreground"
                            style={{
                              borderLeft: `4px solid ${getCompanyColor(companyIndex)}`,
                              backgroundColor: getCompanyBgColor(companyIndex),
                            }}
                          >
                            <div className="flex flex-col gap-0.5">
                              <span>{row.company.name} — Variante {vr.idx + 1}{vr.varianteLine.label?.trim() ? ` : ${vr.varianteLine.label}` : ""}</span>
                              {getMissingRequiredPriceLabelsVariante(row.company.id, vr.varianteLine.id).length > 0 && (
                                <span className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  Prix manquant : {getMissingRequiredPriceLabelsVariante(row.company.id, vr.varianteLine.id).join(", ")}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{fmt(vr.priceTotal)}</TableCell>
                          <TableCell className="text-right">{vr.priceScore.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{vr.techniqueScore.toFixed(2)}</TableCell>
                          {envWeight > 0 && <TableCell className="text-right">{vr.envScore.toFixed(2)}</TableCell>}
                          {planWeight > 0 && <TableCell className="text-right">{vr.planningScore.toFixed(2)}</TableCell>}
                          <TableCell className="text-right font-bold">{vr.globalScore.toFixed(2)}</TableCell>
                          <TableCell className="text-center min-w-[260px] flex flex-wrap items-center justify-center">
                            {(() => {
                              return (
                                <div className="flex flex-col gap-1 items-center">
                                  <Select
                                    value={decisionVariante}
                                    onValueChange={(v) => updateDecisionVariante(row.company.id, varianteId, v)}
                                    disabled={isReadOnly || isValidated}
                                  >
                                    <SelectTrigger className="w-[260px]">
                                      <SelectValue placeholder="Décision" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getAvailableDecisions(row.company.id).map((d) => (
                                        <SelectItem key={d} value={d}>
                                          {NEGOTIATION_DECISION_LABELS[d]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {(decisionVariante === "rejete_oab" || decisionVariante === "rejete_irreguliere" || decisionVariante === "rejete_inacceptable") && (
                                    <div className="w-[260px] mt-2 flex flex-col gap-1">
                                      <Textarea
                                        placeholder="Motif du rejet (Obligatoire)"
                                        className={`text-xs min-h-[60px] resize-none ${!row.company.exclusionReason ? "border-destructive ring-destructive focus-visible:ring-destructive" : ""}`}
                                        value={row.company.exclusionReason || ""}
                                        onChange={(e) => updateCompany(row.company.id, { exclusionReason: e.target.value })}
                                        disabled={isReadOnly || isValidated}
                                      />
                                      {!row.company.exclusionReason && (
                                        <span className="text-[10px] text-destructive font-medium text-left">Le motif est requis.</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
                disabled={pseVarianteBlocksValidation || hasPendingQuestions}
                title={
                  hasPendingQuestions
                    ? "Décochez les questions en attente (analyses technique/prix) pour pouvoir attribuer"
                    : pseVarianteBlocksValidation
                    ? "Renseignez OUI/NON pour chaque PSE et Variante d'abord"
                    : undefined
                }
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

            {hasAnyQuestions && version && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  const versionIndex = lot.versions.findIndex((v) => v.id === version.id);
                  const questionsPath = versionIndex === 0 ? "/questions" : `/questions/${versionIndex + 1}`;
                  navigate(questionsPath);
                }}
              >
                <MessageSquare className="h-4 w-4" />
                Accéder à la phase Questions
              </Button>
            )}

            {!allDecided && !isValidated && !isReadOnly && (
              <p className="text-xs text-muted-foreground">
                Attribuez une décision à chaque entreprise éligible pour pouvoir valider.
              </p>
            )}

            {/* Bouton export RAO — toujours disponible si une version est active */}
            {version && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleExportRao}
                disabled={exportingRao}
              >
                <FileText className="h-4 w-4" />
                {exportingRao ? "Génération…" : "Télécharger le RAO (Word)"}
              </Button>
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
                          {isCurrent && idx > 0 && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" className="gap-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
                                  <Trash2 className="h-3 w-3" />
                                  Supprimer cette phase
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-destructive" />
                                    Supprimer cette phase de négociation ?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    La phase <strong>{getVersionDisplayLabel(v.label)}</strong> sera définitivement supprimée. Vous reviendrez sur la synthèse précédente. Cette action est irréversible.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => {
                                      deleteVersion(v.id);
                                      if (idx === 1) navigate("/synthese");
                                      else navigate(`/nego/${idx - 1}/synthese`);
                                    }}
                                  >
                                    Supprimer et revenir à la synthèse précédente
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
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

          {!allDecided && companiesWithoutDecision.length > 0 && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-destructive mb-1">Décision obligatoire pour toutes les entreprises</p>
                <p className="text-destructive/90 mb-2">
                  Une décision doit être saisie pour chaque entreprise éligible avant de pouvoir valider. Entreprise(s) sans décision :
                </p>
                <ul className="list-disc list-inside text-destructive/90">
                  {companiesWithoutDecision.map((c) => (
                    <li key={c.id}>{c.name}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {attributaireResult && (
            <div className="space-y-3">
              <div className="rounded-md border border-green-300 bg-green-50 p-4 text-sm leading-relaxed">
                <p className="font-semibold mb-2 text-green-800">🏆 Attribution pressentie</p>
                <p>{scenarioDescription}</p>
                <p className="mt-2 text-muted-foreground">
                  Classée au rang n°1 avec une note globale de {attributaireResult.globalScore.toFixed(2)} / {maxTotal} pts.
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
                <p className="font-semibold mb-1">Détail du scénario retenu :</p>
                {(() => {
                  const details = version?.attributionDetails?.[attributaireResult.company.id];
                  const baseLabelDetail = hasTO ? "Tranche Ferme" : "Solution de base";
                  const baseAmt = details?.baseAmount ?? getLinePrice(attributaireResult.company.id, 0);
                  const retainedIds = details?.retainedLineIds ?? [];
                  const finalAmt = details?.finalAmount ?? attributaireResult.priceTotal;
                  return (
                    <>
                      <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                        <li>{baseLabelDetail} — {fmt(baseAmt)}</li>
                        {retainedIds.map((lineId) => {
                          const line = activeLotLines.find((l) => l.id === lineId);
                          return line ? <li key={line.id}>{getLineLabel(line)} — {fmt(getLinePrice(attributaireResult.company.id, line.id))}</li> : null;
                        })}
                      </ul>
                      <p className="mt-2 font-semibold">Montant final HT : {fmt(finalAmt)}</p>
                    </>
                  );
                })()}
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
            const nonRetenues = activeCompanies.filter((c) => c.status !== "ecartee" && getNegotiationDecision(c.id, version?.id) === "non_retenue");
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
                  const hasRetenueNego2 = Object.values(decisions).some((d) => d === "retenue_nego_2");
                  if (hasRetenueNego2 && versionIndex === 1) {
                    createNextNegotiationPhase(negoDate);
                  }
                  validateVersion(version.id);
                  setValidationDialogOpen(false);
                }
              }}
              disabled={(!allDecided) || (nobodyRetained && !evictionMotif.trim())}
              title={!allDecided ? "Saisissez une décision pour chaque entreprise avant de valider" : undefined}
            >
              Confirmer la validation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale obligatoire : choix PSE/TO avant d'enregistrer Attributaire */}
      <Dialog open={isPseAttributionModalOpen} onOpenChange={(open) => {
        if (!open) {
          setIsPseAttributionModalOpen(false);
          setPendingAttributionCompanyId(null);
          setPendingAttributionChoices({});
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Choix des options pour l&apos;attribution</DialogTitle>
            <DialogDescription>
              Choisissez les PSE retenues pour le contrat final. Le montant total = Base (ou Tranche Ferme) + PSE cochées. Les tranches optionnelles sont incluses d&apos;office.
            </DialogDescription>
          </DialogHeader>
          {pendingAttributionCompanyId != null && (() => {
            const company = activeCompanies.find((c) => c.id === pendingAttributionCompanyId);
            const baseAmount = getLinePrice(pendingAttributionCompanyId, 0);
            const optionsSum = attributionModalLines
              .filter((l) => pendingAttributionChoices[l.id] === "oui")
              .reduce((s, l) => s + getLinePrice(pendingAttributionCompanyId, l.id), 0);
            const finalAmount = baseAmount + optionsSum;
            const retainedLineIds = attributionModalLines
              .filter((l) => pendingAttributionChoices[l.id] === "oui")
              .map((l) => l.id);
            return (
              <div className="space-y-4 py-2">
                {company && (
                  <p className="text-sm font-semibold text-foreground">
                    Entreprise : {company.name}
                  </p>
                )}
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">
                    Montant de base (Tranche Ferme seule) :
                  </span>
                  <span className="font-semibold">{fmt(baseAmount)}</span>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">PSE (Prestations Supplémentaires Éventuelles)</p>
                  {attributionModalLines.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Checkbox
                          id={`attr-${l.id}`}
                          checked={(pendingAttributionChoices[l.id] ?? "non") === "oui"}
                          onCheckedChange={(checked) =>
                            setPendingAttributionChoices((prev) => ({
                              ...prev,
                              [l.id]: checked ? "oui" : "non",
                            }))
                          }
                        />
                        <label htmlFor={`attr-${l.id}`} className="text-sm font-medium cursor-pointer truncate">
                          {getLineLabel(l)}
                        </label>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {(pendingAttributionChoices[l.id] ?? "non") === "oui"
                          ? fmt(getLinePrice(pendingAttributionCompanyId, l.id))
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-semibold flex justify-between items-center">
                  <span>Montant total avec options</span>
                  <span>{fmt(finalAmount)} HT</span>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsPseAttributionModalOpen(false);
                setPendingAttributionCompanyId(null);
                setPendingAttributionChoices({});
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={() => {
                if (pendingAttributionCompanyId == null || !version) return;
                const baseAmount = getLinePrice(pendingAttributionCompanyId, 0);
                const retainedLineIds = attributionModalLines
                  .filter((l) => pendingAttributionChoices[l.id] === "oui")
                  .map((l) => l.id);
                const optionsSum = retainedLineIds.reduce(
                  (s, lineId) => s + getLinePrice(pendingAttributionCompanyId, lineId),
                  0
                );
                const finalAmount = baseAmount + optionsSum;
                setAttributionDetails(
                  pendingAttributionCompanyId,
                  { baseAmount, retainedLineIds, finalAmount },
                  version.id
                );
                setPseVarianteChoice((prev) => ({
                  ...prev,
                  ...Object.fromEntries(
                    pseLines.map((line) => [
                      line.id,
                      (pendingAttributionChoices[line.id] ?? "non") as "oui" | "non",
                    ])
                  ),
                }));
                setEnabledLines((prev) => ({
                  ...prev,
                  ...Object.fromEntries(toLines.map((line) => [line.id, true])),
                }));
                setNegotiationDecision(pendingAttributionCompanyId, "attributaire", version.id);
                setIsPseAttributionModalOpen(false);
                setPendingAttributionCompanyId(null);
                setPendingAttributionChoices({});
              }}
            >
              Valider l&apos;attribution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Popup : choix Attributaire bloqué tant que les PSE n'ont pas OUI/NON */}
      <Dialog open={attributaireBlockedDialogOpen} onOpenChange={setAttributaireBlockedDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <AlertTriangle className="h-5 w-5" />
              PSE à retenir au marché
            </DialogTitle>
            <DialogDescription>
              Vous devez choisir les PSE à retenir au marché en renseignant <strong>OUI</strong> ou <strong>NON</strong> pour chaque ligne dans le pavé « Comparaison de Scénarios — PSE retenues au marché ? » ci-dessus.
              <br /><br />
              Tant que toutes les PSE n'ont pas un choix OUI ou NON, l'option Attributaire ne peut pas être sélectionnée.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setAttributaireBlockedDialogOpen(false)}>Fermer</Button>
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
