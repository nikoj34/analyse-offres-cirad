import { ReactNode, useState, useRef, useEffect } from "react";
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
  ChevronRight,
  ArrowLeft,
  Package,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import ciradLogo from "@/assets/ditam-logo.png";
import { Footer } from "@/components/Footer";

function SidebarLink({
  to,
  icon: Icon,
  label,
  blockCondition,
  onBlock,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  blockCondition?: boolean;
  onBlock?: () => void;
}) {
  const location = useLocation();
  const isActive = location.pathname === to;
  const shouldBlock = blockCondition && to !== "/lot";
  return (
    <NavLink
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-sidebar-foreground hover:bg-sidebar-accent/20"
      )}
      onClick={shouldBlock ? (e) => { e.preventDefault(); onBlock?.(); } : undefined}
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
  const lot = project.lots?.[project.currentLotIndex ?? 0];

  // Redirect to /lot on first mount (project open)
  const hasRedirected = useRef(false);
  useEffect(() => {
    if (!hasRedirected.current) {
      hasRedirected.current = true;
      navigate('/lot');
    }
  }, []);

  // Configuration incohérente : variante interdite = NON et les deux autres = NON → message bloquant (on ne peut pas quitter /lot)
  const isVarianteIncoherent =
    location.pathname === "/lot" &&
    !!lot &&
    lot.varianteInterdite === false &&
    lot.varianteAutorisee !== true &&
    lot.varianteExigee !== true;
  const [showVarianteIncoherentModal, setShowVarianteIncoherentModal] = useState(false);

  const handleLotSubNav = (lotIdx: number, path: string) => {
    if (path !== "/lot" && isVarianteIncoherent) {
      setShowVarianteIncoherentModal(true);
      return;
    }
    if (lotIdx !== project.currentLotIndex) {
      switchLot(lotIdx);
    }
    navigate(path);
  };

  // Track which lots are expanded in the sidebar
  const [openLots, setOpenLots] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    init[project.currentLotIndex] = true;
    return init;
  });

  const toggleLot = (idx: number) => {
    setOpenLots((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Build lot label (optional chaining pour éviter crash si donnée absente)
  const lotLabel = (l: typeof lot, idx: number) => {
    const num = l?.lotNumber ?? String(idx + 1);
    const name = l?.lotAnalyzed ?? l?.label ?? `Lot ${idx + 1}`;
    return `Lot ${num} — ${name}`;
  };

  // Current lot for page header
  const isProjectPage = location.pathname === "/";
  const currentLotLabel = lot ? lotLabel(lot, project.currentLotIndex ?? 0) : "Lot";

  // Ordre des pages pour le bouton "Page suivante" (path sans /companyIndex pour prix/technique)
  const pageOrder = ["/", "/lot", "/prix", "/technique", "/synthese", "/export"];
  const pathBase = location.pathname.replace(/\/\d+$/, "");
  const currentIndex = pageOrder.indexOf(pathBase);
  const nextPath = currentIndex >= 0 && currentIndex < pageOrder.length - 1 ? pageOrder[currentIndex + 1] : null;
  const showNextPageButton = nextPath !== null && location.pathname !== "/config" && pathBase !== "/prix" && pathBase !== "/technique";

  /** Determine dynamic Questions label for a lot (Questions / Réponses après import) */
  const getQuestionsLabel = (l: typeof lot, round?: number): string => {
    const totalVersions = (l?.versions?.length ?? 0);
    if (totalVersions >= 3) {
      return round === 2 ? "Questions négo 2" : "Questions négo 1";
    }
    const hasResponsesImported = (l?.versions?.[0]?.questionnaire?.questionnaires ?? []).some((q) => q.receptionMode === true);
    return hasResponsesImported ? "Questions / Réponses" : "Questions";
  };

  /** Une fois l'import des réponses fait, l'entrée Questions passe au-dessus de Synthèse */
  const hasResponsesImported = (l: typeof lot) =>
    (l?.versions?.[0]?.questionnaire?.questionnaires ?? []).some((q) => q.receptionMode === true);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1">
        {/* Sidebar : menu lots + Configuration tout en bas */}
        <aside className="w-64 shrink-0 border-r border-border bg-sidebar flex flex-col min-h-screen">
          <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4 shrink-0">
            <img src={ciradLogo} alt="DITAM" className="h-8" />
            <span className="text-sm font-bold text-sidebar-foreground leading-tight">
              Analyse d'offres
            </span>
          </div>

          <div className="px-3 pt-2 pb-1 shrink-0">
            <button
              onClick={() => closeProject()}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full rounded-md px-2 py-1.5 hover:bg-sidebar-accent/50"
            >
              <ArrowLeft className="h-3 w-3" />
              Retour aux projets
            </button>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <nav className="flex flex-col gap-0.5 p-3 flex-1 overflow-y-auto">
            {/* 1. Données du projet */}
            <SidebarLink to="/" icon={FileText} label="Données du projet" />

            {/* For each lot: collapsible tree */}
            {(project.lots ?? []).map((l, idx) => {
              const isOpen = openLots[idx] ?? false;
              const isActive = idx === project.currentLotIndex;
              const negoVersions = (l?.versions ?? []).slice(1);

              // Questions / Réponses visibles uniquement si la case « Question(s) à poser » est cochée pour au moins une entreprise (pas si « Retenue en négociation »)
              const hasQuestionsChecked = (l?.companies ?? []).some((c) => c.hasQuestions === true);

                  return (
                <div key={l?.id ?? idx} className="mt-1">
                  <Collapsible open={isOpen} onOpenChange={() => toggleLot(idx)}>
                    <CollapsibleTrigger
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent/15 text-[hsl(var(--sidebar-accent))] font-semibold"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/10 hover:text-sidebar-foreground"
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
                              ? "bg-green-600 text-white font-medium dark:bg-green-700 dark:text-white"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/20"
                          )}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          Configuration
                        </button>
                        <button
                          onClick={() => handleLotSubNav(idx, "/prix")}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                            isActive &&
                              (location.pathname === "/prix" ||
                                location.pathname.startsWith("/prix/"))
                              ? "bg-green-600 text-white font-medium dark:bg-green-700 dark:text-white"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/20"
                          )}
                        >
                          <Euro className="h-3.5 w-3.5 shrink-0" />
                          Analyse prix
                        </button>
                        <button
                          onClick={() => handleLotSubNav(idx, "/technique")}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                            isActive &&
                              (location.pathname === "/technique" ||
                                location.pathname.startsWith("/technique/"))
                              ? "bg-green-600 text-white font-medium dark:bg-green-700 dark:text-white"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/20"
                          )}
                        >
                          <Wrench className="h-3.5 w-3.5 shrink-0" />
                          Analyse technique
                        </button>

                        {/* Questions / Réponses — au-dessus de Synthèse uniquement après import des réponses */}
                        {hasQuestionsChecked && hasResponsesImported(l) && (
                          <button
                            onClick={() => handleLotSubNav(idx, "/questions")}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                              isActive && location.pathname === "/questions"
                                ? "bg-green-600 text-white font-medium dark:bg-green-700 dark:text-white"
                                : "text-sidebar-foreground hover:bg-sidebar-accent/20"
                            )}
                          >
                            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                            {getQuestionsLabel(l)}
                          </button>
                        )}

                        <button
                          onClick={() => handleLotSubNav(idx, "/synthese")}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                            isActive && location.pathname === "/synthese"
                              ? "bg-green-600 text-white font-medium dark:bg-green-700 dark:text-white"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/20"
                          )}
                        >
                          <BarChart3 className="h-3.5 w-3.5 shrink-0" />
                          {getSyntheseLabel(l, 0)}
                        </button>

                        {/* Questions — en dessous de Synthèse tant qu'aucun import de réponses n'a été fait */}
                        {hasQuestionsChecked && !hasResponsesImported(l) && (
                          <button
                            onClick={() => handleLotSubNav(idx, "/questions")}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                              isActive && location.pathname === "/questions"
                                ? "bg-green-600 text-white font-medium dark:bg-green-700 dark:text-white"
                                : "text-sidebar-foreground hover:bg-sidebar-accent/20"
                            )}
                          >
                            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                            {getQuestionsLabel(l)}
                          </button>
                        )}

                        {/* Négociations */}
                        {negoVersions.length > 0 && (
                          <Collapsible defaultOpen={isActive && negoVersions.length > 0}>
                            <CollapsibleTrigger
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent/20 transition-colors"
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

                                  // Check if questions négo 2 should show (retenue ou Questions)
                                  const hasRetainedThisRound = Object.values(v.negotiationDecisions ?? {}).some(d => d === "retenue" || d === "questions_reponses");
                                  const showQuestionsAfterThisRound = round === 1 && hasRetainedThisRound && negoVersions.length >= 2;

                                  return (
                                    <div key={v.id} className="space-y-0.5">
                                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        {negoLabel}
                                      </div>
                                      <button
                                        onClick={() => handleLotSubNav(idx, `/nego/${round}/prix`)}
                                        className={cn(
                                          "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors text-left w-full",
                                          isActive &&
                                            (location.pathname === `/nego/${round}/prix` ||
                                              location.pathname.startsWith(`/nego/${round}/prix/`))
                                            ? "bg-green-600 text-white font-medium dark:bg-green-700 dark:text-white"
                                            : "text-sidebar-foreground hover:bg-sidebar-accent/20"
                                        )}
                                      >
                                        <Euro className="h-3 w-3 shrink-0" />
                                        Prix
                                      </button>
                                      <button
                                        onClick={() => handleLotSubNav(idx, `/nego/${round}/technique`)}
                                        className={cn(
                                          "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors text-left w-full",
                                          isActive &&
                                            (location.pathname === `/nego/${round}/technique` ||
                                              location.pathname.startsWith(
                                                `/nego/${round}/technique/`
                                              ))
                                            ? "bg-green-600 text-white font-medium dark:bg-green-700 dark:text-white"
                                            : "text-sidebar-foreground hover:bg-sidebar-accent/20"
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
                                            ? "bg-green-600 text-white font-medium dark:bg-green-700 dark:text-white"
                                            : "text-sidebar-foreground hover:bg-sidebar-accent/20"
                                        )}
                                      >
                                        <BarChart3 className="h-3 w-3 shrink-0" />
                                        {getSyntheseLabel(l, round)}
                                      </button>

                                      {/* Questions négo 2 — after négo 1 synthese */}
                                      {showQuestionsAfterThisRound && (
                                        <button
                                          onClick={() => handleLotSubNav(idx, "/questions/2")}
                                          className={cn(
                                            "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors text-left w-full",
                                            isActive && location.pathname.startsWith("/questions/2")
                                              ? "bg-green-600 text-white font-medium dark:bg-green-700 dark:text-white"
                                              : "text-sidebar-foreground hover:bg-sidebar-accent/20"
                                          )}
                                        >
                                          <MessageSquare className="h-3 w-3 shrink-0" />
                                          {getQuestionsLabel(l, 2)}
                                        </button>
                                      )}
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
                              ? "bg-green-600 text-white font-medium dark:bg-green-700 dark:text-white"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/20"
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
          </div>
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
            {showNextPageButton && (
              <div className="mt-8 flex justify-end border-t border-border pt-6">
                <Button
                  onClick={() => {
                    if (isVarianteIncoherent) {
                      setShowVarianteIncoherentModal(true);
                    } else {
                      navigate(nextPath!);
                    }
                  }}
                  className="gap-2"
                  size="lg"
                >
                  Page suivante
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>
      <Footer />

      <AlertDialog open={showVarianteIncoherentModal} onOpenChange={setShowVarianteIncoherentModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Configuration incohérente</AlertDialogTitle>
            <AlertDialogDescription>
              Variante interdite = NON alors que Variante autorisée et Variante exigée sont à NON. Vous ne pouvez pas quitter cette page tant que vous n&apos;avez pas corrigé la configuration (mettre Variante interdite = OUI, ou Variante autorisée = OUI, ou Variante exigée = OUI) dans Configuration du lot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowVarianteIncoherentModal(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
