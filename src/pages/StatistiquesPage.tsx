import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMultiProjectStore } from "@/store/multiProjectStore";
import type { LotData, NegotiationVersion } from "@/types/project";
import { BarChart3, FolderOpen, Database, UserPen, Euro, TrendingDown, Building2, Calendar } from "lucide-react";
import { useMemo } from "react";
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from "recharts";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

const fmtEuro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

/** Montant total d'une entreprise dans une version (somme des priceEntries). */
function getVersionCompanyTotal(version: NegotiationVersion | undefined, companyId: number): number {
  if (!version?.priceEntries) return 0;
  return version.priceEntries
    .filter((e) => e.companyId === companyId)
    .reduce((sum, e) => sum + (e.dpgf1 ?? 0) + (e.dpgf2 ?? 0), 0);
}

/** Pour un lot, récupère la version avec attributaire validé et l'id attributaire. */
function getAttributaireFromLot(lot: LotData): { version: NegotiationVersion; companyId: number } | null {
  for (const v of lot.versions ?? []) {
    if (!v.validated) continue;
    const entry = Object.entries(v.negotiationDecisions ?? {}).find(([, d]) => d === "attributaire");
    if (entry) return { version: v, companyId: Number(entry[0]) };
  }
  return null;
}

/** Génère une couleur claire distincte par index (teinte répartie sur 360°). */
function getColorForIndex(index: number, total: number): string {
  const hue = total > 0 ? (360 * index) / total % 360 : 0;
  return `hsl(${hue}, 55%, 68%)`;
}

