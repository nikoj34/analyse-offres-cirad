import { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  FileText,
  ClipboardList,
  DollarSign,
  BarChart3,
  GitBranch,
  Download,
  Bot,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Page de Garde", icon: FileText },
  { to: "/technique", label: "Analyse Technique", icon: ClipboardList },
  { to: "/prix", label: "Prix", icon: DollarSign },
  { to: "/synthese", label: "Synthèse", icon: BarChart3 },
  { to: "/versions", label: "Négociations", icon: GitBranch },
  { to: "/export", label: "Export Excel", icon: Download },
  { to: "/assistant", label: "Assistant IA", icon: Bot },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-sidebar">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
          <BarChart3 className="h-6 w-6 text-sidebar-primary" />
          <span className="text-lg font-bold text-sidebar-foreground">
            ProcureAnalyze
          </span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                location.pathname === item.to
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
