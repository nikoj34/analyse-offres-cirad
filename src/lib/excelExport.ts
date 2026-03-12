import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  LegacyProjectView,
  NOTATION_LABELS,
  NOTATION_VALUES,
  NotationLevel,
  NEGOTIATION_DECISION_LABELS,
  NegotiationDecision,
  NegotiationVersion,
  getVersionDisplayLabel,
  getSyntheseLabel,
} from "@/types/project";
import type { ProjectData as MultiLotProjectData, LotData } from "@/types/project";
import { getCompanyTotalGlobalEvalue, getCompanyTotalForPseSubset } from "./scenarioTotal";

type ProjectData = LegacyProjectView;

const COLORS = {
  headerBg: "1F4E79",
  headerFont: "FFFFFF",
  lightBlue: "D6E4F0",
  lightGreen: "E2EFDA",
  lightYellow: "FFF2CC",
  lightOrange: "FCE4D6",
  lightRed: "F8D7DA",
  white: "FFFFFF",
  borderColor: "B4C6E7",
  darkText: "1F4E79",
  excluded: "D9534F",
  /** Police grise pour la ligne "Note associée (sur 100)" dans le récap prix Synthèse */
  noteGray: "6B7280",
};

// 30 distinct company colors (matching companyColors.ts)
const COMPANY_ARGB = [
  "FF2563EB", "FFDC2626", "FF16A34A", "FFEA580C", "FF7C3AED",
  "FFCA8A04", "FF0891B2", "FFBE185D", "FF4F46E5", "FF059669",
  "FF9333EA", "FFD97706", "FF0D9488", "FFE11D48", "FF6D28D9",
  "FF65A30D", "FF0284C7", "FFC2410C", "FF7C2D12", "FF4338CA",
  "FF15803D", "FFB91C1C", "FF1D4ED8", "FFA21CAF", "FF854D0E",
  "FF0E7490", "FF9F1239", "FF3730A3", "FF166534", "FF92400E",
];

// Pastel version of company color (very light background)
function companyPastelArgb(idx: number): string {
  const hex = COMPANY_ARGB[idx % COMPANY_ARGB.length].slice(2); // remove FF prefix
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Mix with white at 90%
  const mix = (c: number) => Math.round(c * 0.12 + 255 * 0.88).toString(16).padStart(2, "0");
  return `FF${mix(r)}${mix(g)}${mix(b)}`;
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: "thin", color: { argb: COLORS.borderColor } };
  return { top: side, bottom: side, left: side, right: side };
}

function thickBorder(): Partial<ExcelJS.Borders> {
  const thick: Partial<ExcelJS.Border> = { style: "medium", color: { argb: "595959" } };
  const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: COLORS.borderColor } };
  return { top: thick, bottom: thick, left: thick, right: thick };
}

function headerFill(): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
}

function headerFont(): Partial<ExcelJS.Font> {
  return { bold: true, color: { argb: COLORS.headerFont }, size: 11 };
}

function lightFill(color: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb: color } };
}

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

/** Colonne Excel (1-based) vers lettre(s) : 1=A, 2=B, 27=AA */
function colLetter(colIndex: number): string {
  if (colIndex <= 26) return String.fromCharCode(64 + colIndex);
  const high = Math.floor((colIndex - 1) / 26);
  const low = (colIndex - 1) % 26;
  return String.fromCharCode(64 + high) + String.fromCharCode(65 + low);
}

/** Formule SOMME sur une plage contiguë */
function formulaSumRange(colIndex: number, firstRow: number, lastRow: number): string {
  const col = colLetter(colIndex);
  return `SOMME(${col}${firstRow}:${col}${lastRow})`;
}

/** Formule somme sur des lignes non contiguës (ex: DPGF1 uniquement) */
function formulaSumRows(colIndex: number, rows: number[]): string {
  const col = colLetter(colIndex);
  return rows.map((r) => `${col}${r}`).join("+");
}

/**
 * Applique le renvoi à la ligne (wrap text) et l'alignement vertical centré à toutes les cellules
 * d'une feuille. Préserve l'alignement existant via déstructuration avec valeur de repli.
 */
function applyWrapTextToSheet(ws: ExcelJS.Worksheet): void {
  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const existing = cell.alignment ?? {};
      cell.alignment = { ...existing, wrapText: true, vertical: "middle" as const };
    });
  });
}

/** Applique le wrap text et l'alignement vertical à toutes les feuilles du classeur. */
function applyWrapTextToAllSheets(wb: ExcelJS.Workbook): void {
  wb.worksheets.forEach((ws) => applyWrapTextToSheet(ws));
}

const ROW_HEIGHT_LINE = 15;
const ROW_HEIGHT_CHARS_PER_LINE = 50;

/** Nombre de lignes estimé pour un texte (sauts de ligne + longueur) */
function countTextLines(text: string | undefined, charsPerLine = ROW_HEIGHT_CHARS_PER_LINE): number {
  const s = text != null ? String(text).trim() : "";
  if (!s) return 1;
  const fromNewlines = (s.match(/\n/g) || []).length + 1;
  const fromLength = Math.ceil(s.length / charsPerLine) || 1;
  return Math.max(1, fromNewlines, fromLength);
}

/** Hauteur de ligne estimée d'après le contenu texte (sauts de ligne + longueur) */
function estimateRowHeight(text: string | undefined, minH = 18, maxH = 250, lineHeight = ROW_HEIGHT_LINE, charsPerLine = ROW_HEIGHT_CHARS_PER_LINE): number {
  const lines = countTextLines(text, charsPerLine);
  return Math.min(maxH, Math.max(minH, Math.round(lines * lineHeight)));
}

/** Hauteur de ligne à partir de plusieurs contenus (texte brut ou richText) ; prend le max. */
function rowHeightFromCellValues(values: unknown[], minH = 18, maxH = 250, lineHeight = ROW_HEIGHT_LINE, charsPerLine = ROW_HEIGHT_CHARS_PER_LINE): number {
  let maxLines = 1;
  for (const v of values) {
    let s = "";
    if (typeof v === "string") s = v;
    else if (v != null && typeof v === "object" && "richText" in v) {
      const rt = (v as { richText?: Array<{ text: string }> }).richText;
      s = Array.isArray(rt) ? rt.map((r) => r.text).join("") : "";
    }
    maxLines = Math.max(maxLines, countTextLines(s, charsPerLine));
  }
  return Math.min(maxH, Math.max(minH, Math.round(maxLines * lineHeight)));
}

// ─── Intelligent text diff ───────────────────────────────────────────────────
// Computes a rich text showing old text (strikethrough red) + new text (green)
// when comparing current vs previous version of a field.
// If identical, returns plain string. Supports cumulative diffs across multiple nego rounds.
function buildDiffRichText(current: string, prev: string): ExcelJS.CellRichTextValue | string {
  const cur = (current ?? "").trim();
  const prv = (prev ?? "").trim();
  if (!prv && !cur) return "";
  if (!prv) return cur;
  if (cur === prv) return cur;

  const parts: ExcelJS.RichText[] = [];

  // Keep unchanged prefix/suffix and mark differences in the middle.
  // Simple approach: show prev struck, then new added (handles append/modify)
  // Check if it's a pure append (new starts with prev)
  if (cur.startsWith(prv)) {
    // Only addition at the end
    const added = cur.slice(prv.length).trim();
    if (prv) parts.push({ text: prv, font: { size: 10 } });
    if (added) {
      if (prv) parts.push({ text: "\n" });
      parts.push({ text: added, font: { color: { argb: "FF1565C0" }, size: 10 } }); // blue for additions
    }
  } else {
    // Modified or deleted: deleted text = red + strikethrough, added text = blue (CIRAD spec)
    if (prv) {
      parts.push({ text: prv, font: { strike: true, color: { argb: "FFC62828" }, size: 10 } });
    }
    if (cur) {
      if (prv) parts.push({ text: "\n" });
      parts.push({ text: cur, font: { color: { argb: "FF1565C0" }, size: 10 } });
    }
  }
  return parts.length > 0 ? { richText: parts } : cur;
}

// ─── Nom de phase dynamique pour export ──────────────────────────────────────
const MAX_SHEET_NAME_LENGTH = 31;

/**
 * Retourne les noms d’onglets selon le nombre total de versions et l’index de la version courante.
 *
 * 0 négo       → "Analyse prix" / "Analyse technique" / "Q&R" / "Synthèse"
 * ≥1 négo, V0  → "Analyse prix initiale" / "Analyse technique initiale" / "Q&R" / "Synthèse initiale"
 * 1 négo, Négo → "Analyse prix Négo" / "Analyse technique Négo" / "Q&R Négo" / "Synthèse après négociation" / "Déroulement Négo"
 * ≥2 négo, N   → idem avec numéro : "Analyse prix Négo N" / … / "Synthèse après négociation N" / "Déroulement Négo N"
 */
function getTabNames(
  totalVersions: number,
  versionIndex: number
): { prix: string; tech: string; qr: string; synthese: string; deroulement: string } {
  const t = (s: string) => s.length > MAX_SHEET_NAME_LENGTH ? s.slice(0, MAX_SHEET_NAME_LENGTH) : s;
  const negoCount = totalVersions - 1;

  if (negoCount === 0) {
    return { prix: "Analyse prix", tech: "Analyse technique", qr: "Q&R", synthese: "Synthèse", deroulement: "" };
  }

  if (versionIndex === 0) {
    return { prix: "Analyse prix initiale", tech: "Analyse technique initiale", qr: "Q&R", synthese: "Synthèse initiale", deroulement: "" };
  }

  const n = versionIndex;

  if (negoCount === 1) {
    return { prix: "Analyse prix Négo", tech: "Analyse technique Négo", qr: "Q&R Négo", synthese: "Synthèse après négociation", deroulement: "Déroulement Négo" };
  }

  return {
    prix:        t(`Analyse prix Négo ${n}`),
    tech:        t(`Analyse technique Négo ${n}`),
    qr:          t(`Q&R Négo ${n}`),
    synthese:    t(`Synthèse après négociation ${n}`),
    deroulement: t(`Déroulement Négo ${n}`),
  };
}

