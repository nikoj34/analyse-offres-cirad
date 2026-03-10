import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

export interface ExportNegoExcelParams {
  /** Phase pour le nom de l'onglet : "Préparation" ou "Déroulement" */
  phase: "Préparation" | "Déroulement";
  /** Liste des questions (texte uniquement pour l'export) */
  questions: { text: string }[];
}

const HEADER_FILL_ARGB = "FFE0E0E0"; // gris clair

/**
 * Génère un fichier Excel (.xlsx) : grille de prise de notes vierge pour la négociation.
 * Un onglet par phase. Colonne A = Sujet/Question (largeur 50, gras, fond gris), Colonne B = Notes/Réponses (largeur 80, vide).
 * wrapText et alignement vertical sur toutes les cellules, hauteur de ligne généreuse pour les questions.
 */
export async function exportNegoExcel(params: ExportNegoExcelParams): Promise<void> {
  const { phase, questions } = params;

  const wb = new ExcelJS.Workbook();
  const sheetName = phase === "Préparation" ? "Préparation" : "Déroulement";
  const ws = wb.addWorksheet(sheetName, {});

  // Largeurs de colonnes
  ws.getColumn(1).width = 50;
  ws.getColumn(2).width = 80;

  // Ligne d'en-tête
  const headerRow = ws.getRow(1);
  headerRow.height = 25;
  const cellA1 = headerRow.getCell(1);
  cellA1.value = "Sujet / Question à aborder";
  cellA1.font = { bold: true };
  cellA1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL_ARGB } };
  cellA1.alignment = { wrapText: true, vertical: "middle" };

  const cellB1 = headerRow.getCell(2);
  cellB1.value = "Notes de l'entreprise";
  cellB1.font = { bold: true };
  cellB1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL_ARGB } };
  cellB1.alignment = { wrapText: true, vertical: "middle" };

  const filteredQuestions = questions.filter((q) => (q.text || "").trim() !== "");
  const questionRowHeight = 80;

  filteredQuestions.forEach((q, index) => {
    const rowIndex = index + 2;
    const row = ws.getRow(rowIndex);
    row.height = questionRowHeight;

    const cellA = row.getCell(1);
    cellA.value = q.text.trim();
    cellA.alignment = { wrapText: true, vertical: "top" };

    const cellB = row.getCell(2);
    cellB.value = "";
    cellB.alignment = { wrapText: true, vertical: "top" };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const fileName = `grille-nego-${phase === "Préparation" ? "preparation" : "deroulement"}.xlsx`;
  saveAs(blob, fileName);
}