export default function StatistiquesPage() {
  const { projects: allProjects } = useMultiProjectStore();

  const stats = useMemo(() => {
    const projectIds = Object.keys(allProjects);
    const count = projectIds.length;
    const jsonSize = count > 0
      ? new Blob([JSON.stringify(allProjects)]).size
      : 0;
    const totalLots = Object.values(allProjects).reduce(
      (sum, p) => sum + (p.lots?.length ?? 1),
      0
    );
    const totalCompanies = Object.values(allProjects).reduce((sum, p) => {
      for (const lot of p.lots ?? []) {
        sum += lot.companies?.length ?? 0;
      }
      return sum;
    }, 0);
    const byRedacteur: Record<string, number> = {};
    for (const p of Object.values(allProjects)) {
      if (!p?.info) continue;
      const author = p.info.author?.trim() || "(Sans rédacteur)";
      byRedacteur[author] = (byRedacteur[author] ?? 0) + 1;
    }
    const byRedacteurList = Object.entries(byRedacteur).sort((a, b) => b[1] - a[1]);

    const montantNotifieByYear: Record<string, number> = {};
    const gainNegociationByYear: Record<string, number> = {};
    let totalMontantNotifie = 0;
    let totalGainNegociation = 0;
    const projectsByYear: Record<string, number> = {};
    let projectsWithNegociation = 0;

    for (const p of Object.values(allProjects)) {
      const year = p?.info?.analysisDate?.slice(0, 4)?.trim() || "Sans année";
      projectsByYear[year] = (projectsByYear[year] ?? 0) + 1;
      let projectHasNego = false;

      for (const lot of p.lots ?? []) {
        const attr = getAttributaireFromLot(lot);
        if (!attr) continue;
        const montant = getVersionCompanyTotal(attr.version, attr.companyId);
        montantNotifieByYear[year] = (montantNotifieByYear[year] ?? 0) + montant;
        totalMontantNotifie += montant;

        const v0 = lot.versions?.[0];
        if (v0) {
          const initialTotal = getVersionCompanyTotal(v0, attr.companyId);
          const gain = initialTotal - montant;
          gainNegociationByYear[year] = (gainNegociationByYear[year] ?? 0) + gain;
          totalGainNegociation += gain;
        }
        if ((lot.versions?.length ?? 0) > 1) projectHasNego = true;
      }
      if (projectHasNego) projectsWithNegociation += 1;
    }

    const montantNotifieByYearList = Object.entries(montantNotifieByYear).sort((a, b) => a[0].localeCompare(b[0]));
    const gainNegociationByYearList = Object.entries(gainNegociationByYear).sort((a, b) => a[0].localeCompare(b[0]));
    const projectsByYearList = Object.entries(projectsByYear).sort((a, b) => a[0].localeCompare(b[0]));

    return {
      projectCount: count,
      totalLots,
      totalCompanies,
      backupSizeBytes: jsonSize,
      byRedacteur: byRedacteurList,
      montantNotifieByYearList,
      gainNegociationByYearList,
      totalMontantNotifie,
      totalGainNegociation,
      projectsByYearList,
      projectsWithNegociation,
    };
  }, [allProjects]);

  return (
    <div className="mx-auto max-w-[1600px] p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-7 w-7" />
          Statistiques
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vue d&apos;ensemble des analyses et de l&apos;utilisation.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nombre de projets</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.projectCount}</div>
            <p className="text-xs text-muted-foreground">analyses dans la base</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taille de la sauvegarde</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(stats.backupSizeBytes)}</div>
            <p className="text-xs text-muted-foreground">équivalent export JSON</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lots au total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalLots}</div>
            <p className="text-xs text-muted-foreground">sur tous les projets</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entreprises consultées</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalCompanies}</div>
            <p className="text-xs text-muted-foreground">nombre total sur tous les lots</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Montant total notifié</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtEuro(stats.totalMontantNotifie)}</div>
            <p className="text-xs text-muted-foreground">somme des montants attribuaires</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gain négociation (total)</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={stats.totalGainNegociation < 0 ? "text-2xl font-bold text-red-500" : "text-2xl font-bold text-green-600"}>
              {fmtEuro(stats.totalGainNegociation)}
            </div>
            <p className="text-xs text-muted-foreground">économie vs offre initiale</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projets avec négociation</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.projectsWithNegociation}</div>
            <p className="text-xs text-muted-foreground">au moins une phase négociation</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Euro className="h-5 w-5" />
              Montant total notifié par année
            </CardTitle>
            <CardDescription>
              Somme des montants attribuaires (HT) par année d&apos;analyse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.montantNotifieByYearList.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun montant notifié (aucun attributaire validé).</p>
            ) : (
              <ul className="space-y-2">
                {stats.montantNotifieByYearList.map(([year, amount]) => (
                  <li key={year} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <span className="font-medium">{year}</span>
                    <span className="font-mono font-medium">{fmtEuro(amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              Gain négociation par année
            </CardTitle>
            <CardDescription>
              Économie réalisée par rapport à l&apos;offre initiale, par année d&apos;analyse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.gainNegociationByYearList.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun gain calculé.</p>
            ) : (
              <ul className="space-y-2">
                {stats.gainNegociationByYearList.map(([year, gain]) => (
                  <li key={year} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <span className="font-medium">{year}</span>
                    <span className={`font-mono ${gain < 0 ? "font-bold text-red-500" : "font-medium text-green-600"}`}>
                      {fmtEuro(gain)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Nombre de projets par année
          </CardTitle>
          <CardDescription>
            Répartition des projets selon l&apos;année de la date d&apos;analyse (données du projet).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.projectsByYearList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune date d&apos;analyse renseignée.</p>
          ) : (
            <ul className="space-y-2">
              {stats.projectsByYearList.map(([year, n]) => (
                <li key={year} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span className="font-medium">{year}</span>
                  <span className="text-muted-foreground">{n} projet{n > 1 ? "s" : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPen className="h-5 w-5" />
            Par rédacteur
          </CardTitle>
          <CardDescription>
            Nombre de projets par rédacteur (champ Rédacteur des données du projet).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.byRedacteur.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun projet pour le moment.</p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="w-full max-w-[420px] h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.byRedacteur.map(([name, value]) => ({ name, value }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={2}
                      label={({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
                        const RADIAN = Math.PI / 180;
                        const r = (innerRadius + outerRadius) / 2;
                        const x = cx + r * Math.cos(-midAngle * RADIAN);
                        const y = cy + r * Math.sin(-midAngle * RADIAN);
                        return (
                          <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="text-sm font-semibold fill-foreground">
                            {value}
                          </text>
                        );
                      }}
                      labelLine={false}
                    >
                      {stats.byRedacteur.map((_, index) => (
                        <Cell key={index} fill={getColorForIndex(index, stats.byRedacteur.length)} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${value} projet${value > 1 ? "s" : ""}`, "Projets"]}
                    />
                    <Legend wrapperStyle={{ paddingTop: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
