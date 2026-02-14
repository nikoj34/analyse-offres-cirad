import { useProjectStore } from "@/store/projectStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NOTATION_VALUES } from "@/types/project";
import { useMemo } from "react";
import { Check, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SynthesePage = () => {
  const { project, toggleNegotiationRetained, isNegotiationRetained } = useProjectStore();
  const { companies, weightingCriteria, versions, currentVersionId, lotLines } = project;

  const activeCompanies = companies.filter((c) => c.name.trim() !== "");
  const currentVersion = versions.find((v) => v.id === currentVersionId);
  const technicalCriteria = weightingCriteria.filter((c) => c.id !== "prix");
  const prixCriterion = weightingCriteria.find((c) => c.id === "prix");
  const prixWeight = prixCriterion?.weight ?? 40;
  const activeLotLines = lotLines.filter((l) => l.label.trim() !== "");

  // Separate criteria for display
  const valueTechnique = technicalCriteria.filter((c) => c.id !== "environnemental" && c.id !== "planning");
  const envCriterion = technicalCriteria.find((c) => c.id === "environnemental");
  const planCriterion = technicalCriteria.find((c) => c.id === "planning");

  const results = useMemo(() => {
    if (!currentVersion) return [];

    const techScores: Record<number, { total: number; technique: number; env: number; planning: number }> = {};
    for (const company of activeCompanies) {
      if (company.status === "ecartee") {
        techScores[company.id] = { total: 0, technique: 0, env: 0, planning: 0 };
        continue;
      }
      let total = 0;
      let technique = 0;
      let env = 0;
      let planning = 0;

      for (const criterion of technicalCriteria) {
        let criterionScore = 0;
        if (criterion.subCriteria.length > 0) {
          let raw = 0;
          const subTotal = criterion.subCriteria.reduce((s, sc) => s + sc.weight, 0);
          for (const sub of criterion.subCriteria) {
            const note = currentVersion.technicalNotes.find(
              (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
            );
            if (note?.notation) {
              const subWeight = subTotal > 0 ? sub.weight / subTotal : 0;
              raw += NOTATION_VALUES[note.notation] * subWeight;
            }
          }
          criterionScore = (raw / 5) * criterion.weight;
        } else {
          const note = currentVersion.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
          );
          if (note?.notation) {
            criterionScore = (NOTATION_VALUES[note.notation] / 5) * criterion.weight;
          }
        }

        if (criterion.id === "environnemental") env = criterionScore;
        else if (criterion.id === "planning") planning = criterionScore;
        else technique += criterionScore;
        total += criterionScore;
      }
      techScores[company.id] = { total, technique, env, planning };
    }

    const companyPriceTotals: Record<number, number> = {};
    for (const company of activeCompanies) {
      if (company.status === "ecartee") continue;
      let sum = 0;
      for (const line of activeLotLines) {
        const entry = currentVersion.priceEntries.find(
          (e) => e.companyId === company.id && e.lotLineId === line.id
        );
        sum += (entry?.dpgf1 ?? 0) + (entry?.dpgf2 ?? 0);
      }
      companyPriceTotals[company.id] = sum;
    }

    const validPrices = Object.values(companyPriceTotals).filter((v) => v > 0);
    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;

    const priceScores: Record<number, number> = {};
    for (const [id, total] of Object.entries(companyPriceTotals)) {
      priceScores[Number(id)] = total > 0 ? (minPrice / total) * prixWeight : 0;
    }

    return activeCompanies.map((company) => {
      const ts = techScores[company.id] ?? { total: 0, technique: 0, env: 0, planning: 0 };
      const priceScore = company.status === "ecartee" ? 0 : (priceScores[company.id] ?? 0);
      const priceTotal = company.status === "ecartee" ? 0 : (companyPriceTotals[company.id] ?? 0);
      const globalScore = ts.total + priceScore;

      return {
        company,
        techScore: ts.total,
        techniqueScore: ts.technique,
        envScore: ts.env,
        planningScore: ts.planning,
        priceScore,
        priceTotal,
        globalScore,
      };
    });
  }, [activeCompanies, technicalCriteria, currentVersion, prixWeight, activeLotLines]);

  const sorted = useMemo(() => {
    return [...results].sort((a, b) => {
      if (a.company.status === "ecartee" && b.company.status !== "ecartee") return 1;
      if (a.company.status !== "ecartee" && b.company.status === "ecartee") return -1;
      return b.globalScore - a.globalScore;
    });
  }, [results]);

  const valueTechWeight = valueTechnique.reduce((s, c) => s + c.weight, 0);
  const envWeight = envCriterion?.weight ?? 0;
  const planWeight = planCriterion?.weight ?? 0;
  const maxTotal = valueTechWeight + envWeight + planWeight + prixWeight;

  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

  if (activeCompanies.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Synthèse & Classement</h1>
          <p className="text-sm text-muted-foreground">
            Veuillez d'abord saisir des entreprises dans la Page de Garde.
          </p>
        </div>
      </div>
    );
  }

  let rank = 0;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Synthèse & Classement</h1>
        <p className="text-sm text-muted-foreground">
          Classement global des entreprises (technique + prix). Total sur {maxTotal} pts.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classement Général</CardTitle>
          <CardDescription>Les entreprises écartées sont affichées mais non classées.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rang</TableHead>
                <TableHead>Entreprise</TableHead>
                <TableHead className="text-right">Technique / {valueTechWeight}</TableHead>
                {envWeight > 0 && <TableHead className="text-right">Enviro. / {envWeight}</TableHead>}
                {planWeight > 0 && <TableHead className="text-right">Planning / {planWeight}</TableHead>}
                <TableHead className="text-right">Prix / {prixWeight}</TableHead>
                <TableHead className="text-right">Montant Total</TableHead>
                <TableHead className="text-right">Globale / {maxTotal}</TableHead>
                <TableHead className="text-center">Statut</TableHead>
                <TableHead className="text-center">Phase Négo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row) => {
                const isExcluded = row.company.status === "ecartee";
                if (!isExcluded) rank++;
                const retained = isNegotiationRetained(row.company.id);
                return (
                  <TableRow key={row.company.id} className={isExcluded ? "opacity-50" : ""}>
                    <TableCell className="font-semibold">
                      {isExcluded ? "—" : rank}
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.company.id}. {row.company.name}
                    </TableCell>
                    <TableCell className="text-right">
                      {isExcluded ? "—" : row.techniqueScore.toFixed(1)}
                    </TableCell>
                    {envWeight > 0 && (
                      <TableCell className="text-right">
                        {isExcluded ? "—" : row.envScore.toFixed(1)}
                      </TableCell>
                    )}
                    {planWeight > 0 && (
                      <TableCell className="text-right">
                        {isExcluded ? "—" : row.planningScore.toFixed(1)}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      {isExcluded ? "—" : row.priceScore.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right">
                      {isExcluded ? "—" : fmt(row.priceTotal)}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {isExcluded ? "—" : row.globalScore.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-center">
                      {isExcluded ? (
                        <Badge variant="destructive">
                          Écartée{row.company.exclusionReason ? ` — ${row.company.exclusionReason}` : ""}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">—</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {isExcluded ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Button
                          variant={retained ? "default" : "outline"}
                          size="sm"
                          className="gap-1"
                          onClick={() => toggleNegotiationRetained(row.company.id)}
                        >
                          {retained ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          {retained ? "Retenue" : "Non retenue"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SynthesePage;
