import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useProjectStore } from "@/store/projectStore";
import type { DpgfLine, ProjectInfo } from "@/types/project";
import { ArrowLeft, Plus, Trash2, FileSpreadsheet, Upload, Copy, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Download, FileUp, IndentIncrease, IndentDecrease, Type } from "lucide-react";
import { useMultiProjectStore } from "@/store/multiProjectStore";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { toast } from "sonner";

/** État local des offres importées (clé = id offre).
 * Mode 1 DPGF : lines. Mode 2 DPGFs : linesDpgf1 et/ou linesDpgf2 par offre. */
type ImportedOffersState = Record<
  string,
  {
    companyName: string;
    lines?: Record<string, { quantite: number; pu: number; total: number }>;
    linesDpgf1?: Record<string, { quantite: number; pu: number; total: number }>;
    linesDpgf2?: Record<string, { quantite: number; pu: number; total: number }>;
  }
>;

/** Extension projet pour le bac à sable (mode 2 DPGFs, migration dpgfMaster). */
type SandboxProjectInfo = ProjectInfo & {
  dpgfMode?: 1 | 2;
  dpgfMaster1?: DpgfLine[];
  dpgfMaster2?: DpgfLine[];
};

/** Catégorie de ligne : Base, PSE, Variante, Tranche. */
export type DpgfCategorie = "base" | "pse" | "variante" | "tranche";

/** Ligne avec indentation et catégorie (persistées dans dpgfMaster via cast). */
type DpgfLineWithIndent = DpgfLine & { indent?: number; categorie?: DpgfCategorie };

const CATEGORIE_OPTIONS: { value: DpgfCategorie; label: string }[] = [
  { value: "base", label: "Base" },
  { value: "pse", label: "PSE" },
  { value: "variante", label: "Variante" },
  { value: "tranche", label: "Tranche" },
];

function newId(): string {
  return crypto.randomUUID();
}

function createChapter(reference: string, designation: string): DpgfLine {
  return {
    id: newId(),
    reference: reference || "",
    designation: designation || "",
    unite: "",
    quantite: 0,
    puEstime: 0,
    isChapter: true,
  };
}

function createLine(reference: string, designation: string, unite: string, quantite: number, puEstime: number): DpgfLine {
  return {
    id: newId(),
    reference: reference || "",
    designation: designation || "",
    unite: unite || "",
    quantite: quantite ?? 0,
    puEstime: puEstime ?? 0,
    isChapter: false,
  };
}

/** Normalise une référence pour le matching (trim). */
function normRef(ref: string): string {
  return String(ref ?? "").trim();
}

/** Réf de type chapitre top-level (1., 2., …). */
function isTopLevelChapterRef(ref: string): boolean {
  return /^\d+\.$/.test(normRef(ref));
}

