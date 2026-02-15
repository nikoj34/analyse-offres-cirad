import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useMultiProjectStore } from "@/store/multiProjectStore";
import { useProjectStore } from "@/store/projectStore";
import { useEffect } from "react";

const Index = lazy(() => import("./pages/Index"));
const TechniquePage = lazy(() => import("./pages/TechniquePage"));
const PrixPage = lazy(() => import("./pages/PrixPage"));
const SynthesePage = lazy(() => import("./pages/SynthesePage"));
const VersionsPage = lazy(() => import("./pages/VersionsPage"));
const ExportPage = lazy(() => import("./pages/ExportPage"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"));

const queryClient = new QueryClient();

function ProjectSync() {
  const { currentProjectId, projects, saveCurrentProject } = useMultiProjectStore();
  const { project, resetProject } = useProjectStore();
  const projectStore = useProjectStore;

  // Load project data when switching projects
  useEffect(() => {
    if (currentProjectId && projects[currentProjectId]) {
      const savedProject = projects[currentProjectId];
      useProjectStore.setState({ project: savedProject });
    }
  }, [currentProjectId]);

  // Auto-save current project
  useEffect(() => {
    if (currentProjectId && project.id === currentProjectId) {
      saveCurrentProject(project);
    }
  }, [project, currentProjectId, saveCurrentProject]);

  return null;
}

const App = () => {
  const { currentProjectId } = useMultiProjectStore();

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
        <BrowserRouter>
          <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Chargement…</div>}>
          {currentProjectId ? (
            <AppLayout>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/technique" element={<TechniquePage />} />
                <Route path="/prix" element={<PrixPage />} />
                <Route path="/synthese" element={<SynthesePage />} />
                <Route path="/nego/:round/technique" element={<TechniquePage />} />
                <Route path="/nego/:round/prix" element={<PrixPage />} />
                <Route path="/nego/:round/synthese" element={<SynthesePage />} />
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
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
