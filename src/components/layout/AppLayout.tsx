import { ReactNode, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projectStore";
import { useMultiProjectStore } from "@/store/multiProjectStore";
import { getVersionDisplayLabel } from "@/types/project";
import {
  FileText,
  Wrench,
  Euro,
  BarChart3,
  GitBranch,
  Download,
  ChevronDown,
  ArrowLeft,
  Package,
  Plus,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import ciradLogo from "@/assets/cirad-logo.png";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";

function SidebarLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <NavLink
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { project, switchLot, addLot } = useProjectStore();
  const lot = project.lots[project.currentLotIndex];
  const { closeProject } = useMultiProjectStore();
  const [negoOpen, setNegoOpen] = useState(true);
  const [lotsOpen, setLotsOpen] = useState(true);
  const negoVersions = lot.versions.slice(1);
  const hasMultipleLots = project.lots.length > 1;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1">
        <aside className="w-64 shrink-0 border-r border-border bg-sidebar overflow-y-auto">
          <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
            <img src={ciradLogo} alt="CIRAD" className="h-8" />
            <span className="text-sm font-bold text-sidebar-foreground leading-tight">
              Analyse d'offres
            </span>
          </div>
          <div className="px-3 pt-2 pb-1">
            <button
              onClick={() => closeProject()}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full rounded-md px-2 py-1.5 hover:bg-sidebar-accent/50"
            >
              <ArrowLeft className="h-3 w-3" />
              Retour aux projets
            </button>
          </div>

          {/* Lot selector */}
          {project.lots.length > 0 && (
            <div className="px-3 pt-2">
              <Collapsible open={lotsOpen} onOpenChange={setLotsOpen}>
                <CollapsibleTrigger
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <Package className="h-4 w-4" />
                  Lots ({project.lots.length})
                  <ChevronDown
                    className={cn(
                      "ml-auto h-4 w-4 transition-transform",
                      lotsOpen && "rotate-180"
                    )}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pl-3 flex flex-col gap-0.5 mt-1">
                    {project.lots.map((l, idx) => (
                      <button
                        key={l.id}
                        onClick={() => switchLot(idx)}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors text-left w-full",
                          idx === project.currentLotIndex
                            ? "bg-primary/10 text-primary font-semibold border border-primary/20"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                        )}
                      >
                        <Package className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{l.label || `Lot ${idx + 1}`}</span>
                        {l.lotAnalyzed && (
                          <span className="text-xs text-muted-foreground truncate ml-auto">
                            {l.lotAnalyzed}
                          </span>
                        )}
                      </button>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-start gap-2 text-xs mt-1"
                      onClick={addLot}
                    >
                      <Plus className="h-3 w-3" />
                      Ajouter un lot
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          <nav className="flex flex-col gap-1 p-3">
            {hasMultipleLots && (
              <div className="px-3 py-1 text-xs font-semibold text-primary uppercase tracking-wider border-b border-border mb-1">
                {lot.label || `Lot ${project.currentLotIndex + 1}`}
              </div>
            )}
            <SidebarLink to="/" icon={FileText} label="Données du projet" />
            <SidebarLink to="/technique" icon={Wrench} label="Analyse Technique" />
            <SidebarLink to="/prix" icon={Euro} label="Analyse des prix" />
            <SidebarLink to="/synthese" icon={BarChart3} label="Synthèse" />

            <Collapsible open={negoOpen} onOpenChange={setNegoOpen}>
              <CollapsibleTrigger
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <GitBranch className="h-4 w-4" />
                Négociations
                <ChevronDown
                  className={cn(
                    "ml-auto h-4 w-4 transition-transform",
                    negoOpen && "rotate-180"
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pl-3 flex flex-col gap-0.5">
                  <SidebarLink to="/versions" icon={GitBranch} label="Cycles" />
                  {negoVersions.map((v, i) => {
                    const round = i + 1;
                    const shortLabel = round === 1 ? "Négo 1" : "Négo 2";
                    return (
                      <div key={v.id} className="space-y-0.5">
                        <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {shortLabel}
                        </div>
                        <SidebarLink
                          to={`/nego/${round}/technique`}
                          icon={Wrench}
                          label={`Technique ${shortLabel}`}
                        />
                        <SidebarLink
                          to={`/nego/${round}/prix`}
                          icon={Euro}
                          label={`Prix ${shortLabel}`}
                        />
                        <SidebarLink
                          to={`/nego/${round}/synthese`}
                          icon={BarChart3}
                          label={`Synthèse ${shortLabel}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <SidebarLink to="/export" icon={Download} label="Export Excel" />
          </nav>
        </aside>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-[1600px] p-6 lg:p-8">{children}</div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
