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
    // Modified or deleted text: strike red + new green
    if (prv) {
      parts.push({ text: prv, font: { strike: true, color: { argb: "FFC62828" }, size: 10 } });
    }
    if (cur) {
      if (prv) parts.push({ text: "\n" });
      parts.push({ text: cur, font: { color: { argb: "FF2E7D32" }, size: 10 } });
    }
  }
  return parts.length > 0 ? { richText: parts } : cur;
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
    (c) => c.id !== "prix" && c.id !== "environnemental" && c.id !== "planning"
  );
  const envCrit = project.weightingCriteria.find((c) => c.id === "environnemental");
  const planCrit = project.weightingCriteria.find((c) => c.id === "planning");
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

  const COL_LABEL = 1;
  const companyCol = (idx: number) => 2 + idx;

  const getLineLabel = (line: typeof activeLotLines[0]) => {
    if (!line.type) return line.label;
    const group = activeLotLines.filter((l) => l.type === line.type);
    const idx = group.indexOf(line) + 1;
    const prefix = line.type === "PSE" ? "PSE" : line.type === "VARIANTE" ? "Variante" : "TO";
    return `${prefix} ${idx}${line.label ? ` — ${line.label}` : ""}`;
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

  // ── Row 3: Company names (small) ──
  ws.getCell(row, COL_LABEL).value = "";
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
  ws.getCell(row, COL_LABEL).border = thinBorder();
  ws.getRow(row).height = 14;
  activeCompanies.forEach((company, idx) => {
    const col = companyCol(idx);
    const pastel = companyPastelArgb(idx);
    ws.getCell(row, col).value = company.name;
    ws.getCell(row, col).font = { italic: true, size: 8, color: { argb: "FF555555" } };
    ws.getCell(row, col).fill = solidFill(pastel);
    ws.getCell(row, col).alignment = { horizontal: "center" };
    ws.getCell(row, col).border = thinBorder();
  });
  row++;

  // ── Helper: get total for a company from a set of lines ──
  const getTotal = (companyId: number, lines: typeof activeLotLines) => {
    return lines.reduce((sum, line) => {
      const entry = version.priceEntries.find((e) => e.companyId === companyId && e.lotLineId === line.id);
      return sum + (entry?.dpgf1 ?? 0) + (entry?.dpgf2 ?? 0);
    }, 0);
  };

  // ── Helper: render a row for a lot line ──
  const renderLineRow = (line: typeof activeLotLines[0], label: string, isSectionHeader = false) => {
    const est1 = line.estimationDpgf1 ?? 0;
    const est2 = line.estimationDpgf2 ?? 0;
    const estTotal = est1 + est2;

    ws.getCell(row, COL_LABEL).value = label;
    ws.getCell(row, COL_LABEL).font = { size: 9, italic: isSectionHeader };
    ws.getCell(row, COL_LABEL).fill = lightFill(isSectionHeader ? COLORS.lightBlue : COLORS.white);
    ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 18;

    activeCompanies.forEach((company, idx) => {
      const col = companyCol(idx);
      const entry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === line.id);
      const d1 = entry?.dpgf1 ?? 0;
      const d2 = entry?.dpgf2 ?? 0;
      const offerTotal = hasDpgf2 ? d1 + d2 : d1;
      const estRef = hasDpgf2 ? estTotal : est1;

      const cell = ws.getCell(row, col);
      cell.value = offerTotal || null;
      cell.numFmt = '#,##0.00 "€"';
      cell.alignment = { horizontal: "right" };
      cell.border = thinBorder();

      // Color based on deviation
      if (estRef !== 0 && offerTotal !== 0) {
        const dev = ((offerTotal - estRef) / Math.abs(estRef)) * 100;
        const absDev = Math.abs(dev);
        if (absDev <= 10) cell.fill = lightFill("E8F5E9");
        else if (absDev <= 20) cell.fill = lightFill("FFF3E0");
        else cell.fill = lightFill("FFEBEE");
      }
    });
    row++;

    // Estimation sub-row (grayed)
    if (estTotal > 0) {
      ws.getCell(row, COL_LABEL).value = `  ↳ Est. CIRAD : ${hasDpgf2 ? `${est1.toLocaleString("fr-FR")} + ${est2.toLocaleString("fr-FR")}` : est1.toLocaleString("fr-FR")} €`;
      ws.getCell(row, COL_LABEL).font = { italic: true, size: 8, color: { argb: "FF888888" } };
      ws.getCell(row, COL_LABEL).fill = lightFill("F5F5F5");
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = 14;

      activeCompanies.forEach((company, idx) => {
        const col = companyCol(idx);
        const entry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === line.id);
        const d1 = entry?.dpgf1 ?? 0;
        const d2 = entry?.dpgf2 ?? 0;
        const offerTotal = hasDpgf2 ? d1 + d2 : d1;
        const estRef = hasDpgf2 ? estTotal : est1;
        const cell = ws.getCell(row, col);
        if (estRef !== 0 && offerTotal !== 0) {
          const dev = ((offerTotal - estRef) / Math.abs(estRef)) * 100;
          cell.value = `${dev >= 0 ? "+" : ""}${dev.toFixed(2)}%`;
          cell.font = { italic: true, size: 8, color: { argb: Math.abs(dev) <= 10 ? "FF2E7D32" : Math.abs(dev) <= 20 ? "FFE65100" : "FFC62828" } };
        } else {
          cell.value = "—";
          cell.font = { italic: true, size: 8, color: { argb: "FF888888" } };
        }
        cell.fill = lightFill("F5F5F5");
        cell.alignment = { horizontal: "center" };
        cell.border = thinBorder();
      });
      row++;
    }
  };

  // ── Section: Tranche Ferme ──
  ws.mergeCells(row, COL_LABEL, row, lastCol);
  const tfHeader = ws.getCell(row, COL_LABEL);
  tfHeader.value = "TRANCHE FERME (hors PSE, Variante et Tranche Optionnelle)";
  tfHeader.font = { bold: true, size: 10, color: { argb: COLORS.headerFont } };
  tfHeader.fill = headerFill();
  tfHeader.border = thinBorder();
  ws.getRow(row).height = 18;
  row++;

  for (const line of baseLines) {
    renderLineRow(line, line.label);
  }

  // TF Total
  ws.getCell(row, COL_LABEL).value = hasDpgf2 ? "TOTAL Tranche Ferme (hors PSE, Variante et Tranche Optionnelle)\nDPGF 1 + DPGF 2" : "TOTAL Tranche Ferme (hors PSE, Variante et Tranche Optionnelle)";
  ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
  ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightGreen);
  ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "middle" };
  ws.getCell(row, COL_LABEL).border = thickBorder();
  ws.getRow(row).height = 28;

  const tfTotalRowNum = row;
  activeCompanies.forEach((company, idx) => {
    const col = companyCol(idx);
    const total = getTotal(company.id, baseLines);
    const cell = ws.getCell(row, col);
    cell.value = total || null;
    cell.numFmt = '#,##0.00 "€"';
    cell.font = { bold: true, size: 10 };
    cell.fill = lightFill(COLORS.lightGreen);
    cell.alignment = { horizontal: "right" };
    cell.border = thickBorder();

    // Écart vs estimation globale
    const estBase = baseLines.reduce((s, l) => s + (hasDpgf2 ? (l.estimationDpgf1 ?? 0) + (l.estimationDpgf2 ?? 0) : (l.estimationDpgf1 ?? 0)), 0);
    if (estBase > 0 && total > 0) {
      const dev = ((total - estBase) / Math.abs(estBase)) * 100;
      if (Math.abs(dev) <= 10) cell.fill = lightFill("C8E6C9");
      else if (Math.abs(dev) <= 20) cell.fill = lightFill("FFE0B2");
      else cell.fill = lightFill("FFCDD2");
    }
  });
  row++;

  // DPGF2 sub-total if applicable
  if (hasDpgf2) {
    ws.getCell(row, COL_LABEL).value = "DPGF 1 — Estimé à " + baseLines.reduce((s, l) => s + (l.estimationDpgf1 ?? 0), 0).toLocaleString("fr-FR") + " € HT";
    ws.getCell(row, COL_LABEL).font = { italic: true, size: 8, color: { argb: "FF888888" } };
    ws.getCell(row, COL_LABEL).fill = lightFill("F5F5F5");
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 14;
    activeCompanies.forEach((company, idx) => {
      const col = companyCol(idx);
      const total1 = baseLines.reduce((s, l) => {
        const e = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === l.id);
        return s + (e?.dpgf1 ?? 0);
      }, 0);
      ws.getCell(row, col).value = total1 || null;
      ws.getCell(row, col).numFmt = '#,##0.00 "€"';
      ws.getCell(row, col).font = { italic: true, size: 8, color: { argb: "FF888888" } };
      ws.getCell(row, col).fill = lightFill("F5F5F5");
      ws.getCell(row, col).border = thinBorder();
    });
    row++;

    ws.getCell(row, COL_LABEL).value = "DPGF 2 — Estimé à " + baseLines.reduce((s, l) => s + (l.estimationDpgf2 ?? 0), 0).toLocaleString("fr-FR") + " € HT";
    ws.getCell(row, COL_LABEL).font = { italic: true, size: 8, color: { argb: "FF888888" } };
    ws.getCell(row, COL_LABEL).fill = lightFill("F5F5F5");
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 14;
    activeCompanies.forEach((company, idx) => {
      const col = companyCol(idx);
      const total2 = baseLines.reduce((s, l) => {
        const e = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === l.id);
        return s + (e?.dpgf2 ?? 0);
      }, 0);
      ws.getCell(row, col).value = total2 || null;
      ws.getCell(row, col).numFmt = '#,##0.00 "€"';
      ws.getCell(row, col).font = { italic: true, size: 8, color: { argb: "FF888888" } };
      ws.getCell(row, col).fill = lightFill("F5F5F5");
      ws.getCell(row, col).border = thinBorder();
    });
    row++;
  }

  ws.getRow(row).height = 6;
  row++;

  // ── PSE ──
  if (pseLines.length > 0) {
    for (let i = 0; i < pseLines.length; i++) {
      const line = pseLines[i];
      const est = (line.estimationDpgf1 ?? 0) + (line.estimationDpgf2 ?? 0);
      ws.getCell(row, COL_LABEL).value = `MONTANT PSE N°${i + 1} — Estimée à ${est.toLocaleString("fr-FR")} € HT`;
      ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
      ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightYellow);
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = 18;
      activeCompanies.forEach((company, idx) => {
        const col = companyCol(idx);
        const entry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === line.id);
        const val = (entry?.dpgf1 ?? 0) + (entry?.dpgf2 ?? 0);
        const cell = ws.getCell(row, col);
        cell.value = val || null;
        cell.numFmt = '#,##0.00 "€"';
        cell.fill = lightFill(COLORS.lightYellow);
        cell.alignment = { horizontal: "right" };
        cell.border = thinBorder();
      });
      row++;
    }
    ws.getRow(row).height = 6;
    row++;
  }

  // ── Variantes ──
  if (varianteLines.length > 0) {
    for (let i = 0; i < varianteLines.length; i++) {
      const line = varianteLines[i];
      const est = (line.estimationDpgf1 ?? 0) + (line.estimationDpgf2 ?? 0);
      ws.getCell(row, COL_LABEL).value = `MONTANT VARIANTE N°${i + 1} — Estimée à ${est.toLocaleString("fr-FR")} € HT`;
      ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
      ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightOrange);
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = 18;
      activeCompanies.forEach((company, idx) => {
        const col = companyCol(idx);
        const entry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === line.id);
        const val = (entry?.dpgf1 ?? 0) + (entry?.dpgf2 ?? 0);
        const cell = ws.getCell(row, col);
        cell.value = val || null;
        cell.numFmt = '#,##0.00 "€"';
        cell.fill = lightFill(COLORS.lightOrange);
        cell.alignment = { horizontal: "right" };
        cell.border = thinBorder();
      });
      row++;
    }
    ws.getRow(row).height = 6;
    row++;
  }

  // ── Tranches Optionnelles ──
  if (toLines.length > 0) {
    for (let i = 0; i < toLines.length; i++) {
      const line = toLines[i];
      const est = (line.estimationDpgf1 ?? 0) + (line.estimationDpgf2 ?? 0);
      ws.getCell(row, COL_LABEL).value = `MONTANT Tranche Optionnelle N°${i + 1} — Estimée à ${est.toLocaleString("fr-FR")} € HT`;
      ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
      ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightBlue);
      ws.getCell(row, COL_LABEL).border = thinBorder();
      ws.getRow(row).height = 18;
      activeCompanies.forEach((company, idx) => {
        const col = companyCol(idx);
        const entry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === line.id);
        const val = (entry?.dpgf1 ?? 0) + (entry?.dpgf2 ?? 0);
        const cell = ws.getCell(row, col);
        cell.value = val || null;
        cell.numFmt = '#,##0.00 "€"';
        cell.fill = lightFill(COLORS.lightBlue);
        cell.alignment = { horizontal: "right" };
        cell.border = thinBorder();
      });
      row++;
    }
    ws.getRow(row).height = 6;
    row++;
  }

  // ── Scénarios totaux ──
  type ScenarioLine = { label: string; estLabel: string; lines: typeof activeLotLines; fillColor: string };
  const estBase = baseLines.reduce((s, l) => s + (hasDpgf2 ? (l.estimationDpgf1 ?? 0) + (l.estimationDpgf2 ?? 0) : (l.estimationDpgf1 ?? 0)), 0);
  const estPse = pseLines.reduce((s, l) => s + (hasDpgf2 ? (l.estimationDpgf1 ?? 0) + (l.estimationDpgf2 ?? 0) : (l.estimationDpgf1 ?? 0)), 0);
  const estVar = varianteLines.reduce((s, l) => s + (hasDpgf2 ? (l.estimationDpgf1 ?? 0) + (l.estimationDpgf2 ?? 0) : (l.estimationDpgf1 ?? 0)), 0);
  const estTo = toLines.reduce((s, l) => s + (hasDpgf2 ? (l.estimationDpgf1 ?? 0) + (l.estimationDpgf2 ?? 0) : (l.estimationDpgf1 ?? 0)), 0);

  const scenarios: ScenarioLine[] = [
    { label: `TOTAL Tranche Ferme + Tranche Optionnelle — Estimé à ${(estBase + estTo).toLocaleString("fr-FR")} € HT`, estLabel: "", lines: [...baseLines, ...toLines], fillColor: "D1ECF1" },
    { label: `TOTAL Tranche Ferme + PSE — Estimé à ${(estBase + estPse).toLocaleString("fr-FR")} € HT`, estLabel: "", lines: [...baseLines, ...pseLines], fillColor: "D4EDDA" },
    { label: `TOTAL Tranche Ferme + Variante — Estimé à ${(estBase + estVar).toLocaleString("fr-FR")} € HT`, estLabel: "", lines: [...baseLines, ...varianteLines], fillColor: "FFF3CD" },
    { label: `TOTAL + PSE + Variante + Tranche Optionnelle — Estimé à ${(estBase + estPse + estVar + estTo).toLocaleString("fr-FR")} € HT`, estLabel: "", lines: [...baseLines, ...pseLines, ...varianteLines, ...toLines], fillColor: "F8D7DA" },
  ];

  const notePrixRows: { rowNum: number; estTotal: number; fillColor: string; label: string }[] = [];

  for (const scenario of scenarios) {
    const est = scenario.lines.reduce((s, l) => s + (hasDpgf2 ? (l.estimationDpgf1 ?? 0) + (l.estimationDpgf2 ?? 0) : (l.estimationDpgf1 ?? 0)), 0);
    ws.getCell(row, COL_LABEL).value = scenario.label;
    ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
    ws.getCell(row, COL_LABEL).fill = lightFill(scenario.fillColor);
    ws.getCell(row, COL_LABEL).alignment = { wrapText: true, vertical: "middle" };
    ws.getCell(row, COL_LABEL).border = thickBorder();
    ws.getRow(row).height = 28;

    activeCompanies.forEach((company, idx) => {
      const col = companyCol(idx);
      const total = getTotal(company.id, scenario.lines);
      const cell = ws.getCell(row, col);
      cell.value = total || "- €";
      if (typeof total === "number") cell.numFmt = '#,##0.00 "€"';
      cell.font = { bold: true, size: 9 };
      cell.fill = lightFill(scenario.fillColor);
      cell.alignment = { horizontal: "right" };
      cell.border = thickBorder();
    });
    notePrixRows.push({ rowNum: row, estTotal: est, fillColor: scenario.fillColor, label: scenario.label });
    row++;
  }

  ws.getRow(row).height = 6;
  row++;

  // ── Notes de prix par scénario ──
  // Compute min totals for each scenario
  for (const scenRow of notePrixRows) {
    const totalsForScenario = activeCompanies.map((company) => {
      const scenLines = notePrixRows.find((r) => r.rowNum === scenRow.rowNum);
      // We need to recompute from the scenario data — re-fetch
      return 0; // placeholder handled below
    });
  }

  // Row: NOTE DU PRIX - Scénario TF + TO
  const noteRows = [
    { label: `NOTE DU PRIX (/${prixWeight}) — Scénario TF + Tranche Optionnelle`, lines: [...baseLines, ...toLines], fillColor: "D1ECF1", isBold: false },
    { label: `NOTE DU PRIX (/${prixWeight}) — Scénario TF + PSE`, lines: [...baseLines, ...pseLines], fillColor: "D4EDDA", isBold: false },
    { label: `NOTE DU PRIX (/${prixWeight}) — Scénario TF + Variante`, lines: [...baseLines, ...varianteLines], fillColor: "FFF3CD", isBold: false },
    { label: `NOTE DU PRIX (/${prixWeight}) — Scénario TOTAL GÉNÉRAL`, lines: [...baseLines, ...pseLines, ...varianteLines, ...toLines], fillColor: "FFD7DA", isBold: true },
  ];

  for (const noteRow of noteRows) {
    const totals = activeCompanies.map((company) => getTotal(company.id, noteRow.lines));
    const validTotals = totals.filter((t) => t > 0);
    const minTotal = validTotals.length > 0 ? Math.min(...validTotals) : 0;

    ws.getCell(row, COL_LABEL).value = noteRow.label;
    ws.getCell(row, COL_LABEL).font = { bold: noteRow.isBold, size: 9, color: noteRow.isBold ? { argb: "FFC62828" } : undefined };
    ws.getCell(row, COL_LABEL).fill = lightFill(noteRow.fillColor);
    ws.getCell(row, COL_LABEL).alignment = { wrapText: true };
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 22;

    activeCompanies.forEach((company, idx) => {
      const col = companyCol(idx);
      const total = totals[idx];
      const notePrice = total > 0 && minTotal > 0 ? Number(((minTotal / total) * prixWeight).toFixed(2)) : 0;
      const cell = ws.getCell(row, col);
      cell.value = notePrice;
      cell.numFmt = "0.00";
      cell.font = { bold: noteRow.isBold, size: 10, color: noteRow.isBold ? { argb: "FFC62828" } : undefined };
      cell.fill = lightFill(noteRow.fillColor);
      cell.alignment = { horizontal: "center" };
      cell.border = thinBorder();
    });
    row++;
  }

  ws.getRow(row).height = 6;
  row++;

  // ── Écart global / estimation ──
  {
    const estTotalAll = estBase + estPse + estVar + estTo;
    ws.getCell(row, COL_LABEL).value = `ÉCART GLOBAL / ESTIMATION (${estTotalAll.toLocaleString("fr-FR")} €)`;
    ws.getCell(row, COL_LABEL).font = { bold: true, size: 9 };
    ws.getCell(row, COL_LABEL).fill = lightFill(COLORS.lightRed);
    ws.getCell(row, COL_LABEL).border = thinBorder();
    ws.getRow(row).height = 18;

    activeCompanies.forEach((company, idx) => {
      const col = companyCol(idx);
      const total = getTotal(company.id, activeLotLines);
      const cell = ws.getCell(row, col);
      if (estTotalAll > 0 && total > 0) {
        const dev = ((total - estTotalAll) / Math.abs(estTotalAll)) * 100;
        cell.value = `${dev >= 0 ? "+" : ""}${dev.toFixed(2)}%`;
        const absDev = Math.abs(dev);
        cell.font = { bold: true, color: { argb: absDev <= 10 ? "FF2E7D32" : absDev <= 20 ? "FFE65100" : "FFC62828" } };
        cell.fill = lightFill(absDev <= 10 ? "E8F5E9" : absDev <= 20 ? "FFF3E0" : "FFEBEE");
      } else {
        cell.value = "—";
        cell.fill = lightFill(COLORS.lightRed);
      }
      cell.alignment = { horizontal: "center" };
      cell.border = thinBorder();
    });
  }

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

  const technicalCriteria = project.weightingCriteria.filter((c) => c.id !== "prix");
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

  let sRow = 2;
  const synthColCount = 9;
  const lastSynthCol = String.fromCharCode(66 + synthColCount - 1);
  synthSheet.mergeCells(`B${sRow}:${lastSynthCol}${sRow}`);
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

  const synthHeaders = [
    "Entreprise",
    "Montant Total HT",
    `Note Prix (/${prixWeight})`,
    `Note Technique (/${vtWeight})`,
    `Note Enviro. (/${envW})`,
    `Note Planning (/${planW})`,
    `Note Globale (/${maxGlobal})`,
    "Classement",
    "Décision",
  ];

  synthHeaders.forEach((label, i) => {
    const c = synthSheet.getCell(sRow, i + 2);
    c.value = label;
    c.font = headerFont();
    c.fill = headerFill();
    c.border = thinBorder();
    c.alignment = { horizontal: "center", wrapText: true };
  });
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

    let priceTotal = 0;
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

  const nonExcludedRows: number[] = [];
  const montantCells: string[] = [];

  for (const r of sortedSynth) {
    const isExcluded = r.company.status === "ecartee";
    if (!isExcluded) {
      nonExcludedRows.push(sRow);
      montantCells.push(`C${sRow}`);
    }

    const decisions = version.negotiationDecisions ?? {};
    const decision: NegotiationDecision = decisions[r.company.id] ?? "non_defini";
    const decisionLabel = NEGOTIATION_DECISION_LABELS[decision];

    const nameCell = synthSheet.getCell(sRow, 2);
    nameCell.value = `${r.company.id}. ${r.company.name}${isExcluded ? " (Écartée)" : ""}`;
    nameCell.border = thinBorder();
    nameCell.alignment = { horizontal: "left" };

    const montantCell = synthSheet.getCell(sRow, 3);
    montantCell.value = isExcluded ? "—" : r.priceTotal;
    montantCell.border = thinBorder();
    montantCell.alignment = { horizontal: "center" };
    if (!isExcluded) montantCell.numFmt = '#,##0.00 "€"';

    const prixScoreCell = synthSheet.getCell(sRow, 4);
    prixScoreCell.value = Number(r.priceScore.toFixed(2));
    prixScoreCell.border = thinBorder();
    prixScoreCell.alignment = { horizontal: "center" };

    const techCell = synthSheet.getCell(sRow, 5);
    techCell.value = isExcluded ? "—" : Number(r.techScore.toFixed(1));
    techCell.border = thinBorder();
    techCell.alignment = { horizontal: "center" };

    const envCell = synthSheet.getCell(sRow, 6);
    envCell.value = isExcluded ? "—" : Number(r.envScore.toFixed(1));
    envCell.border = thinBorder();
    envCell.alignment = { horizontal: "center" };

    const planCell = synthSheet.getCell(sRow, 7);
    planCell.value = isExcluded ? "—" : Number(r.planScore.toFixed(1));
    planCell.border = thinBorder();
    planCell.alignment = { horizontal: "center" };

    const globalCell = synthSheet.getCell(sRow, 8);
    globalCell.value = isExcluded ? "—" : Number(r.globalScore.toFixed(2));
    globalCell.border = thinBorder();
    globalCell.alignment = { horizontal: "center" };
    globalCell.font = { bold: true };

    const rankCell = synthSheet.getCell(sRow, 9);
    rankCell.border = thinBorder();
    rankCell.alignment = { horizontal: "center" };

    const phaseCell = synthSheet.getCell(sRow, 10);
    phaseCell.value = isExcluded ? "Écartée" : decisionLabel;
    phaseCell.border = thinBorder();
    phaseCell.alignment = { horizontal: "center" };

    if (isExcluded) {
      rankCell.value = "—";
      for (let i = 2; i <= 10; i++) {
        const c = synthSheet.getCell(sRow, i);
        c.font = { italic: true, color: { argb: COLORS.excluded } };
        c.fill = lightFill(COLORS.lightRed);
      }
    } else {
      const isRetained = decision === "retenue" || decision === "attributaire";
      phaseCell.font = { bold: true, color: { argb: isRetained ? "2E7D32" : COLORS.excluded } };
      const compIdx = sortedSynth.filter((x) => x.company.status !== "ecartee").indexOf(r);
      const pastel = companyPastelArgb(compIdx >= 0 ? compIdx : 0);
      for (let i = 2; i <= 10; i++) {
        const c = synthSheet.getCell(sRow, i);
        if (!c.fill || (c.fill as any).fgColor?.argb === COLORS.white) {
          c.fill = lightFill(pastel);
        }
      }
    }

    sRow++;
  }

  // Rank
  for (let i = 0; i < nonExcludedRows.length; i++) {
    const row = nonExcludedRows[i];
    synthSheet.getCell(row, 9).value = i + 1;
    synthSheet.getCell(row, 9).font = { bold: true };
  }

  sRow += 2;

  // Attributaire block
  const allDecisions = version.negotiationDecisions ?? {};
  const attributaireEntry = sortedSynth.find(
    (r) => r.company.status !== "ecartee" && allDecisions[r.company.id] === "attributaire"
  );

  const getLineLabelSynth = (line: typeof activeLotLines[0]) => {
    if (!line.type) return line.label;
    const group = activeLotLines.filter((l) => l.type === line.type);
    const idx = group.indexOf(line) + 1;
    const prefix = line.type === "PSE" ? "PSE" : line.type === "VARIANTE" ? "Variante" : "TO";
    return `${prefix} ${idx}${line.label ? ` — ${line.label}` : ""}`;
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
        let basePrice = 0;
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
        let basePrice = 0;
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

  for (let i = 2; i <= 10; i++) {
    synthSheet.getColumn(i).width = i === 2 ? 25 : 18;
  }
}

