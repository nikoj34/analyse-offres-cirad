/**
 * Calcul du montant scénario (aligné avec la Synthèse).
 * TF + lignes optionnelles activées (scenarioEnabledLines) + PSE/Variantes retenues (pseVarianteChoice === "oui").
 */
import type { NegotiationVersion } from "@/types/project";

export type LotLineForScenario = { id: number; type: string | null };

function getLinePrice(
  version: NegotiationVersion | undefined,
  companyId: number,
  lineId: number
): number {
  if (!version?.priceEntries) return 0;
  const entry = version.priceEntries.find(
    (e) => e.companyId === companyId && e.lotLineId === lineId
  );
  return (entry?.dpgf1 ?? 0) + (entry?.dpgf2 ?? 0);
}

/** Valeurs par défaut pour les lignes optionnelles : TO = true, PSE/Variante = false */
export function getDefaultScenarioEnabledLines(
  activeLotLines: LotLineForScenario[]
): Record<number, boolean> {
  const init: Record<number, boolean> = {};
  for (const l of activeLotLines) {
    init[l.id] = l.type === "T_OPTIONNELLE";
  }
  return init;
}

/**
 * Montant scénario pour une entreprise : même formule que la Synthèse.
 * - Tranche ferme (lotLineId 0)
 * - + lignes avec scenarioEnabledLines[id] === true (TO par défaut)
 * - + lignes PSE/Variante avec pseVarianteChoice[id] === "oui"
 */
export function getCompanyScenarioTotal(
  version: NegotiationVersion | undefined,
  activeLotLines: LotLineForScenario[],
  companyId: number
): number {
  if (!version) return 0;

  const enabledLines = {
    ...getDefaultScenarioEnabledLines(activeLotLines),
    ...version.scenarioEnabledLines,
  };
  const pseVarianteChoice = version.pseVarianteChoice ?? {};

  // Base : Tranche ferme (lotLineId 0)
  let total = getLinePrice(version, companyId, 0);

  // + Lignes optionnelles activées (TO, etc.)
  for (const line of activeLotLines) {
    if (line.type && enabledLines[line.id]) {
      total += getLinePrice(version, companyId, line.id);
    }
  }

  // + PSE / Variantes retenues au marché (OUI)
  for (const line of activeLotLines) {
    if (
      (line.type === "PSE" || line.type === "VARIANTE") &&
      pseVarianteChoice[line.id] === "oui"
    ) {
      total += getLinePrice(version, companyId, line.id);
    }
  }

  return total;
}

/**
 * Total incluant la tranche ferme et toutes les lignes (TO, PSE, variantes).
 * Utilisé pour l’Ancien prix (V0) et tout total « toutes lignes ».
 */
export function getCompanyTotalIncludingPseAndTo(
  version: NegotiationVersion | undefined,
  activeLotLines: LotLineForScenario[],
  companyId: number
): number {
  if (!version) return 0;
  let total = getLinePrice(version, companyId, 0);
  for (const line of activeLotLines) {
    total += getLinePrice(version, companyId, line.id);
  }
  return total;
}
