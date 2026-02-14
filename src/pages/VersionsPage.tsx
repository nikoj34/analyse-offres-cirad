const VersionsPage = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cycles de Négociation</h1>
        <p className="text-sm text-muted-foreground">
          Gestion des versions V0, V1, V2 — à venir en Phase 5.
        </p>
      </div>
      <div className="flex items-center justify-center rounded-lg border border-dashed border-border p-12">
        <p className="text-muted-foreground">Module en cours de développement</p>
      </div>
    </div>
  );
};

export default VersionsPage;
