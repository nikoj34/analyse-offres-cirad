import { useProjectStore } from "@/store/projectStore";

export function useWeightingValid(): { isValid: boolean; total: number } {
  const { project } = useProjectStore();
  const total = project.weightingCriteria.reduce((sum, c) => sum + c.weight, 0);
  return { isValid: total === 100, total };
}
