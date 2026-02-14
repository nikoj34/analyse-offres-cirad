import { ProjectInfoForm } from "@/components/page-garde/ProjectInfoForm";
import { CompaniesForm } from "@/components/page-garde/CompaniesForm";
import { LotLinesForm } from "@/components/page-garde/LotLinesForm";
import { WeightingForm } from "@/components/page-garde/WeightingForm";
import { EstimationForm } from "@/components/page-garde/EstimationForm";

const Index = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Page de Garde</h1>
        <p className="text-sm text-muted-foreground">
          Saisissez les informations générales du projet, les entreprises candidates et les pondérations.
        </p>
      </div>
      <ProjectInfoForm />
      <CompaniesForm />
      <LotLinesForm />
      <EstimationForm />
      <WeightingForm />
    </div>
  );
};

export default Index;
