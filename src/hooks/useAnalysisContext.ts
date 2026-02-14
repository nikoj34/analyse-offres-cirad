import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useProjectStore } from "@/store/projectStore";

export function useAnalysisContext() {
  const { round } = useParams<{ round: string }>();
  const { project, switchVersion } = useProjectStore();

  const negoRound = round ? parseInt(round) : null;
  const isNego = negoRound !== null && !isNaN(negoRound);

  // V0 = versions[0], Négo 1 = versions[1], Négo 2 = versions[2]
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
    retainedIds = project.versions[versionIndex - 1].negotiationRetained ?? [];
  }

  const activeCompanies = project.companies.filter((c) => {
    if (c.name.trim() === "") return false;
    if (retainedIds !== null) return retainedIds.includes(c.id);
    return true;
  });

  return {
    version: targetVersion,
    versionId: targetVersion?.id,
    activeCompanies,
    isNego,
    negoRound,
    isReadOnly: targetVersion?.frozen ?? false,
    negoLabel: isNego ? `Négociation ${negoRound}` : null,
  };
}
