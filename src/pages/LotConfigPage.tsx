import { CompaniesForm } from "@/components/page-garde/CompaniesForm";
import { EstimationForm } from "@/components/page-garde/EstimationForm";
import { LotLinesForm } from "@/components/page-garde/LotLinesForm";
import { WeightingForm } from "@/components/page-garde/WeightingForm";
import { useProjectStore } from "@/store/projectStore";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const LotConfigPage = () => {
  const { project, updateLotInfo } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Configuration du lot
        </h1>
        <p className="text-sm text-muted-foreground">
          Entreprises, estimations, lignes de prestations et pondérations pour ce lot.
        </p>
      </div>

      {/* Dual DPGF toggle */}
      <div className="flex items-center gap-3 rounded-md border border-border p-3 bg-muted/30">
        <Checkbox
          id="dual-dpgf"
          checked={lot.hasDualDpgf ?? false}
          onCheckedChange={(checked) => updateLotInfo({ hasDualDpgf: !!checked })}
        />
        <div>
          <Label htmlFor="dual-dpgf" className="cursor-pointer font-medium">Projet à 2 DPGF</Label>
          <p className="text-xs text-muted-foreground">
            Active la saisie d'un second DPGF (DPGF 2) pour les estimations et les prix.
          </p>
        </div>
      </div>

      <CompaniesForm />
      <EstimationForm />
      <LotLinesForm />
      <WeightingForm />
    </div>
  );
};

export default LotConfigPage;