// ─── Analyse Technique — Entreprises en colonnes ─────────────────────────────
function buildTechSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  project: ProjectData,
  version: NegotiationVersion,
  companies: typeof project.companies,
  prevVersion?: NegotiationVersion | null
) {
  const ws = wb.addWorksheet(sheetName);
  ws.properties.defaultRowHeight = 60; // taller rows for comments

  const technicalCriteria = project.weightingCriteria.filter(
    (c) => c.id !== "prix" && c.id !== "environnemental" && c.id !== "planning" && c.weight > 0
  );
  const envCrit = project.weightingCriteria.find((c) => c.id === "environnemental" && c.weight > 0);
  const planCrit = project.weightingCriteria.find((c) => c.id === "planning" && c.weight > 0);
  const maxTechWeight = technicalCriteria.reduce((s, c) => s + c.weight, 0);

  const activeCompanies = companies.filter((c) => c.name.trim() !== "");

  // Column A = labels; for each company: 2 columns (Appréciation + Note)
  // Col 1 = A (row labels)
  // Col 2 = B (first company — Appréciation), Col 3 = C (first company — Note/X)
  // Col 4 = D (second company — Appréciation), etc.
  const COL_LABEL = 1; // A
  const companyColStart = (idx: number) => 2 + idx * 2; // B, D, F...

  // ── Row 1: Title ──
  let row = 1;
  const lastCol = companyColStart(activeCompanies.length - 1) + 1;
  ws.mergeCells(row, COL_LABEL, row, lastCol);
  const titleCell = ws.getCell(row, COL_LABEL);
  titleCell.value = `${project.info.name || "Projet"} — Lot ${project.info.lotNumber || ""} — ${sheetName}`;
  titleCell.font = { bold: true, size: 13, color: { argb: COLORS.darkText } };
  titleCell.fill = lightFill(COLORS.lightBlue);
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = 22;
  row++;

  // ── Row 2: Company headers (name) ──
  ws.getCell(row, COL_LABEL).value = `${project.info.name || ""}`;
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 10, color: { argb: COLORS.headerFont } };
  ws.getCell(row, COL_LABEL).fill = headerFill();
  ws.getCell(row, COL_LABEL).border = thinBorder();
  ws.getRow(row).height = 28;

  activeCompanies.forEach((company, idx) => {
    const colA = companyColStart(idx);
    const colB = colA + 1;
    ws.mergeCells(row, colA, row, colB);
    const cell = ws.getCell(row, colA);
    const isExcluded = company.status === "ecartee";
    cell.value = `Offre ${idx + 1}\n${company.name}${isExcluded ? " (ÉCARTÉE)" : ""}`;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = solidFill(COMPANY_ARGB[idx % COMPANY_ARGB.length]);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thickBorder();
  });
  row++;

  // Pas d'en-tête global unique : chaque bloc sous-critère aura son propre en-tête (Appréciation | Note / X)
  // ── Helper to compute criterion score (with raw sub scores for display) ──
  const getCriterionScore = (companyId: number, criterionId: string): {
    notation: string;
    score: number;
    note: any;
    subScores: { sub: any; notation: string; score: number; rawScore: number; subWeight: number; note: any }[];
    totalRaw?: number;
    subTotal?: number;
  } => {
    const criterion = project.weightingCriteria.find((c) => c.id === criterionId)!;
    if (!criterion) return { notation: "—", score: 0, note: undefined, subScores: [] };

    if (criterion.subCriteria.length > 0) {
      const subTotal = criterion.subCriteria.reduce((s, sc) => s + sc.weight, 0);
      let totalRaw = 0;
      const subScores = criterion.subCriteria.map((sub) => {
        const note = version.technicalNotes.find(
          (n) => n.companyId === companyId && n.criterionId === criterionId && n.subCriterionId === sub.id
        );
        const val = note?.notation ? NOTATION_VALUES[note.notation] : 0;
        const rawScore = sub.weight * val;
        totalRaw += rawScore;
        return {
          sub,
          notation: note?.notation ? NOTATION_LABELS[note.notation] : "—",
          score: rawScore,
          rawScore,
          subWeight: sub.weight,
          note,
        };
      });
      const score = subTotal > 0 ? (totalRaw / subTotal) * criterion.weight : 0;
      return { notation: "—", score, note: undefined, subScores, totalRaw, subTotal };
    } else {
      const note = version.technicalNotes.find(
        (n) => n.companyId === companyId && n.criterionId === criterionId && !n.subCriterionId
      );
      const val = note?.notation ? NOTATION_VALUES[note.notation] : 0;
      const score = val * criterion.weight;
      return { notation: note?.notation ? NOTATION_LABELS[note.notation] : "—", score, note, subScores: [] };
    }
  };

  // ── Per criterion rows ──
  for (const criterion of technicalCriteria) {
    const activeSubCriteria = criterion.subCriteria.filter((s) => s.weight > 0);
    const hasSubCriteria = activeSubCriteria.length > 0;
    const subTotal = activeSubCriteria.reduce((s, sc) => s + sc.weight, 0);

    if (hasSubCriteria) {
      // For each sub-criterion: en-tête dédié puis ligne de résultats (note brute)
      for (const sub of activeSubCriteria) {
        // ── Ligne d'en-tête juste au-dessus des résultats : ["", "Sous-critère X", "Appréciation", "Note / {poids}", ...] ──
        ws.getCell(row, COL_LABEL).value = "";
        ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
        ws.getCell(row, COL_LABEL).border = thinBorder();
        ws.getRow(row).height = 18;

        activeCompanies.forEach((company, idx) => {
          const colA = companyColStart(idx);
          const colB = colA + 1;
          const pastel = companyPastelArgb(idx);
          ws.getCell(row, colA).value = "Appréciation";
          ws.getCell(row, colA).font = { bold: true, size: 9 };
          ws.getCell(row, colA).fill = solidFill(pastel);
          ws.getCell(row, colA).alignment = { horizontal: "center" };
          ws.getCell(row, colA).border = thinBorder();
          ws.getCell(row, colB).value = `Note / ${sub.weight}`;
          ws.getCell(row, colB).font = { bold: true, size: 9 };
          ws.getCell(row, colB).fill = solidFill(pastel);
          ws.getCell(row, colB).alignment = { horizontal: "center" };
          ws.getCell(row, colB).border = thinBorder();
        });
        row++;

        // ── Ligne des résultats du sous-critère (note brute = coeff × poids_sous_critère) ──
        ws.getCell(row, COL_LABEL).value = `${criterion.label}\n${sub.label} (${sub.weight}%)`;
        ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
        ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
        ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
        ws.getCell(row, COL_LABEL).border = thinBorder();
        ws.getRow(row).height = 18;

        activeCompanies.forEach((company, idx) => {
          const colA = companyColStart(idx);
          const colB = colA + 1;
          const pastel = companyPastelArgb(idx);
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
          );
          const val = note?.notation ? NOTATION_VALUES[note.notation] : 0;
          const rawScore = sub.weight * val;

          const appCell = ws.getCell(row, colA);
          appCell.value = note?.notation ? NOTATION_LABELS[note.notation] : "—";
          appCell.font = { bold: true, size: 9 };
          appCell.fill = solidFill(pastel);
          appCell.alignment = { horizontal: "center", vertical: "middle" };
          appCell.border = thinBorder();

          const noteCell = ws.getCell(row, colB);
          noteCell.value = Number(rawScore.toFixed(2));
          noteCell.numFmt = "0.00";
          noteCell.font = { size: 9 };
          noteCell.fill = solidFill(pastel);
          noteCell.alignment = { horizontal: "center", vertical: "middle" };
          noteCell.border = thinBorder();
        });
        row++;

        // ── Comments rows (Points Positifs + Points Négatifs) ──
        // Données de la version courante de cet onglet (version active pour cette phase).
        // Positifs
        const posTexts = activeCompanies.map((company) => {
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
          );
          return note?.commentPositif || note?.comment || "";
        });
        const maxPosLen = Math.max(0, ...posTexts.map((t) => String(t).length));
        ws.getCell(row, COL_LABEL).value = "Points Positifs";
        ws.getCell(row, COL_LABEL).font = { italic: true, size: 9, color: { argb: "FF2E7D32" } };
        ws.getCell(row, COL_LABEL).fill = lightFill("F0FBF0");
        ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
        ws.getCell(row, COL_LABEL).border = thinBorder();
        ws.getRow(row).height = rowHeightFromCellValues(posTexts, 40, 250);

        activeCompanies.forEach((company, idx) => {
          const colA = companyColStart(idx);
          const colB = colA + 1;
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
          );
          const curPos = note?.commentPositif || note?.comment || "";

          ws.mergeCells(row, colA, row, colB);
          const cell = ws.getCell(row, colA);

          if (prevVersion) {
            const prevNote = prevVersion.technicalNotes.find(
              (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
            );
            const prevPos = prevNote?.commentPositif || prevNote?.comment || "";
            cell.value = buildDiffRichText(curPos, prevPos);
          } else {
            cell.value = curPos;
          }
          cell.alignment = { wrapText: true, vertical: "top" };
          cell.border = thinBorder();
          cell.fill = lightFill("F9FFF9");
        });
        row++;

        // Négatifs
        const negTexts = activeCompanies.map((company) => {
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
          );
          return note?.commentNegatif || "";
        });
        const maxNegLen = Math.max(0, ...negTexts.map((t) => String(t).length));
        ws.getCell(row, COL_LABEL).value = "Points Négatifs";
        ws.getCell(row, COL_LABEL).font = { italic: true, size: 9, color: { argb: "FFC62828" } };
        ws.getCell(row, COL_LABEL).fill = lightFill("FFF8F8");
        ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
        ws.getCell(row, COL_LABEL).border = thinBorder();
        ws.getRow(row).height = rowHeightFromCellValues(negTexts, 40, 250);

        activeCompanies.forEach((company, idx) => {
          const colA = companyColStart(idx);
          const colB = colA + 1;
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
          );
          const curNeg = note?.commentNegatif || "";

          ws.mergeCells(row, colA, row, colB);
          const cell = ws.getCell(row, colA);

          if (prevVersion) {
            const prevNote = prevVersion.technicalNotes.find(
              (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
            );
            const prevNeg = prevNote?.commentNegatif || "";
            cell.value = buildDiffRichText(curNeg, prevNeg);
          } else {
            cell.value = curNeg;
          }
          cell.alignment = { wrapText: true, vertical: "top" };
          cell.border = thinBorder();
          cell.fill = lightFill("FFFDF8");
        });
        row++;

        // Répond aux questions
        const qrTextsSubCrit = activeCompanies.map((company) => {
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
          );
          return note?.questionResponse || "";
        });
        ws.getCell(row, COL_LABEL).value = "Répond aux questions";
        ws.getCell(row, COL_LABEL).font = { italic: true, size: 9, color: { argb: "FF0D47A1" } };
        ws.getCell(row, COL_LABEL).fill = lightFill("E8F0FE");
        ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
        ws.getCell(row, COL_LABEL).border = thinBorder();
        ws.getRow(row).height = rowHeightFromCellValues(qrTextsSubCrit, 40, 250);
        activeCompanies.forEach((company, idx) => {
          const colA = companyColStart(idx);
          const colB = colA + 1;
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
          );
          ws.mergeCells(row, colA, row, colB);
          const cell = ws.getCell(row, colA);
          cell.value = note?.questionResponse || "";
          cell.alignment = { wrapText: true, vertical: "top" };
          cell.border = thinBorder();
          cell.fill = lightFill("E8F0FE");
        });
        row++;
      }

      // ── Total brut : Somme(notes brutes) / Somme(poids sous-critères) ──
      ws.getCell(row, COL_LABEL).value = `Total brut\n${subTotal} pts max`;
      ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
      ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightGreen);
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
      ws.getRow(row).height = 18;

      activeCompanies.forEach((company, idx) => {
        const colA = companyColStart(idx);
        const colB = colA + 1;
        const scores = getCriterionScore(company.id, criterion.id);
        const totalR = scores.totalRaw ?? 0;
        const subT = scores.subTotal ?? subTotal;
        ws.mergeCells(row, colA, row, colB);
        const cell = ws.getCell(row, colA);
        cell.value = subT > 0 ? `${totalR.toFixed(1)} / ${subT}` : "—";
        cell.font = { bold: true, size: 9 };
        cell.fill = lightFill(COLORS.lightGreen);
        cell.alignment = { horizontal: "center" };
        cell.border = thinBorder();
      });
      row++;

    } else {
      // Critère sans sous-critères (ex: Environnemental, Planning) : même structure d'en-tête que pour les sous-critères
      // ── Ligne d'en-tête : ["", "Appréciation", "Note / {poids}", ...] par entreprise ──
      ws.getCell(row, COL_LABEL).value = "";
      ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = 18;

      activeCompanies.forEach((company, idx) => {
        const colA = companyColStart(idx);
        const colB = colA + 1;
        const pastel = companyPastelArgb(idx);
        ws.getCell(row, colA).value = "Appréciation";
        ws.getCell(row, colA).font = { bold: true, size: 9 };
        ws.getCell(row, colA).fill = solidFill(pastel);
        ws.getCell(row, colA).alignment = { horizontal: "center" };
        ws.getCell(row, colA).border = thinBorder();
        ws.getCell(row, colB).value = `Note / ${criterion.weight}`;
        ws.getCell(row, colB).font = { bold: true, size: 9 };
        ws.getCell(row, colB).fill = solidFill(pastel);
        ws.getCell(row, colB).alignment = { horizontal: "center" };
        ws.getCell(row, colB).border = thinBorder();
      });
      row++;

      // ── Ligne de résultats (appréciation + note pondérée) ──
      ws.getCell(row, COL_LABEL).value = `${criterion.label} (${criterion.weight}%)`;
      ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
      ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
      ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = 18;

      activeCompanies.forEach((company, idx) => {
        const colA = companyColStart(idx);
        const colB = colA + 1;
        const pastel = companyPastelArgb(idx);
        const scores = getCriterionScore(company.id, criterion.id);

        ws.getCell(row, colA).value = scores.notation;
        ws.getCell(row, colA).font = { bold: true, size: 9 };
        ws.getCell(row, colA).fill = solidFill(pastel);
        ws.getCell(row, colA).alignment = { horizontal: "center" };
        ws.getCell(row, colA).border = thinBorder();

        ws.getCell(row, colB).value = Number(scores.score.toFixed(2));
        ws.getCell(row, colB).numFmt = "0.00";
        ws.getCell(row, colB).fill = solidFill(pastel);
        ws.getCell(row, colB).alignment = { horizontal: "center" };
        ws.getCell(row, colB).border = thinBorder();
      });
      row++;

      // Comments for simple criterion (Points Positifs/Négatifs = version de cet onglet)
      const simplePosTexts = activeCompanies.map((company) => {
        const note = version.technicalNotes.find(
          (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
        );
        return note?.commentPositif || note?.comment || "";
      });
      const simpleMaxPosLen = Math.max(0, ...simplePosTexts.map((t) => String(t).length));
      ws.getCell(row, COL_LABEL).value = "Points Positifs";
      ws.getCell(row, COL_LABEL).font = { italic: true, size: 9, color: { argb: "FF2E7D32" } };
      ws.getCell(row, COL_LABEL).fill = lightFill("F0FBF0");
      ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = rowHeightFromCellValues(simplePosTexts, 40, 250);

      activeCompanies.forEach((company, idx) => {
        const colA = companyColStart(idx);
        const colB = colA + 1;
        const note = version.technicalNotes.find(
          (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
        );
        const curPos = note?.commentPositif || note?.comment || "";
        ws.mergeCells(row, colA, row, colB);
        const cell = ws.getCell(row, colA);
        if (prevVersion) {
          const prevNote = prevVersion.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
          );
          cell.value = buildDiffRichText(curPos, prevNote?.commentPositif || prevNote?.comment || "");
        } else {
          cell.value = curPos;
        }
        cell.alignment = { wrapText: true, vertical: "top" };
        cell.border = thinBorder();
        cell.fill = lightFill("F9FFF9");
      });
      row++;

      const simpleNegTexts = activeCompanies.map((company) => {
        const note = version.technicalNotes.find(
          (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
        );
        return note?.commentNegatif || "";
      });
      const simpleMaxNegLen = Math.max(0, ...simpleNegTexts.map((t) => String(t).length));
      ws.getCell(row, COL_LABEL).value = "Points Négatifs";
      ws.getCell(row, COL_LABEL).font = { italic: true, size: 9, color: { argb: "FFC62828" } };
      ws.getCell(row, COL_LABEL).fill = lightFill("FFF8F8");
      ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = rowHeightFromCellValues(simpleNegTexts, 40, 250);

      activeCompanies.forEach((company, idx) => {
        const colA = companyColStart(idx);
        const colB = colA + 1;
        const note = version.technicalNotes.find(
          (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
        );
        const curNeg = note?.commentNegatif || "";
        ws.mergeCells(row, colA, row, colB);
        const cell = ws.getCell(row, colA);
        if (prevVersion) {
          const prevNote = prevVersion.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
          );
          cell.value = buildDiffRichText(curNeg, prevNote?.commentNegatif || "");
        } else {
          cell.value = curNeg;
        }
        cell.alignment = { wrapText: true, vertical: "top" };
        cell.border = thinBorder();
        cell.fill = lightFill("FFFDF8");
      });
      row++;

      // Répond aux questions
      const qrTextsSimple = activeCompanies.map((company) => {
        const note = version.technicalNotes.find(
          (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
        );
        return note?.questionResponse || "";
      });
      ws.getCell(row, COL_LABEL).value = "Répond aux questions";
      ws.getCell(row, COL_LABEL).font = { italic: true, size: 9, color: { argb: "FF0D47A1" } };
      ws.getCell(row, COL_LABEL).fill = lightFill("E8F0FE");
      ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = rowHeightFromCellValues(qrTextsSimple, 40, 250);
      activeCompanies.forEach((company, idx) => {
        const colA = companyColStart(idx);
        const colB = colA + 1;
        const note = version.technicalNotes.find(
          (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
        );
        ws.mergeCells(row, colA, row, colB);
        const cell = ws.getCell(row, colA);
        cell.value = note?.questionResponse || "";
        cell.alignment = { wrapText: true, vertical: "top" };
        cell.border = thinBorder();
        cell.fill = lightFill("E8F0FE");
      });
      row++;
    }

    // Empty separator
    ws.getRow(row).height = 6;
    row++;
  }

  // ── Note technique pondérée (seule ligne conservée : valeur sur maxTechWeight) ──
  const totalScores: Record<number, number> = {};
  activeCompanies.forEach((company) => {
    let total = 0;
    for (const criterion of technicalCriteria) {
      total += getCriterionScore(company.id, criterion.id).score;
    }
    totalScores[company.id] = total;
  });

  const prixCriterion = project.weightingCriteria.find((c) => c.id === "prix");
  const prixWeight = prixCriterion?.weight ?? 40;
  const techPondWeight = 100 - prixWeight - (envCrit?.weight ?? 0) - (planCrit?.weight ?? 0);

  ws.getCell(row, COL_LABEL).value = `Note technique pondérée sur ${techPondWeight} %`;
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 10, color: { argb: COLORS.darkText } };
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightOrange);
  ws.getCell(row, COL_LABEL).border = thinBorder();
  ws.getRow(row).height = 20;

  activeCompanies.forEach((company, idx) => {
    const colA = companyColStart(idx);
    const colB = colA + 1;
    const pondScore = totalScores[company.id] ?? 0;
    ws.mergeCells(row, colA, row, colB);
    const cell = ws.getCell(row, colA);
    cell.value = Number(pondScore.toFixed(2));
    cell.numFmt = `0.00 "sur" ${maxTechWeight}`;
    cell.font = { bold: true, size: 10 };
    cell.fill = lightFill(COLORS.lightOrange);
    cell.alignment = { horizontal: "center" };
    cell.border = thickBorder();
  });
  row += 2;

  const rowNoteTechPonderee = row - 2;
  let rowEnvScore = 0;
  let rowPlanScore = 0;

  // ── Environnemental ──
  if (envCrit) {
    // Ligne d'en-tête (comme les sous-critères) : Appréciation | Note sur X
    ws.getCell(row, COL_LABEL).value = "";
    ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 18;
    activeCompanies.forEach((company, idx) => {
      const colA = companyColStart(idx);
      const colB = colA + 1;
      const pastel = companyPastelArgb(idx);
      ws.getCell(row, colA).value = "Appréciation";
      ws.getCell(row, colA).font = { bold: true, size: 9 };
      ws.getCell(row, colA).fill = solidFill(pastel);
      ws.getCell(row, colA).alignment = { horizontal: "center" };
      ws.getCell(row, colA).border = thinBorder();
      ws.getCell(row, colB).value = `Note sur ${envCrit.weight}`;
      ws.getCell(row, colB).font = { bold: true, size: 9 };
      ws.getCell(row, colB).fill = solidFill(pastel);
      ws.getCell(row, colB).alignment = { horizontal: "center" };
      ws.getCell(row, colB).border = thinBorder();
    });
    row++;

    rowEnvScore = row; // ligne des scores env (juste avant d'écrire la ligne)
    ws.getCell(row, COL_LABEL).value = `Environnemental (${envCrit.weight}%)`;
    ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
    ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 18;

    activeCompanies.forEach((company, idx) => {
      const colA = companyColStart(idx);
      const colB = colA + 1;
      const pastel = companyPastelArgb(idx);
      const note = version.technicalNotes.find(
        (n) => n.companyId === company.id && n.criterionId === "environnemental" && !n.subCriterionId
      );
      const val = note?.notation ? NOTATION_VALUES[note.notation] : 0;
      const score = val * envCrit.weight;
      ws.getCell(row, colA).value = note?.notation ? NOTATION_LABELS[note.notation] : "—";
      ws.getCell(row, colA).font = { bold: true, size: 9 };
      ws.getCell(row, colA).fill = solidFill(pastel);
      ws.getCell(row, colA).alignment = { horizontal: "center" };
      ws.getCell(row, colA).border = thinBorder();
      ws.getCell(row, colB).value = Number(score.toFixed(2));
      ws.getCell(row, colB).numFmt = "0.00";
      ws.getCell(row, colB).fill = solidFill(pastel);
      ws.getCell(row, colB).alignment = { horizontal: "center" };
      ws.getCell(row, colB).border = thinBorder();
    });
    row++;

    // Total sur environnement X % (même format que note technique : "X sur 10")
    ws.getCell(row, COL_LABEL).value = `Total sur environnement ${envCrit.weight} %`;
    ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
    ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightGreen);
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 18;
    activeCompanies.forEach((company, idx) => {
      const colA = companyColStart(idx);
      const colB = colA + 1;
      const note = version.technicalNotes.find(
        (n) => n.companyId === company.id && n.criterionId === "environnemental" && !n.subCriterionId
      );
      const val = note?.notation ? NOTATION_VALUES[note.notation] : 0;
      const score = val * envCrit.weight;
      ws.mergeCells(row, colA, row, colB);
      const cell = ws.getCell(row, colA);
      cell.value = Number(score.toFixed(2));
      cell.numFmt = `0.00 "sur" ${envCrit.weight}`;
      cell.font = { bold: true, size: 9 };
      cell.fill = lightFill(COLORS.lightGreen);
      cell.alignment = { horizontal: "center" };
      cell.border = thinBorder();
    });
    row++;

    // Comments
    const envCommentTexts = activeCompanies.map((company) => {
      const note = version.technicalNotes.find(
        (n) => n.companyId === company.id && n.criterionId === "environnemental" && !n.subCriterionId
      );
      return note?.commentPositif || note?.comment || "";
    });
    const maxEnvCommentLen = Math.max(0, ...envCommentTexts.map((t) => String(t).length));
    ws.getCell(row, COL_LABEL).value = "Commentaire Environnemental";
    ws.getCell(row, COL_LABEL).font = { italic: true, size: 9 };
    ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
    ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = rowHeightFromCellValues(envCommentTexts, 40, 250);

    activeCompanies.forEach((company, idx) => {
      const colA = companyColStart(idx);
      const colB = colA + 1;
      const note = version.technicalNotes.find(
        (n) => n.companyId === company.id && n.criterionId === "environnemental" && !n.subCriterionId
      );
      ws.mergeCells(row, colA, row, colB);
      const cell = ws.getCell(row, colA);
      const curPos = note?.commentPositif || note?.comment || "";
      if (prevVersion) {
        const prevNote = prevVersion.technicalNotes.find(
          (n) => n.companyId === company.id && n.criterionId === "environnemental" && !n.subCriterionId
        );
        cell.value = buildDiffRichText(curPos, prevNote?.commentPositif || prevNote?.comment || "");
      } else {
        cell.value = curPos;
      }
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.border = thinBorder();
    });
    row += 2;
  }

  // ── Planning ──
  if (planCrit) {
    // Ligne d'en-tête (comme les sous-critères) : Appréciation | Note sur X
    ws.getCell(row, COL_LABEL).value = "";
    ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 18;
    activeCompanies.forEach((company, idx) => {
      const colA = companyColStart(idx);
      const colB = colA + 1;
      const pastel = companyPastelArgb(idx);
      ws.getCell(row, colA).value = "Appréciation";
      ws.getCell(row, colA).font = { bold: true, size: 9 };
      ws.getCell(row, colA).fill = solidFill(pastel);
      ws.getCell(row, colA).alignment = { horizontal: "center" };
      ws.getCell(row, colA).border = thinBorder();
      ws.getCell(row, colB).value = `Note sur ${planCrit.weight}`;
      ws.getCell(row, colB).font = { bold: true, size: 9 };
      ws.getCell(row, colB).fill = solidFill(pastel);
      ws.getCell(row, colB).alignment = { horizontal: "center" };
      ws.getCell(row, colB).border = thinBorder();
    });
    row++;

    rowPlanScore = row;
    ws.getCell(row, COL_LABEL).value = `Planning (${planCrit.weight}%)`;
    ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
    ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 18;

    activeCompanies.forEach((company, idx) => {
      const colA = companyColStart(idx);
      const colB = colA + 1;
      const pastel = companyPastelArgb(idx);
      const note = version.technicalNotes.find(
        (n) => n.companyId === company.id && n.criterionId === "planning" && !n.subCriterionId
      );
      const val = note?.notation ? NOTATION_VALUES[note.notation] : 0;
      const score = val * planCrit.weight;
      ws.getCell(row, colA).value = note?.notation ? NOTATION_LABELS[note.notation] : "—";
      ws.getCell(row, colA).font = { bold: true, size: 9 };
      ws.getCell(row, colA).fill = solidFill(pastel);
      ws.getCell(row, colA).alignment = { horizontal: "center" };
      ws.getCell(row, colA).border = thinBorder();
      ws.getCell(row, colB).value = Number(score.toFixed(2));
      ws.getCell(row, colB).numFmt = "0.00";
      ws.getCell(row, colB).fill = solidFill(pastel);
      ws.getCell(row, colB).alignment = { horizontal: "center" };
      ws.getCell(row, colB).border = thinBorder();
    });
    row++;

    // Total sur planning X % (même format que note technique : "X sur Y")
    ws.getCell(row, COL_LABEL).value = `Total sur planning ${planCrit.weight} %`;
    ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
    ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightGreen);
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 18;
    activeCompanies.forEach((company, idx) => {
      const colA = companyColStart(idx);
      const colB = colA + 1;
      const note = version.technicalNotes.find(
        (n) => n.companyId === company.id && n.criterionId === "planning" && !n.subCriterionId
      );
      const val = note?.notation ? NOTATION_VALUES[note.notation] : 0;
      const score = val * planCrit.weight;
      ws.mergeCells(row, colA, row, colB);
      const cell = ws.getCell(row, colA);
      cell.value = Number(score.toFixed(2));
      cell.numFmt = `0.00 "sur" ${planCrit.weight}`;
      cell.font = { bold: true, size: 9 };
      cell.fill = lightFill(COLORS.lightGreen);
      cell.alignment = { horizontal: "center" };
      cell.border = thinBorder();
    });
    row++;

    const planCommentTexts = activeCompanies.map((company) => {
      const note = version.technicalNotes.find(
        (n) => n.companyId === company.id && n.criterionId === "planning" && !n.subCriterionId
      );
      return note?.commentPositif || note?.comment || "";
    });
    const maxPlanCommentLen = Math.max(0, ...planCommentTexts.map((t) => String(t).length));
    ws.getCell(row, COL_LABEL).value = "Commentaire Planning";
    ws.getCell(row, COL_LABEL).font = { italic: true, size: 9 };
    ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
    ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = rowHeightFromCellValues(planCommentTexts, 40, 250);

    activeCompanies.forEach((company, idx) => {
      const colA = companyColStart(idx);
      const colB = colA + 1;
      const note = version.technicalNotes.find(
        (n) => n.companyId === company.id && n.criterionId === "planning" && !n.subCriterionId
      );
      ws.mergeCells(row, colA, row, colB);
      const cell = ws.getCell(row, colA);
      const curPos = note?.commentPositif || note?.comment || "";
      if (prevVersion) {
        const prevNote = prevVersion.technicalNotes.find(
          (n) => n.companyId === company.id && n.criterionId === "planning" && !n.subCriterionId
        );
        cell.value = buildDiffRichText(curPos, prevNote?.commentPositif || prevNote?.comment || "");
      } else {
        cell.value = curPos;
      }
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.border = thinBorder();
    });
    row += 2;
  }

  // ── Documents à vérifier ──
  const docVerifyTexts = activeCompanies.map((company) => String(version.documentsToVerify?.[company.id] ?? ""));
  ws.getCell(row, COL_LABEL).value = "Documents à vérifier / commentaire global";
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 9, color: { argb: "FFE65100" } };
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightOrange);
  ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
  ws.getCell(row, COL_LABEL).border = thinBorder();
  ws.getRow(row).height = rowHeightFromCellValues(docVerifyTexts, 40, 250);

  activeCompanies.forEach((company, idx) => {
    const colA = companyColStart(idx);
    const colB = colA + 1;
    const curDoc = version.documentsToVerify?.[company.id] ?? "";
  ws.mergeCells(row, colA, row, colB);
  const cell = ws.getCell(row, colA);
  if (prevVersion) {
    const prevDoc = prevVersion.documentsToVerify?.[company.id] ?? "";
    cell.value = buildDiffRichText(curDoc, prevDoc);
  } else {
    cell.value = curDoc;
  }
  cell.alignment = { wrapText: true, vertical: "top" };
  cell.border = thinBorder();
  cell.fill = lightFill(COLORS.lightOrange);
  });
  row += 2;

  // ── Note globale (technique + env. [+ planning] le cas échéant) — formules Excel ──
  const maxGlobalTechEnvPlan = maxTechWeight + (envCrit?.weight ?? 0) + (planCrit?.weight ?? 0);
  const partsLabel: string[] = ["technique"];
  if (envCrit) partsLabel.push("environnemental");
  if (planCrit) partsLabel.push("planning");
  const labelNoteGlobale = `Note globale (${partsLabel.join(" + ")}) / ${maxGlobalTechEnvPlan}`;
  ws.getCell(row, COL_LABEL).value = labelNoteGlobale;
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 11, color: { argb: COLORS.darkText } };
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightGreen);
  ws.getCell(row, COL_LABEL).border = thickBorder();
  ws.getRow(row).height = 22;

  activeCompanies.forEach((company, idx) => {
    const colA = companyColStart(idx);
    const colB = colA + 1;
    const colTech = colLetter(colA);
    const colNote = colLetter(colB); // note env/plan dans la 2e colonne de chaque paire
    const parts: string[] = [`${colTech}${rowNoteTechPonderee}`];
    if (envCrit) parts.push(`${colNote}${rowEnvScore}`);
    if (planCrit) parts.push(`${colNote}${rowPlanScore}`);
    const formula = "=" + parts.join("+");
    ws.mergeCells(row, colA, row, colB);
    const cell = ws.getCell(row, colA);
    cell.value = { formula };
    cell.numFmt = "0.00";
    cell.font = { bold: true, size: 11 };
    cell.fill = lightFill(COLORS.lightGreen);
    cell.alignment = { horizontal: "center" };
    cell.border = thickBorder();
  });
  row += 2;

  // ── Volets figés (colonne A + lignes 1–2) ──
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 2, topLeftCell: "B3", activeCell: "B3" }];

  // ── Column widths ──
  ws.getColumn(COL_LABEL).width = 28;
  activeCompanies.forEach((_, idx) => {
    ws.getColumn(companyColStart(idx)).width = 35;
    ws.getColumn(companyColStart(idx) + 1).width = 12;
  });
}

