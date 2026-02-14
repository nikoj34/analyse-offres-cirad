import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index";
import TechniquePage from "./pages/TechniquePage";
import PrixPage from "./pages/PrixPage";
import SynthesePage from "./pages/SynthesePage";
import VersionsPage from "./pages/VersionsPage";
import ExportPage from "./pages/ExportPage";
import AssistantPage from "./pages/AssistantPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/technique" element={<TechniquePage />} />
            <Route path="/prix" element={<PrixPage />} />
            <Route path="/synthese" element={<SynthesePage />} />
            <Route path="/versions" element={<VersionsPage />} />
            <Route path="/export" element={<ExportPage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
