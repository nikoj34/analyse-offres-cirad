import { lazy, Suspense, useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { GlobalSidebar } from "@/components/layout/GlobalSidebar";
import { useMultiProjectStore } from "@/store/multiProjectStore";
import { Footer } from "@/components/Footer";
import { useProjectStore } from "@/store/projectStore";
import { getRepository, getSessionUser } from "@/lib/storageRepository";
import { migrateToMultiLot } from "@/types/project";
import { toast } from "sonner";

const DRAFT_BACKUP_KEY = "cirad-draft-backup";
const DRAFT_BACKUP_INTERVAL_MS = 15 * 60 * 1000;

const Index = lazy(() => import("./pages/Index"));
const LotConfigPage = lazy(() => import("./pages/LotConfigPage"));
const AdministratifPage = lazy(() => import("./pages/AdministratifPage"));
const TechniquePage = lazy(() => import("./pages/TechniquePage"));
const PrixPage = lazy(() => import("./pages/PrixPage"));
const SynthesePage = lazy(() => import("./pages/SynthesePage"));
const VersionsPage = lazy(() => import("./pages/VersionsPage"));
const ExportPage = lazy(() => import("./pages/ExportPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const QuestionnairePage = lazy(() => import("./pages/QuestionnairePage"));
const ReponsesPage = lazy(() => import("./pages/ReponsesPage"));
const ConfigurationPage = lazy(() => import("./pages/ConfigurationPage"));
const StatistiquesPage = lazy(() => import("./pages/StatistiquesPage"));
const FAQPage = lazy(() => import("./pages/FAQPage"));
const PreparationNegoPage = lazy(() => import("./pages/PreparationNegoPage"));
const DeroulementNegoPage = lazy(() => import("./pages/DeroulementNegoPage"));

const queryClient = new QueryClient();

function ProjectSync() {
  const { currentProjectId, projects, saveCurrentProject } = useMultiProjectStore();
  const { project } = useProjectStore();

  // Load project data when switching projects
  useEffect(() => {
    if (currentProjectId && projects[currentProjectId]) {
      const savedProject = migrateToMultiLot(projects[currentProjectId]);
      useProjectStore.setState({ project: savedProject });
    }
  }, [currentProjectId]);

  // Auto-save current project (debounced)
  useEffect(() => {
    if (currentProjectId && project.id === currentProjectId) {
      const timer = setTimeout(() => {
        saveCurrentProject(project);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [project, currentProjectId, saveCurrentProject]);

  // Heartbeat to keep lock alive
  useEffect(() => {
    if (!currentProjectId) return;
    const userId = getSessionUser();
    const interval = setInterval(() => {
      getRepository().heartbeat(currentProjectId, userId).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [currentProjectId]);

  // Anti-crash local : brouillon du projet en cours toutes les 15 min
  useEffect(() => {
    if (!currentProjectId || project.id !== currentProjectId) return;
    const saveDraft = () => {
      try {
        const payload = { project, savedAt: new Date().toISOString() };
        localStorage.setItem(DRAFT_BACKUP_KEY, JSON.stringify(payload));
      } catch {}
    };
    saveDraft();
    const interval = setInterval(saveDraft, DRAFT_BACKUP_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [currentProjectId, project]);

  return null;
}

function DraftRestorePrompt() {
  const { currentProjectId, restoreDraft } = useMultiProjectStore();
  const prompted = useRef(false);

  useEffect(() => {
    if (currentProjectId !== null || prompted.current) return;
    try {
      const raw = localStorage.getItem(DRAFT_BACKUP_KEY);
      if (!raw) return;
      const { project: draft, savedAt } = JSON.parse(raw);
      if (!draft?.id) return;
      prompted.current = true;
      const at = savedAt ? new Date(savedAt).toLocaleString("fr-FR") : "";
      toast.info(`Un brouillon a été trouvé${at ? ` (sauvegardé le ${at})` : ""}.`, {
        duration: 12000,
        action: {
          label: "Restaurer le brouillon",
          onClick: () => {
            restoreDraft(migrateToMultiLot(draft));
            localStorage.removeItem(DRAFT_BACKUP_KEY);
          },
        },
      });
    } catch {}
  }, [currentProjectId, restoreDraft]);

  return null;
}

const App = () => {
  const { currentProjectId, ready } = useMultiProjectStore();

  // Always start on projects page on app load/refresh
  useEffect(() => {
    useMultiProjectStore.getState().closeProject();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <ProjectSync />
        <DraftRestorePrompt />
        <HashRouter>
          <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Chargement…</div>}>
          {currentProjectId ? (
            <AppLayout>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/lot" element={<LotConfigPage />} />
                <Route path="/version/:vIndex/administratif" element={<AdministratifPage />} />
                {/* Routes canoniques : toutes avec :vIndex pour isolation Analyse initiale / Négociation */}
                <Route path="/version/:vIndex/prix" element={<PrixPage />} />
                <Route path="/version/:vIndex/prix/:companyId" element={<PrixPage />} />
                <Route path="/version/:vIndex/technique" element={<TechniquePage />} />
                <Route path="/version/:vIndex/technique/:companyId" element={<TechniquePage />} />
                <Route path="/version/:vIndex/synthese" element={<SynthesePage />} />
                <Route path="/version/:vIndex/prep/:companyId" element={<PreparationNegoPage />} />
                <Route path="/version/:vIndex/deroulement/:companyId" element={<DeroulementNegoPage />} />
                {/* Redirections anciennes routes vers /version/0/... */}
                <Route path="/prix" element={<Navigate to="/version/0/prix" replace />} />
                <Route path="/prix/:companyIndex" element={<Navigate to="/version/0/prix" replace />} />
                <Route path="/technique" element={<Navigate to="/version/0/technique" replace />} />
                <Route path="/technique/:companyIndex" element={<Navigate to="/version/0/technique" replace />} />
                <Route path="/synthese" element={<Navigate to="/version/0/synthese" replace />} />
                <Route path="/questions" element={<QuestionnairePage />} />
                <Route path="/reponses" element={<ReponsesPage />} />
                <Route path="/questions/:round" element={<QuestionnairePage />} />
                <Route path="/versions" element={<VersionsPage />} />
                <Route path="/export" element={<ExportPage />} />
                <Route path="/config" element={<ConfigurationPage />} />
                <Route path="*" element={<Index />} />

              </Routes>
            </AppLayout>
          ) : (
            <div className="flex min-h-screen flex-col bg-background">
              <div className="flex flex-1 min-h-0">
                <GlobalSidebar />
                <main className="flex-1 overflow-auto">
                  <Routes>
                    <Route path="/config" element={<ConfigurationPage />} />
                    <Route path="/statistiques" element={<StatistiquesPage />} />
                    <Route path="/faq" element={<FAQPage />} />
                    <Route path="*" element={<ProjectsPage />} />
                  </Routes>
                </main>
              </div>
              <Footer />
            </div>
          )}
          </Suspense>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