function buildMethodologySheet(wb: ExcelJS.Workbook, project: ProjectData) {
  const methSheet = wb.addWorksheet("METHODOLOGIE");
  methSheet.properties.defaultRowHeight = 18;

  let row = 2;
  methSheet.mergeCells(`B${row}:H${row}`);
  const title = methSheet.getCell(`B${row}`);
  title.value = "MÉTHODOLOGIE DE NOTATION ET D'ANALYSE";
  title.font = { bold: true, size: 14, color: { argb: COLORS.darkText } };
  title.fill = lightFill(COLORS.lightBlue);
  title.border = thinBorder();
  row += 2;

  methSheet.mergeCells(`B${row}:H${row}`);
  const priceTitle = methSheet.getCell(`B${row}`);
  priceTitle.value = "1. Critère Prix";
  priceTitle.font = { bold: true, size: 12, color: { argb: COLORS.headerFont } };
  priceTitle.fill = headerFill();
  priceTitle.border = thinBorder();
  row++;

  methSheet.getCell(`B${row}`).value = "Formule : Note = (Montant le plus bas / Montant candidat) × Pondération Prix";
  methSheet.getCell(`B${row}`).font = { italic: true, size: 10 };
  row++;
  methSheet.getCell(`B${row}`).value = "Le candidat le moins-disant obtient la note maximale. Les autres sont notés proportionnellement.";
  methSheet.getCell(`B${row}`).font = { size: 10 };
  row += 2;

  methSheet.mergeCells(`B${row}:H${row}`);
  const techTitle = methSheet.getCell(`B${row}`);
  techTitle.value = "2. Critères Techniques (Valeur Technique, Environnemental, Planning)";
  techTitle.font = { bold: true, size: 12, color: { argb: COLORS.headerFont } };
  techTitle.fill = headerFill();
  techTitle.border = thinBorder();
  row++;

  methSheet.getCell(`B${row}`).value = "Chaque critère est noté sur une échelle de 1 à 5, puis pondéré selon le barème suivant :";
  methSheet.getCell(`B${row}`).font = { size: 10 };
  row += 2;

  const techCriteria = project.weightingCriteria.filter((c) => c.id !== "prix");
  const notationHeaders = ["Appréciation", "Note / 5"];
  for (const c of techCriteria) {
    notationHeaders.push(`Sur ${c.weight} pts`);
  }
  notationHeaders.forEach((h, i) => {
    const cell = methSheet.getCell(row, i + 2);
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
    methSheet.getCell(row, 2).value = label;
    methSheet.getCell(row, 2).border = thinBorder();
    methSheet.getCell(row, 2).font = { bold: true };
    methSheet.getCell(row, 3).value = `${value} / 5`;
    methSheet.getCell(row, 3).border = thinBorder();
    methSheet.getCell(row, 3).alignment = { horizontal: "center" };
    let col = 4;
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

  methSheet.mergeCells(`B${row}:H${row}`);
  const scenTitle = methSheet.getCell(`B${row}`);
  scenTitle.value = "3. Tableau des Scénarios Possibles";
  scenTitle.font = { bold: true, size: 12, color: { argb: COLORS.headerFont } };
  scenTitle.fill = headerFill();
  scenTitle.border = thinBorder();
  row++;

  const activeLotLines = project.lotLines.filter((l) => l.label.trim() !== "");
  const typedLines = activeLotLines.filter((l) => l.type);

  if (typedLines.length === 0) {
    methSheet.getCell(`B${row}`).value = "Aucune PSE, Variante ou Tranche Optionnelle configurée.";
    methSheet.getCell(`B${row}`).font = { italic: true, size: 10 };
    row++;
  } else {
    ["Scénario", "Composition", "Description"].forEach((h, i) => {
      const cell = methSheet.getCell(row, i + 2);
      cell.value = h;
      cell.font = { bold: true, size: 9 };
      cell.fill = lightFill(COLORS.lightBlue);
      cell.border = thinBorder();
    });
    row++;

    methSheet.getCell(row, 2).value = "Base seule";
    methSheet.getCell(row, 2).border = thinBorder();
    methSheet.getCell(row, 3).value = "Tranche Ferme (DPGF)";
    methSheet.getCell(row, 3).border = thinBorder();
    methSheet.getCell(row, 4).value = "Solution de base uniquement";
    methSheet.getCell(row, 4).border = thinBorder();
    row++;

    const pseLines = typedLines.filter((l) => l.type === "PSE");
    const varianteLines = typedLines.filter((l) => l.type === "VARIANTE");
    const toLines = typedLines.filter((l) => l.type === "T_OPTIONNELLE");

    if (pseLines.length > 0) {
      methSheet.getCell(row, 2).value = "Base + PSE";
      methSheet.getCell(row, 2).border = thinBorder();
      methSheet.getCell(row, 3).value = `TF + ${pseLines.map((l) => l.label).join(", ")}`;
      methSheet.getCell(row, 3).border = thinBorder();
      methSheet.getCell(row, 4).value = "Solution de base avec toutes les PSE";
      methSheet.getCell(row, 4).border = thinBorder();
      row++;
    }
    if (varianteLines.length > 0) {
      methSheet.getCell(row, 2).value = "Base + Variantes";
      methSheet.getCell(row, 2).border = thinBorder();
      methSheet.getCell(row, 3).value = `TF + ${varianteLines.map((l) => l.label).join(", ")}`;
      methSheet.getCell(row, 3).border = thinBorder();
      methSheet.getCell(row, 4).value = "Solution de base avec toutes les Variantes";
      methSheet.getCell(row, 4).border = thinBorder();
      row++;
    }
    if (toLines.length > 0) {
      methSheet.getCell(row, 2).value = "Base + TO";
      methSheet.getCell(row, 2).border = thinBorder();
      methSheet.getCell(row, 3).value = `TF + ${toLines.map((l) => l.label).join(", ")}`;
      methSheet.getCell(row, 3).border = thinBorder();
      methSheet.getCell(row, 4).value = "Solution de base avec toutes les Tranches Optionnelles";
      methSheet.getCell(row, 4).border = thinBorder();
      row++;
    }
    if (pseLines.length > 0 && toLines.length > 0) {
      methSheet.getCell(row, 2).value = "Base + PSE + TO";
      methSheet.getCell(row, 2).border = thinBorder();
      methSheet.getCell(row, 3).value = `TF + ${[...pseLines, ...toLines].map((l) => l.label).join(", ")}`;
      methSheet.getCell(row, 3).border = thinBorder();
      methSheet.getCell(row, 4).value = "Combinaison complète";
      methSheet.getCell(row, 4).border = thinBorder();
      row++;
    }
  }

  methSheet.getColumn("B").width = 25;
  methSheet.getColumn("C").width = 20;
  methSheet.getColumn("D").width = 40;
  methSheet.getColumn("E").width = 15;
  methSheet.getColumn("F").width = 15;
  methSheet.getColumn("G").width = 15;
  methSheet.getColumn("H").width = 15;
}

// =============== Main export function ===============

export async function exportToExcel(project: ProjectData) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Analyse d'offres CIRAD";
  wb.created = new Date();

  const activeCompanies = project.companies.filter((c) => c.name.trim() !== "");
  const activeLotLines = project.lotLines.filter((l) => l.label.trim() !== "");
  const v0 = project.versions[0];
  if (!v0) return;

  // =========== DONNÉES DU PROJET ===========
  const pgSheet = wb.addWorksheet("DONNEES_DU_PROJET");
  pgSheet.properties.defaultRowHeight = 18;

  pgSheet.mergeCells("B2:K2");
  const titleCell = pgSheet.getCell("B2");
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

  let row = 4;
  for (const [label, value] of infoData) {
    const labelCell = pgSheet.getCell(`B${row}`);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 10 };
    labelCell.fill = lightFill(COLORS.lightBlue);
    labelCell.border = thinBorder();

    pgSheet.mergeCells(`C${row}:F${row}`);
    const valCell = pgSheet.getCell(`C${row}`);
    valCell.value = value || "";
    valCell.border = thinBorder();
    row++;
  }

  row += 1;
  pgSheet.mergeCells(`B${row}:F${row}`);
  const estTitle = pgSheet.getCell(`B${row}`);
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
    const lc = pgSheet.getCell(`B${row}`);
    lc.value = label;
    lc.font = { bold: true, size: 10 };
    lc.fill = lightFill(COLORS.lightYellow);
    lc.border = thinBorder();

    pgSheet.mergeCells(`C${row}:F${row}`);
    const vc = pgSheet.getCell(`C${row}`);
    vc.value = typeof value === "number" ? value : 0;
    vc.numFmt = '#,##0.00 "€"';
    vc.border = thinBorder();
    row++;
  }

  row += 1;
  pgSheet.mergeCells(`B${row}:F${row}`);
  const compTitle = pgSheet.getCell(`B${row}`);
  compTitle.value = "ENTREPRISES";
  compTitle.font = headerFont();
  compTitle.fill = headerFill();
  compTitle.border = thinBorder();
  row++;

  for (const company of activeCompanies) {
    const nc = pgSheet.getCell(`B${row}`);
    nc.value = company.id;
    nc.font = { bold: true, size: 10 };
    nc.border = thinBorder();
    nc.fill = lightFill(COLORS.lightBlue);

    pgSheet.mergeCells(`C${row}:F${row}`);
    const nameCell2 = pgSheet.getCell(`C${row}`);
    nameCell2.value = company.name + (company.status === "ecartee" ? ` (Écartée — ${company.exclusionReason})` : "");
    nameCell2.border = thinBorder();
    if (company.status === "ecartee") {
      nameCell2.font = { color: { argb: COLORS.excluded }, italic: true };
    }
    row++;
  }

  row += 1;
  pgSheet.mergeCells(`B${row}:G${row}`);
  const lotTitle = pgSheet.getCell(`B${row}`);
  lotTitle.value = "PSE / VARIANTE / TRANCHE OPTIONNELLE";
  lotTitle.font = headerFont();
  lotTitle.fill = headerFill();
  lotTitle.border = thinBorder();
  row++;

  ["Type", "N°", "Intitulé", "DPGF", "Est. DPGF 1 (€)", "Est. DPGF 2 (€)"].forEach((h, i) => {
    const col = String.fromCharCode(66 + i);
    const c = pgSheet.getCell(`${col}${row}`);
    c.value = h;
    c.font = { bold: true, size: 9 };
    c.fill = lightFill(COLORS.lightBlue);
    c.border = thinBorder();
  });
  row++;

  for (const line of activeLotLines) {
    pgSheet.getCell(`B${row}`).value = line.type || "—";
    pgSheet.getCell(`C${row}`).value = line.id;
    pgSheet.getCell(`D${row}`).value = line.label;
    pgSheet.getCell(`E${row}`).value = line.dpgfAssignment;
    pgSheet.getCell(`F${row}`).value = line.estimationDpgf1 ?? 0;
    pgSheet.getCell(`F${row}`).numFmt = '#,##0.00 "€"';
    pgSheet.getCell(`G${row}`).value = line.estimationDpgf2 ?? 0;
    pgSheet.getCell(`G${row}`).numFmt = '#,##0.00 "€"';
    ["B", "C", "D", "E", "F", "G"].forEach((col) => {
      pgSheet.getCell(`${col}${row}`).border = thinBorder();
    });
    row++;
  }

  row += 1;
  pgSheet.mergeCells(`B${row}:F${row}`);
  const weightTitle = pgSheet.getCell(`B${row}`);
  weightTitle.value = "ÉVALUATION TECHNIQUE ET FINANCIÈRE";
  weightTitle.font = headerFont();
  weightTitle.fill = headerFill();
  weightTitle.border = thinBorder();
  row++;

  ["Critère", "Pondération %", "Sous-critères"].forEach((h, i) => {
    const col = String.fromCharCode(66 + i);
    const c = pgSheet.getCell(`${col}${row}`);
    c.value = h;
    c.font = { bold: true, size: 9 };
    c.fill = lightFill(COLORS.lightBlue);
    c.border = thinBorder();
  });
  row++;

  for (const criterion of project.weightingCriteria) {
    pgSheet.getCell(`B${row}`).value = criterion.label;
    pgSheet.getCell(`B${row}`).font = { bold: true };
    pgSheet.getCell(`C${row}`).value = criterion.weight;
    pgSheet.getCell(`D${row}`).value = criterion.subCriteria.map((s) => `${s.label} (${s.weight}%)`).join(", ") || "—";
    ["B", "C", "D"].forEach((col) => {
      pgSheet.getCell(`${col}${row}`).border = thinBorder();
    });
    row++;
  }

  pgSheet.getColumn("B").width = 25;
  pgSheet.getColumn("C").width = 15;
  pgSheet.getColumn("D").width = 30;
  pgSheet.getColumn("E").width = 15;
  pgSheet.getColumn("F").width = 20;
  pgSheet.getColumn("G").width = 20;
  pgSheet.getColumn("H").width = 15;

  // =========== V0 Sheets ===========
  buildTechSheet(wb, "ANALYSE_TECHNIQUE", project, v0, activeCompanies);
  buildPrixSheet(wb, "ANALYSE_DES_PRIX", project, v0, activeCompanies);
  buildSyntheseSheet(wb, "SYNTHESE", project, v0, activeCompanies);

  // =========== Methodology ===========
  buildMethodologySheet(wb, project);

  // =========== Nego sheets for V1, V2 ===========
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
      buildTechSheet(wb, `Négo ${negoRound} Analyse technique`, project, negoVersion, negoCompanies, prevVersion);
      buildPrixSheet(wb, `Négo ${negoRound} Analyse des prix`, project, negoVersion, negoCompanies);
      buildSyntheseSheet(wb, `Négo ${negoRound} Synthèse`, project, negoVersion, negoCompanies);
    }
  }

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `Analyse_Offres_${project.info.name || "Projet"}.xlsx`);
}
