import { APP_VERSION } from "@/lib/version";

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30 px-6 py-3 text-center text-xs text-muted-foreground">
      © Nicolas JAMET — Analyse d'offres v{APP_VERSION} — {new Date().getFullYear()}
    </footer>
  );
}