// ─── Analyse Prix — Entreprises en colonnes ───────────────────────────────────
function buildPrixSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  project: ProjectData,
  version: NegotiationVersion,
  companies: typeof project.companies,
  baseLabel: string
) {
  const ws = wb.addWorksheet(sheetName);
  ws.properties.defaultRowHeight = 18;

  const activeCompanies = companies.filter((c) => c.name.trim() !== "");
  const activeLotLines = project.lotLines.filter((l) => l.label.trim() !== "");
  const baseLines = activeLotLines.filter((l) => !l.type);
  const pseLines = activeLotLines.filter((l) => l.type === "PSE");
  const varianteLines = activeLotLines.filter((l) => l.type === "VARIANTE");
  const toLines = activeLotLines.filter((l) => l.type === "T_OPTIONNELLE");
  const typedLines = activeLotLines.filter((l) => l.type);
  const tfShort = baseLabel === "Tranche Ferme" ? "TF" : "Base";

  const prixCriterion = project.weightingCriteria.find((c) => c.id === "prix");
  const prixWeight = prixCriterion?.weight ?? 40;
  const hasDpgf2 = project.info.hasDualDpgf ?? false;
  const toleranceSeuil = (project.info as { toleranceSeuil?: number }).toleranceSeuil ?? 20;

  const COL_LABEL = 1;
  const companyCol = (idx: number) => 2 + idx;

  const getLineLabel = (line: typeof activeLotLines[0]) => {
    if (!line.type) return line.label;
    const group = activeLotLines.filter((l) => l.type === line.type);
    const idx = group.indexOf(line) + 1;
    const toLabel = line.type === "T_OPTIONNELLE"
      ? (idx === 1 ? "Tranche Optionnelle" : `Tranche Optionnelle ${idx - 1}`)
      : null;
    const prefix = toLabel !== null ? toLabel : (line.type === "PSE" ? `PSE ${idx}` : `Variante ${idx}`);
    return `${prefix}${line.label ? ` — ${line.label}` : ""}`;
  };

  const lastCol = companyCol(activeCompanies.length - 1);

  // ── Row 1: Title ──
  let row = 1;
  ws.mergeCells(row, COL_LABEL, row, lastCol);
  const titleCell = ws.getCell(row, COL_LABEL);
  titleCell.value = `${project.info.name || "Projet"} — Lot ${project.info.lotNumber || ""} — ${sheetName}`;
  titleCell.font = { bold: true, size: 13, color: { argb: COLORS.darkText } };
  titleCell.fill = lightFill(COLORS.lightBlue);
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = 22;
  row++;

  // ── Row 2: Company headers ──
  ws.getCell(row, COL_LABEL).value = `${project.info.name || ""}`;
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 10, color: { argb: COLORS.headerFont } };
  ws.getCell(row, COL_LABEL).fill = headerFill();
  ws.getCell(row, COL_LABEL).border = thinBorder();
  ws.getRow(row).height = 30;

  activeCompanies.forEach((company, idx) => {
    const col = companyCol(idx);
    const cell = ws.getCell(row, col);
    const isExcluded = company.status === "ecartee";
    cell.value = `Offre ${idx + 1}\n${company.name}${isExcluded ? "\n(ÉCARTÉE)" : ""}`;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = solidFill(COMPANY_ARGB[idx % COMPANY_ARGB.length]);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = thickBorder();
  });
  row++;

  // ── Helper: get total for a company (optionnellement inclut lotLineId 0 = DPGF Tranche Ferme) ──
  const getTotal = (companyId: number, lines: typeof activeLotLines, includeBase = false) => {
    let total = 0;
    if (includeBase) {
      const baseEntry = version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === 0);
      total += (baseEntry?.dpgf1 ?? 0) + (baseEntry?.dpgf2 ?? 0);
    }
    return total + lines.reduce((sum, line) => {
      const entry = version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === line.id);
      return sum + (entry?.dpgf1 ?? 0) + (entry?.dpgf2 ?? 0);
    }, 0);
  };

  // ── Helper: render a row for a lot line ──
  const renderLineRow = (line: typeof activeLotLines[0], label: string, isSectionHeader = false) => {
    const est1 = line.estimationDpgf1 ?? 0;
    const est2 = line.estimationDpgf2 ?? 0;
    const estTotal = est1 + est2;

    if (hasDpgf2) {
      // === DPGF 1 row ===
      ws.getCell(row, COL_LABEL).value = `${label} — DPGF 1${est1 > 0 ? ` (Est. ${est1.toLocaleString("fr-FR")} €)` : ""}`;
      ws.getCell(row, COL_LABEL).font = { size: 9, italic: true };
      ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.white);
      ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "middle" };
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = 16;

      activeCompanies.forEach((company, idx) => {
        const col = companyCol(idx);
        const entry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === line.id);
        const d1 = entry?.dpgf1 ?? 0;
        const cell = ws.getCell(row, col);
        cell.value = d1 || null;
        cell.numFmt = '#,##0.00 "€"';
        cell.alignment = { horizontal: "right" };
        cell.border = thinBorder();
        cell.fill = lightFill(COLORS.white);
      });
      row++;

      // === DPGF 2 row ===
      ws.getCell(row, COL_LABEL).value = `${label} — DPGF 2${est2 > 0 ? ` (Est. ${est2.toLocaleString("fr-FR")} €)` : ""}`;
      ws.getCell(row, COL_LABEL).font = { size: 9, italic: true };
      ws.getCell(row, COL_LABEL).fill = lightFill("FAFAFA");
      ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "middle" };
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = 16;

      activeCompanies.forEach((company, idx) => {
        const col = companyCol(idx);
        const entry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === line.id);
        const d2 = entry?.dpgf2 ?? 0;
        const cell = ws.getCell(row, col);
        cell.value = d2 || null;
        cell.numFmt = '#,##0.00 "€"';
        cell.alignment = { horizontal: "right" };
        cell.border = thinBorder();
        cell.fill = lightFill("FAFAFA");
      });
      row++;

    } else {
      // === Single DPGF row ===
      ws.getCell(row, COL_LABEL).value = label + (est1 > 0 ? ` (Est. ${est1.toLocaleString("fr-FR")} €)` : "");
      ws.getCell(row, COL_LABEL).font = { size: 9, italic: isSectionHeader };
      ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.white);
      ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = 18;

      activeCompanies.forEach((company, idx) => {
        const col = companyCol(idx);
        const entry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === line.id);
        const d1 = entry?.dpgf1 ?? 0;
        const cell = ws.getCell(row, col);
        cell.value = d1 || null;
        cell.numFmt = '#,##0.00 "€"';
        cell.alignment = { horizontal: "right" };
        cell.border = thinBorder();
        cell.fill = lightFill(COLORS.white);
      });
      row++;
    }
  };

  // ── Section: Base / Tranche Ferme — 1 ligne DPGF 1, 1 ligne DPGF 2 (si coché), 1 ligne Total ──
  ws.mergeCells(row, COL_LABEL, row, lastCol);
  const tfHeader = ws.getCell(row, COL_LABEL);
  {
    const tfExclusions = (
      [
        pseLines.length > 0 ? "PSE" : null,
        varianteLines.length > 0 ? "Variante" : null,
        toLines.length > 0 ? "Tranche Optionnelle" : null,
      ] as (string | null)[]
    ).filter((x): x is string => x !== null);
    tfHeader.value = tfExclusions.length > 0
      ? `${baseLabel.toUpperCase()} (hors ${tfExclusions.join(", ")})`
      : baseLabel.toUpperCase();
  }
  tfHeader.font = { bold: true, size: 10, color: { argb: COLORS.headerFont } };
  tfHeader.fill = headerFill();
  tfHeader.border = thinBorder();
  ws.getRow(row).height = 18;
  row++;

  const estLotDpgf1 = project.info.estimationDpgf1 ?? 0;
  const estLotDpgf2 = project.info.estimationDpgf2 ?? 0;
  const estBaseTotalLabel = hasDpgf2 ? estLotDpgf1 + estLotDpgf2 : estLotDpgf1;

  const getTotalDpgf1 = (companyId: number) => {
    const baseEntry = version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === 0);
    let sum = baseEntry?.dpgf1 ?? 0;
    for (const line of baseLines) {
      const e = version.priceEntries.find((x) => x.companyId === companyId && x.lotLineId === line.id);
      sum += e?.dpgf1 ?? 0;
    }
    return sum;
  };
  const getTotalDpgf2 = (companyId: number) => {
    const baseEntry = version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === 0);
    let sum = baseEntry?.dpgf2 ?? 0;
    for (const line of baseLines) {
      const e = version.priceEntries.find((x) => x.companyId === companyId && x.lotLineId === line.id);
      sum += e?.dpgf2 ?? 0;
    }
    return sum;
  };

  const dpgf1Row = row;
  ws.getCell(row, COL_LABEL).value = `DPGF 1${estLotDpgf1 > 0 ? ` (Est. ${estLotDpgf1.toLocaleString("fr-FR")} €)` : ""}`;
  ws.getCell(row, COL_LABEL).font = { size: 10 };
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.white);
  ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "middle" };
  ws.getCell(row, COL_LABEL).border = thinBorder();
  ws.getRow(row).height = 18;
  activeCompanies.forEach((company, idx) => {
    const cell = ws.getCell(row, companyCol(idx));
    const val = getTotalDpgf1(company.id);
    cell.value = val || null;
    cell.numFmt = '#,##0.00 "€"';
    cell.alignment = { horizontal: "right" };
    cell.border = thinBorder();
    cell.fill = lightFill(COLORS.white);
  });
  row++;

  let dpgf2Row = 0;
  if (hasDpgf2) {
    dpgf2Row = row;
    ws.getCell(row, COL_LABEL).value = `DPGF 2${estLotDpgf2 > 0 ? ` (Est. ${estLotDpgf2.toLocaleString("fr-FR")} €)` : ""}`;
    ws.getCell(row, COL_LABEL).font = { size: 10 };
    ws.getCell(row, COL_LABEL).fill = lightFill("FAFAFA");
    ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "middle" };
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 18;
    activeCompanies.forEach((company, idx) => {
      const cell = ws.getCell(row, companyCol(idx));
      const val = getTotalDpgf2(company.id);
      cell.value = val || null;
      cell.numFmt = '#,##0.00 "€"';
      cell.alignment = { horizontal: "right" };
      cell.border = thinBorder();
      cell.fill = lightFill("FAFAFA");
    });
    row++;
  }

  const totalTfRow = row;
  ws.getCell(row, COL_LABEL).value = `Total ${tfShort} (DPGF 1 et DPGF 2) — Estimé à ${estBaseTotalLabel.toLocaleString("fr-FR")} € HT`;
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 10 };
  ws.getCell(row, COL_LABEL).fill = lightFill("C8E6C9");
  ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "middle" };
  ws.getCell(row, COL_LABEL).border = thickBorder();
  ws.getRow(row).height = 22;
  activeCompanies.forEach((company, idx) => {
    const colIdx = companyCol(idx);
    const cell = ws.getCell(row, colIdx);
    if (hasDpgf2) {
      cell.value = { formula: `${colLetter(colIdx)}${dpgf1Row}+${colLetter(colIdx)}${dpgf2Row}` };
    } else {
      cell.value = { formula: `${colLetter(colIdx)}${dpgf1Row}` };
    }
    cell.numFmt = '#,##0.00 "€"';
    cell.font = { bold: true, size: 10 };
    cell.fill = lightFill("C8E6C9");
    cell.alignment = { horizontal: "right" };
    cell.border = thickBorder();
  });
  row++;

  ws.getRow(row).height = 6;
  row++;

  // ── Helper: render PSE/Variante/TO — une seule ligne si un seul DPGF (lot ou ligne), pas de lignes vides ──
  const renderTypedLine = (line: typeof activeLotLines[0], labelPrefix: string) => {
    const est1 = line.estimationDpgf1 ?? 0;
    const est2 = line.estimationDpgf2 ?? 0;
    const assign = line.dpgfAssignment || "both";
    const showDpgf1 = hasDpgf2 ? (assign === "DPGF_1" || assign === "both") : true;
    const showDpgf2 = hasDpgf2 && (assign === "DPGF_2" || assign === "both");

    if (showDpgf1) {
      ws.getCell(row, COL_LABEL).value = hasDpgf2 ? `${labelPrefix} — DPGF 1${est1 > 0 ? ` (Est. ${est1.toLocaleString("fr-FR")} €)` : ""}` : `${labelPrefix}${est1 > 0 ? ` (Est. ${est1.toLocaleString("fr-FR")} €)` : ""}`;
      ws.getCell(row, COL_LABEL).font = { size: 9, italic: !!hasDpgf2 };
      ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.white);
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = hasDpgf2 ? 16 : 18;
      activeCompanies.forEach((company, idx) => {
        const col = companyCol(idx);
        const entry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === line.id);
        const cell = ws.getCell(row, col);
        cell.value = entry?.dpgf1 ?? null;
        cell.numFmt = '#,##0.00 "€"';
        cell.alignment = { horizontal: "right" };
        cell.border = thinBorder();
        cell.fill = lightFill(COLORS.white);
      });
      row++;
    }

    if (showDpgf2) {
      ws.getCell(row, COL_LABEL).value = `${labelPrefix} — DPGF 2${est2 > 0 ? ` (Est. ${est2.toLocaleString("fr-FR")} €)` : ""}`;
      ws.getCell(row, COL_LABEL).font = { size: 9, italic: true };
      ws.getCell(row, COL_LABEL).fill = lightFill("FAFAFA");
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = 16;
      activeCompanies.forEach((company, idx) => {
        const col = companyCol(idx);
        const entry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === line.id);
        const cell = ws.getCell(row, col);
        cell.value = entry?.dpgf2 ?? null;
        cell.numFmt = '#,##0.00 "€"';
        cell.alignment = { horizontal: "right" };
        cell.border = thinBorder();
        cell.fill = lightFill("FAFAFA");
      });
      row++;
    }
  };

  // ── Tranches Optionnelles (juste sous la Tranche ferme) ──
  if (toLines.length > 0) {
    ws.mergeCells(row, COL_LABEL, row, lastCol);
    const toHeader = ws.getCell(row, COL_LABEL);
    toHeader.value = "TRANCHES OPTIONNELLES";
    toHeader.font = { bold: true, size: 9, color: { argb: COLORS.headerFont } };
    toHeader.fill = lightFill(COLORS.lightBlue);
    toHeader.border = thinBorder();
    ws.getRow(row).height = 16;
    row++;

    for (let i = 0; i < toLines.length; i++) {
      renderTypedLine(toLines[i], `Tranche Optionnelle N°${i + 1}${toLines[i].label ? ` — ${toLines[i].label}` : ""}`);
    }
    ws.getRow(row).height = 6;
    row++;
  }

  // ── PSE (s'il y en a) ──
  if (pseLines.length > 0) {
    ws.mergeCells(row, COL_LABEL, row, lastCol);
    const pseHeader = ws.getCell(row, COL_LABEL);
    pseHeader.value = "PRESTATIONS SUPPLÉMENTAIRES ÉVENTUELLES (PSE)";
    pseHeader.font = { bold: true, size: 9, color: { argb: COLORS.headerFont } };
    pseHeader.fill = lightFill(COLORS.lightYellow);
    pseHeader.border = thinBorder();
    ws.getRow(row).height = 16;
    row++;

    for (let i = 0; i < pseLines.length; i++) {
      renderTypedLine(pseLines[i], `PSE N°${i + 1}${pseLines[i].label ? ` — ${pseLines[i].label}` : ""}`);
    }
    ws.getRow(row).height = 6;
    row++;
  }

  // ── Total Global Évalué (Base + TOUTES PSE + TOUTES TO) — référence analyse financière ──
  const baseOnlyLines = [...baseLines, ...toLines, ...pseLines];
  const _estBase = (project.info.estimationDpgf1 ?? 0) + (project.info.estimationDpgf2 ?? 0);
  const _estLine = (l: typeof activeLotLines[0]) => hasDpgf2 ? (l.estimationDpgf1 ?? 0) + (l.estimationDpgf2 ?? 0) : (l.estimationDpgf1 ?? 0);
  const _estPse = pseLines.reduce((s, l) => s + _estLine(l), 0);
  const _estTo = toLines.reduce((s, l) => s + _estLine(l), 0);
  const estGlobal = _estBase + _estTo + _estPse;

  {
    const totalGlobalParts = (
      [toLines.length > 0 ? "TO" : null, pseLines.length > 0 ? "PSE" : null] as (string | null)[]
    ).filter((x): x is string => x !== null);
    ws.getCell(row, COL_LABEL).value = totalGlobalParts.length > 0
      ? `Total Global Évalué (${baseLabel} + ${totalGlobalParts.join(" + ")}) — Estimé à ${estGlobal.toLocaleString("fr-FR")} € HT`
      : `Total Global Évalué — Estimé à ${estGlobal.toLocaleString("fr-FR")} € HT`;
  }
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 10 };
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightGreen);
  ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "middle" };
  ws.getCell(row, COL_LABEL).border = thickBorder();
  ws.getRow(row).height = 22;
  activeCompanies.forEach((company, idx) => {
    const col = companyCol(idx);
    const total = getTotal(company.id, baseOnlyLines, true);
    const cell = ws.getCell(row, col);
    cell.value = total || null;
    if (total) cell.numFmt = '#,##0.00 "€"';
    cell.font = { bold: true, size: 10 };
    cell.fill = lightFill(COLORS.lightGreen);
    cell.alignment = { horizontal: "right" };
    cell.border = thickBorder();
  });
  row++;

  // ── Écart / Estimation Globale (en % et en €) ──
  ws.getCell(row, COL_LABEL).value = `Écart / Estimation Globale (${estGlobal.toLocaleString("fr-FR")} €) — Seuil ±${toleranceSeuil}%`;
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightRed);
  ws.getCell(row, COL_LABEL).border = thinBorder();
  ws.getRow(row).height = 18;
  activeCompanies.forEach((company, idx) => {
    const col = companyCol(idx);
    const total = getTotal(company.id, baseOnlyLines, true);
    const cell = ws.getCell(row, col);
    if (estGlobal > 0 && total > 0) {
      const pct = ((total - estGlobal) / estGlobal) * 100;
      const diff = total - estGlobal;
      cell.value = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)} % (${diff >= 0 ? "+" : ""}${diff.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €)`;
      const absDev = Math.abs(pct);
      const halfSeuil = toleranceSeuil / 2;
      cell.font = { bold: true, size: 9, color: { argb: absDev <= halfSeuil ? "FF2E7D32" : absDev <= toleranceSeuil ? "FFE65100" : "FFC62828" } };
      cell.fill = lightFill(absDev <= halfSeuil ? "E8F5E9" : absDev <= toleranceSeuil ? "FFF3E0" : "FFEBEE");
    } else {
      cell.value = "—";
      cell.fill = lightFill(COLORS.lightRed);
    }
    cell.alignment = { horizontal: "center", wrapText: true };
    cell.border = thinBorder();
  });
  row++;

  // ── Note de Prix Globale (/ poids) — calculée sur Total Global Évalué ──
  const globalTotals = activeCompanies.map((company) => getTotal(company.id, baseOnlyLines, true));
  const validGlobalTotals = globalTotals.filter((t) => t > 0);
  const minGlobalTotal = validGlobalTotals.length > 0 ? Math.min(...validGlobalTotals) : 0;

  ws.getCell(row, COL_LABEL).value = `Note de Prix Globale (/${prixWeight})`;
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 10, color: { argb: COLORS.darkText } };
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightYellow);
  ws.getCell(row, COL_LABEL).alignment = { wrapText: true };
  ws.getCell(row, COL_LABEL).border = thickBorder();
  ws.getRow(row).height = 22;
  activeCompanies.forEach((company, idx) => {
    const col = companyCol(idx);
    const total = globalTotals[idx];
    const notePrice = total > 0 && minGlobalTotal > 0 ? Number(((minGlobalTotal / total) * prixWeight).toFixed(2)) : 0;
    const cell = ws.getCell(row, col);
    cell.value = company.status === "ecartee" ? "—" : (notePrice || "—");
    if (typeof notePrice === "number" && notePrice > 0) cell.numFmt = "0.00";
    cell.font = { bold: true, size: 10 };
    cell.fill = lightFill(COLORS.lightYellow);
    cell.alignment = { horizontal: "center" };
    cell.border = thickBorder();
  });
  row++;

  ws.getRow(row).height = 6;
  row++;

  // ── Variantes (s'il y en a) ──
  if (varianteLines.length > 0) {
    ws.mergeCells(row, COL_LABEL, row, lastCol);
    const varHeader = ws.getCell(row, COL_LABEL);
    varHeader.value = "VARIANTES";
    varHeader.font = { bold: true, size: 9, color: { argb: COLORS.headerFont } };
    varHeader.fill = lightFill(COLORS.lightOrange);
    varHeader.border = thinBorder();
    ws.getRow(row).height = 16;
    row++;

    for (let i = 0; i < varianteLines.length; i++) {
      renderTypedLine(varianteLines[i], `Variante N°${i + 1}${varianteLines[i].label ? ` — ${varianteLines[i].label}` : ""}`);
    }
    ws.getRow(row).height = 6;
    row++;
  }

  // ── Volets figés (colonne A + lignes 1–2) ──
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 2, topLeftCell: "B3", activeCell: "B3" }];

  // ── Column widths ──
  ws.getColumn(COL_LABEL).width = 42;
  activeCompanies.forEach((_, idx) => {
    ws.getColumn(companyCol(idx)).width = 16;
  });
}

/**
 * Onglet Synthèse : reflet exact de SynthesePage (results).
 * - Montant Total HT = Total Global Évalué (Base + PSE + TO, sans variantes), via getCompanyTotalGlobalEvalue.
 * - Note Prix = (Montant Global min / Montant Global candidat) × Poids Prix.
 * - Notes Technique / Enviro. / Planning = notes pondérées finales (même formules que l’UI).
 * - Note Globale = somme Technique + Enviro. + Planning + Prix. Toutes les notes à 2 décimales.
 */
function buildSyntheseSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  project: ProjectData,
  version: NegotiationVersion,
  companies: typeof project.companies,
  baseLabel: string
) {
  const synthSheet = wb.addWorksheet(sheetName);
  synthSheet.properties.defaultRowHeight = 18;

  const technicalCriteria = project.weightingCriteria.filter((c) => c.id !== "prix" && c.weight > 0);
  const prixCriterion = project.weightingCriteria.find((c) => c.id === "prix");
  const prixWeight = prixCriterion?.weight ?? 40;
  const activeLotLines = project.lotLines.filter((l) => l.label.trim() !== "");
  const valueTechnique = technicalCriteria.filter((c) => c.id !== "environnemental" && c.id !== "planning");
  const envCrit = technicalCriteria.find((c) => c.id === "environnemental");
  const planCrit = technicalCriteria.find((c) => c.id === "planning");
  const totalPoidsTechnique = valueTechnique.reduce((s, c) => s + c.weight, 0);
  const envW = envCrit?.weight ?? 0;
  const planW = planCrit?.weight ?? 0;
  const maxGlobal = totalPoidsTechnique + envW + planW + prixWeight;

  let sRow = 1;
  const lastSynthColLetter = colLetter(1 + companies.length);
  synthSheet.mergeCells(`B${sRow}:${lastSynthColLetter}${sRow}`);
  const synthTitle = synthSheet.getCell(`B${sRow}`);
  synthTitle.value = `${project.info.name || "Projet"} — Lot n° ${project.info.lotNumber || ""} — ${sheetName}`;
  synthTitle.font = { bold: true, size: 12, color: { argb: COLORS.darkText } };
  synthTitle.fill = lightFill(COLORS.lightBlue);
  synthTitle.border = thinBorder();
  sRow++;

  interface SynthResult {
    company: typeof companies[0];
    priceTotal: number;
    priceScore: number;
    techScore: number;
    envScore: number;
    planScore: number;
    globalScore: number;
  }

  const synthResults: SynthResult[] = [];

  for (const company of companies) {
    if (company.status === "ecartee") {
      synthResults.push({ company, priceTotal: 0, priceScore: 0, techScore: 0, envScore: 0, planScore: 0, globalScore: 0 });
      continue;
    }

    let techScore = 0, envScore = 0, planScore = 0;

    for (const criterion of technicalCriteria) {
      let criterionScore = 0;
      if (criterion.subCriteria.length > 0) {
        let raw = 0;
        const subTotal = criterion.subCriteria.reduce((s, sc) => s + sc.weight, 0);
        for (const sub of criterion.subCriteria) {
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
          );
          if (note?.notation) {
            const subWeight = subTotal > 0 ? sub.weight / subTotal : 0;
            raw += NOTATION_VALUES[note.notation] * subWeight;
          }
        }
        criterionScore = raw * criterion.weight;
      } else {
        const note = version.technicalNotes.find(
          (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
        );
        if (note?.notation) {
          criterionScore = NOTATION_VALUES[note.notation] * criterion.weight;
        }
      }

      if (criterion.id === "environnemental") envScore = criterionScore;
      else if (criterion.id === "planning") planScore = criterionScore;
      else techScore += criterionScore;
    }

    // Montant Total Global Évalué : Base (DPGF) + toutes les PSE + toutes les TO (sans variantes)
    const priceTotal = getCompanyTotalGlobalEvalue(version, activeLotLines, company.id);

    synthResults.push({ company, priceTotal, priceScore: 0, techScore, envScore, planScore, globalScore: 0 });
  }

  // Note Prix : (Montant Total Global le plus bas / Montant Total Global de l'entreprise) × Poids du Prix
  const validSynthPrices = synthResults.filter((r) => r.company.status !== "ecartee" && r.priceTotal > 0);
  const minSynthPrice = validSynthPrices.length > 0 ? Math.min(...validSynthPrices.map((r) => r.priceTotal)) : 0;
  for (const r of synthResults) {
    if (r.company.status === "ecartee") continue;
    r.priceScore = r.priceTotal > 0 ? (minSynthPrice / r.priceTotal) * prixWeight : 0;
    r.globalScore = r.techScore + r.envScore + r.planScore + r.priceScore;
  }

  // Ordre d'affichage = ordre de l'application (companies), pas tri par note
  const orderedSynth = companies.map((c) => synthResults.find((r) => r.company.id === c.id)!).filter(Boolean);
  // Classement par note globale (pour la ligne "Classement")
  const byScoreDesc = [...synthResults].filter((r) => r.company.status !== "ecartee").sort((a, b) => b.globalScore - a.globalScore);
  const rankByCompanyId: Record<number, number> = {};
  byScoreDesc.forEach((r, idx) => {
    rankByCompanyId[r.company.id] = idx + 1;
  });

  const COL_LABEL = 1;
  const synthCompanyCol = (idx: number) => 2 + idx;
  const lastSynthDataCol = synthCompanyCol(orderedSynth.length - 1);
  const pseLines = activeLotLines.filter((l) => l.type === "PSE");

  // Tableau transposé : critères en lignes (A), entreprises en colonnes (B, C, D…) — ordre = ordre application
  const headerRow = sRow;
  synthSheet.getCell(headerRow, COL_LABEL).value = "Critère";
  synthSheet.getCell(headerRow, COL_LABEL).font = headerFont();
  synthSheet.getCell(headerRow, COL_LABEL).fill = headerFill();
  synthSheet.getCell(headerRow, COL_LABEL).border = thinBorder();
  synthSheet.getCell(headerRow, COL_LABEL).alignment = { horizontal: "center", wrapText: true };
  orderedSynth.forEach((r, idx) => {
    const col = synthCompanyCol(idx);
    const c = synthSheet.getCell(headerRow, col);
    const isExcluded = r.company.status === "ecartee";
    c.value = `Offre ${idx + 1}\n${r.company.name}${isExcluded ? " (Écartée)" : ""}`;
    c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    c.fill = solidFill(COMPANY_ARGB[idx % COMPANY_ARGB.length]);
    c.border = thickBorder();
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  sRow++;

  // ── Récapitulatif consolidé : 1 ligne Montant Total HT (Base + PSE), puis notes, puis Décision / Motif (aucun détail PSE individuel) ──
  const pseIdsAll = pseLines.map((l) => l.id);
  const amountsByCompany = orderedSynth.map((r) =>
    r.company.status === "ecartee" ? 0 : getCompanyTotalForPseSubset(version, r.company.id, pseIdsAll)
  );
  const minSynthPriceForNote = amountsByCompany.some((a) => a > 0) ? Math.min(...amountsByCompany.filter((a) => a > 0)) : 0;

  // Ligne 1 : Montant Total HT (Base + PSE)
  synthSheet.getCell(sRow, COL_LABEL).value = "Montant Total HT (Base + PSE)";
  synthSheet.getCell(sRow, COL_LABEL).font = { bold: true, size: 10 };
  synthSheet.getCell(sRow, COL_LABEL).fill = lightFill(COLORS.lightBlue);
  synthSheet.getCell(sRow, COL_LABEL).border = thinBorder();
  synthSheet.getCell(sRow, COL_LABEL).alignment = { horizontal: "left" };
  orderedSynth.forEach((r, idx) => {
    const col = synthCompanyCol(idx);
    const cell = synthSheet.getCell(sRow, col);
    const val = amountsByCompany[idx];
    cell.value = r.company.status === "ecartee" ? "—" : val;
    if (typeof val === "number") cell.numFmt = '#,##0.00 "€"';
    cell.border = thinBorder();
    cell.alignment = { horizontal: "center" };
    if (r.company.status === "ecartee") {
      cell.font = { bold: true, italic: true, color: { argb: COLORS.excluded } };
      cell.fill = lightFill(COLORS.lightRed);
    } else {
      cell.font = { bold: true };
      const compIdx = orderedSynth.filter((x) => x.company.status !== "ecartee").indexOf(r);
      cell.fill = lightFill(companyPastelArgb(compIdx >= 0 ? compIdx : 0));
    }
  });
  sRow++;

  // Recalcul note prix pour cette solution unique (base + toutes PSE) pour affichage cohérent
  for (let i = 0; i < orderedSynth.length; i++) {
    const r = orderedSynth[i];
    if (r.company.status !== "ecartee" && amountsByCompany[i] > 0 && minSynthPriceForNote > 0) {
      r.priceScore = (minSynthPriceForNote / amountsByCompany[i]) * prixWeight;
      r.globalScore = r.techScore + r.envScore + r.planScore + r.priceScore;
    }
  }

  // Note finale sur 100
  synthSheet.getCell(sRow, COL_LABEL).value = "Note finale sur 100";
  synthSheet.getCell(sRow, COL_LABEL).font = { size: 10 };
  synthSheet.getCell(sRow, COL_LABEL).fill = lightFill(COLORS.lightBlue);
  synthSheet.getCell(sRow, COL_LABEL).border = thinBorder();
  orderedSynth.forEach((r, idx) => {
    const col = synthCompanyCol(idx);
    const cell = synthSheet.getCell(sRow, col);
    cell.value = r.company.status === "ecartee" ? "—" : Number(r.globalScore.toFixed(2));
    cell.border = thinBorder();
    cell.alignment = { horizontal: "center" };
    if (r.company.status === "ecartee") cell.fill = lightFill(COLORS.lightRed);
    else {
      const compIdx = orderedSynth.filter((x) => x.company.status !== "ecartee").indexOf(r);
      cell.fill = lightFill(companyPastelArgb(compIdx >= 0 ? compIdx : 0));
    }
  });
  sRow++;

  // Note Prix
  synthSheet.getCell(sRow, COL_LABEL).value = `Note Prix (/${prixWeight})`;
  synthSheet.getCell(sRow, COL_LABEL).font = { size: 10 };
  synthSheet.getCell(sRow, COL_LABEL).fill = lightFill(COLORS.lightBlue);
  synthSheet.getCell(sRow, COL_LABEL).border = thinBorder();
  orderedSynth.forEach((r, idx) => {
    const col = synthCompanyCol(idx);
    const cell = synthSheet.getCell(sRow, col);
    cell.value = r.company.status === "ecartee" ? "—" : Number(r.priceScore.toFixed(2));
    cell.border = thinBorder();
    cell.alignment = { horizontal: "center" };
    if (r.company.status === "ecartee") cell.fill = lightFill(COLORS.lightRed);
    else {
      const compIdx = orderedSynth.filter((x) => x.company.status !== "ecartee").indexOf(r);
      cell.fill = lightFill(companyPastelArgb(compIdx >= 0 ? compIdx : 0));
    }
  });
  sRow++;

  // Lignes des autres notes (Technique, Enviro., Planning uniquement — Note finale déjà affichée ci-dessus)
  const criteriaRows: { label: string; getVal: (r: SynthResult) => string | number; numFmt?: string }[] = [
    ...(totalPoidsTechnique > 0
      ? [{ label: `Note Technique (/${totalPoidsTechnique})`, getVal: (r: SynthResult) => (r.company.status === "ecartee" ? "—" : Number(r.techScore.toFixed(2))) }]
      : []),
    ...(envW > 0
      ? [{ label: `Note Enviro. (/${envW})`, getVal: (r: SynthResult) => (r.company.status === "ecartee" ? "—" : Number(r.envScore.toFixed(2))) }]
      : []),
    ...(planW > 0
      ? [{ label: `Note Planning (/${planW})`, getVal: (r: SynthResult) => (r.company.status === "ecartee" ? "—" : Number(r.planScore.toFixed(2))) }]
      : []),
  ];

  for (const cr of criteriaRows) {
    synthSheet.getCell(sRow, COL_LABEL).value = cr.label;
    synthSheet.getCell(sRow, COL_LABEL).font = { size: 10 };
    synthSheet.getCell(sRow, COL_LABEL).fill = lightFill(COLORS.lightBlue);
    synthSheet.getCell(sRow, COL_LABEL).border = thinBorder();
    synthSheet.getCell(sRow, COL_LABEL).alignment = { horizontal: "left" };
    orderedSynth.forEach((r, idx) => {
      const col = synthCompanyCol(idx);
      const cell = synthSheet.getCell(sRow, col);
      cell.value = cr.getVal(r);
      if (cr.numFmt && typeof cell.value === "number") cell.numFmt = cr.numFmt;
      cell.border = thinBorder();
      cell.alignment = { horizontal: "center" };
      if (r.company.status === "ecartee") {
        cell.font = { italic: true, color: { argb: COLORS.excluded } };
        cell.fill = lightFill(COLORS.lightRed);
      } else {
        const compIdx = orderedSynth.filter((x) => x.company.status !== "ecartee").indexOf(r);
        cell.fill = lightFill(companyPastelArgb(compIdx >= 0 ? compIdx : 0));
      }
    });
    sRow++;
  }

  // Classement (rang par note globale, affiché dans l'ordre des entreprises)
  synthSheet.getCell(sRow, COL_LABEL).value = "Classement";
  synthSheet.getCell(sRow, COL_LABEL).font = { bold: true, size: 10 };
  synthSheet.getCell(sRow, COL_LABEL).fill = lightFill(COLORS.lightBlue);
  synthSheet.getCell(sRow, COL_LABEL).border = thinBorder();
  orderedSynth.forEach((r, idx) => {
    const col = synthCompanyCol(idx);
    const cell = synthSheet.getCell(sRow, col);
    if (r.company.status === "ecartee") {
      cell.value = "—";
      cell.fill = lightFill(COLORS.lightRed);
      cell.font = { italic: true, color: { argb: COLORS.excluded } };
    } else {
      const rank = rankByCompanyId[r.company.id];
      cell.value = rank ?? "—";
      cell.font = { bold: true };
      cell.fill = lightFill(companyPastelArgb((rank ?? 1) - 1));
    }
    cell.border = thinBorder();
    cell.alignment = { horizontal: "center" };
  });
  sRow++;

  // Décision
  synthSheet.getCell(sRow, COL_LABEL).value = "Décision";
  synthSheet.getCell(sRow, COL_LABEL).font = { bold: true, size: 10 };
  synthSheet.getCell(sRow, COL_LABEL).fill = lightFill(COLORS.lightBlue);
  synthSheet.getCell(sRow, COL_LABEL).border = thinBorder();
  const rejetDecisions: NegotiationDecision[] = ["rejete_oab", "rejete_irreguliere", "rejete_inacceptable"];
  orderedSynth.forEach((r, idx) => {
    const col = synthCompanyCol(idx);
    const cell = synthSheet.getCell(sRow, col);
    const decision: NegotiationDecision = (version.negotiationDecisions ?? {})[r.company.id] ?? "non_defini";
    const isRejetJuridique = rejetDecisions.includes(decision);
    cell.value = r.company.status === "ecartee" ? "Écartée" : NEGOTIATION_DECISION_LABELS[decision];
    cell.border = thinBorder();
    cell.alignment = { horizontal: "center" };
    if (r.company.status === "ecartee") {
      cell.fill = lightFill(COLORS.lightRed);
      cell.font = { italic: true, color: { argb: COLORS.excluded } };
    } else if (isRejetJuridique) {
      cell.font = { bold: true, color: { argb: COLORS.excluded } };
      const compIdx = orderedSynth.filter((x) => x.company.status !== "ecartee").indexOf(r);
      cell.fill = lightFill(companyPastelArgb(compIdx >= 0 ? compIdx : 0));
    } else {
      const isRetained = decision === "retenue" || decision === "attributaire";
      cell.font = { bold: true, color: { argb: isRetained ? "2E7D32" : COLORS.excluded } };
      const compIdx = orderedSynth.filter((x) => x.company.status !== "ecartee").indexOf(r);
      cell.fill = lightFill(companyPastelArgb(compIdx >= 0 ? compIdx : 0));
    }
  });
  sRow++;

  // Motif du rejet (écartée ou rejet juridique OAB / Irrégulière / Inacceptable)
  synthSheet.getCell(sRow, COL_LABEL).value = "Motif du rejet";
  synthSheet.getCell(sRow, COL_LABEL).font = { bold: true, size: 10 };
  synthSheet.getCell(sRow, COL_LABEL).fill = lightFill(COLORS.lightBlue);
  synthSheet.getCell(sRow, COL_LABEL).border = thinBorder();
  synthSheet.getCell(sRow, COL_LABEL).alignment = { wrapText: true };
  orderedSynth.forEach((r, idx) => {
    const col = synthCompanyCol(idx);
    const cell = synthSheet.getCell(sRow, col);
    const decision: NegotiationDecision = (version.negotiationDecisions ?? {})[r.company.id] ?? "non_defini";
    const hasMotif = r.company.status === "ecartee" || rejetDecisions.includes(decision);
    const motif = (r.company.exclusionReason ?? "").trim();
    cell.value = hasMotif ? (motif || "—") : "";
    cell.border = thinBorder();
    cell.alignment = { wrapText: true, vertical: "top" };
    if (hasMotif && motif) {
      cell.fill = lightFill(COLORS.lightOrange);
      cell.font = { size: 9 };
    }
  });
  sRow += 2;

  // Volets figés Synthèse (colonne A + ligne 1)
  synthSheet.views = [{ state: "frozen", xSplit: 1, ySplit: 3, topLeftCell: "B4", activeCell: "B4" }];

  // Attributaire block
  const allDecisions = version.negotiationDecisions ?? {};
  const attributaireEntry = orderedSynth.find(
    (r) => r.company.status !== "ecartee" && allDecisions[r.company.id] === "attributaire"
  );

  const getLineLabelSynth = (line: typeof activeLotLines[0]) => {
    if (!line.type) return line.label;
    const group = activeLotLines.filter((l) => l.type === line.type);
    const idx = group.indexOf(line) + 1;
    const toLabel = line.type === "T_OPTIONNELLE"
      ? (idx === 1 ? "Tranche Optionnelle" : `Tranche Optionnelle ${idx - 1}`)
      : null;
    const prefix = toLabel !== null ? toLabel : (line.type === "PSE" ? `PSE ${idx}` : `Variante ${idx}`);
    return `${prefix}${line.label ? ` — ${line.label}` : ""}`;
  };

  const typedLines = activeLotLines.filter((l) => l.type);
  const fmtEuro = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  if (version.validated || attributaireEntry) {
    synthSheet.mergeCells(`B${sRow}:J${sRow}`);
    const valTitle = synthSheet.getCell(`B${sRow}`);
    valTitle.value = "VALIDATION DE L'ANALYSE";
    valTitle.font = { bold: true, size: 12, color: { argb: COLORS.headerFont } };
    valTitle.fill = headerFill();
    valTitle.border = thinBorder();
    sRow++;

    if (version.validated && version.validatedAt) {
      synthSheet.getCell(`B${sRow}`).value = `Validée le : ${new Date(version.validatedAt).toLocaleDateString("fr-FR")}`;
      synthSheet.getCell(`B${sRow}`).font = { italic: true, size: 10, color: { argb: "2E7D32" } };
      sRow++;
    }
    sRow++;

    if (attributaireEntry) {
      const attrRank = rankByCompanyId[attributaireEntry.company.id] ?? 0;
      const finalAmount = version.attributionDetails?.[attributaireEntry.company.id]?.finalAmount ?? attributaireEntry.priceTotal;
      const enabledOptions = typedLines.filter((l) => {
        const entry = version.priceEntries.find(
          (e) => e.companyId === attributaireEntry.company.id && e.lotLineId === l.id
        );
        return entry && ((entry.dpgf1 ?? 0) !== 0 || (entry.dpgf2 ?? 0) !== 0);
      });
      const optionLabels = enabledOptions.map((l) => getLineLabelSynth(l));

      synthSheet.mergeCells(`B${sRow}:J${sRow}`);
      const attrTitle = synthSheet.getCell(`B${sRow}`);
      attrTitle.value = "🏆 Attribution pressentie";
      attrTitle.font = { bold: true, size: 11, color: { argb: "2E7D32" } };
      attrTitle.fill = lightFill(COLORS.lightGreen);
      attrTitle.border = thinBorder();
      sRow++;

      synthSheet.mergeCells(`B${sRow}:J${sRow}`);
      synthSheet.getCell(`B${sRow}`).value = `L'entreprise ${attributaireEntry.company.name} est retenue pour un montant de ${fmtEuro(finalAmount)} HT, incluant la Solution de ${baseLabel}${optionLabels.length > 0 ? ` + ${optionLabels.join(", ")}` : ""}.`;
      synthSheet.getCell(`B${sRow}`).font = { size: 10 };
      synthSheet.getCell(`B${sRow}`).alignment = { wrapText: true };
      synthSheet.getCell(`B${sRow}`).border = thinBorder();
      sRow++;

      synthSheet.mergeCells(`B${sRow}:J${sRow}`);
      synthSheet.getCell(`B${sRow}`).value = `Classée au rang n°${attrRank} avec une note globale de ${attributaireEntry.globalScore.toFixed(1)} / ${maxGlobal} pts.`;
      synthSheet.getCell(`B${sRow}`).font = { italic: true, size: 10, color: { argb: "666666" } };
      synthSheet.getCell(`B${sRow}`).border = thinBorder();
      sRow += 2;

      synthSheet.getCell(`B${sRow}`).value = "Détail du scénario retenu :";
      synthSheet.getCell(`B${sRow}`).font = { bold: true, size: 10 };
      sRow++;
      synthSheet.getCell(`B${sRow}`).value = `• Solution de ${baseLabel}`;
      synthSheet.getCell(`B${sRow}`).font = { size: 10 };
      sRow++;
      for (const l of enabledOptions) {
        const linePrice = (() => {
          const e = version.priceEntries.find(
            (e) => e.companyId === attributaireEntry.company.id && e.lotLineId === l.id
          );
          return (e?.dpgf1 ?? 0) + (e?.dpgf2 ?? 0);
        })();
        synthSheet.getCell(`B${sRow}`).value = `• ${getLineLabelSynth(l)} — ${fmtEuro(linePrice)}`;
        synthSheet.getCell(`B${sRow}`).font = { size: 10 };
        sRow++;
      }
      synthSheet.getCell(`B${sRow}`).value = `Montant final HT : ${fmtEuro(finalAmount)}`;
      synthSheet.getCell(`B${sRow}`).font = { bold: true, size: 10 };
      sRow += 2;
    }

    const excludedCompanies = companies.filter((c) => c.status === "ecartee");
    const nonRetenues = companies.filter(
      (c) => c.status !== "ecartee" && (allDecisions[c.id] === "non_retenue" || allDecisions[c.id] === "rejete_oab" || allDecisions[c.id] === "rejete_irreguliere" || allDecisions[c.id] === "rejete_inacceptable")
    );

    if (excludedCompanies.length > 0 || nonRetenues.length > 0) {
      synthSheet.mergeCells(`B${sRow}:J${sRow}`);
      const evTitle = synthSheet.getCell(`B${sRow}`);
      evTitle.value = "⚠️ Motifs d'éviction / non-attribution";
      evTitle.font = { bold: true, size: 11, color: { argb: "E65100" } };
      evTitle.fill = lightFill(COLORS.lightOrange);
      evTitle.border = thinBorder();
      sRow++;

      for (const c of excludedCompanies) {
        synthSheet.getCell(`B${sRow}`).value = `${c.name} — Écartée : ${c.exclusionReason || "Motif non précisé"}`;
        synthSheet.getCell(`B${sRow}`).font = { size: 10, color: { argb: "E65100" } };
        sRow++;
      }
      for (const c of nonRetenues) {
        const decision: NegotiationDecision = (allDecisions[c.id] ?? "non_retenue") as NegotiationDecision;
        const label = NEGOTIATION_DECISION_LABELS[decision] ?? "Non retenue";
        const motif = (c.exclusionReason ?? "").trim();
        synthSheet.getCell(`B${sRow}`).value = motif ? `${c.name} — ${label} : ${motif}` : `${c.name} — ${label}`;
        synthSheet.getCell(`B${sRow}`).font = { size: 10, color: { argb: "E65100" } };
        sRow++;
      }
      sRow++;
    }
  }

  if (typedLines.length > 0) {
    sRow += 1;
    synthSheet.mergeCells(`B${sRow}:J${sRow}`);
    const scenTitle = synthSheet.getCell(`B${sRow}`);
    scenTitle.value = "NOTES PRIX PAR SCÉNARIO";
    scenTitle.font = { bold: true, size: 12, color: { argb: COLORS.headerFont } };
    scenTitle.fill = headerFill();
    scenTitle.border = thinBorder();
    sRow++;

    synthSheet.getCell(`B${sRow}`).value = `Notes de prix pour chaque scénario (${baseLabel} + option individuelle), y compris ceux non retenus.`;
    synthSheet.getCell(`B${sRow}`).font = { italic: true, size: 9 };
    sRow += 2;

    const eligibleForScenario = companies.filter((c) => c.status !== "ecartee" && c.name.trim() !== "");

    const scenTechScores: Record<number, number> = {};
    for (const company of eligibleForScenario) {
      let total = 0;
      for (const criterion of technicalCriteria) {
        let score = 0;
        if (criterion.subCriteria.length > 0) {
          let raw = 0;
          const subTotal = criterion.subCriteria.reduce((s, sc) => s + sc.weight, 0);
          for (const sub of criterion.subCriteria) {
            const note = version.technicalNotes.find(
              (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
            );
            if (note?.notation) raw += NOTATION_VALUES[note.notation] * (subTotal > 0 ? sub.weight / subTotal : 0);
          }
          score = raw * criterion.weight;
        } else {
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
          );
          if (note?.notation) score = NOTATION_VALUES[note.notation] * criterion.weight;
        }
        total += score;
      }
      scenTechScores[company.id] = total;
    }

    {
      synthSheet.mergeCells(`B${sRow}:H${sRow}`);
      const tfTitle = synthSheet.getCell(`B${sRow}`);
      tfTitle.value = `${baseLabel} (seule)`;
      tfTitle.font = { bold: true, size: 10, color: { argb: COLORS.headerFont } };
      tfTitle.fill = headerFill();
      tfTitle.border = thinBorder();
      sRow++;

      ["Entreprise", `Prix ${baseLabel} (€ HT)`, `Note Tech`, `Note Prix (/${prixWeight})`, `Note Globale (/${maxGlobal})`, "Rang"].forEach((h, i) => {
        const c = synthSheet.getCell(sRow, i + 2);
        c.value = h;
        c.font = { bold: true, size: 9 };
        c.fill = lightFill(COLORS.lightBlue);
        c.border = thinBorder();
        c.alignment = { horizontal: "center", wrapText: true };
      });
      sRow++;

      const baseTotals = eligibleForScenario.map((company) => {
        const baseEntry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === 0);
        let basePrice = (baseEntry?.dpgf1 ?? 0) + (baseEntry?.dpgf2 ?? 0);
        for (const bl of activeLotLines.filter((l) => !l.type)) {
          const e = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === bl.id);
          basePrice += (e?.dpgf1 ?? 0) + (e?.dpgf2 ?? 0);
        }
        return { name: `${company.id}. ${company.name}`, basePrice, techTotal: scenTechScores[company.id] ?? 0 };
      });

      const validPrices = baseTotals.filter((t) => t.basePrice > 0).map((t) => t.basePrice);
      const minP = validPrices.length > 0 ? Math.min(...validPrices) : 0;

      const scored = baseTotals.map((t) => {
        const ps = t.basePrice > 0 ? (minP / t.basePrice) * prixWeight : 0;
        return { ...t, priceScore: ps, globalScore: t.techTotal + ps };
      }).sort((a, b) => b.globalScore - a.globalScore);

      scored.forEach((s, idx) => {
        synthSheet.getCell(sRow, 2).value = s.name; synthSheet.getCell(sRow, 2).border = thinBorder();
        synthSheet.getCell(sRow, 3).value = s.basePrice; synthSheet.getCell(sRow, 3).numFmt = '#,##0.00 "€"'; synthSheet.getCell(sRow, 3).border = thinBorder();
        synthSheet.getCell(sRow, 4).value = Number(s.techTotal.toFixed(1)); synthSheet.getCell(sRow, 4).border = thinBorder(); synthSheet.getCell(sRow, 4).alignment = { horizontal: "center" };
        synthSheet.getCell(sRow, 5).value = Number(s.priceScore.toFixed(2)); synthSheet.getCell(sRow, 5).border = thinBorder(); synthSheet.getCell(sRow, 5).alignment = { horizontal: "center" }; synthSheet.getCell(sRow, 5).font = { bold: true };
        synthSheet.getCell(sRow, 6).value = Number(s.globalScore.toFixed(2)); synthSheet.getCell(sRow, 6).border = thinBorder(); synthSheet.getCell(sRow, 6).alignment = { horizontal: "center" }; synthSheet.getCell(sRow, 6).font = { bold: true };
        synthSheet.getCell(sRow, 7).value = idx + 1; synthSheet.getCell(sRow, 7).border = thinBorder(); synthSheet.getCell(sRow, 7).alignment = { horizontal: "center" }; synthSheet.getCell(sRow, 7).font = { bold: true };
        sRow++;
      });
      sRow++;
    }

    for (const line of typedLines) {
      const label = getLineLabelSynth(line);
      synthSheet.mergeCells(`B${sRow}:H${sRow}`);
      const secTitle = synthSheet.getCell(`B${sRow}`);
      secTitle.value = `${baseLabel} + ${label}`;
      secTitle.font = { bold: true, size: 10, color: { argb: COLORS.headerFont } };
      secTitle.fill = headerFill();
      secTitle.border = thinBorder();
      sRow++;

      ["Entreprise", "Total (€ HT)", `Note Tech`, `Note Prix (/${prixWeight})`, `Note Globale (/${maxGlobal})`, "Rang"].forEach((h, i) => {
        const c = synthSheet.getCell(sRow, i + 2);
        c.value = h;
        c.font = { bold: true, size: 9 };
        c.fill = lightFill(COLORS.lightBlue);
        c.border = thinBorder();
        c.alignment = { horizontal: "center", wrapText: true };
      });
      sRow++;

      const totals = eligibleForScenario.map((company) => {
        const baseEntry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === 0);
        let basePrice = (baseEntry?.dpgf1 ?? 0) + (baseEntry?.dpgf2 ?? 0);
        for (const bl of activeLotLines.filter((l) => !l.type)) {
          const e = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === bl.id);
          basePrice += (e?.dpgf1 ?? 0) + (e?.dpgf2 ?? 0);
        }
        const optEntry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === line.id);
        const optionPrice = (optEntry?.dpgf1 ?? 0) + (optEntry?.dpgf2 ?? 0);
        return { name: `${company.id}. ${company.name}`, total: basePrice + optionPrice, techTotal: scenTechScores[company.id] ?? 0 };
      });

      const validPrices = totals.filter((t) => t.total > 0).map((t) => t.total);
      const minP = validPrices.length > 0 ? Math.min(...validPrices) : 0;

      const scored = totals.map((t) => {
        const ps = t.total > 0 ? (minP / t.total) * prixWeight : 0;
        return { ...t, priceScore: ps, globalScore: t.techTotal + ps };
      }).sort((a, b) => b.globalScore - a.globalScore);

      scored.forEach((s, idx) => {
        synthSheet.getCell(sRow, 2).value = s.name; synthSheet.getCell(sRow, 2).border = thinBorder();
        synthSheet.getCell(sRow, 3).value = s.total; synthSheet.getCell(sRow, 3).numFmt = '#,##0.00 "€"'; synthSheet.getCell(sRow, 3).border = thinBorder();
        synthSheet.getCell(sRow, 4).value = Number(s.techTotal.toFixed(1)); synthSheet.getCell(sRow, 4).border = thinBorder(); synthSheet.getCell(sRow, 4).alignment = { horizontal: "center" };
        synthSheet.getCell(sRow, 5).value = Number(s.priceScore.toFixed(2)); synthSheet.getCell(sRow, 5).border = thinBorder(); synthSheet.getCell(sRow, 5).alignment = { horizontal: "center" }; synthSheet.getCell(sRow, 5).font = { bold: true };
        synthSheet.getCell(sRow, 6).value = Number(s.globalScore.toFixed(2)); synthSheet.getCell(sRow, 6).border = thinBorder(); synthSheet.getCell(sRow, 6).alignment = { horizontal: "center" }; synthSheet.getCell(sRow, 6).font = { bold: true };
        synthSheet.getCell(sRow, 7).value = idx + 1; synthSheet.getCell(sRow, 7).border = thinBorder(); synthSheet.getCell(sRow, 7).alignment = { horizontal: "center" }; synthSheet.getCell(sRow, 7).font = { bold: true };
        sRow++;
      });
      sRow++;
    }
  }

  synthSheet.getColumn(COL_LABEL).width = 28;
  for (let i = 2; i <= lastSynthDataCol; i++) {
    synthSheet.getColumn(i).width = 40;
  }
}

