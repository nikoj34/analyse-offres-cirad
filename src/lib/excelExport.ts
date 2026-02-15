import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  ProjectData,
  NOTATION_LABELS,
  NOTATION_VALUES,
  NotationLevel,
  NEGOTIATION_DECISION_LABELS,
  NegotiationDecision,
  NegotiationVersion,
  getVersionDisplayLabel,
} from "@/types/project";

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

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n);

// =============== Shared helpers to build technique/prix/synthese sheets ===============

function buildTechSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  project: ProjectData,
  version: NegotiationVersion,
  companies: typeof project.companies
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

  // Date d'analyse and validation date
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

    ["Critère", "Sous-critère", "Pondération", "Notation", "Note", "Commentaire"].forEach((label, i) => {
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
          techSheet.getCell(tRow, 7).value = note?.comment || "";
          techSheet.getCell(tRow, 7).alignment = { wrapText: true, vertical: "top" };
          for (let i = 2; i <= 7; i++) {
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
        techSheet.getCell(tRow, 7).value = note?.comment || "";
        techSheet.getCell(tRow, 7).alignment = { wrapText: true, vertical: "top" };
        for (let i = 2; i <= 7; i++) {
          techSheet.getCell(tRow, i).border = thinBorder();
        }
        tRow++;
      }
    }

    techSheet.getCell(tRow, 2).value = "TOTAL";
    techSheet.getCell(tRow, 2).font = { bold: true };
    techSheet.getCell(tRow, 6).value = Number(companyTotal.toFixed(1));
    techSheet.getCell(tRow, 6).font = { bold: true };
    for (let i = 2; i <= 7; i++) {
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
  techSheet.getColumn(7).width = 60;
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
  const hasDpgf2 = activeLotLines.some((l) => l.dpgfAssignment === "DPGF_2" || l.dpgfAssignment === "both");

  let pRow = 2;
  prixSheet.mergeCells(`B${pRow}:${hasDpgf2 ? "H" : "F"}${pRow}`);
  const prixTitle = prixSheet.getCell(`B${pRow}`);
  prixTitle.value = `${project.info.name || "Projet"} — Lot n° ${project.info.lotNumber || ""} — ${sheetName}`;
  prixTitle.font = { bold: true, size: 12, color: { argb: COLORS.darkText } };
  prixTitle.fill = lightFill(COLORS.lightBlue);
  prixTitle.border = thinBorder();
  pRow++;

  // Date d'analyse and validation date
  prixSheet.getCell(`B${pRow}`).value = `Date d'analyse : ${version.analysisDate || "—"}`;
  prixSheet.getCell(`B${pRow}`).font = { italic: true, size: 9 };
  if (version.validated && version.validatedAt) {
    prixSheet.getCell(`D${pRow}`).value = `Validée le : ${new Date(version.validatedAt).toLocaleDateString("fr-FR")}`;
    prixSheet.getCell(`D${pRow}`).font = { italic: true, size: 9, color: { argb: "2E7D32" } };
  }
  pRow++;

  for (const company of companies) {
    const isExcluded = company.status === "ecartee";

    prixSheet.mergeCells(`B${pRow}:${hasDpgf2 ? "H" : "F"}${pRow}`);
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

    const cols = ["Ligne", "DPGF 1 (€ HT)"];
    if (hasDpgf2) cols.push("DPGF 2 (€ HT)");
    cols.push("Total (€ HT)");

    cols.forEach((label, i) => {
      const colLetter = String.fromCharCode(66 + i);
      const c = prixSheet.getCell(`${colLetter}${pRow}`);
      c.value = label;
      c.font = { bold: true, size: 9 };
      c.fill = lightFill(COLORS.lightBlue);
      c.border = thinBorder();
    });
    pRow++;

    let totalDpgf1 = 0;
    let totalDpgf2 = 0;

    for (const line of activeLotLines) {
      const entry = version.priceEntries.find(
        (e) => e.companyId === company.id && e.lotLineId === line.id
      );
      const d1 = entry?.dpgf1 ?? 0;
      const d2 = entry?.dpgf2 ?? 0;
      totalDpgf1 += d1;
      totalDpgf2 += d2;

      let col = 1;
      prixSheet.getCell(pRow, col + 1).value = `${line.label}${line.type ? ` (${line.type})` : ""}`;
      prixSheet.getCell(pRow, col + 1).border = thinBorder();
      col++;

      prixSheet.getCell(pRow, col + 1).value = d1 || "";
      prixSheet.getCell(pRow, col + 1).numFmt = '#,##0.00 "€"';
      prixSheet.getCell(pRow, col + 1).border = thinBorder();
      col++;

      if (hasDpgf2) {
        prixSheet.getCell(pRow, col + 1).value = d2 || "";
        prixSheet.getCell(pRow, col + 1).numFmt = '#,##0.00 "€"';
        prixSheet.getCell(pRow, col + 1).border = thinBorder();
        col++;
      }

      prixSheet.getCell(pRow, col + 1).value = d1 + d2;
      prixSheet.getCell(pRow, col + 1).numFmt = '#,##0.00 "€"';
      prixSheet.getCell(pRow, col + 1).font = { bold: true };
      prixSheet.getCell(pRow, col + 1).border = thinBorder();
      pRow++;
    }

    let col = 1;
    prixSheet.getCell(pRow, col + 1).value = "TOTAL";
    prixSheet.getCell(pRow, col + 1).font = { bold: true };
    prixSheet.getCell(pRow, col + 1).fill = lightFill(COLORS.lightGreen);
    prixSheet.getCell(pRow, col + 1).border = thinBorder();
    col++;

    prixSheet.getCell(pRow, col + 1).value = totalDpgf1;
    prixSheet.getCell(pRow, col + 1).numFmt = '#,##0.00 "€"';
    prixSheet.getCell(pRow, col + 1).font = { bold: true };
    prixSheet.getCell(pRow, col + 1).fill = lightFill(COLORS.lightGreen);
    prixSheet.getCell(pRow, col + 1).border = thinBorder();
    col++;

    if (hasDpgf2) {
      prixSheet.getCell(pRow, col + 1).value = totalDpgf2;
      prixSheet.getCell(pRow, col + 1).numFmt = '#,##0.00 "€"';
      prixSheet.getCell(pRow, col + 1).font = { bold: true };
      prixSheet.getCell(pRow, col + 1).fill = lightFill(COLORS.lightGreen);
      prixSheet.getCell(pRow, col + 1).border = thinBorder();
      col++;
    }

    prixSheet.getCell(pRow, col + 1).value = totalDpgf1 + totalDpgf2;
    prixSheet.getCell(pRow, col + 1).numFmt = '#,##0.00 "€"';
    prixSheet.getCell(pRow, col + 1).font = { bold: true };
    prixSheet.getCell(pRow, col + 1).fill = lightFill(COLORS.lightGreen);
    prixSheet.getCell(pRow, col + 1).border = thinBorder();

    pRow += 2;
  }

  prixSheet.getColumn("B").width = 30;
  prixSheet.getColumn("C").width = 18;
  prixSheet.getColumn("D").width = 18;
  prixSheet.getColumn("E").width = 18;
  prixSheet.getColumn("F").width = 18;
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

  // Date d'analyse and validation date
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

    let techScore = 0;
    let envScore = 0;
    let planScore = 0;

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

  for (const r of sortedSynth) {
    const isExcluded = r.company.status === "ecartee";
    if (!isExcluded) nonExcludedRows.push(sRow);

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
    prixScoreCell.value = isExcluded ? "—" : Number(r.priceScore.toFixed(1));
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

  // RANK formulas
  for (const row of nonExcludedRows) {
    const rankCell = synthSheet.getCell(row, 9);
    rankCell.value = { formula: `RANK(H${row},H${nonExcludedRows[0]}:H${nonExcludedRows[nonExcludedRows.length - 1]})` };
    rankCell.font = { bold: true };
  }

  for (let i = 2; i <= 10; i++) {
    synthSheet.getColumn(i).width = i === 2 ? 25 : 18;
  }
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

  // =========== PAGE DE GARDE ===========
  const pgSheet = wb.addWorksheet("PAGE_DE_GARDE");
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
    vc.numFmt = '#,##0 "€"';
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
    pgSheet.getCell(`F${row}`).numFmt = '#,##0 "€"';
    pgSheet.getCell(`G${row}`).value = line.estimationDpgf2 ?? 0;
    pgSheet.getCell(`G${row}`).numFmt = '#,##0 "€"';
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

  // Notation methodology table
  row += 1;
  pgSheet.mergeCells(`B${row}:F${row}`);
  const notationTitle = pgSheet.getCell(`B${row}`);
  notationTitle.value = "MÉTHODOLOGIE DE NOTATION";
  notationTitle.font = headerFont();
  notationTitle.fill = headerFill();
  notationTitle.border = thinBorder();
  row++;

  // Header row
  const notationHeaders = ["Appréciation", "Note / 5"];
  // Add weighted columns for each technical criterion
  const techCriteria = project.weightingCriteria.filter((c) => c.id !== "prix");
  for (const c of techCriteria) {
    notationHeaders.push(`Sur ${c.weight} pts`);
  }
  notationHeaders.forEach((h, i) => {
    const col = String.fromCharCode(66 + i);
    const cell = pgSheet.getCell(`${col}${row}`);
    cell.value = h;
    cell.font = { bold: true, size: 9 };
    cell.fill = lightFill(COLORS.lightBlue);
    cell.border = thinBorder();
    cell.alignment = { horizontal: "center" };
  });
  row++;

  // Notation rows
  const notationScale: [string, number][] = [
    ["Très bien", 5],
    ["Bien", 4],
    ["Moyen", 3],
    ["Passable", 2],
    ["Insuffisant", 1],
  ];
  for (const [label, value] of notationScale) {
    let col = 1;
    const labelCell = pgSheet.getCell(row, col + 1);
    labelCell.value = label;
    labelCell.border = thinBorder();
    labelCell.font = { bold: true };
    col++;

    const noteCell = pgSheet.getCell(row, col + 1);
    noteCell.value = `${value} / 5`;
    noteCell.border = thinBorder();
    noteCell.alignment = { horizontal: "center" };
    col++;

    for (const c of techCriteria) {
      const weighted = (value / 5) * c.weight;
      const wCell = pgSheet.getCell(row, col + 1);
      wCell.value = Number(weighted.toFixed(1));
      wCell.border = thinBorder();
      wCell.alignment = { horizontal: "center" };
      col++;
    }
    row++;
  }

  pgSheet.getColumn("B").width = 25;
  pgSheet.getColumn("C").width = 15;
  pgSheet.getColumn("D").width = 30;
  pgSheet.getColumn("E").width = 15;
  pgSheet.getColumn("F").width = 20;
  pgSheet.getColumn("G").width = 20;
  pgSheet.getColumn("H").width = 15;

  // =========== V0 Sheets: Analyse initiale ===========
  buildTechSheet(wb, "ANALYSE_TECHNIQUE", project, v0, activeCompanies);
  buildPrixSheet(wb, "PRIX", project, v0, activeCompanies);
  buildSyntheseSheet(wb, "SYNTHESE", project, v0, activeCompanies);

  // =========== Nego sheets for V1, V2 ===========
  for (let i = 1; i < project.versions.length; i++) {
    const negoVersion = project.versions[i];
    const negoRound = i;

    // Get retained companies from previous version
    const prevVersion = project.versions[i - 1];
    const prevDecisions = prevVersion.negotiationDecisions ?? {};
    const retainedIds = Object.entries(prevDecisions)
      .filter(([, d]) => d === "retenue" || d === "attributaire")
      .map(([id]) => Number(id));

    const negoCompanies = activeCompanies.filter((c) => retainedIds.includes(c.id));

    if (negoCompanies.length > 0) {
      buildTechSheet(wb, `Négo ${negoRound} Analyse technique`, project, negoVersion, negoCompanies);
      buildPrixSheet(wb, `Négo ${negoRound} Analyse Prix`, project, negoVersion, negoCompanies);
      buildSyntheseSheet(wb, `Négo ${negoRound} Synthèse`, project, negoVersion, negoCompanies);
    }
  }

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `Analyse_Offres_${project.info.name || "Projet"}.xlsx`);
}
