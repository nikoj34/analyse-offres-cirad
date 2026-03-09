import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCompanyColor } from "@/lib/companyColors";
import { AlertTriangle, Building2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Company } from "@/types/project";

export default function AdministratifPage() {
  const { project, updateCompany } = useProjectStore();
  const lot = project?.lots?.[project?.currentLotIndex ?? 0];
  const adminConfig = project?.info?.adminConfig ?? {
    requireDecennale: true,
    requireBiennale: true,
    requireRC: true,
    customDocs: [],
  };

  if (!lot) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">Aucune donnée disponible pour ce lot.</p>
      </div>
    );
  }

  const companies = (lot?.companies ?? []).filter(c => c.status !== "ecartee");

  const updateAdminData = (companyId: number, company: Company, updates: Partial<NonNullable<Company["adminData"]>>) => {
    const currentData = company?.adminData ?? {
      decennaleFournie: false,
      decennaleDateExpiration: "",
      decennaleActiviteOK: null,
      decennaleMontantOK: null,
      biennaleFournie: false,
      rcFournie: false,
      customDocsStatus: {},
    };
    updateCompany(companyId, { adminData: { ...currentData, ...updates } });
  };

  const updateCustomDoc = (companyId: number, company: Company, docName: string, value: boolean) => {
    const currentData = company?.adminData ?? {
      decennaleFournie: false,
      decennaleDateExpiration: "",
      decennaleActiviteOK: null,
      decennaleMontantOK: null,
      biennaleFournie: false,
      rcFournie: false,
      customDocsStatus: {},
    };
    updateCompany(companyId, {
      adminData: {
        ...currentData,
        customDocsStatus: {
          ...(currentData.customDocsStatus ?? {}),
          [docName]: value,
        },
      },
    });
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Vérifications administratives
        </h1>
        <p className="text-sm text-muted-foreground">
          Contrôle des pièces administratives et assurances des entreprises du lot.
        </p>
      </div>

      <div className="grid gap-6">
        {companies.map((company, index) => {
          const color = getCompanyColor(index);
          const data = company?.adminData ?? {
            decennaleFournie: false,
            decennaleDateExpiration: "",
            decennaleActiviteOK: null,
            decennaleMontantOK: null,
            biennaleFournie: false,
            rcFournie: false,
            customDocsStatus: {},
          };

          const showDecennaleAlert =
            adminConfig?.requireDecennale &&
            (data.decennaleActiviteOK === false || data.decennaleMontantOK === false);

          return (
            <Card key={company.id} className="overflow-hidden border-t-4" style={{ borderTopColor: color }}>
              <CardHeader className="bg-muted/10 pb-4">
                <CardTitle className="text-lg flex items-center gap-2" style={{ color }}>
                  <Building2 className="h-5 w-5" />
                  {company.name || `Entreprise ${company.id}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-8">
                
                {adminConfig?.requireDecennale && (
                  <div className="space-y-4">
                    <h3 className="font-semibold border-b pb-2">Assurance Décennale</h3>
                    
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="flex items-center justify-between border rounded-md p-3">
                        <Label>Attestation fournie</Label>
                        <Switch
                          checked={data.decennaleFournie ?? false}
                          onCheckedChange={(v) => updateAdminData(company.id, company, { decennaleFournie: v })}
                        />
                      </div>
                      
                      <div className="space-y-2 border rounded-md p-3">
                        <Label>Date d'expiration</Label>
                        <Input
                          type="date"
                          value={data.decennaleDateExpiration ?? ""}
                          onChange={(e) => updateAdminData(company.id, company, { decennaleDateExpiration: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2 border rounded-md p-3">
                        <Label>Activité correspondante au lot ?</Label>
                        <Select
                          value={data.decennaleActiviteOK === null ? "null" : data.decennaleActiviteOK ? "true" : "false"}
                          onValueChange={(val) => {
                            const boolVal = val === "null" ? null : val === "true";
                            updateAdminData(company.id, company, { decennaleActiviteOK: boolVal });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Non vérifié" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="null">Non vérifié</SelectItem>
                            <SelectItem value="true">Oui</SelectItem>
                            <SelectItem value="false">Non</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2 border rounded-md p-3">
                        <Label>Montant de couverture suffisant ?</Label>
                        <Select
                          value={data.decennaleMontantOK === null ? "null" : data.decennaleMontantOK ? "true" : "false"}
                          onValueChange={(val) => {
                            const boolVal = val === "null" ? null : val === "true";
                            updateAdminData(company.id, company, { decennaleMontantOK: boolVal });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Non vérifié" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="null">Non vérifié</SelectItem>
                            <SelectItem value="true">Oui</SelectItem>
                            <SelectItem value="false">Non</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {showDecennaleAlert && (
                      <Alert variant="destructive" className="bg-destructive/10">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>Attention</AlertTitle>
                        <AlertDescription>
                          Risque non couvert par l'assurance décennale (activité ou montant insuffisant).
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}

                {adminConfig?.requireBiennale && (
                  <div className="space-y-4">
                    <h3 className="font-semibold border-b pb-2">Assurance Biennale</h3>
                    <div className="flex items-center justify-between border rounded-md p-3 max-w-md">
                      <Label>Garantie Biennale incluse</Label>
                      <Switch
                        checked={data.biennaleFournie ?? false}
                        onCheckedChange={(v) => updateAdminData(company.id, company, { biennaleFournie: v })}
                      />
                    </div>
                  </div>
                )}

                {adminConfig?.requireRC && (
                  <div className="space-y-4">
                    <h3 className="font-semibold border-b pb-2">Responsabilité Civile</h3>
                    <div className="flex items-center justify-between border rounded-md p-3 max-w-md">
                      <Label>Responsabilité Civile fournie</Label>
                      <Switch
                        checked={data.rcFournie ?? false}
                        onCheckedChange={(v) => updateAdminData(company.id, company, { rcFournie: v })}
                      />
                    </div>
                  </div>
                )}

                {(adminConfig?.customDocs?.length ?? 0) > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-semibold border-b pb-2">Autres documents</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {(adminConfig?.customDocs ?? []).map((doc) => (
                        <div key={doc} className="flex items-center justify-between border rounded-md p-3">
                          <Label className="truncate pr-4" title={doc}>{doc}</Label>
                          <Switch
                            checked={data.customDocsStatus?.[doc] ?? false}
                            onCheckedChange={(v) => updateCustomDoc(company.id, company, doc, v)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          );
        })}

        {companies.length === 0 && (
          <div className="text-center p-8 bg-muted/20 rounded-lg border border-dashed">
            <p className="text-muted-foreground">Aucune entreprise à évaluer pour ce lot.</p>
          </div>
        )}
      </div>
    </div>
  );
}