/**
 * Onglet « Questions & Réponses » (Q&R) : pour une version donnée, tableau à 4 colonnes
 * 1 = Entreprise, 2 = N° question, 3 = Question, 4 = Réponse (une ligne par question).
 */
function buildQuestionsResponsesSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  project: ProjectData,
  version: NegotiationVersion,
  companies: { id: number; name: string }[],
  showIfEmpty = false
) {
  const questionnaire = version.questionnaire;
  const companyIds = new Set(companies.map((c) => c.id));
  const questionnairesWithQuestions = questionnaire?.questionnaires
    ? questionnaire.questionnaires.filter((cq) => companyIds.has(cq.companyId) && cq.questions?.length > 0)
    : [];

  if (questionnairesWithQuestions.length === 0) {
    if (!showIfEmpty) return;
    const ws = wb.addWorksheet(sheetName);
    ws.properties.defaultRowHeight = 18;
    ws.mergeCells("A1:D1");
    const titleCell = ws.getCell("A1");
    const titleText = sheetName.replace(/^Q&R/, "Questions & Réponses");
    titleCell.value = `${project.info.name || "Projet"} — Lot ${project.info.lotNumber || ""} — ${titleText}`;
    titleCell.font = { bold: true, size: 13, color: { argb: COLORS.darkText } };
    titleCell.fill = lightFill(COLORS.lightBlue);
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 22;
    ws.getCell("A2").value = "Aucune question / réponse enregistrée pour cette phase.";
    ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF888888" } };
    ws.getColumn("A").width = 28;
    ws.getColumn("B").width = 6;
    ws.getColumn("C").width = 50;
    ws.getColumn("D").width = 50;
    return;
  }

  const ws = wb.addWorksheet(sheetName);
  ws.properties.defaultRowHeight = 18;

  const COL_ENTREPRISE = 1;
  const COL_NUM = 2;
  const COL_QUESTION = 3;
  const COL_REPONSE = 4;
  const lastCol = 4;

  let row = 1;
  ws.mergeCells(row, COL_ENTREPRISE, row, lastCol);
  const titleCell = ws.getCell(row, COL_ENTREPRISE);
  const titleText = sheetName.replace(/^Q&R/, "Questions & Réponses");
  titleCell.value = `${project.info.name || "Projet"} — Lot ${project.info.lotNumber || ""} — ${titleText}`;
  titleCell.font = { bold: true, size: 13, color: { argb: COLORS.darkText } };
  titleCell.fill = lightFill(COLORS.lightBlue);
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = 22;
  row++;

  ws.getCell(row, COL_ENTREPRISE).value = "Entreprise";
  ws.getCell(row, COL_NUM).value = "N°";
  ws.getCell(row, COL_QUESTION).value = "Question";
  ws.getCell(row, COL_REPONSE).value = "Réponse";
  for (let col = 1; col <= lastCol; col++) {
    const c = ws.getCell(row, col);
    c.font = { bold: true, size: 10 };
    c.fill = lightFill(COLORS.lightBlue);
    c.border = thinBorder();
    c.alignment = { horizontal: col === COL_NUM ? "center" : "left", vertical: "middle", wrapText: true };
  }
  ws.getRow(row).height = 20;
  row++;

  for (const cq of questionnairesWithQuestions) {
    const company = companies.find((c) => c.id === cq.companyId);
    const companyName = company?.name || `Entreprise ${cq.companyId}`;
    cq.questions.forEach((q, i) => {
      ws.getCell(row, COL_ENTREPRISE).value = companyName;
      ws.getCell(row, COL_ENTREPRISE).alignment = { wrapText: true, vertical: "top" };
      ws.getCell(row, COL_NUM).value = i + 1;
      ws.getCell(row, COL_NUM).alignment = { horizontal: "center", vertical: "top" };
      ws.getCell(row, COL_QUESTION).value = q.text || "—";
      ws.getCell(row, COL_QUESTION).alignment = { wrapText: true, vertical: "top" };
      ws.getCell(row, COL_REPONSE).value = q.response ?? "—";
      ws.getCell(row, COL_REPONSE).alignment = { wrapText: true, vertical: "top" };
      for (let col = 1; col <= lastCol; col++) {
        ws.getCell(row, col).border = thinBorder();
      }
      ws.getRow(row).height = rowHeightFromCellValues([companyName, q.text || "", q.response ?? ""], 18, 250);
      row++;
    });
  }

  ws.getColumn(COL_ENTREPRISE).width = 28;
  ws.getColumn(COL_NUM).width = 6;
  ws.getColumn(COL_QUESTION).width = 50;
  ws.getColumn(COL_REPONSE).width = 50;
}

