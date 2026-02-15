import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useMultiProjectStore } from "@/store/multiProjectStore";
import { useProjectStore } from "@/store/projectStore";
import { useEffect } from "react";
import Index from "./pages/Index";
import TechniquePage from "./pages/TechniquePage";
import PrixPage from "./pages/PrixPage";
import SynthesePage from "./pages/SynthesePage";
import VersionsPage from "./pages/VersionsPage";
import ExportPage from "./pages/ExportPage";
import ProjectsPage from "./pages/ProjectsPage";
import NotFound from "./pages/NotFound";

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
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
