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
} from "@/types/project";
import type { ProjectData as MultiLotProjectData } from "@/types/project";

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

// ─── Dynamic Synthèse label for export ───────────────────────────────────────
function getExportSyntheseLabel(versions: NegotiationVersion[], versionIndex: number): string {
  const total = versions.length;
  if (total === 1) {
    const decisions = versions[0]?.negotiationDecisions ?? {};
    const vals = Object.values(decisions);
    const hasAttrib = vals.some(d => d === "attributaire");
    const allDecided = vals.length > 0 && vals.every(d => d !== "non_defini");
    const hasRetenue = vals.some(d => d === "retenue");
    if (hasAttrib || (allDecided && !hasRetenue && vals.length > 0)) return "SYNTHESE_FINALE";
    return "SYNTHESE";
  }
  if (versionIndex === 0) return "SYNTHESE_INITIALE";
  if (versionIndex === total - 1) return "SYNTHESE_FINALE";
  return "SYNTHESE_INTERMEDIAIRE";
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

  // ── Row 3: Sub-header (Appréciation / Note) ──
  ws.getCell(row, COL_LABEL).value = "";
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
  ws.getCell(row, COL_LABEL).border = thinBorder();
  ws.getRow(row).height = 18;

  activeCompanies.forEach((company, idx) => {
    const colA = companyColStart(idx);
    const colB = colA + 1;
    const pastel = companyPastelArgb(idx);

    const appCell = ws.getCell(row, colA);
    appCell.value = "Appréciation";
    appCell.font = { bold: true, size: 9 };
    appCell.fill = solidFill(pastel);
    appCell.alignment = { horizontal: "center" };
    appCell.border = thinBorder();

    const noteCell = ws.getCell(row, colB);
    noteCell.value = `Note/${maxTechWeight}`;
    noteCell.font = { bold: true, size: 9 };
    noteCell.fill = solidFill(pastel);
    noteCell.alignment = { horizontal: "center" };
    noteCell.border = thinBorder();
  });
  row++;

  // ── Helper to compute criterion score ──
  const getCriterionScore = (companyId: number, criterionId: string): { notation: string; score: number; note: any; subScores: { sub: any; notation: string; score: number; note: any }[] } => {
    const criterion = project.weightingCriteria.find((c) => c.id === criterionId)!;
    if (!criterion) return { notation: "—", score: 0, note: undefined, subScores: [] };

    if (criterion.subCriteria.length > 0) {
      const subTotal = criterion.subCriteria.reduce((s, sc) => s + sc.weight, 0);
      let total = 0;
      const subScores = criterion.subCriteria.map((sub) => {
        const note = version.technicalNotes.find(
          (n) => n.companyId === companyId && n.criterionId === criterionId && n.subCriterionId === sub.id
        );
        const val = note?.notation ? NOTATION_VALUES[note.notation] : 0;
        const w = subTotal > 0 ? sub.weight / subTotal : 0;
        const score = (val * w / 5) * criterion.weight;
        total += score;
        return { sub, notation: note?.notation ? NOTATION_LABELS[note.notation] : "—", score, note };
      });
      return { notation: "—", score: total, note: undefined, subScores };
    } else {
      const note = version.technicalNotes.find(
        (n) => n.companyId === companyId && n.criterionId === criterionId && !n.subCriterionId
      );
      const val = note?.notation ? NOTATION_VALUES[note.notation] : 0;
      const score = (val / 5) * criterion.weight;
      return { notation: note?.notation ? NOTATION_LABELS[note.notation] : "—", score, note, subScores: [] };
    }
  };

  // ── Per criterion rows ──
  for (const criterion of technicalCriteria) {
    const hasSubCriteria = criterion.subCriteria.length > 0;
    const subTotal = hasSubCriteria ? criterion.subCriteria.reduce((s, sc) => s + sc.weight, 0) : 0;

    if (hasSubCriteria) {
      // For each sub-criterion: one block of rows
      for (const sub of criterion.subCriteria) {
        const subWeight = subTotal > 0 ? sub.weight / subTotal : 0;

        // ── Sub-header row ──
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
          const score = (val * subWeight / 5) * criterion.weight;

          const appCell = ws.getCell(row, colA);
          appCell.value = note?.notation ? NOTATION_LABELS[note.notation] : "—";
          appCell.font = { bold: true, size: 9 };
          appCell.fill = solidFill(pastel);
          appCell.alignment = { horizontal: "center", vertical: "middle" };
          appCell.border = thinBorder();

          const noteCell = ws.getCell(row, colB);
          noteCell.value = Number(score.toFixed(2));
          noteCell.numFmt = "0.00";
          noteCell.font = { size: 9 };
          noteCell.fill = solidFill(pastel);
          noteCell.alignment = { horizontal: "center", vertical: "middle" };
          noteCell.border = thinBorder();
        });
        row++;

        // ── Comments rows (Points Positifs + Points Négatifs) ──
        // Positifs
        ws.getCell(row, COL_LABEL).value = "Points Positifs";
        ws.getCell(row, COL_LABEL).font = { italic: true, size: 9, color: { argb: "FF2E7D32" } };
        ws.getCell(row, COL_LABEL).fill = lightFill("F0FBF0");
        ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
        ws.getCell(row, COL_LABEL).border = thinBorder();
        ws.getRow(row).height = 55;

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
        ws.getCell(row, COL_LABEL).value = "Points Négatifs";
        ws.getCell(row, COL_LABEL).font = { italic: true, size: 9, color: { argb: "FFC62828" } };
        ws.getCell(row, COL_LABEL).fill = lightFill("FFF8F8");
        ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
        ws.getCell(row, COL_LABEL).border = thinBorder();
        ws.getRow(row).height = 55;

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
      }

      // ── Sous-total critère row ──
      ws.getCell(row, COL_LABEL).value = `Total — ${criterion.label} (/${criterion.weight} pts)`;
      ws.getCell(row, COL_LABEL).font = { bold: true, size: 10 };
      ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightGreen);
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = 18;

      activeCompanies.forEach((company, idx) => {
        const colA = companyColStart(idx);
        const colB = colA + 1;
        const scores = getCriterionScore(company.id, criterion.id);

        ws.mergeCells(row, colA, row, colB);
        const cell = ws.getCell(row, colA);
        cell.value = Number(scores.score.toFixed(2));
        cell.numFmt = "0.00";
        cell.font = { bold: true, size: 10 };
        cell.fill = lightFill(COLORS.lightGreen);
        cell.alignment = { horizontal: "center" };
        cell.border = thinBorder();
      });
      row++;

    } else {
      // No sub-criteria: single row for notation
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

      // Comments for simple criterion
      ws.getCell(row, COL_LABEL).value = "Points Positifs";
      ws.getCell(row, COL_LABEL).font = { italic: true, size: 9, color: { argb: "FF2E7D32" } };
      ws.getCell(row, COL_LABEL).fill = lightFill("F0FBF0");
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = 55;

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

      ws.getCell(row, COL_LABEL).value = "Points Négatifs";
      ws.getCell(row, COL_LABEL).font = { italic: true, size: 9, color: { argb: "FFC62828" } };
      ws.getCell(row, COL_LABEL).fill = lightFill("FFF8F8");
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = 55;

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
    }

    // Empty separator
    ws.getRow(row).height = 6;
    row++;
  }

  // ── Note totale sur 100 ──
  ws.getCell(row, COL_LABEL).value = `Note totale sur ${maxTechWeight}`;
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 10, color: { argb: COLORS.darkText } };
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightYellow);
  ws.getCell(row, COL_LABEL).border = thinBorder();
  ws.getRow(row).height = 20;

  const totalScores: Record<number, number> = {};
  activeCompanies.forEach((company, idx) => {
    const colA = companyColStart(idx);
    const colB = colA + 1;
    let total = 0;
    for (const criterion of technicalCriteria) {
      total += getCriterionScore(company.id, criterion.id).score;
    }
    totalScores[company.id] = total;
    ws.mergeCells(row, colA, row, colB);
    const cell = ws.getCell(row, colA);
    cell.value = `Note de ${total.toFixed(0)} sur ${maxTechWeight}`;
    cell.font = { bold: true, size: 10 };
    cell.fill = lightFill(COLORS.lightYellow);
    cell.alignment = { horizontal: "center" };
    cell.border = thickBorder();
  });
  row++;

  // ── Note technique pondérée ──
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
    cell.numFmt = "0.00";
    cell.font = { bold: true, size: 10 };
    cell.fill = lightFill(COLORS.lightOrange);
    cell.alignment = { horizontal: "center" };
    cell.border = thickBorder();
  });
  row += 2;

  // ── Environnemental ──
  if (envCrit) {
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
      const score = (val / 5) * envCrit.weight;
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

    // Comments
    ws.getCell(row, COL_LABEL).value = "Commentaire Environnemental";
    ws.getCell(row, COL_LABEL).font = { italic: true, size: 9 };
    ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 55;

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
      const score = (val / 5) * planCrit.weight;
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

    ws.getCell(row, COL_LABEL).value = "Commentaire Planning";
    ws.getCell(row, COL_LABEL).font = { italic: true, size: 9 };
    ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 55;

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
  ws.getCell(row, COL_LABEL).value = "Document à vérifier";
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 9, color: { argb: "FFE65100" } };
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightOrange);
  ws.getCell(row, COL_LABEL).border = thinBorder();
  ws.getRow(row).height = 55;

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

  // ── Volets figés (colonne A + lignes 1–2) ──
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 3, topLeftCell: "B4", activeCell: "B4" }];

  // ── Column widths ──
  ws.getColumn(COL_LABEL).width = 28;
  activeCompanies.forEach((_, idx) => {
    ws.getColumn(companyColStart(idx)).width = 22;
    ws.getColumn(companyColStart(idx) + 1).width = 10;
  });
}