// ─── CR Négo par entreprise ──────────────────────────────────────────────────

/** Construit le nom d'onglet "CR négo N NomEntreprise" (tronqué à 31 chars). */
function buildCRSheetName(negoIndex: number, companyName: string): string {
  const prefix = `CR négo ${negoIndex} `;
  const name = companyName.trim() || "—";
  const available = MAX_SHEET_NAME_LENGTH - prefix.length;
  return prefix + (name.length > available ? name.slice(0, available) : name);
}

/** Crée un onglet de compte-rendu de négociation pour UNE entreprise. */
function buildDeroulementCompanySheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  project: ProjectData,
  version: NegotiationVersion,
  company: ProjectData["companies"][number],
  companyIdx: number
): void {
  type ExecData = { date?: string; attendees?: string; answers?: Record<string, string>; freeText?: string };
  type PrepQuestion = { id: string; text: string; order: number; importance: string };

  const execData = (version.negotiationData?.[company.id]?.execution ?? null) as ExecData | null;
  const prepQuestions = ((version.negotiationData?.[company.id]?.prep?.questions ?? []) as PrepQuestion[])
    .slice()
    .sort((a, b) => a.order - b.order);

  const ws = wb.addWorksheet(sheetName);
  ws.properties.defaultRowHeight = 18;

  const COL_LABEL = 1;
  const COL_VALUE = 2;
  const importanceLabel: Record<string, string> = { faible: "Faible", moyen: "Moyen", fort: "Fort" };
  let row = 1;

  // Titre
  ws.mergeCells(row, COL_LABEL, row, COL_VALUE);
  const titleCell = ws.getCell(row, COL_LABEL);
  titleCell.value = `${project.info.name || "Projet"} — Lot ${project.info.lotNumber || ""} — Compte-rendu de négociation`;
  titleCell.font = { bold: true, size: 13, color: { argb: COLORS.darkText } };
  titleCell.fill = lightFill(COLORS.lightBlue);
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(row).height = 22;
  row++;

  // En-tête entreprise (bandeau coloré)
  ws.mergeCells(row, COL_LABEL, row, COL_VALUE);
  const compHeader = ws.getCell(row, COL_LABEL);
  compHeader.value = company.name || `Entreprise ${company.id}`;
  compHeader.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  compHeader.fill = solidFill(COMPANY_ARGB[companyIdx % COMPANY_ARGB.length]);
  compHeader.alignment = { horizontal: "left", vertical: "middle" };
  compHeader.border = thickBorder();
  ws.getRow(row).height = 26;
  row++;

  // Date de la réunion
  ws.getCell(row, COL_LABEL).value = "Date de la réunion";
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 10 };
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
  ws.getCell(row, COL_LABEL).border = thinBorder();
  ws.getCell(row, COL_VALUE).value = execData?.date || "—";
  ws.getCell(row, COL_VALUE).border = thinBorder();
  ws.getRow(row).height = 18;
  row++;

  // Personnes présentes
  const attendeesText = execData?.attendees || "—";
  ws.getCell(row, COL_LABEL).value = "Personnes présentes";
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 10 };
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
  ws.getCell(row, COL_LABEL).border = thinBorder();
  ws.getCell(row, COL_LABEL).alignment = { vertical: "top" };
  ws.getCell(row, COL_VALUE).value = attendeesText;
  ws.getCell(row, COL_VALUE).alignment = { wrapText: true, vertical: "top" };
  ws.getCell(row, COL_VALUE).border = thinBorder();
  ws.getRow(row).height = rowHeightFromCellValues([attendeesText], 18, 120);
  row++;

  // Questions / Réponses
  if (prepQuestions.length > 0) {
    ws.mergeCells(row, COL_LABEL, row, COL_VALUE);
    const qrHeader = ws.getCell(row, COL_LABEL);
    qrHeader.value = "Questions / Réponses";
    qrHeader.font = { bold: true, size: 10, color: { argb: COLORS.headerFont } };
    qrHeader.fill = headerFill();
    qrHeader.border = thinBorder();
    ws.getRow(row).height = 18;
    row++;

    prepQuestions.forEach((q, qi) => {
      const answer = execData?.answers?.[q.id] ?? "";
      const impLabel = importanceLabel[q.importance] ?? q.importance;
      const questionText = q.text || "—";

      ws.getCell(row, COL_LABEL).value = `Q${qi + 1} (${impLabel})`;
      ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
      ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightYellow);
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getCell(row, COL_LABEL).alignment = { vertical: "top" };
      ws.getCell(row, COL_VALUE).value = questionText;
      ws.getCell(row, COL_VALUE).font = { bold: true, size: 9 };
      ws.getCell(row, COL_VALUE).fill = lightFill(COLORS.lightYellow);
      ws.getCell(row, COL_VALUE).alignment = { wrapText: true, vertical: "top" };
      ws.getCell(row, COL_VALUE).border = thinBorder();
      ws.getRow(row).height = rowHeightFromCellValues([questionText], 18, 120);
      row++;

      ws.getCell(row, COL_LABEL).value = "Réponse";
      ws.getCell(row, COL_LABEL).font = { italic: true, size: 9 };
      ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.white);
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getCell(row, COL_LABEL).alignment = { vertical: "top" };
      ws.getCell(row, COL_VALUE).value = answer || "—";
      ws.getCell(row, COL_VALUE).alignment = { wrapText: true, vertical: "top" };
      ws.getCell(row, COL_VALUE).border = thinBorder();
      ws.getRow(row).height = rowHeightFromCellValues([answer || "—"], 18, 200);
      row++;
    });
  }

  // Compte-rendu / Notes libres
  const freeText = execData?.freeText || "—";
  ws.getCell(row, COL_LABEL).value = "Compte-rendu / Notes libres";
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 10 };
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightGreen);
  ws.getCell(row, COL_LABEL).border = thinBorder();
  ws.getCell(row, COL_LABEL).alignment = { vertical: "top" };
  ws.getCell(row, COL_VALUE).value = freeText;
  ws.getCell(row, COL_VALUE).alignment = { wrapText: true, vertical: "top" };
  ws.getCell(row, COL_VALUE).border = thinBorder();
  ws.getRow(row).height = rowHeightFromCellValues([freeText], 18, 250);

  ws.getColumn(COL_LABEL).width = 30;
  ws.getColumn(COL_VALUE).width = 80;
}

