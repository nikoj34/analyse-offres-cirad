import { ReactNode, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/projectStore";
import { useMultiProjectStore } from "@/store/multiProjectStore";
import { getSyntheseLabel } from "@/types/project";
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
  MessageSquare,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import ciradLogo from "@/assets/cirad-logo.png";
import { Footer } from "@/components/Footer";

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
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { project, switchLot } = useProjectStore();
  const { closeProject } = useMultiProjectStore();
  const location = useLocation();
  const navigate = useNavigate();
  const lot = project.lots[project.currentLotIndex];

  // Track which lots are expanded in the sidebar
  const [openLots, setOpenLots] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    init[project.currentLotIndex] = true;
    return init;
  });

  const toggleLot = (idx: number) => {
    setOpenLots((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleLotSubNav = (lotIdx: number, path: string) => {
    if (lotIdx !== project.currentLotIndex) {
      switchLot(lotIdx);
    }
    navigate(path);
  };

  // Build lot label
  const lotLabel = (l: typeof lot, idx: number) => {
    const num = l.lotNumber || String(idx + 1);
    const name = l.lotAnalyzed || l.label || `Lot ${idx + 1}`;
    return `Lot ${num} — ${name}`;
  };

  // Current lot for page header
  const isProjectPage = location.pathname === "/";
  const currentLotLabel = lotLabel(lot, project.currentLotIndex);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-border bg-sidebar overflow-y-auto">
          <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
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

          <nav className="flex flex-col gap-0.5 p-3">
            {/* 1. Données du projet */}
            <SidebarLink to="/" icon={FileText} label="Données du projet" />

            {/* For each lot: collapsible tree */}
            {project.lots.map((l, idx) => {
              const isOpen = openLots[idx] ?? false;
              const isActive = idx === project.currentLotIndex;
              const negoVersions = l.versions.slice(1);

              return (
                <div key={l.id} className="mt-1">
                  <Collapsible open={isOpen} onOpenChange={() => toggleLot(idx)}>
                    <CollapsibleTrigger
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      <Package className="h-4 w-4 shrink-0" />
                      <span className="truncate text-left flex-1">
                        {lotLabel(l, idx)}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 transition-transform",
                          isOpen && "rotate-180"
                        )}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-3 mt-0.5">
                        <button
                          onClick={() => handleLotSubNav(idx, "/lot")}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                            isActive && location.pathname === "/lot"
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                          )}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          Configuration
                        </button>
                        <button
                          onClick={() => handleLotSubNav(idx, "/prix")}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                            isActive && location.pathname === "/prix"
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                          )}
                        >
                          <Euro className="h-3.5 w-3.5 shrink-0" />
                          Analyse prix
                        </button>
                        <button
                          onClick={() => handleLotSubNav(idx, "/technique")}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                            isActive && location.pathname === "/technique"
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                          )}
                        >
                          <Wrench className="h-3.5 w-3.5 shrink-0" />
                          Analyse technique
                        </button>
                        <button
                          onClick={() => handleLotSubNav(idx, "/synthese")}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                            isActive && location.pathname === "/synthese"
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                          )}
                        >
                          <BarChart3 className="h-3.5 w-3.5 shrink-0" />
                          {getSyntheseLabel(l, 0)}
                        </button>

                        {/* Questions — visible si au moins une entreprise retenue pour négociation */}
                        {(() => {
                          const hasRetained = l.versions.some(v =>
                            Object.values(v.negotiationDecisions ?? {}).some(d => d === "retenue")
                          );
                          if (!hasRetained) return null;
                          return (
                            <button
                              onClick={() => handleLotSubNav(idx, "/questions")}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                                isActive && location.pathname === "/questions"
                                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                              )}
                            >
                              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                              Questions
                            </button>
                          );
                        })()}

                        {/* Négociations */}
                        {negoVersions.length > 0 && (
                          <Collapsible defaultOpen={isActive && negoVersions.length > 0}>
                            <CollapsibleTrigger
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors"
                            >
                              <GitBranch className="h-3.5 w-3.5 shrink-0" />
                              <span className="flex-1 text-left">Négociations</span>
                              <ChevronDown className="h-3 w-3 shrink-0" />
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-2 mt-0.5">
                                    {negoVersions.map((v, i) => {
                                  const round = i + 1;
                                  const negoLabel = `Négo ${round}`;
                                  return (
                                    <div key={v.id} className="space-y-0.5">
                                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        {negoLabel}
                                      </div>
                                      <button
                                        onClick={() => handleLotSubNav(idx, `/nego/${round}/prix`)}
                                        className={cn(
                                          "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors text-left w-full",
                                          isActive && location.pathname === `/nego/${round}/prix`
                                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                                        )}
                                      >
                                        <Euro className="h-3 w-3 shrink-0" />
                                        Prix
                                      </button>
                                      <button
                                        onClick={() => handleLotSubNav(idx, `/nego/${round}/technique`)}
                                        className={cn(
                                          "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors text-left w-full",
                                          isActive && location.pathname === `/nego/${round}/technique`
                                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                                        )}
                                      >
                                        <Wrench className="h-3 w-3 shrink-0" />
                                        Technique
                                      </button>
                                      <button
                                        onClick={() => handleLotSubNav(idx, `/nego/${round}/synthese`)}
                                        className={cn(
                                          "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors text-left w-full",
                                          isActive && location.pathname === `/nego/${round}/synthese`
                                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                                        )}
                                      >
                                        <BarChart3 className="h-3 w-3 shrink-0" />
                                        {getSyntheseLabel(l, round)}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}

                        {/* Export for this lot */}
                        <button
                          onClick={() => handleLotSubNav(idx, "/export")}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                            isActive && location.pathname === "/export"
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                          )}
                        >
                          <Download className="h-3.5 w-3.5 shrink-0" />
                          Export Excel
                        </button>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-[1600px] p-6 lg:p-8">
            {/* Dynamic lot header */}
            {!isProjectPage && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2">
                <Package className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-primary">
                  {currentLotLabel}
                </span>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
