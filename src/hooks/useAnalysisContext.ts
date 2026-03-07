import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useProjectStore } from "@/store/projectStore";
import { getVersionDisplayLabel } from "@/types/project";

export function useAnalysisContext() {
  const { vIndex } = useParams<{ vIndex?: string }>();
  const { project, switchVersion } = useProjectStore();
  const lot = project.lots?.[project.currentLotIndex ?? 0];

  /** Source de vérité : vIndex extrait de l'URL (/version/:vIndex/...). */
  const versionIndexFromUrl = vIndex != null ? parseInt(vIndex, 10) : 0;
  const versionIndex = Number.isNaN(versionIndexFromUrl) ? 0 : Math.max(0, versionIndexFromUrl);
  const negoRound = versionIndex > 0 ? versionIndex : null;
  const isNego = versionIndex > 0;
  const versions = lot?.versions ?? [];
  const targetVersion = versions[versionIndex] ?? versions[0];

  useEffect(() => {
    if (!targetVersion || !lot) return;
    if (targetVersion.id === lot.currentVersionId) return;
    switchVersion(targetVersion.id);
  }, [versionIndex, targetVersion?.id, lot?.currentVersionId, switchVersion]);

  // Négociation : n'afficher que les entreprises retenues à la phase précédente
  let retainedIds: number[] | null = null;
  if (isNego && versionIndex > 0 && versions[versionIndex - 1]) {
    const prevDecisions = versions[versionIndex - 1].negotiationDecisions ?? {};
    retainedIds = Object.entries(prevDecisions)
      .filter(([, d]) =>
        versionIndex === 1
          ? d === "retenue" || d === "questions_reponses" || d === "attributaire"
          : d === "retenue_nego_2"
      )
      .map(([id]) => Number(id));
  }

  const activeCompanies = (lot?.companies ?? []).filter((c) => {
    if ((c?.name ?? "").trim() === "") return false;
    if (retainedIds !== null) return retainedIds.includes(c.id);
    return true;
  });

  const displayLabel = targetVersion ? getVersionDisplayLabel(targetVersion.label) : "";

  /** Verrouillage strict V0 : obligation légale — figer l'offre initiale dès qu'une phase de négociation existe (lot.versions.length > 1). V1+ : éditable sauf si figée/validée. */
  const v0MustBeReadOnly = versionIndex === 0 && versions.length > 1;
  const effectiveReadOnly =
    v0MustBeReadOnly ||
    (targetVersion?.frozen ?? false) ||
    (targetVersion?.validated ?? false);

  return {
    version: targetVersion,
    versionId: targetVersion?.id,
    versionIndex,
    activeCompanies,
    isNego,
    negoRound,
    isReadOnly: effectiveReadOnly,
    negoLabel: isNego ? `Négociation ${negoRound}` : displayLabel,
  };
}