function buildMethodologySheet(wb: ExcelJS.Workbook, project: ProjectData, baseLabel: string) {
  const methSheet = wb.addWorksheet("METHODOLOGIE");
  methSheet.properties.defaultRowHeight = 18;

  let row = 1;
  methSheet.mergeCells(`A${row}:G${row}`);
  const title = methSheet.getCell(row, 1);
  title.value = "MÉTHODOLOGIE DE NOTATION ET D'ANALYSE";
  title.font = { bold: true, size: 14, color: { argb: COLORS.darkText } };
  title.fill = lightFill(COLORS.lightBlue);
  title.border = thinBorder();
  row += 2;

  methSheet.mergeCells(`A${row}:G${row}`);
  const priceTitle = methSheet.getCell(row, 1);
  priceTitle.value = "1. Critère Prix";
  priceTitle.font = { bold: true, size: 12, color: { argb: COLORS.headerFont } };
  priceTitle.fill = headerFill();
  priceTitle.border = thinBorder();
  row++;

  methSheet.getCell(row, 1).value = "Formule : Note = (Montant le plus bas / Montant candidat) × Pondération Prix";
  methSheet.getCell(row, 1).font = { italic: true, size: 10 };
  row++;
  methSheet.getCell(row, 1).value = "Le candidat le moins-disant obtient la note maximale. Les autres sont notés proportionnellement.";
  methSheet.getCell(row, 1).font = { size: 10 };
  row += 2;

  methSheet.mergeCells(`A${row}:G${row}`);
  const techTitle = methSheet.getCell(row, 1);
  techTitle.value = "2. Critères Techniques (Valeur Technique, Environnemental, Planning)";
  techTitle.font = { bold: true, size: 12, color: { argb: COLORS.headerFont } };
  techTitle.fill = headerFill();
  techTitle.border = thinBorder();
  row++;

  methSheet.getCell(row, 1).value = "Chaque sous-critère ou critère est noté par un coefficient (Très bien = 100 %, …), puis la note brute est (poids × coefficient). La note pondérée du critère parent applique ensuite le poids du critère.";
  methSheet.getCell(row, 1).font = { size: 10 };
  row += 2;

  // Poids uniques : tous les critères techniques + tous les sous-critères (pas de colonnes en dur)
  const techCriteriaMeth = project.weightingCriteria.filter((c) => c.id !== "prix" && c.weight > 0);
  const uniqueWeightsSet = new Set<number>();
  for (const c of techCriteriaMeth) {
    uniqueWeightsSet.add(c.weight);
    for (const sub of c.subCriteria || []) {
      if (sub.weight > 0) uniqueWeightsSet.add(sub.weight);
    }
  }
  const uniqueWeights = Array.from(uniqueWeightsSet).sort((a, b) => a - b);

  const notationHeaders = ["Appréciation", "Coefficient"];
  uniqueWeights.forEach((p) => notationHeaders.push(`Sur ${p} pts`));
  notationHeaders.forEach((h, i) => {
    const cell = methSheet.getCell(row, i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9 };
    cell.fill = lightFill(COLORS.lightBlue);
    cell.border = thinBorder();
    cell.alignment = { horizontal: "center" };
  });
  row++;

  const notationScale: [string, number][] = [
    ["Très bien", 1.0],
    ["Bien", 0.75],
    ["Moyen", 0.5],
    ["Passable", 0.25],
    ["Insuffisant", 0.1],
  ];
  for (const [label, coefficient] of notationScale) {
    methSheet.getCell(row, 1).value = label;
    methSheet.getCell(row, 1).border = thinBorder();
    methSheet.getCell(row, 1).font = { bold: true };
    methSheet.getCell(row, 2).value = `${Math.round(coefficient * 100)} %`;
    methSheet.getCell(row, 2).border = thinBorder();
    methSheet.getCell(row, 2).alignment = { horizontal: "center" };
    for (let i = 0; i < uniqueWeights.length; i++) {
      const poids = uniqueWeights[i];
      const wCell = methSheet.getCell(row, 3 + i);
      wCell.value = Number((poids * coefficient).toFixed(1));
      wCell.border = thinBorder();
      wCell.alignment = { horizontal: "center" };
    }
    row++;
  }
  row += 2;

  methSheet.mergeCells(`A${row}:G${row}`);
  const scenTitle = methSheet.getCell(row, 1);
  scenTitle.value = "3. Tableau des Scénarios Possibles";
  scenTitle.font = { bold: true, size: 12, color: { argb: COLORS.headerFont } };
  scenTitle.fill = headerFill();
  scenTitle.border = thinBorder();
  row++;

  const activeLotLines = project.lotLines.filter((l) => l.label.trim() !== "");
  const typedLines = activeLotLines.filter((l) => l.type);

  if (typedLines.length === 0) {
    methSheet.getCell(row, 1).value = "Aucune PSE, Variante ou Tranche Optionnelle configurée.";
    methSheet.getCell(row, 1).font = { italic: true, size: 10 };
    row++;
  } else {
    ["Scénario", "Composition", "Description"].forEach((h, i) => {
      const cell = methSheet.getCell(row, i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 9 };
      cell.fill = lightFill(COLORS.lightBlue);
      cell.border = thinBorder();
    });
    row++;

    const tfShort = baseLabel === "Tranche Ferme" ? "TF" : "Base";
    methSheet.getCell(row, 1).value = `${baseLabel} seule`;
    methSheet.getCell(row, 1).border = thinBorder();
    methSheet.getCell(row, 2).value = `${baseLabel} (DPGF)`;
    methSheet.getCell(row, 2).border = thinBorder();
    methSheet.getCell(row, 3).value = `Solution de ${baseLabel.toLowerCase()} uniquement`;
    methSheet.getCell(row, 3).border = thinBorder();
    row++;

    const pseLines = typedLines.filter((l) => l.type === "PSE");
    const varianteLines = typedLines.filter((l) => l.type === "VARIANTE");
    const toLines = typedLines.filter((l) => l.type === "T_OPTIONNELLE");

    if (pseLines.length > 0) {
      methSheet.getCell(row, 1).value = `${baseLabel} + PSE`;
      methSheet.getCell(row, 1).border = thinBorder();
      methSheet.getCell(row, 2).value = `${tfShort} + ${pseLines.map((l) => l.label).join(", ")}`;
      methSheet.getCell(row, 2).border = thinBorder();
      methSheet.getCell(row, 3).value = `Solution de ${baseLabel.toLowerCase()} avec toutes les PSE`;
      methSheet.getCell(row, 3).border = thinBorder();
      row++;
    }
    if (varianteLines.length > 0) {
      methSheet.getCell(row, 1).value = `${baseLabel} + Variantes`;
      methSheet.getCell(row, 1).border = thinBorder();
      methSheet.getCell(row, 2).value = `${tfShort} + ${varianteLines.map((l) => l.label).join(", ")}`;
      methSheet.getCell(row, 2).border = thinBorder();
      methSheet.getCell(row, 3).value = `Solution de ${baseLabel.toLowerCase()} avec toutes les Variantes`;
      methSheet.getCell(row, 3).border = thinBorder();
      row++;
    }
    if (toLines.length > 0) {
      methSheet.getCell(row, 1).value = `${baseLabel} + Tranches Optionnelles`;
      methSheet.getCell(row, 1).border = thinBorder();
      methSheet.getCell(row, 2).value = `${tfShort} + ${toLines.map((l) => l.label).join(", ")}`;
      methSheet.getCell(row, 2).border = thinBorder();
      methSheet.getCell(row, 3).value = `Solution de ${baseLabel.toLowerCase()} avec toutes les Tranches Optionnelles`;
      methSheet.getCell(row, 3).border = thinBorder();
      row++;
    }
    if (pseLines.length > 0 && toLines.length > 0) {
      methSheet.getCell(row, 1).value = `${baseLabel} + PSE + Tranches Optionnelles`;
      methSheet.getCell(row, 1).border = thinBorder();
      methSheet.getCell(row, 2).value = `${tfShort} + ${[...pseLines, ...toLines].map((l) => l.label).join(", ")}`;
      methSheet.getCell(row, 2).border = thinBorder();
      methSheet.getCell(row, 3).value = "Combinaison complète";
      methSheet.getCell(row, 3).border = thinBorder();
      row++;
    }
  }

  methSheet.getColumn("A").width = 25;
  methSheet.getColumn("B").width = 20;
  methSheet.getColumn("C").width = 40;
  methSheet.getColumn("D").width = 15;
  methSheet.getColumn("E").width = 15;
  methSheet.getColumn("F").width = 15;
  methSheet.getColumn("G").width = 15;
}

