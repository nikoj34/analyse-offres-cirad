import { NavLink } from "react-router-dom";
import { Settings, FolderOpen, BarChart3, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import ciradLogo from "@/assets/cirad-logo.png";

/**
 * Sidebar minimale affichée quand aucun projet n'est ouvert.
 * Analyses, Statistiques, FAQ, Configuration.
 */
export function GlobalSidebar() {
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-sidebar flex flex-col min-h-screen">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4 shrink-0">
        <img src={ciradLogo} alt="CIRAD" className="h-8" />
        <span className="text-sm font-bold text-sidebar-foreground leading-tight">
          Analyse d'offres
        </span>
      </div>
      <div className="p-3 space-y-0.5">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )
          }
        >
          <FolderOpen className="h-4 w-4 shrink-0" />
          <span className="truncate">Analyses</span>
        </NavLink>
        <NavLink
          to="/statistiques"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )
          }
        >
          <BarChart3 className="h-4 w-4 shrink-0" />
          <span className="truncate">Statistiques</span>
        </NavLink>
        <NavLink
          to="/faq"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )
          }
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          <span className="truncate">FAQ</span>
        </NavLink>
        <NavLink
          to="/config"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span className="truncate">Configuration</span>
        </NavLink>
      </div>
      <div className="flex-1" />
    </aside>
  );
}
