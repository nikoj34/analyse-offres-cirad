import { useParams } from "react-router-dom";
import { useProjectStore } from "@/store/projectStore";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getCompanyColor, getCompanyBgColor } from "@/lib/companyColors";

const IMPORTANCE_OPTIONS = [
  { value: "faible", label: "Faible" },
  { value: "moyen", label: "Moyen" },
  { value: "fort", label: "Fort" },
] as const;

export interface NegotiationPrepQuestion {
  id: string;
  text: string;
  order: number;
  importance?: string;
}

const PreparationNegoPage = () => {
  const { vIndex, companyId } = useParams<{ vIndex?: string; companyId?: string }>();
  const { project, updateNegotiationPrep } = useProjectStore();
  const lotIndex = Math.max(0, project?.currentLotIndex ?? 0);
  const lot = project?.lots?.[lotIndex];
  const vIndexNum = vIndex != null ? parseInt(vIndex, 10) : 0;
  const version = lot?.versions?.[Number.isNaN(vIndexNum) ? 0 : vIndexNum];
  const companyIdNum = companyId != null ? parseInt(companyId, 10) : NaN;
  const company = lot?.companies?.find((c) => c.id === companyIdNum);

  const [questions, setQuestions] = useState<NegotiationPrepQuestion[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const hydrationKey = `${version?.id ?? ""}-${companyIdNum}`;
  const lastHydrationKey = useRef<string | null>(null);

  /** Au montage et à chaque changement version/company : pré-remplir l'état local depuis version.negotiationData[companyId]. */
  useEffect(() => {
    if (!version || !Number.isInteger(companyIdNum)) return;
    if (lastHydrationKey.current === hydrationKey) return;
    lastHydrationKey.current = hydrationKey;
    const stored = version.negotiationData?.[companyIdNum]?.prep?.questions as NegotiationPrepQuestion[] | undefined;
    setQuestions(Array.isArray(stored) && stored.length > 0 ? stored.map((q) => ({ ...q, importance: q.importance ?? "moyen" })) : [{ id: crypto.randomUUID(), text: "", order: 1, importance: "moyen" }]);
    setSavedAt(null);
    setIsLocked(false);
  }, [hydrationKey, version, companyIdNum]);

  const setQuestionText = (id: string, text: string) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, text } : q)));
  };

  const setQuestionOrder = (id: string, newOrder: number) => {
    const num = Math.max(1, newOrder);
    setQuestions((prev) => {
      const current = prev.find((q) => q.id === id);
      if (!current) return prev;
      const other = prev.find((q) => q.id !== id && q.order === num);
      if (other) {
        return prev.map((q) => {
          if (q.id === id) return { ...q, order: num };
          if (q.id === other.id) return { ...q, order: current.order };
          return q;
        });
      }
      return prev.map((q) => (q.id === id ? { ...q, order: num } : q));
    });
  };

  const setQuestionImportance = (id: string, importance: string) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, importance } : q)));
  };

  const addQuestion = () => {
    const maxOrder = questions.length === 0 ? 0 : Math.max(...questions.map((q) => q.order), 0);
    setQuestions((prev) => [...prev, { id: crypto.randomUUID(), text: "", order: maxOrder + 1, importance: "moyen" }]);
  };

  const removeQuestion = (id: string) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleSave = () => {
    if (!version || !Number.isInteger(companyIdNum)) return;
    const sorted = [...questions].sort((a, b) => a.order - b.order);
    updateNegotiationPrep(companyIdNum, sorted, version.id);
    setSavedAt(new Date());
    setIsLocked(true);
  };

  const companyName = company?.name?.trim() ? company.name : `Entreprise ${companyId ?? "—"}`;

  const handleExportWord = () => {
    toast.info("Export Word en cours de développement.");
  };

  if (!lot) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Préparation de la négociation</h1>
        <p className="text-muted-foreground">Aucun lot disponible.</p>
      </div>
    );
  }

  if (!version) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Préparation de la négociation</h1>
        <p className="text-muted-foreground">Version introuvable.</p>
      </div>
    );
  }

  const sortedQuestions = [...questions].sort((a, b) => a.order - b.order);
  const companyIndexInLot = (lot?.companies ?? []).findIndex((c) => c.id === companyIdNum);
  const companyColor = getCompanyColor(companyIndexInLot >= 0 ? companyIndexInLot : 0);
  const companyBgColor = getCompanyBgColor(companyIndexInLot >= 0 ? companyIndexInLot : 0);

  return (
    <div
      className="rounded-r-lg border-l-4 min-h-0"
      style={{ backgroundColor: companyBgColor, borderColor: companyColor }}
    >
      <div className="p-4 space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-foreground">
          Préparation de la négociation — {companyName}
        </h1>
      </header>

      {/* Cartes : une par question (style old.html / maquette) */}
      <div className={isLocked ? "pointer-events-none opacity-60" : ""}>
        <div className="space-y-4">
          {sortedQuestions.map((q, index) => (
            <Card key={q.id} className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <span className="text-sm font-semibold">Question {index + 1}</span>
                {!isLocked && questions.length > 1 && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={() => removeQuestion(q.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Supprimer
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Intitulé de la question</Label>
                  <Textarea
                    value={q.text}
                    onChange={(e) => setQuestionText(q.id, e.target.value)}
                    disabled={isLocked}
                    placeholder="Saisir l'intitulé de la question..."
                    className="min-h-[80px] resize-none"
                    rows={3}
                  />
                </div>
                <div className="flex flex-wrap gap-6">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Ordre / Numéro</Label>
                    <Input
                      type="number"
                      min={1}
                      value={q.order}
                      onChange={(e) => setQuestionOrder(q.id, parseInt(e.target.value, 10) || 1)}
                      disabled={isLocked}
                      className="w-20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Importance</Label>
                    <Select
                      value={q.importance ?? "moyen"}
                      onValueChange={(v) => setQuestionImportance(q.id, v)}
                      disabled={isLocked}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Importance" />
                      </SelectTrigger>
                      <SelectContent>
                        {IMPORTANCE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Boutons en bas (comme maquette) */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={addQuestion}
          disabled={isLocked}
          className="gap-2"
        >
          <Plus className="h-4 w-4 shrink-0" />
          Ajouter une question
        </Button>
        <Button
          type="button"
          variant={isLocked ? "outline" : "default"}
          onClick={isLocked ? () => setIsLocked(false) : handleSave}
          className="gap-2"
        >
          {isLocked ? "Débloquer la saisie" : "Enregistrer la préparation"}
        </Button>
        <Button type="button" variant="outline" onClick={handleExportWord} className="gap-2">
          Exporter en Word
        </Button>
        {savedAt && (
          <span className="text-sm text-muted-foreground">
            Enregistré à {savedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      </div>
    </div>
  );
};

export default PreparationNegoPage;