/**
 * Onglet "Administratif" : vérifications administratives par entreprise non écartée.
 * Liste les exigences (adminConfig) et l'état Fourni/Non fourni (adminData).
 * Alerte si activité ou montant décennale non couvert.
 */
function buildAdministratifSheet(
  wb: ExcelJS.Workbook,
  project: ProjectData,
  companies: typeof project.companies
) {
  const adminConfig = (project.info as { adminConfig?: { requireDecennale?: boolean; requireBiennale?: boolean; requireRC?: boolean; customDocs?: string[] } }).adminConfig;
  const activeCompanies = companies.filter((c) => c.name.trim() !== "" && c.status !== "ecartee");
  if (activeCompanies.length === 0) return;

  const ws = wb.addWorksheet("Administratif");
  ws.properties.defaultRowHeight = 18;

  let row = 1;
  ws.mergeCells(`A${row}:H${row}`);
  const titleCell = ws.getCell(row, 1);
  titleCell.value = `${project.info.name || "Projet"} — Lot ${project.info.lotNumber || ""} — Vérifications Administratives`;
  titleCell.font = { bold: true, size: 12, color: { argb: COLORS.darkText } };
  titleCell.fill = lightFill(COLORS.lightBlue);
  titleCell.border = thinBorder();
  row += 2;

  // En-têtes : Exigence | Entreprise 1 | Entreprise 2 | ...
  const colLabel = 1;
  const companyCol = (idx: number) => 2 + idx;
  ws.getCell(row, colLabel).value = "Exigence";
  ws.getCell(row, colLabel).font = headerFont();
  ws.getCell(row, colLabel).fill = headerFill();
  ws.getCell(row, colLabel).border = thinBorder();
  activeCompanies.forEach((c, idx) => {
    const col = companyCol(idx);
    ws.getCell(row, col).value = `${c.id}. ${c.name}`;
    ws.getCell(row, col).font = headerFont();
    ws.getCell(row, col).fill = headerFill();
    ws.getCell(row, col).border = thinBorder();
    ws.getCell(row, col).alignment = { wrapText: true };
  });
  row++;

  const fmtOuiNon = (v: boolean | null | undefined): string => {
    if (v == null) return "—";
    return v ? "Oui" : "Non";
  };

  const styleNonRouge = (cell: ExcelJS.Cell, value: boolean | null | undefined) => {
    if (value === false) {
      cell.fill = lightFill(COLORS.lightRed);
      cell.font = { color: { argb: COLORS.excluded }, bold: true };
    }
  };

  const reqDecennale = adminConfig?.requireDecennale ?? false;
  const reqBiennale = adminConfig?.requireBiennale ?? false;
  const reqRC = adminConfig?.requireRC ?? false;
  const customDocs = adminConfig?.customDocs ?? [];

  if (reqDecennale) {
    ws.getCell(row, colLabel).value = "Décennale fournie";
    ws.getCell(row, colLabel).font = { size: 10 };
    ws.getCell(row, colLabel).fill = lightFill(COLORS.lightYellow);
    ws.getCell(row, colLabel).border = thinBorder();
    activeCompanies.forEach((c, idx) => {
      const cell = ws.getCell(row, companyCol(idx));
      const v = c.adminData?.decennaleFournie;
      cell.value = fmtOuiNon(v);
      cell.border = thinBorder();
      styleNonRouge(cell, v);
    });
    row++;

    ws.getCell(row, colLabel).value = "Décennale — Date d'expiration";
    ws.getCell(row, colLabel).font = { size: 10 };
    ws.getCell(row, colLabel).fill = lightFill(COLORS.lightYellow);
    ws.getCell(row, colLabel).border = thinBorder();
    activeCompanies.forEach((c, idx) => {
      const cell = ws.getCell(row, companyCol(idx));
      cell.value = c.adminData?.decennaleDateExpiration?.trim() || "—";
      cell.border = thinBorder();
    });
    row++;

    ws.getCell(row, colLabel).value = "Décennale — Activité couverte";
    ws.getCell(row, colLabel).font = { size: 10 };
    ws.getCell(row, colLabel).fill = lightFill(COLORS.lightYellow);
    ws.getCell(row, colLabel).border = thinBorder();
    activeCompanies.forEach((c, idx) => {
      const cell = ws.getCell(row, companyCol(idx));
      const ok = c.adminData?.decennaleActiviteOK;
      cell.value = fmtOuiNon(ok);
      cell.border = thinBorder();
      styleNonRouge(cell, ok);
    });
    row++;

    ws.getCell(row, colLabel).value = "Décennale — Montant couvert";
    ws.getCell(row, colLabel).font = { size: 10 };
    ws.getCell(row, colLabel).fill = lightFill(COLORS.lightYellow);
    ws.getCell(row, colLabel).border = thinBorder();
    activeCompanies.forEach((c, idx) => {
      const cell = ws.getCell(row, companyCol(idx));
      const ok = c.adminData?.decennaleMontantOK;
      cell.value = fmtOuiNon(ok);
      cell.border = thinBorder();
      styleNonRouge(cell, ok);
    });
    row++;
  }

  if (reqBiennale) {
    ws.getCell(row, colLabel).value = "Biennale fournie";
    ws.getCell(row, colLabel).font = { size: 10 };
    ws.getCell(row, colLabel).fill = lightFill(COLORS.lightYellow);
    ws.getCell(row, colLabel).border = thinBorder();
    activeCompanies.forEach((c, idx) => {
      const cell = ws.getCell(row, companyCol(idx));
      const v = c.adminData?.biennaleFournie;
      cell.value = fmtOuiNon(v);
      cell.border = thinBorder();
      styleNonRouge(cell, v);
    });
    row++;
  }

  if (reqRC) {
    ws.getCell(row, colLabel).value = "RC fournie";
    ws.getCell(row, colLabel).font = { size: 10 };
    ws.getCell(row, colLabel).fill = lightFill(COLORS.lightYellow);
    ws.getCell(row, colLabel).border = thinBorder();
    activeCompanies.forEach((c, idx) => {
      const cell = ws.getCell(row, companyCol(idx));
      const v = c.adminData?.rcFournie;
      cell.value = fmtOuiNon(v);
      cell.border = thinBorder();
      styleNonRouge(cell, v);
    });
    row++;
  }

  for (const docName of customDocs) {
    ws.getCell(row, colLabel).value = `Doc. — ${docName}`;
    ws.getCell(row, colLabel).font = { size: 10 };
    ws.getCell(row, colLabel).fill = lightFill(COLORS.lightYellow);
    ws.getCell(row, colLabel).border = thinBorder();
    activeCompanies.forEach((c, idx) => {
      const cell = ws.getCell(row, companyCol(idx));
      const status = c.adminData?.customDocsStatus?.[docName];
      cell.value = fmtOuiNon(status);
      cell.border = thinBorder();
      styleNonRouge(cell, status);
    });
    row++;
  }

  if (!reqDecennale && !reqBiennale && !reqRC && customDocs.length === 0) {
    ws.getCell(row, colLabel).value = "Aucune exigence administrative configurée.";
    ws.getCell(row, colLabel).font = { italic: true, size: 10 };
    ws.getCell(row, colLabel).border = thinBorder();
  }

  ws.getColumn(colLabel).width = 32;
  activeCompanies.forEach((_, idx) => {
    ws.getColumn(companyCol(idx)).width = 18;
  });
}

