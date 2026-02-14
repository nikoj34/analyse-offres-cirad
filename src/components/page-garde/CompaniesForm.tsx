import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProjectStore } from "@/store/projectStore";
import { Plus, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CompanyStatus } from "@/types/project";

const STATUS_LABELS: Record<CompanyStatus, string> = {
  retenue: "Retenue",
  ecartee: "Écartée",
  non_defini: "—",
};

const STATUS_COLORS: Record<CompanyStatus, string> = {
  retenue: "bg-primary/10 text-primary",
  ecartee: "bg-destructive/10 text-destructive",
  non_defini: "bg-muted text-muted-foreground",
};

export function CompaniesForm() {
  const { project, addCompany, removeCompany, updateCompany, setCompanyStatus } = useProjectStore();
  const { companies } = project;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Entreprises</CardTitle>
            <CardDescription>{companies.length}/16 entreprises</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={addCompany}
            disabled={companies.length >= 16}
          >
            <Plus className="mr-1 h-4 w-4" />
            Ajouter
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {companies.map((company) => (
            <div
              key={company.id}
              className="flex items-center gap-3 rounded-md border border-border p-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {company.id}
              </span>
              <Input
                className="flex-1"
                value={company.name}
                onChange={(e) => updateCompany(company.id, { name: e.target.value })}
                placeholder={`Entreprise ${company.id}${company.id === 7 ? " (entité spéciale)" : ""}`}
              />
              <Select
                value={company.status}
                onValueChange={(v) => setCompanyStatus(company.id, v as CompanyStatus)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="non_defini">—</SelectItem>
                  <SelectItem value="retenue">Retenue</SelectItem>
                  <SelectItem value="ecartee">Écartée</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeCompany(company.id)}
                disabled={companies.length <= 1}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
