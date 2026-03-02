import { useProjectStore } from "@/store/projectStore";

export function useWeightingValid(): { isValid: boolean; total: number } {
  const { project } = useProjectStore();
  const lot = project?.lots?.[project?.currentLotIndex ?? 0];
  if (!lot?.weightingCriteria?.length) return { isValid: false, total: 0 };
  const total = lot.weightingCriteria.reduce((sum, c) => sum + c.weight, 0);
  return { isValid: total === 100, total };
}
