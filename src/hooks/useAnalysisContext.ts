import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useProjectStore } from "@/store/projectStore";
import { getVersionDisplayLabel } from "@/types/project";

export function useAnalysisContext() {
  const { round } = useParams<{ round: string }>();
  const { project, switchVersion } = useProjectStore();

  const negoRound = round ? parseInt(round) : null;
  const isNego = negoRound !== null && !isNaN(negoRound);
  const versionIndex = isNego ? negoRound : 0;
  const targetVersion = project.versions[versionIndex] ?? project.versions[0];

  useEffect(() => {
    if (targetVersion && targetVersion.id !== project.currentVersionId) {
      switchVersion(targetVersion.id);
    }
  }, [targetVersion?.id, project.currentVersionId, switchVersion]);

  // For nego rounds, only show companies retained in previous version
  let retainedIds: number[] | null = null;
  if (isNego && versionIndex > 0 && project.versions[versionIndex - 1]) {
    const prevDecisions = project.versions[versionIndex - 1].negotiationDecisions ?? {};
    retainedIds = Object.entries(prevDecisions)
      .filter(([, d]) => d === "retenue" || d === "attributaire")
      .map(([id]) => Number(id));
  }

  const activeCompanies = project.companies.filter((c) => {
    if (c.name.trim() === "") return false;
    if (retainedIds !== null) return retainedIds.includes(c.id);
    return true;
  });

  const displayLabel = targetVersion ? getVersionDisplayLabel(targetVersion.label) : "";

  // A version is read-only if frozen, validated, or if a later version exists
  const versionIdx = project.versions.findIndex((v) => v.id === targetVersion?.id);
  const hasLaterVersion = versionIdx >= 0 && versionIdx < project.versions.length - 1;
  const effectiveReadOnly = (targetVersion?.frozen ?? false) || (targetVersion?.validated ?? false) || hasLaterVersion;

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