// =============== Main export function ===============

export async function exportToExcel(project: ProjectData) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Analyse d'offres - Etudes & Travaux";
  wb.created = new Date();

  const activeCompanies = project.companies.filter((c) => c.name.trim() !== "");
  const activeLotLines = project.lotLines.filter((l) => l.label.trim() !== "");
  const v0 = project.versions[0];
  if (!v0) return;

  // Détection Tranches Optionnelles : si au moins une ligne de type T_OPTIONNELLE, on utilise "Tranche Ferme", sinon "Base"
  const hasTranches = activeLotLines.some((l) => l.type === "T_OPTIONNELLE");
  const baseLabel = hasTranches ? "Tranche Ferme" : "Base";

  // =========== DONNÉES DU PROJET (tableau à partir de A1) ===========
  const pgSheet = wb.addWorksheet("DONNEES_DU_PROJET");
  pgSheet.properties.defaultRowHeight = 18;

  pgSheet.mergeCells("A1:J1");
  const titleCell = pgSheet.getCell("A1");
  titleCell.value = `ANALYSE DES OFFRES — ${project.info.name || "Projet"} — Lot n° ${project.info.lotNumber || ""}`;
  titleCell.font = { bold: true, size: 14, color: { argb: COLORS.darkText } };
  titleCell.fill = lightFill(COLORS.lightBlue);
  titleCell.border = thinBorder();

  const infoData = [
    ["Nom du projet", project.info.name],
    ["Réf. du marché", project.info.marketRef],
    ["Lot analysé", project.info.lotAnalyzed],
    ["N° de lot", project.info.lotNumber],
    ["Date d'analyse", project.info.analysisDate],
    ["Rédacteur", project.info.author],
  ];

  let row = 2;
  for (const [label, value] of infoData) {
    const labelCell = pgSheet.getCell(`A${row}`);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 10 };
    labelCell.fill = lightFill(COLORS.lightBlue);
    labelCell.border = thinBorder();

    pgSheet.mergeCells(`B${row}:E${row}`);
    const valCell = pgSheet.getCell(`B${row}`);
    valCell.value = value || "";
    valCell.border = thinBorder();
    row++;
  }

  row += 1;
  pgSheet.mergeCells(`A${row}:E${row}`);
  const estTitle = pgSheet.getCell(`A${row}`);
  estTitle.value = "SYNTHÈSE FINANCIÈRE";
  estTitle.font = headerFont();
  estTitle.fill = headerFill();
  estTitle.border = thinBorder();
  row++;

  const estData = [
    ["Estimation DPGF 1 (€ HT)", project.info.estimationDpgf1],
    ["Estimation DPGF 2 (€ HT)", project.info.estimationDpgf2],
    ["Estimation Totale (€ HT)", (project.info.estimationDpgf1 ?? 0) + (project.info.estimationDpgf2 ?? 0)],
  ];
  for (const [label, value] of estData) {
    const lc = pgSheet.getCell(`A${row}`);
    lc.value = label;
    lc.font = { bold: true, size: 10 };
    lc.fill = lightFill(COLORS.lightYellow);
    lc.border = thinBorder();

    pgSheet.mergeCells(`B${row}:E${row}`);
    const vc = pgSheet.getCell(`B${row}`);
    vc.value = typeof value === "number" ? value : 0;
    vc.numFmt = '#,##0.00 "€"';
    vc.border = thinBorder();
    row++;
  }

  row += 1;
  pgSheet.mergeCells(`A${row}:E${row}`);
  const compTitle = pgSheet.getCell(`A${row}`);
  compTitle.value = "ENTREPRISES";
  compTitle.font = headerFont();
  compTitle.fill = headerFill();
  compTitle.border = thinBorder();
  row++;

  pgSheet.getCell(`A${row}`).value = "N° (ordre d'arrivée des plis)";
  pgSheet.getCell(`A${row}`).font = { bold: true, size: 9 };
  pgSheet.getCell(`A${row}`).fill = lightFill(COLORS.lightBlue);
  pgSheet.getCell(`A${row}`).border = thinBorder();
  pgSheet.mergeCells(`B${row}:E${row}`);
  pgSheet.getCell(`B${row}`).value = "Raison sociale";
  pgSheet.getCell(`B${row}`).font = { bold: true, size: 9 };
  pgSheet.getCell(`B${row}`).fill = lightFill(COLORS.lightBlue);
  pgSheet.getCell(`B${row}`).border = thinBorder();
  row++;

  for (const company of activeCompanies) {
    const nc = pgSheet.getCell(`A${row}`);
    nc.value = company.id;
    nc.font = { bold: true, size: 10 };
    nc.border = thinBorder();
    nc.fill = lightFill(COLORS.lightBlue);

    pgSheet.mergeCells(`B${row}:E${row}`);
    const nameCell2 = pgSheet.getCell(`B${row}`);
    nameCell2.value = company.name + (company.status === "ecartee" ? ` (Écartée — ${company.exclusionReason})` : "");
    nameCell2.border = thinBorder();
    if (company.status === "ecartee") {
      nameCell2.font = { color: { argb: COLORS.excluded }, italic: true };
    }
    row++;
  }

  const typedLinesForPg = activeLotLines.filter((l) => l.type);
  if (typedLinesForPg.length > 0) {
    row += 1;
    pgSheet.mergeCells(`A${row}:F${row}`);
    const lotTitle = pgSheet.getCell(`A${row}`);
    const lotTitleParts = (
      [
        typedLinesForPg.some((l) => l.type === "PSE") ? "PSE" : null,
        typedLinesForPg.some((l) => l.type === "VARIANTE") ? "VARIANTE" : null,
        typedLinesForPg.some((l) => l.type === "T_OPTIONNELLE") ? "TRANCHE OPTIONNELLE" : null,
      ] as (string | null)[]
    ).filter((x): x is string => x !== null);
    lotTitle.value = lotTitleParts.join(" / ");
    lotTitle.font = headerFont();
    lotTitle.fill = headerFill();
    lotTitle.border = thinBorder();
    row++;

    ["Type", "N°", "Intitulé", "DPGF", "Est. DPGF 1 (€)", "Est. DPGF 2 (€)"].forEach((h, i) => {
      const col = String.fromCharCode(65 + i);
      const c = pgSheet.getCell(`${col}${row}`);
      c.value = h;
      c.font = { bold: true, size: 9 };
      c.fill = lightFill(COLORS.lightBlue);
      c.border = thinBorder();
    });
    row++;

    const dpgfAssignmentLabel: Record<string, string> = { DPGF_1: "DPGF 1", DPGF_2: "DPGF 2", both: "DPGF 1 et DPGF 2" };
    for (const line of typedLinesForPg) {
      pgSheet.getCell(`A${row}`).value = line.type;
      pgSheet.getCell(`B${row}`).value = line.id;
      pgSheet.getCell(`C${row}`).value = line.label;
      pgSheet.getCell(`D${row}`).value = dpgfAssignmentLabel[line.dpgfAssignment] ?? line.dpgfAssignment;
      pgSheet.getCell(`E${row}`).value = line.estimationDpgf1 ?? 0;
      pgSheet.getCell(`E${row}`).numFmt = '#,##0.00 "€"';
      pgSheet.getCell(`F${row}`).value = line.estimationDpgf2 ?? 0;
      pgSheet.getCell(`F${row}`).numFmt = '#,##0.00 "€"';
      ["A", "B", "C", "D", "E", "F"].forEach((col) => {
        pgSheet.getCell(`${col}${row}`).border = thinBorder();
      });
      row++;
    }
  }

  row += 1;
  pgSheet.mergeCells(`A${row}:E${row}`);
  const weightTitle = pgSheet.getCell(`A${row}`);
  weightTitle.value = "ÉVALUATION TECHNIQUE ET FINANCIÈRE";
  weightTitle.font = headerFont();
  weightTitle.fill = headerFill();
  weightTitle.border = thinBorder();
  row++;

  ["Critère", "Pondération %", "Sous-critères"].forEach((h, i) => {
    const col = String.fromCharCode(65 + i);
    const c = pgSheet.getCell(`${col}${row}`);
    c.value = h;
    c.font = { bold: true, size: 9 };
    c.fill = lightFill(COLORS.lightBlue);
    c.border = thinBorder();
  });
  row++;

  for (const criterion of project.weightingCriteria) {
    if (criterion.weight === 0) continue;

    const hasSub = criterion.subCriteria && criterion.subCriteria.length > 0;
    const subWithWeight = hasSub ? criterion.subCriteria.filter((s) => s.weight > 0) : [];

    if (!hasSub || subWithWeight.length === 0) {
      pgSheet.getCell(`A${row}`).value = criterion.label;
      pgSheet.getCell(`A${row}`).font = { bold: true };
      pgSheet.getCell(`B${row}`).value = criterion.weight;
      pgSheet.getCell(`C${row}`).value = "—";
      ["A", "B", "C"].forEach((col) => {
        pgSheet.getCell(`${col}${row}`).border = thinBorder();
      });
      row++;
      continue;
    }

    pgSheet.getCell(`A${row}`).value = criterion.label;
    pgSheet.getCell(`A${row}`).font = { bold: true };
    pgSheet.getCell(`B${row}`).value = criterion.weight;
    pgSheet.getCell(`C${row}`).value = "";
    ["A", "B", "C"].forEach((col) => {
      pgSheet.getCell(`${col}${row}`).border = thinBorder();
    });
    row++;

    for (const sub of subWithWeight) {
      pgSheet.getCell(`A${row}`).value = sub.label + " (" + sub.weight + " %)";
      pgSheet.getCell(`A${row}`).alignment = { indent: 1 };
      pgSheet.getCell(`A${row}`).font = { underline: true };
      pgSheet.getCell(`B${row}`).value = sub.weight;
      pgSheet.getCell(`C${row}`).value = "";
      ["A", "B", "C"].forEach((col) => {
        pgSheet.getCell(`${col}${row}`).border = thinBorder();
      });
      row++;

      for (const item of sub.items || []) {
        pgSheet.getCell(`A${row}`).value = item.label;
        pgSheet.getCell(`A${row}`).alignment = { horizontal: "right", indent: 2 };
        pgSheet.getCell(`B${row}`).value = "";
        pgSheet.getCell(`C${row}`).value = "";
        ["A", "B", "C"].forEach((col) => {
          pgSheet.getCell(`${col}${row}`).border = thinBorder();
        });
        row++;
      }
    }
  }

  pgSheet.getColumn("A").width = 25;
  pgSheet.getColumn("B").width = 15;
  pgSheet.getColumn("C").width = 30;
  pgSheet.getColumn("D").width = 15;
  pgSheet.getColumn("E").width = 20;
  pgSheet.getColumn("F").width = 20;
  pgSheet.getColumn("G").width = 15;

  // =========== METHODOLOGIE (juste après DONNEES_DU_PROJET) ===========
  buildMethodologySheet(wb, project, baseLabel);

  // =========== VÉRIFICATIONS ADMINISTRATIVES ===========
  buildAdministratifSheet(wb, project, activeCompanies);

  // =========== V0 puis Négo 1, 2… — Onglets par type ===========
  const tabNamesV0 = getTabNames(project.versions.length, 0);
  buildPrixSheet(wb, tabNamesV0.prix, project, v0, activeCompanies, baseLabel);
  buildTechSheet(wb, tabNamesV0.tech, project, v0, activeCompanies);
  buildQuestionsResponsesSheet(wb, tabNamesV0.qr, project, v0, activeCompanies, true);
  buildSyntheseSheet(wb, tabNamesV0.synthese, project, v0, activeCompanies, baseLabel);

  // =========== Négo 1, Négo 2… ===========
  for (let i = 1; i < project.versions.length; i++) {
    const negoVersion = project.versions[i];
    const prevVersion = project.versions[i - 1];
    const prevDecisions = prevVersion.negotiationDecisions ?? {};
    const retainedIds = Object.entries(prevDecisions)
      .filter(([, d]) => d === "retenue" || d === "attributaire")
      .map(([id]) => Number(id));
    const negoCompanies = activeCompanies.filter((c) => retainedIds.includes(c.id));

    if (negoCompanies.length > 0) {
      const tabNames = getTabNames(project.versions.length, i);
      buildPrixSheet(wb, tabNames.prix, project, negoVersion, negoCompanies, baseLabel);
      buildTechSheet(wb, tabNames.tech, project, negoVersion, negoCompanies, prevVersion);
      buildQuestionsResponsesSheet(wb, tabNames.qr, project, negoVersion, negoCompanies);
      // CR négo : un onglet par entreprise, avant la Synthèse
      for (const company of negoCompanies) {
        const companyIdx = project.companies.findIndex((c) => c.id === company.id);
        buildDeroulementCompanySheet(
          wb,
          buildCRSheetName(i, company.name),
          project,
          negoVersion,
          company,
          companyIdx >= 0 ? companyIdx : 0
        );
      }
      buildSyntheseSheet(wb, tabNames.synthese, project, negoVersion, negoCompanies, baseLabel);
    }
  }

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const baseName = project.info.name?.trim() || "Projet";
  const lotSuffix = project.info.lotNumber?.trim() ? `_Lot_${project.info.lotNumber}` : "";
  saveAs(blob, `Analyse_Offres_${baseName}${lotSuffix}.xlsx`);
}

// =============== Export global (tous les projets et lots) ===============

export async function exportAllProjectsToExcel(projects: Record<string, MultiLotProjectData>): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Analyse d'offres - Etudes & Travaux";
  wb.created = new Date();

  const list = Object.values(projects);
  if (list.length === 0) {
    const ws = wb.addWorksheet("Synthèse");
    ws.getCell("A1").value = "Aucun projet.";
    applyWrapTextToAllSheets(wb);
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, "Analyse_Offres_Ensemble_Projets.xlsx");
    return;
  }

  const synthSheet = wb.addWorksheet("Synthèse globale");
  synthSheet.properties.defaultRowHeight = 18;
  const headers = ["Projet", "Réf. marché", "N° Lot", "Libellé lot", "Nb entreprises", "Rédacteur"];
  headers.forEach((h, i) => {
    const c = synthSheet.getCell(1, i + 1);
    c.value = h;
    c.font = headerFont();
    c.fill = headerFill();
    c.border = thinBorder();
  });
  let row = 2;
  for (const project of list) {
    const lots = project.lots ?? [];
    if (lots.length === 0) {
      synthSheet.getCell(row, 1).value = project.info.name || "Sans titre";
      synthSheet.getCell(row, 2).value = project.info.marketRef || "";
      synthSheet.getCell(row, 3).value = "—";
      synthSheet.getCell(row, 4).value = "—";
      synthSheet.getCell(row, 5).value = 0;
      synthSheet.getCell(row, 6).value = project.info.author || "";
      row++;
      continue;
    }
    for (const lot of lots) {
      const n = lot.companies?.filter((c) => c.name?.trim() !== "").length ?? 0;
      synthSheet.getCell(row, 1).value = project.info.name || "Sans titre";
      synthSheet.getCell(row, 2).value = project.info.marketRef || "";
      synthSheet.getCell(row, 3).value = lot.lotNumber || "—";
      synthSheet.getCell(row, 4).value = lot.lotAnalyzed || lot.label || "—";
      synthSheet.getCell(row, 5).value = n;
      synthSheet.getCell(row, 6).value = project.info.author || "";
      row++;
    }
  }
  synthSheet.getColumn(1).width = 28;
  synthSheet.getColumn(2).width = 18;
  synthSheet.getColumn(3).width = 10;
  synthSheet.getColumn(4).width = 22;
  synthSheet.getColumn(5).width = 14;
  synthSheet.getColumn(6).width = 18;

  let sheetIndex = 0;
  for (const p of list) {
    for (const lot of p.lots ?? []) {
      const base = `${(p.info.name || "Projet").slice(0, 10)}_L${(lot.lotNumber || lot.label || "1").slice(0, 6)}`.replace(/[/\\*?\[\]:]/g, "_");
      const safeName = `${base}_${sheetIndex}`.slice(0, 31);
      const ws = wb.addWorksheet(safeName);
      ws.getCell("A1").value = `Projet : ${p.info.name || "—"}`;
      ws.getCell("A2").value = `Lot : ${lot.lotNumber || "—"} — ${lot.lotAnalyzed || lot.label || "—"}`;
      ws.getCell("A3").value = `Entreprises : ${(lot.companies?.filter((c) => c.name?.trim() !== "").length ?? 0)}`;
      ws.getCell("A1").font = { bold: true };
      ws.getCell("A2").font = { bold: true };
      sheetIndex++;
    }
  }

  applyWrapTextToAllSheets(wb);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `Analyse_Offres_Ensemble_Projets_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
