import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useMultiProjectStore } from "@/store/multiProjectStore";
import { useProjectStore } from "@/store/projectStore";
import { getRepository, getSessionUser } from "@/lib/storageRepository";
import { migrateToMultiLot } from "@/types/project";

const Index = lazy(() => import("./pages/Index"));
const LotConfigPage = lazy(() => import("./pages/LotConfigPage"));
const TechniquePage = lazy(() => import("./pages/TechniquePage"));
const PrixPage = lazy(() => import("./pages/PrixPage"));
const SynthesePage = lazy(() => import("./pages/SynthesePage"));
const VersionsPage = lazy(() => import("./pages/VersionsPage"));
const ExportPage = lazy(() => import("./pages/ExportPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));
const QuestionnairePage = lazy(() => import("./pages/QuestionnairePage"));


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
        <HashRouter>
          <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Chargement…</div>}>
          {currentProjectId ? (
            <AppLayout>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/lot" element={<LotConfigPage />} />
                <Route path="/technique" element={<TechniquePage />} />
                <Route path="/prix" element={<PrixPage />} />
                <Route path="/synthese" element={<SynthesePage />} />
                <Route path="/nego/:round/technique" element={<TechniquePage />} />
                <Route path="/nego/:round/prix" element={<PrixPage />} />
                <Route path="/nego/:round/synthese" element={<SynthesePage />} />
                <Route path="/nego/:round/questions" element={<QuestionnairePage />} />
                <Route path="/versions" element={<VersionsPage />} />
                <Route path="/export" element={<ExportPage />} />
                <Route path="*" element={<Index />} />

              </Routes>
            </AppLayout>
          ) : (
            <Routes>
              <Route path="*" element={<ProjectsPage />} />
            </Routes>
          )}
          </Suspense>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
