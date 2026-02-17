import { useProjectStore } from "@/store/projectStore";

export function useWeightingValid(): { isValid: boolean; total: number } {
  const { project } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];
  const total = lot.weightingCriteria.reduce((sum, c) => sum + c.weight, 0);
  return { isValid: total === 100, total };
}