// ─── Analyse Prix — Entreprises en colonnes ───────────────────────────────────
function buildPrixSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  project: ProjectData,
  version: NegotiationVersion,
  companies: typeof project.companies
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

  // ── Section: Tranche Ferme — 1 ligne DPGF 1, 1 ligne DPGF 2 (si coché), 1 ligne Total TF ──
  ws.mergeCells(row, COL_LABEL, row, lastCol);
  const tfHeader = ws.getCell(row, COL_LABEL);
  tfHeader.value = "TRANCHE FERME (hors PSE, Variante et Tranche Optionnelle)";
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
  ws.getCell(row, COL_LABEL).value = `Total TF (DPGF 1 et DPGF 2) — Estimé à ${estBaseTotalLabel.toLocaleString("fr-FR")} € HT`;
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

  // ── Tous les scénarios possibles : TF+TO, puis chaque combinaison de PSE, puis chaque combinaison de Variantes, puis Total ──
  type ScenarioLine = { label: string; estLabel: string; lines: typeof activeLotLines; fillColor: string };
  const estBase = (project.info.estimationDpgf1 ?? 0) + (project.info.estimationDpgf2 ?? 0);
  const estLine = (l: typeof activeLotLines[0]) => hasDpgf2 ? (l.estimationDpgf1 ?? 0) + (l.estimationDpgf2 ?? 0) : (l.estimationDpgf1 ?? 0);
  const estPse = pseLines.reduce((s, l) => s + estLine(l), 0);
  const estVar = varianteLines.reduce((s, l) => s + estLine(l), 0);
  const estTo = toLines.reduce((s, l) => s + estLine(l), 0);

  /** Génère tous les sous-ensembles non vides : d'abord singletons (1, 2, 3…), puis paires (1+2, 1+3…), etc. */
  function nonEmptySubsets<T>(arr: T[]): T[][] {
    if (arr.length === 0) return [];
    const out: T[][] = [];
    for (let k = 1; k <= arr.length; k++) {
      const stack: { start: number; path: T[] } = [{ start: 0, path: [] }];
      while (stack.length) {
        const { start, path } = stack.pop()!;
        if (path.length === k) {
          out.push([...path]);
          continue;
        }
        for (let i = arr.length - 1; i >= start; i--) {
          stack.push({ start: i + 1, path: [...path, arr[i]] });
        }
      }
    }
    return out;
  }

  const pseSubsets = nonEmptySubsets(pseLines);
  const varSubsets = nonEmptySubsets(varianteLines);

  const baseAndTo = [...baseLines, ...toLines];
  const scenarios: ScenarioLine[] = [];

  // 1) Toujours : Tranche ferme + Tranche optionnelle
  scenarios.push({
    label: `TOTAL TF + Tranche Optionnelle — Estimé à ${(estBase + estTo).toLocaleString("fr-FR")} € HT`,
    estLabel: "",
    lines: baseAndTo,
    fillColor: COLORS.white,
  });

  // 2) Chaque combinaison de PSE (PSE 1 seule, PSE 2 seule, PSE 1+2, …)
  for (const subset of pseSubsets) {
    const est = subset.reduce((s, l) => s + estLine(l), 0);
    const names = subset.map((_, i) => `PSE N°${pseLines.indexOf(subset[i]) + 1}`).join(" + ");
    scenarios.push({
      label: `TOTAL TF + Tranches Optionnelles + ${names} — Estimé à ${(estBase + estTo + est).toLocaleString("fr-FR")} € HT`,
      estLabel: "",
      lines: [...baseAndTo, ...subset],
      fillColor: COLORS.white,
    });
  }

  // 3) Chaque combinaison de Variantes (Variante 1 seule, Variante 2 seule, V1+V2, …)
  for (const subset of varSubsets) {
    const est = subset.reduce((s, l) => s + estLine(l), 0);
    const names = subset.map((_, i) => `Variante N°${varianteLines.indexOf(subset[i]) + 1}`).join(" + ");
    scenarios.push({
      label: `TOTAL TF + Tranches Optionnelles + ${names} — Estimé à ${(estBase + estTo + est).toLocaleString("fr-FR")} € HT`,
      estLabel: "",
      lines: [...baseAndTo, ...subset],
      fillColor: COLORS.white,
    });
  }

  // 4) Total général (uniquement s'il y a au moins une PSE ou une variante, pour éviter doublon avec le premier scénario)
  const hasPseOrVar = pseLines.length > 0 || varianteLines.length > 0;
  if (hasPseOrVar) {
    scenarios.push({
      label: `TOTAL GÉNÉRAL (TF + Tranches Optionnelles + PSE + Variantes) — Estimé à ${(estBase + estPse + estVar + estTo).toLocaleString("fr-FR")} € HT`,
      estLabel: "",
      lines: [...baseAndTo, ...pseLines, ...varianteLines],
      fillColor: COLORS.lightGreen,
    });
  }

  const scenarioStartRow = row;
  for (const scenario of scenarios) {
    ws.getCell(row, COL_LABEL).value = scenario.label;
    ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
    ws.getCell(row, COL_LABEL).fill = lightFill(scenario.fillColor);
    ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "middle" };
    ws.getCell(row, COL_LABEL).border = thickBorder();
    ws.getRow(row).height = 22;

    activeCompanies.forEach((company, idx) => {
      const col = companyCol(idx);
      const total = getTotal(company.id, scenario.lines, true);
      const cell = ws.getCell(row, col);
      cell.value = total || null;
      if (total) cell.numFmt = '#,##0.00 "€"';
      cell.font = { bold: true, size: 9 };
      cell.fill = lightFill(scenario.fillColor);
      cell.alignment = { horizontal: "right" };
      cell.border = thickBorder();
    });
    row++;
  }

  ws.getRow(row).height = 6;
  row++;

  // ── Notes de prix par scénario (même ordre que les scénarios totaux) ──
  const noteRows = scenarios.map((sc, i) => ({
    label: i === scenarios.length - 1 && hasPseOrVar ? `NOTE DU PRIX GLOBAL (/${prixWeight}) — Scénario TOTAL GÉNÉRAL` : `NOTE DU PRIX (/${prixWeight}) — ${sc.label.split(" — ")[0]}`,
    lines: sc.lines,
    fillColor: sc.fillColor === COLORS.lightGreen ? "FFB3B3" : i % 3 === 0 ? "BFE9FF" : i % 3 === 1 ? "B8F0C8" : "FFE8A0",
    isBold: sc.fillColor === COLORS.lightGreen,
  }));

  for (const noteRow of noteRows) {
    const totals = activeCompanies.map((company) => getTotal(company.id, noteRow.lines, true));
    const validTotals = totals.filter((t) => t > 0);
    const minTotal = validTotals.length > 0 ? Math.min(...validTotals) : 0;

    ws.getCell(row, COL_LABEL).value = noteRow.label;
    ws.getCell(row, COL_LABEL).font = { bold: true, size: 9, color: noteRow.isBold ? { argb: "FF8B0000" } : { argb: "FF1F4E79" } };
    ws.getCell(row, COL_LABEL).fill = lightFill(noteRow.fillColor);
    ws.getCell(row, COL_LABEL).alignment = { wrapText: true };
    ws.getCell(row, COL_LABEL).border = thickBorder();
    ws.getRow(row).height = 22;

    activeCompanies.forEach((company, idx) => {
      const col = companyCol(idx);
      const total = totals[idx];
      const notePrice = total > 0 && minTotal > 0 ? Number(((minTotal / total) * prixWeight).toFixed(2)) : 0;
      const cell = ws.getCell(row, col);
      cell.value = notePrice || "—";
      if (typeof notePrice === "number" && notePrice > 0) cell.numFmt = "0.00";
      cell.font = { bold: true, size: 11, color: noteRow.isBold ? { argb: "FF8B0000" } : { argb: "FF1F4E79" } };
      cell.fill = lightFill(noteRow.fillColor);
      cell.alignment = { horizontal: "center" };
      cell.border = thickBorder();
    });
    row++;
  }

  ws.getRow(row).height = 6;
  row++;

  // ── Écart global / estimation (formule + formatage conditionnel ±toleranceSeuil %) ──
  {
    const estTotalAll = estBase + estPse + estVar + estTo;
    const totalGeneralRow = hasPseOrVar ? scenarioStartRow + scenarios.length - 1 : scenarioStartRow;
    ws.getCell(row, COL_LABEL).value = `ÉCART GLOBAL / ESTIMATION (${estTotalAll.toLocaleString("fr-FR")} €) — Seuil ±${toleranceSeuil}%`;
    ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
    ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightRed);
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 18;

    activeCompanies.forEach((company, idx) => {
      const colIdx = companyCol(idx);
      const total = getTotal(company.id, activeLotLines, true);
      const cell = ws.getCell(row, colIdx);
      if (estTotalAll > 0) {
        cell.value = { formula: `=(${colLetter(colIdx)}${totalGeneralRow}-${estTotalAll})/${estTotalAll}*100` };
        cell.numFmt = '+0.00%;-0.00%;0%';
        const dev = total > 0 ? ((total - estTotalAll) / Math.abs(estTotalAll)) * 100 : 0;
        const absDev = Math.abs(dev);
        const halfSeuil = toleranceSeuil / 2;
        cell.font = { bold: true, color: { argb: absDev <= halfSeuil ? "FF2E7D32" : absDev <= toleranceSeuil ? "FFE65100" : "FFC62828" } };
        cell.fill = lightFill(absDev <= halfSeuil ? "E8F5E9" : absDev <= toleranceSeuil ? "FFF3E0" : "FFEBEE");
      } else {
        cell.value = "—";
        cell.fill = lightFill(COLORS.lightRed);
      }
      cell.alignment = { horizontal: "center" };
      cell.border = thinBorder();
    });
  }

  // ── Volets figés (colonne A + lignes 1–2) ──
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 2, topLeftCell: "B3", activeCell: "B3" }];

  // ── Column widths ──
  ws.getColumn(COL_LABEL).width = 42;
  activeCompanies.forEach((_, idx) => {
    ws.getColumn(companyCol(idx)).width = 16;
  });
}

function buildSyntheseSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  project: ProjectData,
  version: NegotiationVersion,
  companies: typeof project.companies
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
  const vtWeight = valueTechnique.reduce((s, c) => s + c.weight, 0);
  const envW = envCrit?.weight ?? 0;
  const planW = planCrit?.weight ?? 0;
  const maxGlobal = vtWeight + envW + planW + prixWeight;

  let sRow = 1;
  const lastSynthColLetter = colLetter(1 + companies.length);
  synthSheet.mergeCells(`B${sRow}:${lastSynthColLetter}${sRow}`);
  const synthTitle = synthSheet.getCell(`B${sRow}`);
  synthTitle.value = `${project.info.name || "Projet"} — Lot n° ${project.info.lotNumber || ""} — ${sheetName}`;
  synthTitle.font = { bold: true, size: 12, color: { argb: COLORS.darkText } };
  synthTitle.fill = lightFill(COLORS.lightBlue);
  synthTitle.border = thinBorder();
  sRow++;

  synthSheet.getCell(`B${sRow}`).value = `Date d'analyse : ${version.analysisDate || "—"}`;
  synthSheet.getCell(`B${sRow}`).font = { italic: true, size: 9 };
  if (version.validated && version.validatedAt) {
    synthSheet.getCell(`D${sRow}`).value = `Validée le : ${new Date(version.validatedAt).toLocaleDateString("fr-FR")}`;
    synthSheet.getCell(`D${sRow}`).font = { italic: true, size: 9, color: { argb: "2E7D32" } };
  }
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
        criterionScore = (raw / 5) * criterion.weight;
      } else {
        const note = version.technicalNotes.find(
          (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
        );
        if (note?.notation) {
          criterionScore = (NOTATION_VALUES[note.notation] / 5) * criterion.weight;
        }
      }

      if (criterion.id === "environnemental") envScore = criterionScore;
      else if (criterion.id === "planning") planScore = criterionScore;
      else techScore += criterionScore;
    }

    const baseEntry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === 0);
    let priceTotal = (baseEntry?.dpgf1 ?? 0) + (baseEntry?.dpgf2 ?? 0);
    for (const line of activeLotLines) {
      const entry = version.priceEntries.find(
        (e) => e.companyId === company.id && e.lotLineId === line.id
      );
      priceTotal += (entry?.dpgf1 ?? 0) + (entry?.dpgf2 ?? 0);
    }

    synthResults.push({ company, priceTotal, priceScore: 0, techScore, envScore, planScore, globalScore: 0 });
  }

  const validSynthPrices = synthResults.filter((r) => r.company.status !== "ecartee" && r.priceTotal > 0);
  const minSynthPrice = validSynthPrices.length > 0 ? Math.min(...validSynthPrices.map((r) => r.priceTotal)) : 0;
  for (const r of synthResults) {
    if (r.company.status === "ecartee") continue;
    r.priceScore = r.priceTotal > 0 ? (minSynthPrice / r.priceTotal) * prixWeight : 0;
    r.globalScore = r.techScore + r.envScore + r.planScore + r.priceScore;
  }

  const sortedSynth = [...synthResults].sort((a, b) => {
    if (a.company.status === "ecartee" && b.company.status !== "ecartee") return 1;
    if (a.company.status !== "ecartee" && b.company.status === "ecartee") return -1;
    return b.globalScore - a.globalScore;
  });

  const COL_LABEL = 1;
  const synthCompanyCol = (idx: number) => 2 + idx;
  const lastSynthDataCol = synthCompanyCol(sortedSynth.length - 1);

  // Tableau transposé : critères en lignes (A), entreprises en colonnes (B, C, D…)
  const headerRow = sRow;
  synthSheet.getCell(headerRow, COL_LABEL).value = "Critère";
  synthSheet.getCell(headerRow, COL_LABEL).font = headerFont();
  synthSheet.getCell(headerRow, COL_LABEL).fill = headerFill();
  synthSheet.getCell(headerRow, COL_LABEL).border = thinBorder();
  synthSheet.getCell(headerRow, COL_LABEL).alignment = { horizontal: "center", wrapText: true };
  sortedSynth.forEach((r, idx) => {
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

  const criteriaRows: { label: string; getVal: (r: SynthResult) => string | number; numFmt?: string }[] = [
    { label: "Montant Total HT", getVal: (r) => (r.company.status === "ecartee" ? "—" : r.priceTotal), numFmt: '#,##0.00 "€"' },
    { label: `Note Prix (/${prixWeight})`, getVal: (r) => Number(r.priceScore.toFixed(2)) },
    { label: `Note Technique (/${vtWeight})`, getVal: (r) => (r.company.status === "ecartee" ? "—" : Number(r.techScore.toFixed(1))) },
    { label: `Note Enviro. (/${envW})`, getVal: (r) => (r.company.status === "ecartee" ? "—" : Number(r.envScore.toFixed(1))) },
    { label: `Note Planning (/${planW})`, getVal: (r) => (r.company.status === "ecartee" ? "—" : Number(r.planScore.toFixed(1))) },
    { label: `Note Globale (/${maxGlobal})`, getVal: (r) => (r.company.status === "ecartee" ? "—" : Number(r.globalScore.toFixed(2))) },
  ];

  for (const cr of criteriaRows) {
    synthSheet.getCell(sRow, COL_LABEL).value = cr.label;
    synthSheet.getCell(sRow, COL_LABEL).font = cr.label.startsWith("Note Globale") ? { bold: true, size: 10 } : { size: 10 };
    synthSheet.getCell(sRow, COL_LABEL).fill = lightFill(COLORS.lightBlue);
    synthSheet.getCell(sRow, COL_LABEL).border = thinBorder();
    synthSheet.getCell(sRow, COL_LABEL).alignment = { horizontal: "left" };
    sortedSynth.forEach((r, idx) => {
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
        const compIdx = sortedSynth.filter((x) => x.company.status !== "ecartee").indexOf(r);
        cell.fill = lightFill(companyPastelArgb(compIdx >= 0 ? compIdx : 0));
      }
    });
    sRow++;
  }

  // Classement
  synthSheet.getCell(sRow, COL_LABEL).value = "Classement";
  synthSheet.getCell(sRow, COL_LABEL).font = { bold: true, size: 10 };
  synthSheet.getCell(sRow, COL_LABEL).fill = lightFill(COLORS.lightBlue);
  synthSheet.getCell(sRow, COL_LABEL).border = thinBorder();
  let rank = 0;
  sortedSynth.forEach((r, idx) => {
    const col = synthCompanyCol(idx);
    const cell = synthSheet.getCell(sRow, col);
    if (r.company.status === "ecartee") {
      cell.value = "—";
      cell.fill = lightFill(COLORS.lightRed);
      cell.font = { italic: true, color: { argb: COLORS.excluded } };
    } else {
      rank++;
      cell.value = rank;
      cell.font = { bold: true };
      cell.fill = lightFill(companyPastelArgb(rank - 1));
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
  sortedSynth.forEach((r, idx) => {
    const col = synthCompanyCol(idx);
    const cell = synthSheet.getCell(sRow, col);
    const decision: NegotiationDecision = (version.negotiationDecisions ?? {})[r.company.id] ?? "non_defini";
    cell.value = r.company.status === "ecartee" ? "Écartée" : NEGOTIATION_DECISION_LABELS[decision];
    cell.border = thinBorder();
    cell.alignment = { horizontal: "center" };
    if (r.company.status === "ecartee") {
      cell.fill = lightFill(COLORS.lightRed);
      cell.font = { italic: true, color: { argb: COLORS.excluded } };
    } else {
      const isRetained = decision === "retenue" || decision === "attributaire";
      cell.font = { bold: true, color: { argb: isRetained ? "2E7D32" : COLORS.excluded } };
      const compIdx = sortedSynth.filter((x) => x.company.status !== "ecartee").indexOf(r);
      cell.fill = lightFill(companyPastelArgb(compIdx >= 0 ? compIdx : 0));
    }
  });
  sRow += 2;

  // Volets figés Synthèse (colonne A + ligne 1)
  synthSheet.views = [{ state: "frozen", xSplit: 1, ySplit: 3, topLeftCell: "B4", activeCell: "B4" }];

  // Attributaire block
  const allDecisions = version.negotiationDecisions ?? {};
  const attributaireEntry = sortedSynth.find(
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
      const attrRank = sortedSynth.filter((r) => r.company.status !== "ecartee").indexOf(attributaireEntry) + 1;
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
      synthSheet.getCell(`B${sRow}`).value = `L'entreprise ${attributaireEntry.company.name} est retenue pour un montant de ${fmtEuro(attributaireEntry.priceTotal)} HT, incluant la Solution de Base${optionLabels.length > 0 ? ` + ${optionLabels.join(", ")}` : ""}.`;
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
      synthSheet.getCell(`B${sRow}`).value = "• Solution de Base (Tranche Ferme)";
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
      synthSheet.getCell(`B${sRow}`).value = `Montant final HT : ${fmtEuro(attributaireEntry.priceTotal)}`;
      synthSheet.getCell(`B${sRow}`).font = { bold: true, size: 10 };
      sRow += 2;
    }

    const excludedCompanies = companies.filter((c) => c.status === "ecartee");
    const nonRetenues = companies.filter(
      (c) => c.status !== "ecartee" && allDecisions[c.id] === "non_retenue"
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
        synthSheet.getCell(`B${sRow}`).value = `${c.name} — Non retenue`;
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

    synthSheet.getCell(`B${sRow}`).value = "Notes de prix pour chaque scénario (Base + option individuelle), y compris ceux non retenus.";
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
          score = (raw / 5) * criterion.weight;
        } else {
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
          );
          if (note?.notation) score = (NOTATION_VALUES[note.notation] / 5) * criterion.weight;
        }
        total += score;
      }
      scenTechScores[company.id] = total;
    }

    {
      synthSheet.mergeCells(`B${sRow}:H${sRow}`);
      const tfTitle = synthSheet.getCell(`B${sRow}`);
      tfTitle.value = "Tranche Ferme (Base seule)";
      tfTitle.font = { bold: true, size: 10, color: { argb: COLORS.headerFont } };
      tfTitle.fill = headerFill();
      tfTitle.border = thinBorder();
      sRow++;

      ["Entreprise", "Prix Base (€ HT)", `Note Tech`, `Note Prix (/${prixWeight})`, `Note Globale (/${maxGlobal})`, "Rang"].forEach((h, i) => {
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
      secTitle.value = `Base + ${label}`;
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
    synthSheet.getColumn(i).width = 18;
  }
}

function buildMethodologySheet(wb: ExcelJS.Workbook, project: ProjectData) {
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

  methSheet.getCell(row, 1).value = "Chaque critère est noté sur une échelle de 1 à 5, puis pondéré selon le barème suivant :";
  methSheet.getCell(row, 1).font = { size: 10 };
  row += 2;

  const techCriteria = project.weightingCriteria.filter((c) => c.id !== "prix" && c.weight > 0);
  const notationHeaders = ["Appréciation", "Note / 5"];
  for (const c of techCriteria) {
    notationHeaders.push(`Sur ${c.weight} pts`);
  }
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
    ["Très bien", 5],
    ["Bien", 4],
    ["Moyen", 3],
    ["Passable", 2],
    ["Insuffisant", 1],
  ];
  for (const [label, value] of notationScale) {
    methSheet.getCell(row, 1).value = label;
    methSheet.getCell(row, 1).border = thinBorder();
    methSheet.getCell(row, 1).font = { bold: true };
    methSheet.getCell(row, 2).value = `${value} / 5`;
    methSheet.getCell(row, 2).border = thinBorder();
    methSheet.getCell(row, 2).alignment = { horizontal: "center" };
    let col = 3;
    for (const c of techCriteria) {
      const weighted = (value / 5) * c.weight;
      const wCell = methSheet.getCell(row, col);
      wCell.value = Number(weighted.toFixed(1));
      wCell.border = thinBorder();
      wCell.alignment = { horizontal: "center" };
      col++;
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

    methSheet.getCell(row, 1).value = "Base seule";
    methSheet.getCell(row, 1).border = thinBorder();
    methSheet.getCell(row, 2).value = "Tranche Ferme (DPGF)";
    methSheet.getCell(row, 2).border = thinBorder();
    methSheet.getCell(row, 3).value = "Solution de base uniquement";
    methSheet.getCell(row, 3).border = thinBorder();
    row++;

    const pseLines = typedLines.filter((l) => l.type === "PSE");
    const varianteLines = typedLines.filter((l) => l.type === "VARIANTE");
    const toLines = typedLines.filter((l) => l.type === "T_OPTIONNELLE");

    if (pseLines.length > 0) {
      methSheet.getCell(row, 1).value = "Base + PSE";
      methSheet.getCell(row, 1).border = thinBorder();
      methSheet.getCell(row, 2).value = `TF + ${pseLines.map((l) => l.label).join(", ")}`;
      methSheet.getCell(row, 2).border = thinBorder();
      methSheet.getCell(row, 3).value = "Solution de base avec toutes les PSE";
      methSheet.getCell(row, 3).border = thinBorder();
      row++;
    }
    if (varianteLines.length > 0) {
      methSheet.getCell(row, 1).value = "Base + Variantes";
      methSheet.getCell(row, 1).border = thinBorder();
      methSheet.getCell(row, 2).value = `TF + ${varianteLines.map((l) => l.label).join(", ")}`;
      methSheet.getCell(row, 2).border = thinBorder();
      methSheet.getCell(row, 3).value = "Solution de base avec toutes les Variantes";
      methSheet.getCell(row, 3).border = thinBorder();
      row++;
    }
    if (toLines.length > 0) {
      methSheet.getCell(row, 1).value = "Base + Tranches Optionnelles";
      methSheet.getCell(row, 1).border = thinBorder();
      methSheet.getCell(row, 2).value = `TF + ${toLines.map((l) => l.label).join(", ")}`;
      methSheet.getCell(row, 2).border = thinBorder();
      methSheet.getCell(row, 3).value = "Solution de base avec toutes les Tranches Optionnelles";
      methSheet.getCell(row, 3).border = thinBorder();
      row++;
    }
    if (pseLines.length > 0 && toLines.length > 0) {
      methSheet.getCell(row, 1).value = "Base + PSE + Tranches Optionnelles";
      methSheet.getCell(row, 1).border = thinBorder();
      methSheet.getCell(row, 2).value = `TF + ${[...pseLines, ...toLines].map((l) => l.label).join(", ")}`;
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

// =============== Main export function ===============

export async function exportToExcel(project: ProjectData) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Analyse d'offres - Etudes & Travaux";
  wb.created = new Date();

  const activeCompanies = project.companies.filter((c) => c.name.trim() !== "");
  const activeLotLines = project.lotLines.filter((l) => l.label.trim() !== "");
  const v0 = project.versions[0];
  if (!v0) return;

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

  row += 1;
  pgSheet.mergeCells(`A${row}:F${row}`);
  const lotTitle = pgSheet.getCell(`A${row}`);
  lotTitle.value = "PSE / VARIANTE / TRANCHE OPTIONNELLE";
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
  for (const line of activeLotLines) {
    pgSheet.getCell(`A${row}`).value = line.type || "—";
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

  // =========== Analyse Initiale (V0) — Onglets par type (Prix avant Technique) ──
  buildPrixSheet(wb, "Analyse Initiale - Prix", project, v0, activeCompanies);
  buildTechSheet(wb, "Analyse Initiale - Technique", project, v0, activeCompanies);
  buildSyntheseSheet(wb, "Analyse Initiale - Synthèse", project, v0, activeCompanies);

  // =========== Methodology ===========
  buildMethodologySheet(wb, project);

  // =========== Négo 1, Négo 2… — Un onglet par phase et par type ──
  for (let i = 1; i < project.versions.length; i++) {
    const negoVersion = project.versions[i];
    const negoRound = i;

    const prevVersion = project.versions[i - 1];
    const prevDecisions = prevVersion.negotiationDecisions ?? {};
    const retainedIds = Object.entries(prevDecisions)
      .filter(([, d]) => d === "retenue" || d === "attributaire")
      .map(([id]) => Number(id));

    const negoCompanies = activeCompanies.filter((c) => retainedIds.includes(c.id));

    if (negoCompanies.length > 0) {
      buildPrixSheet(wb, `Négo ${negoRound} - Prix`, project, negoVersion, negoCompanies);
      buildTechSheet(wb, `Négo ${negoRound} - Technique`, project, negoVersion, negoCompanies, prevVersion);
      buildSyntheseSheet(wb, `Négo ${negoRound} - Synthèse`, project, negoVersion, negoCompanies);
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

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `Analyse_Offres_Ensemble_Projets_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
