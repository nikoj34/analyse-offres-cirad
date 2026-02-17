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

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: "thin", color: { argb: COLORS.borderColor } };
  return { top: side, bottom: side, left: side, right: side };
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

// Helper: build rich text cell with diff (strikethrough old + green new)
function buildDiffRichText(current: string, prev: string): ExcelJS.CellRichTextValue | string {
  if (!prev || prev === current) return current;
  const parts: ExcelJS.RichText[] = [];
  if (prev) {
    parts.push({ text: prev, font: { strike: true, color: { argb: "C62828" }, size: 10 } });
  }
  if (current && current !== prev) {
    if (parts.length > 0) parts.push({ text: "\n" });
    parts.push({ text: current, font: { color: { argb: "2E7D32" }, size: 10 } });
  }
  if (parts.length === 0) return current;
  return { richText: parts };
}

// =============== Shared helpers ===============

function buildTechSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  project: ProjectData,
  version: NegotiationVersion,
  companies: typeof project.companies,
  prevVersion?: NegotiationVersion | null
) {
  const techSheet = wb.addWorksheet(sheetName);
  techSheet.properties.defaultRowHeight = 18;

  const technicalCriteria = project.weightingCriteria.filter((c) => c.id !== "prix");
  const maxTechWeight = technicalCriteria.reduce((s, c) => s + c.weight, 0);

  let tRow = 2;
  techSheet.mergeCells(`B${tRow}:G${tRow}`);
  const techTitle = techSheet.getCell(`B${tRow}`);
  techTitle.value = `${project.info.name || "Projet"} — Lot n° ${project.info.lotNumber || ""} — ${sheetName}`;
  techTitle.font = { bold: true, size: 12, color: { argb: COLORS.darkText } };
  techTitle.fill = lightFill(COLORS.lightBlue);
  techTitle.border = thinBorder();
  tRow++;

  techSheet.getCell(`B${tRow}`).value = `Date d'analyse : ${version.analysisDate || "—"}`;
  techSheet.getCell(`B${tRow}`).font = { italic: true, size: 9 };
  if (version.validated && version.validatedAt) {
    techSheet.getCell(`D${tRow}`).value = `Validée le : ${new Date(version.validatedAt).toLocaleDateString("fr-FR")}`;
    techSheet.getCell(`D${tRow}`).font = { italic: true, size: 9, color: { argb: "2E7D32" } };
  }
  tRow++;
  tRow += 2;

  techSheet.getCell(`B${tRow}`).value = `Note technique pondérée sur ${maxTechWeight} %`;
  techSheet.getCell(`B${tRow}`).font = { bold: true, size: 10 };
  techSheet.getCell(`B${tRow}`).fill = lightFill(COLORS.lightYellow);
  techSheet.getCell(`B${tRow}`).border = thinBorder();
  tRow += 2;

  for (const company of companies) {
    const isExcluded = company.status === "ecartee";

    techSheet.mergeCells(`B${tRow}:G${tRow}`);
    const ch = techSheet.getCell(`B${tRow}`);
    ch.value = `${company.id}. ${company.name}${isExcluded ? " (ÉCARTÉE)" : ""}`;
    ch.font = { bold: true, size: 11, color: { argb: isExcluded ? COLORS.excluded : COLORS.headerFont } };
    ch.fill = isExcluded ? lightFill(COLORS.lightRed) : headerFill();
    ch.border = thinBorder();
    tRow++;

    if (isExcluded) {
      techSheet.getCell(`B${tRow}`).value = `Motif : ${company.exclusionReason || "Non spécifié"}`;
      techSheet.getCell(`B${tRow}`).font = { italic: true, color: { argb: COLORS.excluded } };
      tRow += 2;
      continue;
    }

    ["Critère", "Sous-critère", "Pondération", "Notation", "Note", "Points Positifs", "Points Négatifs"].forEach((label, i) => {
      const c = techSheet.getCell(tRow, i + 2);
      c.value = label;
      c.font = { bold: true, size: 9 };
      c.fill = lightFill(COLORS.lightBlue);
      c.border = thinBorder();
    });
    tRow++;

    let companyTotal = 0;

    for (const criterion of technicalCriteria) {
      if (criterion.subCriteria.length > 0) {
        const subTotal = criterion.subCriteria.reduce((s, sc) => s + sc.weight, 0);
        let criterionScore = 0;
        for (const sub of criterion.subCriteria) {
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
          );
          const notationLabel = note?.notation ? NOTATION_LABELS[note.notation] : "—";
          const notationValue = note?.notation ? NOTATION_VALUES[note.notation] : 0;
          const subWeight = subTotal > 0 ? sub.weight / subTotal : 0;
          const subScore = (notationValue * subWeight / 5) * criterion.weight;
          criterionScore += subScore;

          techSheet.getCell(tRow, 2).value = criterion.label;
          techSheet.getCell(tRow, 3).value = `${sub.label} (${sub.weight}%)`;
          techSheet.getCell(tRow, 4).value = `${criterion.weight}%`;
          techSheet.getCell(tRow, 5).value = notationLabel;
          techSheet.getCell(tRow, 6).value = Number(subScore.toFixed(1));
          // Comments with diff rich text
          if (prevVersion) {
            const prevNote = prevVersion.technicalNotes.find(
              (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
            );
            const prevPos = prevNote?.commentPositif || prevNote?.comment || "";
            const curPos = note?.commentPositif || note?.comment || "";
            techSheet.getCell(tRow, 7).value = buildDiffRichText(curPos, prevPos);
            const prevNeg = prevNote?.commentNegatif || "";
            const curNeg = note?.commentNegatif || "";
            techSheet.getCell(tRow, 8).value = buildDiffRichText(curNeg, prevNeg);
            if (prevNote?.notation !== note?.notation) {
              techSheet.getCell(tRow, 5).fill = lightFill("FFF9C4");
              techSheet.getCell(tRow, 5).font = { bold: true, color: { argb: "E65100" } };
            }
          } else {
            techSheet.getCell(tRow, 7).value = note?.commentPositif || note?.comment || "";
            techSheet.getCell(tRow, 8).value = note?.commentNegatif || "";
          }
          techSheet.getCell(tRow, 7).alignment = { wrapText: true, vertical: "top" };
          techSheet.getCell(tRow, 8).alignment = { wrapText: true, vertical: "top" };
          for (let i = 2; i <= 8; i++) {
            techSheet.getCell(tRow, i).border = thinBorder();
          }
          tRow++;
        }
        companyTotal += criterionScore;
      } else {
        const note = version.technicalNotes.find(
          (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
        );
        const notationLabel = note?.notation ? NOTATION_LABELS[note.notation] : "—";
        const notationValue = note?.notation ? NOTATION_VALUES[note.notation] : 0;
        const score = (notationValue / 5) * criterion.weight;
        companyTotal += score;

        techSheet.getCell(tRow, 2).value = criterion.label;
        techSheet.getCell(tRow, 3).value = "—";
        techSheet.getCell(tRow, 4).value = `${criterion.weight}%`;
        techSheet.getCell(tRow, 5).value = notationLabel;
        techSheet.getCell(tRow, 6).value = Number(score.toFixed(1));
        // Comments with diff rich text
        if (prevVersion) {
          const prevNote = prevVersion.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
          );
          const prevPos = prevNote?.commentPositif || prevNote?.comment || "";
          const curPos = note?.commentPositif || note?.comment || "";
          techSheet.getCell(tRow, 7).value = buildDiffRichText(curPos, prevPos);
          const prevNeg = prevNote?.commentNegatif || "";
          const curNeg = note?.commentNegatif || "";
          techSheet.getCell(tRow, 8).value = buildDiffRichText(curNeg, prevNeg);
          if (prevNote?.notation !== note?.notation) {
            techSheet.getCell(tRow, 5).fill = lightFill("FFF9C4");
            techSheet.getCell(tRow, 5).font = { bold: true, color: { argb: "E65100" } };
          }
        } else {
          techSheet.getCell(tRow, 7).value = note?.commentPositif || note?.comment || "";
          techSheet.getCell(tRow, 8).value = note?.commentNegatif || "";
        }
        techSheet.getCell(tRow, 7).alignment = { wrapText: true, vertical: "top" };
        techSheet.getCell(tRow, 8).alignment = { wrapText: true, vertical: "top" };
        for (let i = 2; i <= 8; i++) {
          techSheet.getCell(tRow, i).border = thinBorder();
        }
        tRow++;
      }
    }

    techSheet.getCell(tRow, 2).value = "TOTAL";
    techSheet.getCell(tRow, 2).font = { bold: true };
    techSheet.getCell(tRow, 6).value = Number(companyTotal.toFixed(1));
    techSheet.getCell(tRow, 6).font = { bold: true };
    for (let i = 2; i <= 8; i++) {
      techSheet.getCell(tRow, i).fill = lightFill(COLORS.lightGreen);
      techSheet.getCell(tRow, i).border = thinBorder();
    }
    tRow += 2;
  }

  techSheet.getColumn(2).width = 22;
  techSheet.getColumn(3).width = 22;
  techSheet.getColumn(4).width = 14;
  techSheet.getColumn(5).width = 14;
  techSheet.getColumn(6).width = 10;
  techSheet.getColumn(7).width = 40;
  techSheet.getColumn(8).width = 40;
}

function buildPrixSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  project: ProjectData,
  version: NegotiationVersion,
  companies: typeof project.companies
) {
  const prixSheet = wb.addWorksheet(sheetName);
  prixSheet.properties.defaultRowHeight = 18;

  const activeLotLines = project.lotLines.filter((l) => l.label.trim() !== "");
  const prixCriterion = project.weightingCriteria.find((c) => c.id === "prix");
  const prixWeight = prixCriterion?.weight ?? 40;
  const hasDpgf2 = project.info.hasDualDpgf ?? false;

  // Auto-numbering helper
  const getLineLabel = (line: typeof activeLotLines[0]) => {
    if (!line.type) return line.label;
    const group = activeLotLines.filter((l) => l.type === line.type);
    const idx = group.indexOf(line) + 1;
    const prefix = line.type === "PSE" ? "PSE" : line.type === "VARIANTE" ? "Variante" : "TO";
    return `${prefix} ${idx}${line.label ? ` — ${line.label}` : ""}`;
  };

  let pRow = 2;
  const endCol = hasDpgf2 ? "K" : "I";
  prixSheet.mergeCells(`B${pRow}:${endCol}${pRow}`);
  const prixTitle = prixSheet.getCell(`B${pRow}`);
  prixTitle.value = `${project.info.name || "Projet"} — Lot n° ${project.info.lotNumber || ""} — ${sheetName}`;
  prixTitle.font = { bold: true, size: 12, color: { argb: COLORS.darkText } };
  prixTitle.fill = lightFill(COLORS.lightBlue);
  prixTitle.border = thinBorder();
  pRow++;

  prixSheet.getCell(`B${pRow}`).value = `Date d'analyse : ${version.analysisDate || "—"}`;
  prixSheet.getCell(`B${pRow}`).font = { italic: true, size: 9 };
  if (version.validated && version.validatedAt) {
    prixSheet.getCell(`D${pRow}`).value = `Validée le : ${new Date(version.validatedAt).toLocaleDateString("fr-FR")}`;
    prixSheet.getCell(`D${pRow}`).font = { italic: true, size: 9, color: { argb: "2E7D32" } };
  }
  pRow++;

  // Track total rows for MIN formula
  const companyTotalRows: number[] = [];

  for (const company of companies) {
    const isExcluded = company.status === "ecartee";

    prixSheet.mergeCells(`B${pRow}:${endCol}${pRow}`);
    const compHeader = prixSheet.getCell(`B${pRow}`);
    compHeader.value = `${company.id}. ${company.name}${isExcluded ? " (ÉCARTÉE)" : ""}`;
    compHeader.font = { bold: true, size: 11, color: { argb: isExcluded ? COLORS.excluded : COLORS.headerFont } };
    compHeader.fill = isExcluded ? lightFill(COLORS.lightRed) : headerFill();
    compHeader.border = thinBorder();
    pRow++;

    if (isExcluded) {
      prixSheet.getCell(`B${pRow}`).value = `Motif : ${company.exclusionReason || "Non spécifié"}`;
      prixSheet.getCell(`B${pRow}`).font = { italic: true, color: { argb: COLORS.excluded } };
      pRow += 2;
      continue;
    }

    // Headers: Ligne | Est. DPGF1 | DPGF1 Candidat | Écart 1 | [Est. DPGF2 | DPGF2 Candidat | Écart 2] | Total | Écart Global
    const cols: string[] = ["Ligne", "Est. DPGF 1 (€)", "DPGF 1 Candidat (€ HT)", "Écart DPGF 1 (%)"];
    if (hasDpgf2) cols.push("Est. DPGF 2 (€)", "DPGF 2 Candidat (€ HT)", "Écart DPGF 2 (%)");
    cols.push("Total (€ HT)", "Écart Global (%)");

    cols.forEach((label, i) => {
      const c = prixSheet.getCell(pRow, i + 2);
      c.value = label;
      c.font = { bold: true, size: 9 };
      c.fill = lightFill(COLORS.lightBlue);
      c.border = thinBorder();
      c.alignment = { horizontal: "center", wrapText: true };
    });
    pRow++;

    const dataStartRow = pRow;

    for (const line of activeLotLines) {
      const entry = version.priceEntries.find(
        (e) => e.companyId === company.id && e.lotLineId === line.id
      );
      const d1 = entry?.dpgf1 ?? 0;
      const d2 = entry?.dpgf2 ?? 0;
      const est1 = line.estimationDpgf1 ?? 0;
      const est2 = line.estimationDpgf2 ?? 0;
      const estTotal = est1 + est2;
      const offerTotal = d1 + d2;

      let col = 2;

      // Ligne label with auto-numbering
      prixSheet.getCell(pRow, col).value = getLineLabel(line);
      prixSheet.getCell(pRow, col).border = thinBorder();
      col++;

      // Est. DPGF 1 — grayed out
      const est1Cell = prixSheet.getCell(pRow, col);
      est1Cell.value = est1 || "";
      est1Cell.numFmt = '#,##0.00 "€"';
      est1Cell.border = thinBorder();
      est1Cell.font = { italic: true, color: { argb: "808080" } };
      est1Cell.fill = lightFill("F0F0F0");
      col++;

      // DPGF 1 Candidat
      prixSheet.getCell(pRow, col).value = d1 || "";
      prixSheet.getCell(pRow, col).numFmt = '#,##0.00 "€"';
      prixSheet.getCell(pRow, col).border = thinBorder();
      col++;

      // Écart DPGF 1 — color coded
      if (est1 !== 0 && d1 !== 0) {
        const dev1 = ((d1 - est1) / Math.abs(est1)) * 100;
        const devCell = prixSheet.getCell(pRow, col);
        devCell.value = Number(dev1.toFixed(2));
        devCell.numFmt = '0.00"%"';
        devCell.border = thinBorder();
        const absDev = Math.abs(dev1);
        if (absDev <= 10) devCell.font = { bold: true, color: { argb: "2E7D32" } };
        else if (absDev <= 20) devCell.font = { bold: true, color: { argb: "E65100" } };
        else devCell.font = { bold: true, color: { argb: "C62828" } };
        // Background tint
        if (absDev <= 10) devCell.fill = lightFill("E8F5E9");
        else if (absDev <= 20) devCell.fill = lightFill("FFF3E0");
        else devCell.fill = lightFill("FFEBEE");
      } else {
        prixSheet.getCell(pRow, col).value = "—";
        prixSheet.getCell(pRow, col).border = thinBorder();
      }
      col++;

      if (hasDpgf2) {
        // Est. DPGF 2 — grayed out
        const est2Cell = prixSheet.getCell(pRow, col);
        est2Cell.value = est2 || "";
        est2Cell.numFmt = '#,##0.00 "€"';
        est2Cell.border = thinBorder();
        est2Cell.font = { italic: true, color: { argb: "808080" } };
        est2Cell.fill = lightFill("F0F0F0");
        col++;

        // DPGF 2 Candidat
        prixSheet.getCell(pRow, col).value = d2 || "";
        prixSheet.getCell(pRow, col).numFmt = '#,##0.00 "€"';
        prixSheet.getCell(pRow, col).border = thinBorder();
        col++;

        // Écart DPGF 2 — color coded
        if (est2 !== 0 && d2 !== 0) {
          const dev2 = ((d2 - est2) / Math.abs(est2)) * 100;
          const devCell = prixSheet.getCell(pRow, col);
          devCell.value = Number(dev2.toFixed(2));
          devCell.numFmt = '0.00"%"';
          devCell.border = thinBorder();
          const absDev = Math.abs(dev2);
          if (absDev <= 10) devCell.font = { bold: true, color: { argb: "2E7D32" } };
          else if (absDev <= 20) devCell.font = { bold: true, color: { argb: "E65100" } };
          else devCell.font = { bold: true, color: { argb: "C62828" } };
          if (absDev <= 10) devCell.fill = lightFill("E8F5E9");
          else if (absDev <= 20) devCell.fill = lightFill("FFF3E0");
          else devCell.fill = lightFill("FFEBEE");
        } else {
          prixSheet.getCell(pRow, col).value = "—";
          prixSheet.getCell(pRow, col).border = thinBorder();
        }
        col++;
      }

      // Total
      prixSheet.getCell(pRow, col).value = offerTotal;
      prixSheet.getCell(pRow, col).numFmt = '#,##0.00 "€"';
      prixSheet.getCell(pRow, col).font = { bold: true };
      prixSheet.getCell(pRow, col).border = thinBorder();
      col++;

      // Écart Global — color coded
      if (estTotal !== 0 && offerTotal !== 0) {
        const dev = ((offerTotal - estTotal) / Math.abs(estTotal)) * 100;
        const devCell = prixSheet.getCell(pRow, col);
        devCell.value = Number(dev.toFixed(2));
        devCell.numFmt = '0.00"%"';
        devCell.border = thinBorder();
        const absDev = Math.abs(dev);
        if (absDev <= 10) { devCell.font = { bold: true, color: { argb: "2E7D32" } }; devCell.fill = lightFill("E8F5E9"); }
        else if (absDev <= 20) { devCell.font = { bold: true, color: { argb: "E65100" } }; devCell.fill = lightFill("FFF3E0"); }
        else { devCell.font = { bold: true, color: { argb: "C62828" } }; devCell.fill = lightFill("FFEBEE"); }
      } else {
        prixSheet.getCell(pRow, col).value = "—";
        prixSheet.getCell(pRow, col).border = thinBorder();
      }

      pRow++;
    }

    // Total row with SUM formulas
    let col = 2;
    prixSheet.getCell(pRow, col).value = "TOTAL";
    prixSheet.getCell(pRow, col).font = { bold: true };
    prixSheet.getCell(pRow, col).fill = lightFill(COLORS.lightGreen);
    prixSheet.getCell(pRow, col).border = thinBorder();
    col++;

    // Est DPGF1 SUM
    const estD1Col = String.fromCharCode(64 + col);
    prixSheet.getCell(pRow, col).value = { formula: `SUM(${estD1Col}${dataStartRow}:${estD1Col}${pRow - 1})` };
    prixSheet.getCell(pRow, col).numFmt = '#,##0.00 "€"';
    prixSheet.getCell(pRow, col).font = { bold: true, italic: true, color: { argb: "808080" } };
    prixSheet.getCell(pRow, col).fill = lightFill(COLORS.lightGreen);
    prixSheet.getCell(pRow, col).border = thinBorder();
    col++;

    // DPGF1 SUM
    const d1Col = String.fromCharCode(64 + col);
    prixSheet.getCell(pRow, col).value = { formula: `SUM(${d1Col}${dataStartRow}:${d1Col}${pRow - 1})` };
    prixSheet.getCell(pRow, col).numFmt = '#,##0.00 "€"';
    prixSheet.getCell(pRow, col).font = { bold: true };
    prixSheet.getCell(pRow, col).fill = lightFill(COLORS.lightGreen);
    prixSheet.getCell(pRow, col).border = thinBorder();
    col++;

    // Ecart 1 skip
    prixSheet.getCell(pRow, col).value = "";
    prixSheet.getCell(pRow, col).fill = lightFill(COLORS.lightGreen);
    prixSheet.getCell(pRow, col).border = thinBorder();
    col++;

    if (hasDpgf2) {
      // Est DPGF2 SUM
      const estD2Col = String.fromCharCode(64 + col);
      prixSheet.getCell(pRow, col).value = { formula: `SUM(${estD2Col}${dataStartRow}:${estD2Col}${pRow - 1})` };
      prixSheet.getCell(pRow, col).numFmt = '#,##0.00 "€"';
      prixSheet.getCell(pRow, col).font = { bold: true, italic: true, color: { argb: "808080" } };
      prixSheet.getCell(pRow, col).fill = lightFill(COLORS.lightGreen);
      prixSheet.getCell(pRow, col).border = thinBorder();
      col++;

      // DPGF2 SUM
      const d2Col = String.fromCharCode(64 + col);
      prixSheet.getCell(pRow, col).value = { formula: `SUM(${d2Col}${dataStartRow}:${d2Col}${pRow - 1})` };
      prixSheet.getCell(pRow, col).numFmt = '#,##0.00 "€"';
      prixSheet.getCell(pRow, col).font = { bold: true };
      prixSheet.getCell(pRow, col).fill = lightFill(COLORS.lightGreen);
      prixSheet.getCell(pRow, col).border = thinBorder();
      col++;

      // Ecart 2 skip
      prixSheet.getCell(pRow, col).value = "";
      prixSheet.getCell(pRow, col).fill = lightFill(COLORS.lightGreen);
      prixSheet.getCell(pRow, col).border = thinBorder();
      col++;
    }

    // Total SUM
    const totCol = String.fromCharCode(64 + col);
    prixSheet.getCell(pRow, col).value = { formula: `SUM(${totCol}${dataStartRow}:${totCol}${pRow - 1})` };
    prixSheet.getCell(pRow, col).numFmt = '#,##0.00 "€"';
    prixSheet.getCell(pRow, col).font = { bold: true };
    prixSheet.getCell(pRow, col).fill = lightFill(COLORS.lightGreen);
    prixSheet.getCell(pRow, col).border = thinBorder();

    companyTotalRows.push(pRow);
    pRow += 2;
  }

  // Price score summary with Excel formulas
  if (companyTotalRows.length > 0) {
    const totalColIdx = hasDpgf2 ? 9 : 7; // Column index where Total is
    const totalColLetter = String.fromCharCode(64 + totalColIdx);

    prixSheet.mergeCells(`B${pRow}:${endCol}${pRow}`);
    const scoreTitle = prixSheet.getCell(`B${pRow}`);
    scoreTitle.value = "NOTATION PRIX (formules dynamiques)";
    scoreTitle.font = headerFont();
    scoreTitle.fill = headerFill();
    scoreTitle.border = thinBorder();
    pRow++;

    // Compute tech scores for note finale
    const technicalCriteria = project.weightingCriteria.filter((c) => c.id !== "prix");
    const techScoresMap: Record<number, number> = {};
    for (const company of companies.filter((c) => c.status !== "ecartee")) {
      let total = 0;
      for (const criterion of technicalCriteria) {
        if (criterion.subCriteria.length > 0) {
          let raw = 0;
          const subTotal = criterion.subCriteria.reduce((s, sc) => s + sc.weight, 0);
          for (const sub of criterion.subCriteria) {
            const note = version.technicalNotes.find(
              (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
            );
            if (note?.notation) raw += NOTATION_VALUES[note.notation] * (subTotal > 0 ? sub.weight / subTotal : 0);
          }
          total += (raw / 5) * criterion.weight;
        } else {
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
          );
          if (note?.notation) total += (NOTATION_VALUES[note.notation] / 5) * criterion.weight;
        }
      }
      techScoresMap[company.id] = total;
    }
    const maxTechWeight = technicalCriteria.reduce((s, c) => s + c.weight, 0);

    ["Entreprise", "Montant Total HT", `Note Prix / ${prixWeight}`, `Note Tech / ${maxTechWeight}`, "Note Globale"].forEach((h, i) => {
      const c = prixSheet.getCell(pRow, i + 2);
      c.value = h;
      c.font = { bold: true, size: 9 };
      c.fill = lightFill(COLORS.lightBlue);
      c.border = thinBorder();
      c.alignment = { horizontal: "center" };
    });
    pRow++;

    const eligibleCompanies = companies.filter((c) => c.status !== "ecartee");
    const scoreStartRow = pRow;

    // MIN formula reference — collect total cell refs
    const totalCellRefs = companyTotalRows.map((r) => `${totalColLetter}${r}`);
    const minFormula = `MIN(${totalCellRefs.join(",")})`;

    let compIdx = 0;
    for (const company of eligibleCompanies) {
      const totalRow = companyTotalRows[compIdx];
      if (totalRow === undefined) { compIdx++; continue; }

      prixSheet.getCell(pRow, 2).value = `${company.id}. ${company.name}`;
      prixSheet.getCell(pRow, 2).border = thinBorder();

      // Reference the total from above
      prixSheet.getCell(pRow, 3).value = { formula: `${totalColLetter}${totalRow}` };
      prixSheet.getCell(pRow, 3).numFmt = '#,##0.00 "€"';
      prixSheet.getCell(pRow, 3).border = thinBorder();

      // Note Prix = (MIN / Montant) * Pondération — Excel formula
      prixSheet.getCell(pRow, 4).value = {
        formula: `IF(C${pRow}>0,(${minFormula}/C${pRow})*${prixWeight},0)`
      };
      prixSheet.getCell(pRow, 4).numFmt = '0.00';
      prixSheet.getCell(pRow, 4).font = { bold: true };
      prixSheet.getCell(pRow, 4).border = thinBorder();
      prixSheet.getCell(pRow, 4).alignment = { horizontal: "center" };

      // Note Technique
      const techScore = techScoresMap[company.id] ?? 0;
      prixSheet.getCell(pRow, 5).value = Number(techScore.toFixed(1));
      prixSheet.getCell(pRow, 5).numFmt = '0.0';
      prixSheet.getCell(pRow, 5).border = thinBorder();
      prixSheet.getCell(pRow, 5).alignment = { horizontal: "center" };

      // Note Globale = Note Prix + Note Tech (formula)
      prixSheet.getCell(pRow, 6).value = { formula: `D${pRow}+E${pRow}` };
      prixSheet.getCell(pRow, 6).numFmt = '0.00';
      prixSheet.getCell(pRow, 6).font = { bold: true };
      prixSheet.getCell(pRow, 6).border = thinBorder();
      prixSheet.getCell(pRow, 6).alignment = { horizontal: "center" };

      compIdx++;
      pRow++;
    }

    pRow++;
  }

  prixSheet.getColumn("B").width = 30;
  for (let i = 3; i <= 12; i++) {
    prixSheet.getColumn(i).width = 18;
  }
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

  // Calculate scores
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
  // Track montant column cells for MIN formula
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

    // Note Prix = (MIN / Montant) * Pondération — Excel formula
    const prixScoreCell = synthSheet.getCell(sRow, 4);
    if (isExcluded) {
      prixScoreCell.value = "—";
    } else {
      const minRef = `MIN(${montantCells.map(() => "").join("")})`; // placeholder, will set after loop
      // Temporary static value; we'll overwrite with formula after collecting all montant cells
      prixScoreCell.value = Number(r.priceScore.toFixed(2));
    }
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
    if (isExcluded) {
      globalCell.value = "—";
    } else {
      globalCell.value = { formula: `D${sRow}+E${sRow}+F${sRow}+G${sRow}` };
    }
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
    }

    sRow++;
  }

  // Now set Excel formulas for Note Prix using collected montant cells
  const minFormula = `MIN(${montantCells.join(",")})`;
  for (const row of nonExcludedRows) {
    const prixScoreCell = synthSheet.getCell(row, 4);
    prixScoreCell.value = {
      formula: `IF(C${row}>0,(${minFormula}/C${row})*${prixWeight},0)`
    };
    prixScoreCell.numFmt = '0.00';
    prixScoreCell.font = { bold: true };

    // Re-apply global formula since D changed
    synthSheet.getCell(row, 8).value = { formula: `D${row}+E${row}+F${row}+G${row}` };
    synthSheet.getCell(row, 8).font = { bold: true };
  }

  // RANK formulas
  for (const row of nonExcludedRows) {
    const rankCell = synthSheet.getCell(row, 9);
    rankCell.value = { formula: `RANK(H${row},H${nonExcludedRows[0]}:H${nonExcludedRows[nonExcludedRows.length - 1]})` };
    rankCell.font = { bold: true };
  }

  // ===== VALIDATION TEXT BLOCK =====
  sRow += 2;

  // Find attributaire
  const allDecisions = version.negotiationDecisions ?? {};
  const attributaireEntry = sortedSynth.find(
    (r) => r.company.status !== "ecartee" && allDecisions[r.company.id] === "attributaire"
  );

  // Auto-numbering helper for lot lines
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

    // Attribution pressentie
    if (attributaireEntry) {
      const attrRank = sortedSynth.filter((r) => r.company.status !== "ecartee").indexOf(attributaireEntry) + 1;

      // Determine which options are included (all typed lines with prices from the attributaire)
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

      // Détail du scénario retenu
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

    // Motifs d'éviction / non-attribution
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

  // ===== NOTES PRIX PAR SCÉNARIO =====
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

    // Compute tech scores
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

    // Tranche Ferme
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

    // Per option scenario
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

  // Price methodology
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

  // Technical methodology
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

  // Notation scale table
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

  // Scenario table
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

    // Base scenario
    methSheet.getCell(row, 2).value = "Base seule";
    methSheet.getCell(row, 2).border = thinBorder();
    methSheet.getCell(row, 3).value = "Tranche Ferme (DPGF)";
    methSheet.getCell(row, 3).border = thinBorder();
    methSheet.getCell(row, 4).value = "Solution de base uniquement";
    methSheet.getCell(row, 4).border = thinBorder();
    row++;

    // Generate combinations
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

function buildComparaisonsSheet(
  wb: ExcelJS.Workbook,
  project: ProjectData,
  version: NegotiationVersion,
  companies: typeof project.companies
) {
  const cmpSheet = wb.addWorksheet("COMPARAISONS");
  cmpSheet.properties.defaultRowHeight = 18;

  const activeLotLines = project.lotLines.filter((l) => l.label.trim() !== "");
  const typedLines = activeLotLines.filter((l) => l.type);
  if (typedLines.length === 0) return;

  const technicalCriteria = project.weightingCriteria.filter((c) => c.id !== "prix");
  const prixCriterion = project.weightingCriteria.find((c) => c.id === "prix");
  const prixWeight = prixCriterion?.weight ?? 40;
  const vtWeight = technicalCriteria.filter((c) => c.id !== "environnemental" && c.id !== "planning").reduce((s, c) => s + c.weight, 0);
  const envCrit = technicalCriteria.find((c) => c.id === "environnemental");
  const planCrit = technicalCriteria.find((c) => c.id === "planning");
  const envW = envCrit?.weight ?? 0;
  const planW = planCrit?.weight ?? 0;
  const maxGlobal = vtWeight + envW + planW + prixWeight;

  const eligibleCompanies = companies.filter((c) => c.status !== "ecartee" && c.name.trim() !== "");

  // Auto-numbering
  const getLineLabel = (line: typeof activeLotLines[0]) => {
    if (!line.type) return line.label;
    const group = activeLotLines.filter((l) => l.type === line.type);
    const idx = group.indexOf(line) + 1;
    const prefix = line.type === "PSE" ? "PSE" : line.type === "VARIANTE" ? "Variante" : "TO";
    return `${prefix} ${idx}${line.label ? ` — ${line.label}` : ""}`;
  };

  // Compute tech scores once
  const techScores: Record<number, { tech: number; env: number; plan: number; total: number }> = {};
  for (const company of eligibleCompanies) {
    let tech = 0, env = 0, plan = 0;
    for (const criterion of technicalCriteria) {
      let score = 0;
      if (criterion.subCriteria.length > 0) {
        let raw = 0;
        const subTotal = criterion.subCriteria.reduce((s, sc) => s + sc.weight, 0);
        for (const sub of criterion.subCriteria) {
          const note = version.technicalNotes.find(
            (n) => n.companyId === company.id && n.criterionId === criterion.id && n.subCriterionId === sub.id
          );
          if (note?.notation) {
            raw += NOTATION_VALUES[note.notation] * (subTotal > 0 ? sub.weight / subTotal : 0);
          }
        }
        score = (raw / 5) * criterion.weight;
      } else {
        const note = version.technicalNotes.find(
          (n) => n.companyId === company.id && n.criterionId === criterion.id && !n.subCriterionId
        );
        if (note?.notation) score = (NOTATION_VALUES[note.notation] / 5) * criterion.weight;
      }
      if (criterion.id === "environnemental") env = score;
      else if (criterion.id === "planning") plan = score;
      else tech += score;
    }
    techScores[company.id] = { tech, env, plan, total: tech + env + plan };
  }

  let row = 2;
  cmpSheet.mergeCells(`B${row}:J${row}`);
  const title = cmpSheet.getCell(`B${row}`);
  title.value = `${project.info.name || "Projet"} — Comparaisons par option`;
  title.font = { bold: true, size: 12, color: { argb: COLORS.darkText } };
  title.fill = lightFill(COLORS.lightBlue);
  title.border = thinBorder();
  row++;
  cmpSheet.getCell(`B${row}`).value = "Toutes les comparaisons individuelles (Base + 1 option), y compris celles non retenues.";
  cmpSheet.getCell(`B${row}`).font = { italic: true, size: 9 };
  row += 2;

  // === Tranche Ferme seule (obligatoire) ===
  {
    cmpSheet.mergeCells(`B${row}:J${row}`);
    const tfTitle = cmpSheet.getCell(`B${row}`);
    tfTitle.value = "Scénario : Tranche Ferme (Base seule)";
    tfTitle.font = { bold: true, size: 11, color: { argb: COLORS.headerFont } };
    tfTitle.fill = headerFill();
    tfTitle.border = thinBorder();
    row++;

    const tfHeaders = ["Entreprise", "Prix Base (€ HT)", `Note Tech (/${vtWeight + envW + planW})`, `Note Prix (/${prixWeight})`, `Note Globale (/${maxGlobal})`, "Classement"];
    tfHeaders.forEach((h, i) => {
      const c = cmpSheet.getCell(row, i + 2);
      c.value = h;
      c.font = { bold: true, size: 9 };
      c.fill = lightFill(COLORS.lightBlue);
      c.border = thinBorder();
      c.alignment = { horizontal: "center", wrapText: true };
    });
    row++;

    const baseTotals: { name: string; basePrice: number; techTotal: number }[] = [];
    for (const company of eligibleCompanies) {
      const baseDpgf = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === 0);
      let basePrice = (baseDpgf?.dpgf1 ?? 0) + (baseDpgf?.dpgf2 ?? 0);
      if (basePrice === 0) {
        const baseLines = activeLotLines.filter((l) => !l.type);
        for (const bl of baseLines) {
          const e = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === bl.id);
          basePrice += (e?.dpgf1 ?? 0) + (e?.dpgf2 ?? 0);
        }
      }
      const ts = techScores[company.id] ?? { tech: 0, env: 0, plan: 0, total: 0 };
      baseTotals.push({ name: `${company.id}. ${company.name}`, basePrice, techTotal: ts.total });
    }

    const validBasePrices = baseTotals.filter((t) => t.basePrice > 0).map((t) => t.basePrice);
    const minBasePrice = validBasePrices.length > 0 ? Math.min(...validBasePrices) : 0;

    const scoredBase = baseTotals.map((t) => {
      const priceScore = t.basePrice > 0 ? (minBasePrice / t.basePrice) * prixWeight : 0;
      return { ...t, priceScore, globalScore: t.techTotal + priceScore };
    }).sort((a, b) => b.globalScore - a.globalScore);

    scoredBase.forEach((s, idx) => {
      cmpSheet.getCell(row, 2).value = s.name;
      cmpSheet.getCell(row, 2).border = thinBorder();
      cmpSheet.getCell(row, 3).value = s.basePrice;
      cmpSheet.getCell(row, 3).numFmt = '#,##0.00 "€"';
      cmpSheet.getCell(row, 3).font = { bold: true };
      cmpSheet.getCell(row, 3).border = thinBorder();
      cmpSheet.getCell(row, 4).value = Number(s.techTotal.toFixed(1));
      cmpSheet.getCell(row, 4).border = thinBorder();
      cmpSheet.getCell(row, 4).alignment = { horizontal: "center" };
      cmpSheet.getCell(row, 5).value = Number(s.priceScore.toFixed(2));
      cmpSheet.getCell(row, 5).border = thinBorder();
      cmpSheet.getCell(row, 5).alignment = { horizontal: "center" };
      cmpSheet.getCell(row, 6).value = Number(s.globalScore.toFixed(2));
      cmpSheet.getCell(row, 6).font = { bold: true };
      cmpSheet.getCell(row, 6).border = thinBorder();
      cmpSheet.getCell(row, 6).alignment = { horizontal: "center" };
      cmpSheet.getCell(row, 7).value = idx + 1;
      cmpSheet.getCell(row, 7).font = { bold: true };
      cmpSheet.getCell(row, 7).border = thinBorder();
      cmpSheet.getCell(row, 7).alignment = { horizontal: "center" };
      row++;
    });
    row += 1;
  }

  // For each typed line, show a comparison table (Base + option)
  for (const line of typedLines) {
    const label = getLineLabel(line);

    cmpSheet.mergeCells(`B${row}:J${row}`);
    const secTitle = cmpSheet.getCell(`B${row}`);
    secTitle.value = `Scénario : Base + ${label}`;
    secTitle.font = { bold: true, size: 11, color: { argb: COLORS.headerFont } };
    secTitle.fill = headerFill();
    secTitle.border = thinBorder();
    row++;

    const headers = ["Entreprise", "Prix Base (€)", `Prix ${label} (€)`, "Total (€ HT)", `Note Tech (/${vtWeight + envW + planW})`, `Note Prix (/${prixWeight})`, `Note Globale (/${maxGlobal})`, "Classement"];
    headers.forEach((h, i) => {
      const c = cmpSheet.getCell(row, i + 2);
      c.value = h;
      c.font = { bold: true, size: 9 };
      c.fill = lightFill(COLORS.lightBlue);
      c.border = thinBorder();
      c.alignment = { horizontal: "center", wrapText: true };
    });
    row++;

    // Compute totals for this scenario
    const totals: { companyId: number; name: string; basePrice: number; optionPrice: number; total: number; techTotal: number }[] = [];
    for (const company of eligibleCompanies) {
      const baseDpgf = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === 0);
      const baseTotal = (baseDpgf?.dpgf1 ?? 0) + (baseDpgf?.dpgf2 ?? 0);
      // If no lot line 0, sum all base lines
      let basePrice = baseTotal;
      if (baseTotal === 0) {
        const baseLines = activeLotLines.filter((l) => !l.type);
        for (const bl of baseLines) {
          const e = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === bl.id);
          basePrice += (e?.dpgf1 ?? 0) + (e?.dpgf2 ?? 0);
        }
      }
      const optEntry = version.priceEntries.find((e) => e.companyId === company.id && e.lotLineId === line.id);
      const optionPrice = (optEntry?.dpgf1 ?? 0) + (optEntry?.dpgf2 ?? 0);
      const total = basePrice + optionPrice;
      const ts = techScores[company.id] ?? { tech: 0, env: 0, plan: 0, total: 0 };
      totals.push({ companyId: company.id, name: `${company.id}. ${company.name}`, basePrice, optionPrice, total, techTotal: ts.total });
    }

    const validPrices = totals.filter((t) => t.total > 0).map((t) => t.total);
    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;

    const scored = totals.map((t) => {
      const priceScore = t.total > 0 ? (minPrice / t.total) * prixWeight : 0;
      return { ...t, priceScore, globalScore: t.techTotal + priceScore };
    }).sort((a, b) => b.globalScore - a.globalScore);

    const dataStart = row;
    scored.forEach((s, idx) => {
      cmpSheet.getCell(row, 2).value = s.name;
      cmpSheet.getCell(row, 2).border = thinBorder();
      cmpSheet.getCell(row, 3).value = s.basePrice;
      cmpSheet.getCell(row, 3).numFmt = '#,##0.00 "€"';
      cmpSheet.getCell(row, 3).border = thinBorder();
      cmpSheet.getCell(row, 4).value = s.optionPrice;
      cmpSheet.getCell(row, 4).numFmt = '#,##0.00 "€"';
      cmpSheet.getCell(row, 4).border = thinBorder();
      cmpSheet.getCell(row, 5).value = s.total;
      cmpSheet.getCell(row, 5).numFmt = '#,##0.00 "€"';
      cmpSheet.getCell(row, 5).font = { bold: true };
      cmpSheet.getCell(row, 5).border = thinBorder();
      cmpSheet.getCell(row, 6).value = Number(s.techTotal.toFixed(1));
      cmpSheet.getCell(row, 6).border = thinBorder();
      cmpSheet.getCell(row, 6).alignment = { horizontal: "center" };
      cmpSheet.getCell(row, 7).value = Number(s.priceScore.toFixed(2));
      cmpSheet.getCell(row, 7).border = thinBorder();
      cmpSheet.getCell(row, 7).alignment = { horizontal: "center" };
      cmpSheet.getCell(row, 8).value = Number(s.globalScore.toFixed(2));
      cmpSheet.getCell(row, 8).font = { bold: true };
      cmpSheet.getCell(row, 8).border = thinBorder();
      cmpSheet.getCell(row, 8).alignment = { horizontal: "center" };
      cmpSheet.getCell(row, 9).value = idx + 1;
      cmpSheet.getCell(row, 9).font = { bold: true };
      cmpSheet.getCell(row, 9).border = thinBorder();
      cmpSheet.getCell(row, 9).alignment = { horizontal: "center" };
      row++;
    });
    row += 1;
  }

  cmpSheet.getColumn("B").width = 25;
  for (let i = 3; i <= 10; i++) cmpSheet.getColumn(i).width = 18;
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

  // Estimation section
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

  // Companies list
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

  // Lot lines
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

  // Weighting
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
  buildComparaisonsSheet(wb, project, v0, activeCompanies);

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