export default function DpgfSandboxPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { project, updateInfo } = useProjectStore();
  const { currentProjectId } = useMultiProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterTrameInputRef = useRef<HTMLInputElement>(null);
  /** En mode 2, indique pour quel DPGF importer l'offre au prochain onFileChange. */
  const importForDpgfRef = useRef<1 | 2>(1);

  const sandboxInfo = (project?.info ?? {}) as SandboxProjectInfo;
  const dpgfMode = sandboxInfo.dpgfMode ?? 1;
  const [activeDpgfTab, setActiveDpgfTab] = useState<1 | 2>(1);

  /** Migration : si dpgfMaster1 est vide et l'ancien dpgfMaster a des données, copier dans dpgfMaster1. */
  const migrationDoneRef = useRef(false);
  useEffect(() => {
    if (migrationDoneRef.current || !project?.info) return;
    const info = project.info as SandboxProjectInfo;
    const legacy = (info.dpgfMaster ?? []) as DpgfLine[];
    const master1 = (info.dpgfMaster1 ?? []) as DpgfLine[];
    if (legacy.length > 0 && master1.length === 0) {
      migrationDoneRef.current = true;
      updateInfo({ dpgfMaster1: legacy } as Partial<ProjectInfo>);
    }
  }, [project?.info, updateInfo]);

  /** list1 : afficher dpgfMaster si dpgfMaster1 vide (pour retrouver le travail avant/sans migration). */
  const list1: DpgfLineWithIndent[] = useMemo(() => {
    const raw = (sandboxInfo.dpgfMaster1?.length
      ? sandboxInfo.dpgfMaster1
      : (sandboxInfo.dpgfMaster ?? [])) as DpgfLineWithIndent[];
    return raw.map((l) => ({
      ...l,
      indent: l.indent ?? 0,
      categorie: l.categorie ?? "base",
    }));
  }, [sandboxInfo.dpgfMaster1, sandboxInfo.dpgfMaster]);

  const list2: DpgfLineWithIndent[] = useMemo(() => {
    const raw = (sandboxInfo.dpgfMaster2 ?? []) as DpgfLineWithIndent[];
    return raw.map((l) => ({
      ...l,
      indent: l.indent ?? 0,
      categorie: l.categorie ?? "base",
    }));
  }, [sandboxInfo.dpgfMaster2]);

  /** Liste active selon le mode et l'onglet (mode 1 = list1, mode 2 = onglet 1 ou 2). */
  const list: DpgfLineWithIndent[] = dpgfMode === 1 ? list1 : activeDpgfTab === 1 ? list1 : list2;

  const setList1 = useCallback(
    (next: DpgfLineWithIndent[]) => {
      updateInfo({ dpgfMaster1: next as DpgfLine[] } as Partial<ProjectInfo>);
    },
    [updateInfo]
  );

  const setList2 = useCallback(
    (next: DpgfLineWithIndent[]) => {
      updateInfo({ dpgfMaster2: next as DpgfLine[] } as Partial<ProjectInfo>);
    },
    [updateInfo]
  );

  const setList = dpgfMode === 1 ? setList1 : activeDpgfTab === 1 ? setList1 : setList2;

  const setDpgfMode = useCallback(
    (mode: 1 | 2) => {
      updateInfo({ dpgfMode: mode } as Partial<ProjectInfo>);
      if (mode === 2 && !sandboxInfo.dpgfMaster2) {
        updateInfo({ dpgfMaster2: [] } as Partial<ProjectInfo>);
      }
    },
    [updateInfo, sandboxInfo.dpgfMaster2]
  );

  const [importedOffers, setImportedOffers] = useState<ImportedOffersState>({});
  const [synthesisText, setSynthesisText] = useState("");
  /** Totaux saisis manuellement quand PU est vide (forfaits), clé = line.id */
  const [manualTotals, setManualTotals] = useState<Record<string, number>>({});

  /** Montant HT d'une ligne (article) : Qté×PU ou total forfait. */
  const getLineTotal = useCallback(
    (line: DpgfLineWithIndent): number => {
      if (line.isChapter) return 0;
      const qte = Number(line.quantite) || 0;
      const pu = Number(line.puEstime) || 0;
      if (pu > 0) return qte * pu;
      return manualTotals[line.id] ?? 0;
    },
    [manualTotals]
  );

  const totalEstime = useMemo(() => {
    return list
      .filter((l) => !l.isChapter)
      .reduce((sum, l) => sum + getLineTotal(l), 0);
  }, [list, getLineTotal]);

  /** TOTAL BASE HT : somme des lignes catégorie Base (articles uniquement). */
  const totalBaseHt = useMemo(() => {
    return list
      .filter((l) => !l.isChapter && (l.categorie ?? "base") === "base")
      .reduce((sum, l) => sum + getLineTotal(l), 0);
  }, [list, getLineTotal]);

  /** Liste des totaux par ligne PSE (réf + désignation + total). */
  const pseLines = useMemo(() => {
    return list.filter((l) => !l.isChapter && (l.categorie ?? "base") === "pse");
  }, [list]);

  /** Liste des totaux par ligne Variante ou Tranche. */
  const varianteTrancheLines = useMemo(() => {
    return list.filter(
      (l) => !l.isChapter && ((l.categorie ?? "base") === "variante" || (l.categorie ?? "base") === "tranche")
    );
  }, [list]);

  /** Somme des articles sous un titre jusqu'au prochain titre de niveau N ou supérieur. */
  const getChapterSubtotal = useCallback(
    (lines: DpgfLineWithIndent[], chapterIndex: number): number => {
      const chapter = lines[chapterIndex];
      if (!chapter?.isChapter) return 0;
      const chapterIndent = chapter.indent ?? 0;
      let sum = 0;
      for (let i = chapterIndex + 1; i < lines.length; i++) {
        const line = lines[i];
        const lineIndent = line.indent ?? 0;
        if (line.isChapter && lineIndent <= chapterIndent) break;
        if (!line.isChapter) sum += getLineTotal(line);
      }
      return sum;
    },
    [getLineTotal]
  );

  /** Pour le récap : liste des titres avec leur sous-total (somme des lignes en dessous). */
  const chapterSubtotals = useMemo(() => {
    return list
      .map((line, index) => (line.isChapter ? { line, index } : null))
      .filter((x): x is { line: DpgfLineWithIndent; index: number } => x != null)
      .map(({ line, index }) => ({
        line,
        index,
        subtotal: getChapterSubtotal(list, index),
      }));
  }, [list, getChapterSubtotal]);

  /** Style de la ligne Titre selon le niveau d'indentation (0 = Chapitre, 1 = Sous-titre, etc.). */
  const getTitleRowClassName = (level: number): string => {
    if (level === 0) {
      return "bg-blue-50/95 dark:bg-blue-950/50 border-b-2 border-blue-300 dark:border-blue-700 font-bold uppercase";
    }
    if (level === 1) {
      return "font-bold underline text-sm bg-muted/30";
    }
    if (level === 2) {
      return "font-bold italic bg-muted/20";
    }
    return "italic text-gray-700 dark:text-gray-400 bg-muted/10";
  };

  const handleAddChapter = () => {
    const topLevelCount = list.filter((l) => isTopLevelChapterRef(l.reference)).length;
    const nextRef = String(topLevelCount + 1) + ".";
    setList([...list, { ...createChapter(nextRef, ""), indent: 0, categorie: "base" }]);
  };

  /** Sous-chapitre : réf 1.1, 1.2 sous le dernier chapitre 1. */
  const handleAddSubChapter = () => {
    const lastTop = [...list].reverse().find((l) => isTopLevelChapterRef(l.reference));
    const base = lastTop ? lastTop.reference.replace(/\.$/, "") : "1";
    const subCount = list.filter((l) => {
      const r = normRef(l.reference);
      return l.isChapter && new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\d+$`).test(r);
    }).length;
    const nextRef = `${base}.${subCount + 1}`;
    setList([...list, { ...createChapter(nextRef, ""), indent: 0, categorie: "base" }]);
  };

  /** Article : réf 1.1.1, 1.1.2 sous la dernière section (chapitre ou sous-chapitre). */
  const handleAddArticle = () => {
    const lastSection = [...list].reverse().find((l) => l.isChapter);
    const base = lastSection
      ? normRef(lastSection.reference).replace(/\.$/, "") || "1"
      : "1.1";
    const artCount = list.filter((l) => {
      const r = normRef(l.reference);
      return !l.isChapter && new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\d+`).test(r);
    }).length;
    const nextRef = `${base}.${artCount + 1}`;
    setList([...list, { ...createLine(nextRef, "", "", 0, 0), indent: 0, categorie: "base" }]);
  };

  /** Ligne forfait (sans PU) : total saisi manuellement. */
  const handleAddLigneForfait = () => {
    const lastSection = [...list].reverse().find((l) => l.isChapter);
    const base = lastSection
      ? normRef(lastSection.reference).replace(/\.$/, "") || "1"
      : "1.1";
    const artCount = list.filter((l) => {
      const r = normRef(l.reference);
      return !l.isChapter && new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\d+`).test(r);
    }).length;
    const nextRef = `${base}.${artCount + 1}`;
    const newLine = { ...createLine(nextRef, "", "", 0, 0), indent: 0, categorie: "base" } as DpgfLineWithIndent;
    setList([...list, newLine]);
  };

  /** Alias pour ajouter un titre/chapitre (même logique que handleAddChapter). */
  const handleAddTitreChapitre = () => {
    const topLevelCount = list.filter((l) => isTopLevelChapterRef(l.reference)).length;
    const nextRef = String(topLevelCount + 1) + ".";
    setList([...list, { ...createChapter(nextRef, ""), indent: 0, categorie: "base" }]);
  };

  /** Ajoute une ligne à la fin de la trame (réf dérivée de la dernière ligne ou "1" si vide). */
  const handleAddLine = () => {
    if (list.length === 0) {
      setList([{ ...createLine("1", "", "", 0, 0), indent: 0, categorie: "base" }]);
      return;
    }
    handleInsertAfter(list.length - 1);
  };

  const handleAddLineAfter = (index: number) => {
    const line = list[index];
    const base = normRef(line.reference).replace(/\.$/, "");
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const count = list.filter((l) => new RegExp(`^${escaped}\\.\\d+`).test(normRef(l.reference))).length;
    const newRef = `${base}.${count + 1}`;
    const newLine = line.isChapter ? createChapter(newRef, "") : createLine(newRef, "", "", 0, 0);
    const next = [...list.slice(0, index + 1), newLine, ...list.slice(index + 1)];
    setList(next);
  };

  const handleUpdate = (index: number, updates: Partial<DpgfLineWithIndent>) => {
    const next = list.map((l, i) => (i === index ? { ...l, ...updates } : l));
    setList(next);
  };

  const handleRemove = (index: number) => {
    const removed = list[index];
    setList(list.filter((_, i) => i !== index));
    if (removed?.id && manualTotals[removed.id] !== undefined) {
      setManualTotals((prev) => {
        const next = { ...prev };
        delete next[removed.id];
        return next;
      });
    }
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...list];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setList(next);
  };

  const handleMoveDown = (index: number) => {
    if (index >= list.length - 1) return;
    const next = [...list];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setList(next);
  };

  const handleInsertAfter = (index: number) => {
    const line = list[index];
    const base = normRef(line.reference).replace(/\.$/, "");
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const count = list.filter((l) => new RegExp(`^${escaped}\\.\\d+`).test(normRef(l.reference))).length;
    const newRef = `${base}.${count + 1}`;
    const currentIndent = line.indent ?? 0;
    const currentCategorie = line.categorie ?? "base";
    const newLine = line.isChapter
      ? ({ ...createChapter(newRef, ""), indent: currentIndent, categorie: currentCategorie } as DpgfLineWithIndent)
      : ({ ...createLine(newRef, "", "", 0, 0), indent: currentIndent, categorie: currentCategorie } as DpgfLineWithIndent);
    const next = [...list.slice(0, index + 1), newLine, ...list.slice(index + 1)];
    setList(next);
  };

  const handleIndentRight = (index: number) => {
    const next = list.map((l, i) =>
      i === index ? { ...l, indent: Math.min(5, (l.indent ?? 0) + 1) } : l
    );
    setList(next);
  };

  const handleIndentLeft = (index: number) => {
    const next = list.map((l, i) =>
      i === index ? { ...l, indent: Math.max(0, (l.indent ?? 0) - 1) } : l
    );
    setList(next);
  };

  /** Bascule la ligne entre Titre (isChapter) et Article (avec prix). */
  const handleToggleTitreArticle = (index: number) => {
    const line = list[index];
    const next = list.map((l, i) =>
      i === index ? { ...l, isChapter: !l.isChapter } : l
    );
    setList(next);
    if (line && !line.isChapter && manualTotals[line.id] !== undefined) {
      setManualTotals((prev) => {
        const nextManual = { ...prev };
        delete nextManual[line.id];
        return nextManual;
      });
    }
  };

  const handleExportTrameVierge = async () => {
    if (list.length === 0) {
      toast.info("Ajoutez au moins un chapitre ou une ligne avant d'exporter.");
      return;
    }
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Trame DPGF", { views: [{ showGridLines: true }] });

      const headers = ["Réf", "Désignation", "U", "Qté", "Prix Unitaire Proposé (€)", "Total (€)"];
      ws.addRow(headers);
      const headerRow = ws.getRow(1);
      headerRow.eachCell((c) => {
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
        c.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        };
      });

      list.forEach((line) => {
        const qte = line.isChapter ? 0 : Number(line.quantite) || 0;
        const pu = line.isChapter ? 0 : Number(line.puEstime) || 0;
        const totalVal = pu > 0 ? qte * pu : (line.isChapter ? "" : manualTotals[line.id] ?? "");
        const row = [
          line.reference,
          line.designation,
          line.isChapter ? "" : line.unite,
          line.isChapter ? "" : line.quantite,
          line.isChapter ? "" : (pu > 0 ? pu : ""),
          line.isChapter ? "" : totalVal,
        ];
        const r = ws.addRow(row);
        if (line.isChapter) {
          r.font = { bold: true };
        }
      });

      ws.getColumn(1).width = 12;
      ws.getColumn(2).width = 45;
      ws.getColumn(3).width = 8;
      ws.getColumn(4).width = 10;
      ws.getColumn(5).width = 24;
      ws.getColumn(6).width = 14;

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const name = project?.info?.name
        ? `Trame_DPGF_${project.info.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40)}.xlsx`
        : `Trame_DPGF_${new Date().toISOString().slice(0, 10)}.xlsx`;
      saveAs(blob, name);
      toast.success("Trame exportée. Les entreprises rempliront la colonne « Prix Unitaire Proposé (€) ».");
    } catch (e) {
      toast.error("Erreur lors de l'export Excel.");
      console.error(e);
    }
  };

  /** Télécharge un fichier Excel vide avec les en-têtes pour saisir la trame Master. */
  const handleDownloadModeleExcel = useCallback(async () => {
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Trame Master", { views: [{ showGridLines: true }] });
      const headers = ["Réf", "Désignation", "Unité", "Quantité", "PU Estimé", "Total"];
      ws.addRow(headers);
      const headerRow = ws.getRow(1);
      headerRow.eachCell((c) => {
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
        c.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        };
      });
      ws.getColumn(1).width = 14;
      ws.getColumn(2).width = 45;
      ws.getColumn(3).width = 10;
      ws.getColumn(4).width = 12;
      ws.getColumn(5).width = 14;
      ws.getColumn(6).width = 14;
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      saveAs(blob, "Modele_Trame_DPGF.xlsx");
      toast.success("Modèle Excel téléchargé.");
    } catch (e) {
      toast.error("Erreur lors de la génération du modèle.");
      console.error(e);
    }
  }, []);

  /** Importe une trame Master depuis Excel et remplace dpgfMaster. */
  const handleImportMasterTrame = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const ws = wb.worksheets[0];
        if (!ws) {
          toast.error("Aucune feuille dans le fichier.");
          return;
        }

        let colRef = -1;
        let colDesignation = -1;
        let colUnite = -1;
        let colQuantite = -1;
        let colPu = -1;
        let colTotal = -1;
        const headerRow = ws.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
          const text = String(cell.text ?? "").trim();
          if (/^réf\.?$/i.test(text) || text === "Réf") colRef = colNumber;
          if (/^d[eé]signation$/i.test(text) || text === "Désignation") colDesignation = colNumber;
          if (/^unit[eé]$/i.test(text) || text === "Unité" || text === "U") colUnite = colNumber;
          if (/^quantit[eé]$/i.test(text) || /^qt[eé]\.?$/i.test(text) || text === "Quantité" || text === "Qté") colQuantite = colNumber;
          if (/pu\s*estim[eé]/i.test(text) || text === "PU Estimé") colPu = colNumber;
          if (/^total\s*(\(€\))?$/i.test(text) || text === "Total (€)" || text === "Total") colTotal = colNumber;
        });

        if (colRef <= 0) {
          toast.error("Colonne « Réf » requise dans la première ligne.");
          return;
        }
        if (colDesignation <= 0) colDesignation = colRef + 1;
        if (colUnite <= 0) colUnite = colDesignation + 1;
        if (colQuantite <= 0) colQuantite = colUnite + 1;
        if (colPu <= 0) colPu = colQuantite + 1;
        if (colTotal <= 0) colTotal = colPu + 1;

        const newLines: DpgfLineWithIndent[] = [];
        const newManualTotals: Record<string, number> = {};
        const rowCount = ws.rowCount ?? 0;

        /** Déduit la catégorie depuis la désignation (PSE, VARIANTE, TRANCHE). */
        const categorieFromDesignation = (designation: string): DpgfCategorie => {
          const d = designation.toUpperCase();
          if (d.includes("PSE")) return "pse";
          if (d.includes("VARIANTE")) return "variante";
          if (d.includes("TRANCHE")) return "tranche";
          return "base";
        };

        for (let r = 2; r <= rowCount; r++) {
          const row = ws.getRow(r);
          const refVal = row.getCell(colRef).text ?? row.getCell(colRef).value;
          const ref = normRef(String(refVal ?? ""));
          if (!ref) continue;

          const designation = String(row.getCell(colDesignation).text ?? row.getCell(colDesignation).value ?? "").trim();
          const uniteVal = row.getCell(colUnite).text ?? row.getCell(colUnite).value;
          const uniteStr = String(uniteVal ?? "").trim();
          const qteVal = row.getCell(colQuantite).value ?? row.getCell(colQuantite).text;
          const quantite = Number(qteVal) || 0;
          const puVal = row.getCell(colPu).value ?? row.getCell(colPu).text;
          const puEstime = Number(puVal) || 0;
          const totalVal = row.getCell(colTotal).value ?? row.getCell(colTotal).text;
          const total = Number(totalVal) || 0;

          const hasNoQte = quantite === 0;
          const hasNoPu = puEstime === 0;
          const isChapter = hasNoQte && hasNoPu;

          const categorie = categorieFromDesignation(designation);

          if (isChapter) {
            newLines.push({ ...createChapter(ref, designation), indent: 0, categorie });
          } else {
            const line = createLine(ref, designation, uniteStr, quantite, puEstime);
            newLines.push({ ...line, indent: 0, categorie });
            if (puEstime === 0 && total > 0) {
              newManualTotals[line.id] = total;
            }
          }
        }

        if (newLines.length === 0) {
          toast.error("Aucune ligne valide trouvée (Réf obligatoire).");
          return;
        }

        setList(newLines);
        setManualTotals(newManualTotals);
        toast.success(`Trame Master importée : ${newLines.length} ligne(s).`);
      } catch (e) {
        toast.error("Erreur lors de la lecture du fichier Excel.");
        console.error(e);
      }
    },
    [setList]
  );

  const onMasterTrameFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImportMasterTrame(file);
      e.target.value = "";
    },
    [handleImportMasterTrame]
  );

  const handleImportOffer = useCallback(
    async (file: File, targetDpgf?: 1 | 2) => {
      try {
        const buffer = await file.arrayBuffer();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const ws = wb.worksheets[0];
        if (!ws) {
          toast.error("Aucune feuille dans le fichier.");
          return;
        }

        let colRef = -1;
        let colQte = -1;
        let colPu = -1;
        let colTotal = -1;
        const headerRow = ws.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
          const text = String(cell.text ?? "").trim();
          if (/^réf\.?$/i.test(text) || text === "Réf") colRef = colNumber;
          if (/^quantit[eé]$/i.test(text) || /^qt[eé]\.?$/i.test(text) || text === "Qté") colQte = colNumber;
          if (/prix\s*unitaire\s*propos[eé]/i.test(text) || text.includes("Prix Unitaire Proposé")) colPu = colNumber;
          if (/^total\s*(\(€\))?$/i.test(text) || text === "Total (€)" || text === "Total") colTotal = colNumber;
        });

        if (colRef <= 0) {
          toast.error("Colonne « Réf » requise dans la première ligne.");
          return;
        }
        const hasPu = colPu > 0;
        if (!hasPu && colTotal <= 0) {
          toast.error("Colonnes « Prix Unitaire Proposé (€) » ou « Total (€) » requises.");
          return;
        }
        if (colQte <= 0) colQte = colRef + 1;

        const lines: Record<string, { quantite: number; pu: number; total: number }> = {};
        const rowCount = ws.rowCount ?? 0;
        for (let r = 2; r <= rowCount; r++) {
          const row = ws.getRow(r);
          const refVal = row.getCell(colRef).text ?? row.getCell(colRef).value;
          const ref = normRef(String(refVal ?? ""));
          if (!ref) continue;

          const qteVal = row.getCell(colQte).value ?? row.getCell(colQte).text;
          const quantite = Number(qteVal) || 0;
          let pu = 0;
          let total = 0;
          if (hasPu) {
            const puVal = row.getCell(colPu).value ?? row.getCell(colPu).text;
            pu = Number(puVal) || 0;
            total = quantite * pu;
          }
          if (colTotal > 0) {
            const totalVal = row.getCell(colTotal).value ?? row.getCell(colTotal).text;
            const totalFromFile = Number(totalVal) || 0;
            if (totalFromFile > 0) {
              total = totalFromFile;
              if (pu === 0 && quantite > 0) pu = total / quantite;
            }
          }
          if (total === 0 && pu > 0) total = quantite * pu;
          lines[ref] = { quantite, pu, total };
        }

        const baseName = file.name.replace(/\.xlsx?$/i, "").trim() || "Offre";
        let companyName = baseName;
        if (typeof window !== "undefined" && window.prompt) {
          const prompted = window.prompt("Nom de l'entreprise pour cette offre :", baseName);
          if (prompted !== null) companyName = prompted.trim() || baseName;
        }

        const sandboxInfoCurrent = (project?.info ?? {}) as SandboxProjectInfo;
        const mode = sandboxInfoCurrent.dpgfMode ?? 1;
        const target = mode === 2 ? (targetDpgf ?? 1) : 1;

        setImportedOffers((prev) => {
          const offerId = `offer_${Date.now()}`;
          const existingByCompany = Object.entries(prev).find(([, o]) => o.companyName === companyName);
          const existingId = existingByCompany?.[0];

          if (mode === 2 && existingId) {
            const existing = prev[existingId];
            return {
              ...prev,
              [existingId]: {
                companyName: existing.companyName,
                ...existing,
                linesDpgf1: target === 1 ? lines : (existing.linesDpgf1 ?? existing.lines),
                linesDpgf2: target === 2 ? lines : (existing.linesDpgf2 ?? existing.lines),
              },
            };
          }

          if (mode === 2) {
            return {
              ...prev,
              [offerId]: {
                companyName,
                linesDpgf1: target === 1 ? lines : undefined,
                linesDpgf2: target === 2 ? lines : undefined,
              },
            };
          }

          return {
            ...prev,
            [offerId]: { companyName, lines },
          };
        });

        const targetLabel = mode === 2 ? ` (DPGF ${target})` : "";
        toast.success(`Offre « ${companyName} » importée${targetLabel} (${Object.keys(lines).length} lignes).`);
      } catch (e) {
        toast.error("Erreur lors de la lecture du fichier Excel.");
        console.error(e);
      }
    },
    [project?.info]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImportOffer(file, importForDpgfRef.current);
      e.target.value = "";
    },
    [handleImportOffer]
  );

  const triggerImportOffer = useCallback((targetDpgf: 1 | 2) => {
    importForDpgfRef.current = targetDpgf;
    fileInputRef.current?.click();
  }, []);

  const offerIds = useMemo(() => Object.keys(importedOffers), [importedOffers]);

  /** Liste combinée pour le tableau (mode 2 = list1 + list2 avec indicatrice Bât). */
  const combinedListForTable = useMemo(() => {
    if (dpgfMode === 2) {
      return [
        ...list1.map((l) => ({ ...l, dpgf: 1 as const })),
        ...list2.map((l) => ({ ...l, dpgf: 2 as const })),
      ];
    }
    return list1.map((l) => ({ ...l, dpgf: 1 as const }));
  }, [dpgfMode, list1, list2]);

  /** Pour une offre et un bât, retourne les lignes (ref -> { quantite, pu, total }). */
  const getOfferLinesForDpgf = useCallback(
    (offer: ImportedOffersState[string], dpgf: 1 | 2) => {
      if (dpgfMode === 1) return offer?.lines ?? {};
      return dpgf === 1 ? (offer?.linesDpgf1 ?? offer?.lines ?? {}) : (offer?.linesDpgf2 ?? offer?.lines ?? {});
    },
    [dpgfMode]
  );

  /** Total d'une offre pour un bât (somme des total par ligne). */
  const getOfferTotalForDpgf = useCallback(
    (offer: ImportedOffersState[string], lines: DpgfLineWithIndent[], dpgf: 1 | 2) => {
      const data = getOfferLinesForDpgf(offer, dpgf);
      return lines
        .filter((l) => !l.isChapter)
        .reduce((sum, l) => {
          const ref = normRef(l.reference);
          const d = data[ref] ?? data[l.reference];
          return sum + (d?.total ?? 0);
        }, 0);
    },
    [getOfferLinesForDpgf]
  );

  const totalEstime1 = useMemo(
    () => list1.filter((l) => !l.isChapter).reduce((s, l) => s + getLineTotal(l), 0),
    [list1, getLineTotal]
  );
  const totalEstime2 = useMemo(
    () => list2.filter((l) => !l.isChapter).reduce((s, l) => s + getLineTotal(l), 0),
    [list2, getLineTotal]
  );
  const totalEstimeCombined = totalEstime1 + totalEstime2;

  /** Génère le texte de synthèse des écarts par entreprise (pour mails de négociation). */
  const generateSynthesis = useCallback(() => {
    const articleLines1 = list1.filter((l) => !l.isChapter);
    const articleLines2 = list2.filter((l) => !l.isChapter);
    const hasLines = articleLines1.length > 0 || articleLines2.length > 0;
    if (!hasLines || offerIds.length === 0) {
      setSynthesisText(
        offerIds.length === 0
          ? "Importez au moins une offre pour générer la synthèse des écarts."
          : "La trame ne contient aucune ligne article (uniquement des chapitres)."
      );
      return;
    }

    const blocks: string[] = [];
    const totalMaster = totalEstime1 + totalEstime2;

    for (const offerId of offerIds) {
      const offer = importedOffers[offerId];
      const companyName = offer?.companyName ?? offerId;
      const totalOffer1 = getOfferTotalForDpgf(offer, list1, 1);
      const totalOffer2 = getOfferTotalForDpgf(offer, list2, 2);
      const totalOffer = totalOffer1 + totalOffer2;

      blocks.push(`Entreprise : ${companyName}`);
      blocks.push("");
      blocks.push(`TOTAL GLOBAL (Bât 1 + Bât 2)`);
      blocks.push(`  Référentiel : ${totalMaster.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € HT`);
      blocks.push(`  Offre ${companyName} : ${totalOffer.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € HT`);
      if (totalMaster > 0 && totalOffer > 0) {
        const ecartPct = ((totalOffer - totalMaster) / totalMaster) * 100;
        blocks.push(`  Écart : ${ecartPct >= 0 ? "+" : ""}${ecartPct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`);
      }
      blocks.push("");

      const anomalies: string[] = [];
      const processList = (lines: DpgfLineWithIndent[], dpgf: 1 | 2, label: string) => {
        const data = getOfferLinesForDpgf(offer, dpgf);
        for (const line of lines) {
          const ref = normRef(line.reference);
          const design = (line.designation ?? "").trim() || "—";
          const qteMaster = Number(line.quantite) || 0;
          const puEstime = Number(line.puEstime) || 0;
          const lineData = data[ref] ?? data[line.reference];
          const qteE = lineData?.quantite ?? 0;
          const puE = lineData?.pu ?? 0;
          const totalE = lineData?.total ?? 0;

          const noPu = puE === 0 && totalE === 0;
          const qteDiff = qteE !== qteMaster;
          const hasMasterPu = puEstime > 0;
          const puInf20 = hasMasterPu && puE > 0 && puE < puEstime * 0.8;
          const puSup20 = hasMasterPu && puE > 0 && puE > puEstime * 1.2;

          if (noPu) {
            anomalies.push(`[${label}] Réf ${line.reference} (${design}) : Cet article n'a pas été chiffré (oubli potentiel).`);
          } else if (qteDiff) {
            anomalies.push(
              `[${label}] Réf ${line.reference} (${design}) : La quantité proposée (${qteE}) diffère de la quantité attendue (${qteMaster}).`
            );
          } else if (puInf20) {
            anomalies.push(
              `[${label}] Réf ${line.reference} (${design}) : Le prix unitaire (${puE.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€) semble anormalement bas par rapport à l'estimation (${puEstime.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€).`
            );
          } else if (puSup20) {
            anomalies.push(
              `[${label}] Réf ${line.reference} (${design}) : Le prix unitaire (${puE.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€) est excessivement élevé par rapport à l'estimation (${puEstime.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€).`
            );
          }
        }
      };

      if (dpgfMode === 2) {
        if (articleLines1.length > 0) processList(articleLines1, 1, "Bât 1");
        if (articleLines2.length > 0) processList(articleLines2, 2, "Bât 2");
      } else {
        processList(articleLines1, 1, "Trame");
      }

      const pseLinesAll = [...list1, ...list2].filter((l) => !l.isChapter && (l.categorie ?? "base") === "pse");
      const varianteTrancheAll = [...list1, ...list2].filter(
        (l) => !l.isChapter && ((l.categorie ?? "base") === "variante" || (l.categorie ?? "base") === "tranche")
      );

      if (pseLinesAll.length > 0 || varianteTrancheAll.length > 0) {
        blocks.push("PSE et Variantes / Tranches :");
        let pseIndex = 0;
        for (const line of pseLinesAll) {
          pseIndex++;
          const ref = normRef(line.reference);
          const data1 = getOfferLinesForDpgf(offer, 1);
          const data2 = getOfferLinesForDpgf(offer, 2);
          const d1 = data1[ref] ?? data1[line.reference];
          const d2 = data2[ref] ?? data2[line.reference];
          const totalOfferLine = (d1?.total ?? 0) + (d2?.total ?? 0);
          const totalMasterLine = getLineTotal(line);
          if (totalMasterLine > 0 && totalOfferLine > 0) {
            const pct = ((totalOfferLine - totalMasterLine) / totalMasterLine) * 100;
            const more = pct > 0 ? "plus chère" : "moins chère";
            blocks.push(`  PSE ${pseIndex} (${line.reference} – ${(line.designation || "").slice(0, 35)}…) : L'entreprise est ${Math.abs(pct).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} % ${more} que l'estimation.`);
          }
        }
        let varIndex = 0;
        for (const line of varianteTrancheAll) {
          varIndex++;
          const ref = normRef(line.reference);
          const data1 = getOfferLinesForDpgf(offer, 1);
          const data2 = getOfferLinesForDpgf(offer, 2);
          const d1 = data1[ref] ?? data1[line.reference];
          const d2 = data2[ref] ?? data2[line.reference];
          const totalOfferLine = (d1?.total ?? 0) + (d2?.total ?? 0);
          const totalMasterLine = getLineTotal(line);
          if (totalMasterLine > 0 && totalOfferLine > 0) {
            const pct = ((totalOfferLine - totalMasterLine) / totalMasterLine) * 100;
            const more = pct > 0 ? "plus chère" : "moins chère";
            const typeLabel = (line.categorie ?? "base") === "variante" ? "Variante" : "Tranche";
            blocks.push(`  ${typeLabel} ${varIndex} (${line.reference}) : L'entreprise est ${Math.abs(pct).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} % ${more} que l'estimation.`);
          }
        }
        blocks.push("");
      }

      if (anomalies.length === 0) {
        anomalies.push("Aucun écart majeur détecté par rapport à la trame.");
      }
      blocks.push("Détail des écarts :");
      blocks.push(...anomalies);
      blocks.push("");
    }

    setSynthesisText(blocks.join("\n").trimEnd());
  }, [
    list1,
    list2,
    dpgfMode,
    importedOffers,
    offerIds,
    getOfferLinesForDpgf,
    getOfferTotalForDpgf,
    getLineTotal,
    totalEstime1,
    totalEstime2,
  ]);

  const handleCopySynthesis = useCallback(async () => {
    if (!synthesisText) return;
    try {
      await navigator.clipboard.writeText(synthesisText);
      toast.success("Synthèse copiée dans le presse-papier.");
    } catch {
      toast.error("Copie impossible.");
    }
  }, [synthesisText]);

  const goBack = () => {
    if (currentProjectId) navigate("/config");
    else navigate("/");
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Retour">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Référentiel DPGF (bac à sable)</h1>
          <p className="text-sm text-muted-foreground">
            Construisez la trame du projet. Les données sont enregistrées dans le projet et n&apos;impactent pas les pages d&apos;analyse.
          </p>
        </div>
      </div>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList className="grid w-full max-w-[320px] grid-cols-2">
          <TabsTrigger value="config">Configuration / Saisie</TabsTrigger>
          <TabsTrigger value="analyse">Analyse</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6 mt-4">
      {/* ——— Trame ——— */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Trame</CardTitle>
              <CardDescription>Chapitres et lignes de prix. Total estimé calculé automatiquement.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                <Switch
                  id="dpgf-mode-2"
                  checked={dpgfMode === 2}
                  onCheckedChange={(checked) => setDpgfMode(checked ? 2 : 1)}
                />
                <label htmlFor="dpgf-mode-2" className="text-sm font-medium cursor-pointer">
                  Activer le chiffrage d&apos;un 2ème bâtiment / DPGF
                </label>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleDownloadModeleExcel} className="gap-1">
                <Download className="h-4 w-4" />
                Télécharger le modèle Excel
              </Button>
              <input
                ref={masterTrameInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={onMasterTrameFileChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => masterTrameInputRef.current?.click()}
                className="gap-1"
              >
                <FileUp className="h-4 w-4" />
                Importer Trame Master (.xlsx)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExportTrameVierge}
                className="gap-1"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Exporter la trame Excel pour les entreprises
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={onFileChange}
              />
              {dpgfMode === 2 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => triggerImportOffer(1)}
                    className="gap-1"
                  >
                    <Upload className="h-4 w-4" />
                    Importer pour DPGF 1
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => triggerImportOffer(2)}
                    className="gap-1"
                  >
                    <Upload className="h-4 w-4" />
                    Importer pour DPGF 2
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { importForDpgfRef.current = 1; fileInputRef.current?.click(); }}
                  className="gap-1"
                >
                  <Upload className="h-4 w-4" />
                  Importer l&apos;offre d&apos;une entreprise (.xlsx)
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const body = (
              <>
          {list.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/40 bg-muted/20 py-16 px-6">
              <p className="text-muted-foreground mb-6 text-center">Aucune ligne. Créez votre première ligne pour commencer.</p>
              <Button
                type="button"
                size="lg"
                onClick={() => setList([{ ...createLine("1", "", "", 0, 0), indent: 0, categorie: "base" }])}
                className="gap-2 text-lg h-14 px-8 shadow-md"
              >
                <Plus className="h-6 w-6" />
                Créer ma première ligne
              </Button>
            </div>
          )}

          {list.map((line, index) => {
            const level = line.indent ?? 0;
            const categorie = line.categorie ?? "base";
            const isTitle = line.isChapter;
            const titleRowClass = isTitle ? getTitleRowClassName(level) : "";
            const subtotal = isTitle ? getChapterSubtotal(list, index) : 0;
            return (
            <div
              key={line.id}
              className={`group flex flex-wrap items-center gap-2 rounded-md border p-2 transition-colors border-muted/50 ${isTitle ? titleRowClass : "bg-background"}`}
            >
              {/* Colonne Actions */}
              <div className="flex shrink-0 items-center gap-0.5 border-r border-border pr-2">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleInsertAfter(index)} aria-label="Insérer en dessous" title="Insérer une ligne">
                  <Plus className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleIndentLeft(index)} aria-label="Niveau gauche" title="← Indentation" disabled={level === 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleIndentRight(index)} aria-label="Niveau droite" title="→ Indentation" disabled={level >= 5}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleTitreArticle(index)} aria-label={isTitle ? "Passer en Article" : "Passer en Titre"} title={isTitle ? "Titre → Article" : "Article → Titre"}>
                  <Type className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMoveUp(index)} aria-label="Monter" disabled={index === 0}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleMoveDown(index)} aria-label="Descendre" disabled={index === list.length - 1}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleRemove(index)} aria-label="Supprimer">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                <Input
                  placeholder="Réf"
                  value={line.reference}
                  onChange={(e) => handleUpdate(index, { reference: e.target.value })}
                  className={`w-20 shrink-0 ${isTitle ? "font-semibold bg-transparent border-transparent shadow-none" : ""}`}
                />
                <Input
                  placeholder="Désignation"
                  value={line.designation}
                  onChange={(e) => handleUpdate(index, { designation: e.target.value })}
                  className={`min-w-[200px] flex-1 ${isTitle ? "font-semibold bg-transparent border-transparent shadow-none" : ""}`}
                  style={{ paddingLeft: (level || 0) * 24 + "px" }}
                />
                <Select
                  value={categorie}
                  onValueChange={(v) => handleUpdate(index, { categorie: v as DpgfCategorie })}
                >
                  <SelectTrigger className="w-[110px] shrink-0 h-9">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge
                  variant="secondary"
                  className={
                    categorie === "base"
                      ? "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200 border-green-300 shrink-0"
                      : categorie === "pse"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200 border-blue-300 shrink-0"
                        : categorie === "variante"
                          ? "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200 border-violet-300 shrink-0"
                          : "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-200 border-orange-300 shrink-0"
                  }
                >
                  {CATEGORIE_OPTIONS.find((o) => o.value === categorie)?.label ?? categorie}
                </Badge>
                {isTitle ? (
                  <span className="ml-auto font-bold tabular-nums text-sm shrink-0">
                    {subtotal > 0
                      ? subtotal.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
                      : ""}
                  </span>
                ) : (
                  <>
                    <Input
                      placeholder="Unité"
                      value={line.unite}
                      onChange={(e) => handleUpdate(index, { unite: e.target.value })}
                      className="w-16 shrink-0"
                    />
                    <Input
                      type="number"
                      placeholder="Quantité"
                      value={line.quantite === 0 ? "" : line.quantite}
                      onChange={(e) => handleUpdate(index, { quantite: Number(e.target.value) || 0 })}
                      className="w-24"
                      min={0}
                      step={0.01}
                    />
                    <Input
                      type="number"
                      placeholder="PU (€)"
                      value={line.puEstime === 0 ? "" : line.puEstime}
                      onChange={(e) => {
                        const v = Number(e.target.value) || 0;
                        handleUpdate(index, { puEstime: v });
                        if (v > 0 && manualTotals[line.id] !== undefined) {
                          setManualTotals((prev) => {
                            const next = { ...prev };
                            delete next[line.id];
                            return next;
                          });
                        }
                      }}
                      className="w-24"
                      min={0}
                      step={0.01}
                    />
                    {(line.puEstime === 0 || !line.puEstime) ? (
                      <Input
                        type="number"
                        placeholder="Total HT"
                        value={manualTotals[line.id] === undefined || manualTotals[line.id] === 0 ? "" : manualTotals[line.id]}
                        onChange={(e) =>
                          setManualTotals((prev) => ({
                            ...prev,
                            [line.id]: Number(e.target.value) || 0,
                          }))
                        }
                        className="w-28"
                        min={0}
                        step={0.01}
                        title="Montant forfait (si PU vide)"
                      />
                    ) : (
                      <span className="w-28 text-right tabular-nums text-sm text-muted-foreground">
                        {(Number(line.quantite) || 0) * (Number(line.puEstime) || 0) > 0
                          ? ((Number(line.quantite) || 0) * (Number(line.puEstime) || 0)).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"
                          : "—"}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
            );
          })}

          {list.length > 0 && (
            <div className="flex flex-col gap-4 border-t border-border pt-6">
              <p className="text-sm font-medium text-muted-foreground">Ajouter une ligne à la fin :</p>
              <div className="flex flex-wrap gap-4">
                <Button
                  type="button"
                  variant="default"
                  size="lg"
                  onClick={handleAddTitreChapitre}
                  className="gap-2 text-base shadow-sm"
                >
                  <Plus className="h-5 w-5" />
                  Ajouter un Titre / Chapitre
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="lg"
                  onClick={handleAddArticle}
                  className="gap-2 text-base shadow-sm"
                >
                  <Plus className="h-5 w-5" />
                  Ajouter un Article / Prix
                </Button>
              </div>
            </div>
          )}

          {list.length > 0 && (
            <>
              <div className="flex justify-end items-center gap-4 border-t border-border pt-4">
                <p className="text-base font-semibold text-foreground">
                  Total HT :{" "}
                  <span className="tabular-nums text-lg">
                    {totalEstime.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </span>
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-semibold text-foreground">Récapitulatif financier (PSE et Variantes)</p>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-baseline gap-2">
                    <span className="text-muted-foreground">TOTAL BASE HT :</span>
                    <span className="tabular-nums font-medium">
                      {totalBaseHt.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </span>
                  </div>
                  {pseLines.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Montant des PSE :</span>
                      <ul className="mt-1 ml-4 list-disc space-y-0.5">
                        {pseLines.map((l) => (
                          <li key={l.id} className="flex items-baseline gap-2">
                            <span className="text-foreground">{(l.designation || l.reference || "—").trim() || l.reference}</span>
                            <span className="tabular-nums text-blue-700 dark:text-blue-300">
                              {getLineTotal(l).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {varianteTrancheLines.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Montant des Variantes / Tranches :</span>
                      <ul className="mt-1 ml-4 list-disc space-y-0.5">
                        {varianteTrancheLines.map((l) => (
                          <li key={l.id} className="flex items-baseline gap-2">
                            <span className="text-foreground">{(l.designation || l.reference || "—").trim() || l.reference}</span>
                            <span className={`tabular-nums ${(l.categorie ?? "base") === "variante" ? "text-violet-700 dark:text-violet-300" : "text-orange-700 dark:text-orange-300"}`}>
                              {getLineTotal(l).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {chapterSubtotals.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Sous-totaux par titre (somme des lignes en dessous) :</span>
                      <ul className="mt-1 ml-4 list-disc space-y-0.5">
                        {chapterSubtotals.map(({ line, subtotal }) => (
                          <li key={line.id} className="flex items-baseline gap-2">
                            <span className="text-foreground">{(line.designation || line.reference || "—").trim() || line.reference}</span>
                            <span className="tabular-nums font-medium">
                              {subtotal.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
              </>
            );
            return dpgfMode === 2 ? (
              <Tabs value={String(activeDpgfTab)} onValueChange={(v) => setActiveDpgfTab(Number(v) as 1 | 2)}>
                <TabsList className="mb-4 grid w-full max-w-md grid-cols-2 h-12">
                  <TabsTrigger value="1" className="text-base font-medium">Bâtiment 1</TabsTrigger>
                  <TabsTrigger value="2" className="text-base font-medium">Bâtiment 2</TabsTrigger>
                </TabsList>
                <TabsContent value="1" className="mt-4 space-y-4">{body}</TabsContent>
                <TabsContent value="2" className="mt-4 space-y-4">{body}</TabsContent>
              </Tabs>
            ) : body;
          })()}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="analyse" className="space-y-6 mt-4">
      {/* ——— Analyse comparative ——— */}
      {((dpgfMode === 1 && list1.length > 0) || (dpgfMode === 2 && (list1.length > 0 || list2.length > 0))) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Analyse comparative</CardTitle>
            <CardDescription>
              Comparaison du référentiel (Master) avec les offres importées.
              {dpgfMode === 2 && " Affiche Bât 1 + Bât 2 et Total combiné."}
            </CardDescription>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200 border-orange-300">
                Qté différente
              </Badge>
              <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-200 border-yellow-300">
                PU &lt; −20 %
              </Badge>
              <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200 border-red-300">
                PU &gt; +20 %
              </Badge>
              <Badge variant="outline" className="bg-muted text-muted-foreground line-through">
                Ligne oubliée
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {offerIds.length === 0 ? (
              <p className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                Importez au moins une offre (.xlsx) pour afficher le tableau comparatif.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[70px]">Réf</TableHead>
                      <TableHead className="min-w-[200px]">Désignation</TableHead>
                      {dpgfMode === 2 && <TableHead className="w-12 text-center">Bât</TableHead>}
                      <TableHead className="text-right w-24">Qté Master</TableHead>
                      <TableHead className="text-right w-28">PU Estimé</TableHead>
                      {offerIds.map((offerId) => {
                        const offer = importedOffers[offerId];
                        return (
                          <TableHead key={offerId} colSpan={3} className="text-center bg-muted/30 min-w-[180px]">
                            {offer?.companyName ?? offerId}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={dpgfMode === 2 ? 5 : 4} className="bg-transparent border-b-0" />
                      {offerIds.map((offerId) => (
                        <React.Fragment key={offerId}>
                          <TableHead className="text-right text-xs font-medium w-24 bg-muted/20">
                            Qté
                          </TableHead>
                          <TableHead className="text-right text-xs font-medium w-24 bg-muted/20">
                            PU (€)
                          </TableHead>
                          <TableHead className="text-right text-xs font-medium w-24 bg-muted/20">
                            Total
                          </TableHead>
                        </React.Fragment>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {combinedListForTable.map((line) => {
                      const isChapter = line.isChapter;
                      const ref = normRef(line.reference);
                      const qteMaster = Number(line.quantite) || 0;
                      const puEstime = Number(line.puEstime) || 0;
                      const dpgf = line.dpgf ?? 1;

                      return (
                        <TableRow
                          key={`${line.id}-${dpgf}`}
                          className={isChapter ? "bg-muted/20 font-medium" : undefined}
                        >
                          <TableCell className="font-mono text-xs">{line.reference}</TableCell>
                          <TableCell className={isChapter ? "font-semibold" : ""}>{line.designation}</TableCell>
                          {dpgfMode === 2 && (
                            <TableCell className="text-center tabular-nums">{isChapter ? "" : dpgf}</TableCell>
                          )}
                          <TableCell className="text-right tabular-nums">
                            {isChapter ? "" : qteMaster}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {isChapter ? "" : (puEstime ? puEstime.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—")}
                          </TableCell>
                          {offerIds.map((offerId) => {
                            const offer = importedOffers[offerId];
                            const data = getOfferLinesForDpgf(offer, dpgf);
                            const lineData = data[ref] ?? data[line.reference];
                            const qteE = lineData?.quantite ?? 0;
                            const puE = lineData?.pu ?? 0;
                            const totalE = lineData?.total ?? 0;

                            if (isChapter) {
                              return (
                                <TableCell key={offerId} colSpan={3} className="bg-muted/10" />
                              );
                            }

                            const noPu = puE === 0 && totalE === 0;
                            const qteDiff = qteE !== qteMaster;
                            const puInf20 = puEstime > 0 && puE < puEstime * 0.8;
                            const puSup20 = puEstime > 0 && puE > puEstime * 1.2;

                            const cellClass = [
                              "text-right tabular-nums",
                              noPu && "bg-muted/50 text-muted-foreground line-through",
                              !noPu && qteDiff && "bg-orange-100 dark:bg-orange-950/40 text-orange-800 dark:text-orange-200",
                              !noPu && !qteDiff && puInf20 && "bg-yellow-100 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-200",
                              !noPu && !qteDiff && !puInf20 && puSup20 && "bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-200",
                            ]
                              .filter(Boolean)
                              .join(" ");

                            return (
                              <React.Fragment key={offerId}>
                                <TableCell className={cellClass}>
                                  {qteE !== 0 ? qteE : "—"}
                                </TableCell>
                                <TableCell className={cellClass}>
                                  {puE !== 0 ? puE.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                                </TableCell>
                                <TableCell className={cellClass}>
                                  {totalE !== 0 ? totalE.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                                </TableCell>
                              </React.Fragment>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                    {/* Ligne Total */}
                    <TableRow className="bg-muted/30 font-medium">
                      <TableCell colSpan={dpgfMode === 2 ? 5 : 4} className="font-semibold">
                        Total
                      </TableCell>
                      {offerIds.map((offerId) => {
                        const offer = importedOffers[offerId];
                        const t1 = getOfferTotalForDpgf(offer, list1, 1);
                        const t2 = getOfferTotalForDpgf(offer, list2, 2);
                        const totalOffer = t1 + t2;
                        return (
                          <TableCell key={offerId} colSpan={3} className="text-right tabular-nums font-medium">
                            {totalOffer > 0 ? `${totalOffer.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—"}
                            {dpgfMode === 2 && (t1 > 0 || t2 > 0) && (
                              <span className="block text-xs text-muted-foreground font-normal">
                                Bât 1 : {t1.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € · Bât 2 : {t2.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ——— Générateur de synthèse pour négociation ——— */}
      {((dpgfMode === 1 && list1.length > 0) || (dpgfMode === 2 && (list1.length > 0 || list2.length > 0))) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Générateur de synthèse pour négociation</CardTitle>
            <CardDescription>
              Générez un texte listant les écarts par entreprise pour préparer vos mails de négociation, puis copiez-le dans le presse-papier.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={generateSynthesis} className="gap-2">
                Générer la synthèse des écarts
              </Button>
              {synthesisText && (
                <Button type="button" variant="outline" onClick={handleCopySynthesis} className="gap-2">
                  <Copy className="h-4 w-4" />
                  Copier dans le presse-papier
                </Button>
              )}
            </div>
            {synthesisText ? (
              <textarea
                readOnly
                value={synthesisText}
                rows={16}
                className="w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm font-mono whitespace-pre-wrap resize-y min-h-[200px]"
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Cliquez sur « Générer la synthèse des écarts » pour produire le texte à partir de la trame et des offres importées.
              </p>
            )}
          </CardContent>
        </Card>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
