import {
  Document,
  Paragraph,
  TextRun,
  Packer,
  HeadingLevel,
  AlignmentType,
} from "docx";
import { saveAs } from "file-saver";

export interface ExportNegoWordParams {
  /** Référence du marché (ex: project.info.marketRef ou name) */
  marketRef: string;
  /** Libellé du lot (ex: lot.label ou "Lot X") */
  lotLabel: string;
  /** Nom de l'entreprise */
  companyName: string;
  /** Phase : "Préparation" ou "Déroulement" */
  phase: "Préparation" | "Déroulement";
  /** Liste des questions (texte uniquement pour l'export) */
  questions: { text: string }[];
}

/**
 * Génère un document Word (.docx) : trame de prise de notes vierge pour la négociation.
 * En-tête : marché, lot, entreprise, phase. Pour chaque question : titre en gras + espace de réponse (5 paragraphes vides).
 */
export async function exportNegoWord(params: ExportNegoWordParams): Promise<void> {
  const { marketRef, lotLabel, companyName, phase, questions } = params;

  const children: Paragraph[] = [
    new Paragraph({
      text: "Trame de négociation",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Marché : ", bold: true }),
        new TextRun(marketRef || "—"),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Lot : ", bold: true }),
        new TextRun(lotLabel || "—"),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Entreprise : ", bold: true }),
        new TextRun(companyName || "—"),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Phase : ", bold: true }),
        new TextRun(phase),
      ],
      spacing: { after: 600 },
    }),
  ];

  const filteredQuestions = questions.filter((q) => (q.text || "").trim() !== "");
  for (const q of filteredQuestions) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: q.text.trim(), bold: true })],
        spacing: { after: 200 },
      })
    );
    // Grand espace vide pour prise de notes manuscrite (~4 cm) : 5 paragraphes vides avec espacement généreux
    for (let i = 0; i < 5; i++) {
      children.push(
        new Paragraph({
          text: "",
          spacing: { before: 200, after: 450 },
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `trame-nego-${phase === "Préparation" ? "preparation" : "deroulement"}-${companyName.replace(/[^a-zA-Z0-9-_]/g, "_")}.docx`;
  saveAs(blob, fileName);
}
