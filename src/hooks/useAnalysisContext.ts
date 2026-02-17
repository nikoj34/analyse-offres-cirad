import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useProjectStore } from "@/store/projectStore";
import { getVersionDisplayLabel } from "@/types/project";

export function useAnalysisContext() {
  const { round } = useParams<{ round: string }>();
  const { project, switchVersion } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];

  const negoRound = round ? parseInt(round) : null;
  const isNego = negoRound !== null && !isNaN(negoRound);
  const versionIndex = isNego ? negoRound : 0;
  const targetVersion = lot.versions[versionIndex] ?? lot.versions[0];

  useEffect(() => {
    if (targetVersion && targetVersion.id !== lot.currentVersionId) {
      switchVersion(targetVersion.id);
    }
  }, [targetVersion?.id, lot.currentVersionId, switchVersion]);

  // For nego rounds, only show companies retained in previous version
  let retainedIds: number[] | null = null;
  if (isNego && versionIndex > 0 && lot.versions[versionIndex - 1]) {
    const prevDecisions = lot.versions[versionIndex - 1].negotiationDecisions ?? {};
    retainedIds = Object.entries(prevDecisions)
      .filter(([, d]) => d === "retenue" || d === "attributaire")
      .map(([id]) => Number(id));
  }

  const activeCompanies = lot.companies.filter((c) => {
    if (c.name.trim() === "") return false;
    if (retainedIds !== null) return retainedIds.includes(c.id);
    return true;
  });

  const displayLabel = targetVersion ? getVersionDisplayLabel(targetVersion.label) : "";

  const effectiveReadOnly = (targetVersion?.frozen ?? false) || (targetVersion?.validated ?? false);

  return {
    version: targetVersion,
    versionId: targetVersion?.id,
    activeCompanies,
    isNego,
    negoRound,
    isReadOnly: effectiveReadOnly,
    negoLabel: isNego ? `Négociation ${negoRound}` : displayLabel,
  };
}
