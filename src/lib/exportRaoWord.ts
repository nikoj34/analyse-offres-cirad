/**
 * Export RAO (Rapport d'Analyse des Offres) au format Word (.docx).
 *
 * Génère un document formel conforme aux pratiques marchés publics français
 * (Code de la Commande Publique, Art. L2152-1 et suivants) :
 *  1. Page de garde
 *  2. Objet du marché
 *  3. Critères d'attribution
 *  4. Candidats
 *  5. Analyse financière
 *  6. Analyse technique
 *  7. Classement final
 *  8. Conclusion / Proposition d'attribution
 *  9. Signatures
 *
 * Aucune modification des stores, calculs ou composants existants.
 */

import {
  Document,
  Paragraph,
  TextRun,
  Packer,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
} from "docx";
import { saveAs } from "file-saver";
import type {
  WeightingCriterion,
  TechnicalNote,
  NegotiationDecision,
  Company,
} from "@/types/project";
import { NOTATION_LABELS, NEGOTIATION_DECISION_LABELS } from "@/types/project";

// ─── Types publics ───────────────────────────────────────────────────────────

export interface RaoCompanyResult {
  company: Company;
  techScore: number;
  priceScore: number;
  priceTotal: number;
  globalScore: number;
}

export interface ExportRaoWordParams {
  /** Nom du projet / de l'opération */
  projectName: string;
  /** Référence marché */
  marketRef: string;
  /** Date d'analyse (ISO : "YYYY-MM-DD") */
  analysisDate: string;
  /** Auteur / rapporteur */
  author: string;
  /** Libellé du lot (ex. "Lot 1 — Gros œuvre") */
  lotLabel: string;
  /** Numéro du lot (ex. "1") */
  lotNumber: string;
  /** Objet analysé du lot (ex. "Travaux de gros œuvre") */
  lotAnalyzed: string;
  /** Version de l'analyse (ex. "V0", "V1") */
  versionLabel: string;
  /** Critères de pondération (avec sous-critères) */
  weightingCriteria: WeightingCriterion[];
  /** Entreprises actives pour cette phase */
  companies: Company[];
  /** Résultats triés par score global décroissant */
  sortedResults: RaoCompanyResult[];
  /** Notes techniques saisies */
  technicalNotes: TechnicalNote[];
  /** Décisions de négociation par entreprise */
  decisions: Record<number, NegotiationDecision>;
  /** Résultat de l'attributaire (undefined si non désigné) */
  attributaireResult?: RaoCompanyResult;
  /** Texte de conclusion déjà formaté (depuis SynthesePage) */
  scenarioDescription?: string;
  /** Indique si un questionnaire de clarification a été activé */
  hasQuestionnaire: boolean;
}

// ─── Helpers de formatage ────────────────────────────────────────────────────

function fmtMontant(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtScore(n: number): string {
  return n.toFixed(2);
}

function fmtDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function sanitizeFilename(s: string): string {
  return (s || "").replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40);
}

// ─── Builders de composants Word ─────────────────────────────────────────────

/** Paragraphe simple */
function para(text: string, opts?: { bold?: boolean; size?: number; spacing?: number }): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        bold: opts?.bold ?? false,
        size: opts?.size,
      }),
    ],
    spacing: { after: opts?.spacing ?? 120 },
  });
}

/** Ligne vide */
function emptyLine(count = 1): Paragraph[] {
  return Array.from({ length: count }, () =>
    new Paragraph({ children: [new TextRun("")], spacing: { after: 200 } })
  );
}

/** Paragraphe clé : valeur */
function kvPara(key: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${key} : `, bold: true }),
      new TextRun({ text: value || "—" }),
    ],
    spacing: { after: 120 },
  });
}

/** Séparateur horizontal (ligne vide + un tiret long) */
function separator(): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: "─".repeat(80), color: "AAAAAA" })],
    spacing: { before: 200, after: 200 },
  });
}

/** Tableau de classement (Rang | Entreprise | Note Tech | Note Prix | Note Globale) */
function buildRankingTable(
  sortedResults: RaoCompanyResult[],
  maxTotal: number
): Table {
  // Borders uniformes
  const border = {
    style: BorderStyle.SINGLE,
    size: 4,
    color: "AAAAAA",
  };
  const allBorders = { top: border, bottom: border, left: border, right: border };

  // En-tête
  const headers = ["Rang", "Entreprise", "Note Technique", "Note Prix", "Note Globale"];
  const widths = [800, 3000, 1800, 1800, 1800];

  const headerRow = new TableRow({
    children: headers.map((h, i) =>
      new TableCell({
        children: [
          new Paragraph({
            children: [new TextRun({ text: h, bold: true, color: "FFFFFF" })],
            alignment: AlignmentType.CENTER,
          }),
        ],
        width: { size: widths[i], type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: "1F4E79", fill: "1F4E79" },
        borders: allBorders,
      })
    ),
    tableHeader: true,
  });

  // Lignes de données
  const eligible = sortedResults.filter((r) => r.company.status !== "ecartee");
  const excluded = sortedResults.filter((r) => r.company.status === "ecartee");

  let rank = 1;
  const dataRows = eligible.map((r) => {
    const rowRank = rank++;
    const fillColor = rowRank === 1 ? "E2EFDA" : rowRank % 2 === 0 ? "F5F5F5" : "FFFFFF";
    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: String(rowRank), bold: rowRank === 1 })], alignment: AlignmentType.CENTER })],
          width: { size: widths[0], type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: fillColor, fill: fillColor },
          borders: allBorders,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: r.company.name || "—", bold: rowRank === 1 })] })],
          width: { size: widths[1], type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: fillColor, fill: fillColor },
          borders: allBorders,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: fmtScore(r.techScore) })], alignment: AlignmentType.CENTER })],
          width: { size: widths[2], type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: fillColor, fill: fillColor },
          borders: allBorders,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: fmtScore(r.priceScore) })], alignment: AlignmentType.CENTER })],
          width: { size: widths[3], type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: fillColor, fill: fillColor },
          borders: allBorders,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: `${fmtScore(r.globalScore)} / ${maxTotal}`, bold: rowRank === 1 })], alignment: AlignmentType.CENTER })],
          width: { size: widths[4], type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: fillColor, fill: fillColor },
          borders: allBorders,
        }),
      ],
    });
  });

  // Lignes écartées (en gris)
  const excludedRows = excluded.map((r) =>
    new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "—", color: "999999" })], alignment: AlignmentType.CENTER })],
          width: { size: widths[0], type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: "EEEEEE", fill: "EEEEEE" },
          borders: allBorders,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: `${r.company.name || "—"} (Écartée)`, color: "999999", italics: true })] })],
          width: { size: widths[1], type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: "EEEEEE", fill: "EEEEEE" },
          borders: allBorders,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "—", color: "999999" })], alignment: AlignmentType.CENTER })],
          width: { size: widths[2], type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: "EEEEEE", fill: "EEEEEE" },
          borders: allBorders,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "—", color: "999999" })], alignment: AlignmentType.CENTER })],
          width: { size: widths[3], type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: "EEEEEE", fill: "EEEEEE" },
          borders: allBorders,
        }),
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: "—", color: "999999" })], alignment: AlignmentType.CENTER })],
          width: { size: widths[4], type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: "EEEEEE", fill: "EEEEEE" },
          borders: allBorders,
        }),
      ],
    })
  );

  return new Table({
    rows: [headerRow, ...dataRows, ...excludedRows],
    width: { size: 9200, type: WidthType.DXA },
  });
}

/** Tableau de signatures (2 colonnes) */
function buildSignatureTable(): Table {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
  const allBorders = { top: border, bottom: border, left: border, right: border };
  const sigWidth = 4400;

  return new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "L'Acheteur", bold: true })], alignment: AlignmentType.CENTER })],
            width: { size: sigWidth, type: WidthType.DXA },
            shading: { type: ShadingType.SOLID, color: "F0F0F0", fill: "F0F0F0" },
            borders: allBorders,
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: "Le Représentant du Pouvoir Adjudicateur", bold: true })], alignment: AlignmentType.CENTER })],
            width: { size: sigWidth, type: WidthType.DXA },
            shading: { type: ShadingType.SOLID, color: "F0F0F0", fill: "F0F0F0" },
            borders: allBorders,
          }),
        ],
      }),
      // Espace pour les signatures (4 lignes vides par colonne)
      new TableRow({
        children: [
          new TableCell({
            children: [
              ...Array.from({ length: 4 }, () =>
                new Paragraph({ children: [new TextRun("")], spacing: { after: 280 } })
              ),
              new Paragraph({ children: [new TextRun({ text: "Nom et qualité : ………………………………", size: 18 })], spacing: { after: 120 } }),
              new Paragraph({ children: [new TextRun({ text: "Date : …………………………………………………", size: 18 })], spacing: { after: 120 } }),
            ],
            width: { size: sigWidth, type: WidthType.DXA },
            borders: allBorders,
          }),
          new TableCell({
            children: [
              ...Array.from({ length: 4 }, () =>
                new Paragraph({ children: [new TextRun("")], spacing: { after: 280 } })
              ),
              new Paragraph({ children: [new TextRun({ text: "Nom et qualité : ………………………………", size: 18 })], spacing: { after: 120 } }),
              new Paragraph({ children: [new TextRun({ text: "Date : …………………………………………………", size: 18 })], spacing: { after: 120 } }),
            ],
            width: { size: sigWidth, type: WidthType.DXA },
            borders: allBorders,
          }),
        ],
      }),
    ],
    width: { size: 9200, type: WidthType.DXA },
  });
}

// ─── Fonction principale ─────────────────────────────────────────────────────

/**
 * Génère et télécharge le Rapport d'Analyse des Offres au format .docx.
 * Ne modifie aucune donnée — lecture seule.
 */
export async function exportRaoWord(params: ExportRaoWordParams): Promise<void> {
  const {
    projectName,
    marketRef,
    analysisDate,
    author,
    lotLabel,
    lotNumber,
    lotAnalyzed,
    versionLabel,
    weightingCriteria,
    companies,
    sortedResults,
    technicalNotes,
    decisions,
    attributaireResult,
    scenarioDescription,
    hasQuestionnaire,
  } = params;

  // Critères techniques (hors "prix")
  const technicalCriteria = weightingCriteria.filter((c) => c.id !== "prix");
  const prixCriterion = weightingCriteria.find((c) => c.id === "prix");
  const prixWeight = prixCriterion?.weight ?? 0;
  const techTotalWeight = technicalCriteria.reduce((s, c) => s + c.weight, 0);
  const maxTotal = prixWeight + techTotalWeight;

  const children: (Paragraph | Table)[] = [];

  // ══════════════════════════════════════════════════════════════════════
  // 1. PAGE DE GARDE
  // ══════════════════════════════════════════════════════════════════════
  children.push(
    new Paragraph({
      text: "RAPPORT DE PRÉSENTATION ET D'ANALYSE DES OFFRES",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 },
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ text: "Document confidentiel — Usage interne", italics: true, color: "888888", size: 18 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    })
  );

  children.push(separator());

  children.push(kvPara("Acheteur", "CIRAD"));
  children.push(kvPara("Marché", marketRef || "—"));
  children.push(kvPara("Objet", projectName || "—"));
  children.push(kvPara("Lot", `N° ${lotNumber || "—"} — ${lotLabel || "—"}`));
  children.push(kvPara("Désignation", lotAnalyzed || "—"));
  children.push(kvPara("Date d'analyse", fmtDate(analysisDate)));
  children.push(kvPara("Phase", versionLabel === "V0" ? "Analyse initiale" : `Négociation ${versionLabel}`));
  children.push(kvPara("Rapporteur", author || "—"));

  children.push(separator());
  children.push(...emptyLine(2));

  // ══════════════════════════════════════════════════════════════════════
  // 2. OBJET DU MARCHÉ
  // ══════════════════════════════════════════════════════════════════════
  children.push(
    new Paragraph({
      text: "1. Objet du marché",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );
  children.push(para(`Le présent rapport porte sur l'analyse des offres reçues dans le cadre du marché : ${projectName || "—"}.`));
  if (lotAnalyzed) {
    children.push(para(`Lot analysé : ${lotAnalyzed}.`));
  }
  children.push(...emptyLine(1));

  // ══════════════════════════════════════════════════════════════════════
  // 3. CRITÈRES D'ATTRIBUTION
  // ══════════════════════════════════════════════════════════════════════
  children.push(
    new Paragraph({
      text: "2. Critères d'attribution",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );
  children.push(
    para(
      "Les offres ont été jugées selon les critères pondérés définis dans le règlement de la consultation :",
      { spacing: 200 }
    )
  );

  for (const criterion of weightingCriteria) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `• ${criterion.label}`, bold: true }),
          new TextRun({ text: ` — Pondération : ${criterion.weight} %` }),
        ],
        spacing: { before: 80, after: 80 },
        indent: { left: 360 },
      })
    );
    // Sous-critères
    if (criterion.subCriteria && criterion.subCriteria.length > 0) {
      for (const sub of criterion.subCriteria) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `    ◦ ${sub.label}`, italics: true }),
              new TextRun({ text: ` (${sub.weight} %)`, color: "666666" }),
            ],
            spacing: { before: 40, after: 40 },
            indent: { left: 720 },
          })
        );
      }
    }
  }
  children.push(...emptyLine(1));

  // ══════════════════════════════════════════════════════════════════════
  // 4. CANDIDATS
  // ══════════════════════════════════════════════════════════════════════
  children.push(
    new Paragraph({
      text: "3. Candidats ayant remis une offre",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );
  children.push(para(`${companies.length} offre(s) reçue(s) pour ce lot.`, { spacing: 200 }));

  for (const company of companies) {
    const decision = decisions[company.id];
    const decisionLabel = decision && decision !== "non_defini"
      ? ` — ${NEGOTIATION_DECISION_LABELS[decision]}`
      : "";
    const isExcluded = company.status === "ecartee";
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `• ${company.name || "Entreprise sans nom"}`,
            bold: !isExcluded,
            color: isExcluded ? "999999" : "000000",
          }),
          new TextRun({
            text: isExcluded
              ? ` (Offre écartée${company.exclusionReason ? ` — Motif : ${company.exclusionReason}` : ""})`
              : decisionLabel,
            italics: true,
            color: isExcluded ? "CC0000" : "444444",
          }),
        ],
        spacing: { before: 80, after: 80 },
        indent: { left: 360 },
      })
    );
  }
  children.push(...emptyLine(1));

  // ══════════════════════════════════════════════════════════════════════
  // 5. ANALYSE FINANCIÈRE
  // ══════════════════════════════════════════════════════════════════════
  children.push(
    new Paragraph({
      text: "4. Analyse financière",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );
  children.push(
    para(
      `Le critère Prix est pondéré à ${prixWeight} %. La note prix est calculée selon la formule : ` +
        `Note Prix = (Offre minimale / Offre de l'entreprise) × ${prixWeight}.`,
      { spacing: 200 }
    )
  );

  const eligibleForFinancial = sortedResults.filter((r) => r.company.status !== "ecartee");
  for (const row of eligibleForFinancial) {
    children.push(
      new Paragraph({
        text: row.company.name || "—",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 120 },
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Montant de l'offre (Tranche Ferme + PSE retenues) : ", bold: true }),
          new TextRun({ text: row.priceTotal > 0 ? `${fmtMontant(row.priceTotal)} HT` : "Non renseigné" }),
        ],
        spacing: { after: 100 },
        indent: { left: 360 },
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Note Prix : `, bold: true }),
          new TextRun({ text: `${fmtScore(row.priceScore)} / ${prixWeight} pts` }),
        ],
        spacing: { after: 100 },
        indent: { left: 360 },
      })
    );
  }
  children.push(...emptyLine(1));

  // ══════════════════════════════════════════════════════════════════════
  // 6. ANALYSE TECHNIQUE
  // ══════════════════════════════════════════════════════════════════════
  children.push(
    new Paragraph({
      text: "5. Analyse technique",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );
  children.push(
    para(
      `La valeur technique est pondérée à ${techTotalWeight} %. La notation s'effectue selon le barème : ` +
        "Très bien (100 %), Bien (75 %), Moyen (50 %), Passable (25 %), Insuffisant (10 %).",
      { spacing: 200 }
    )
  );

  if (hasQuestionnaire) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "ℹ Des demandes de clarification ont été adressées aux entreprises. Les réponses reçues ont été intégrées à l'analyse.",
            italics: true,
            color: "1F4E79",
          }),
        ],
        spacing: { before: 100, after: 200 },
      })
    );
  }

  const eligibleForTech = sortedResults.filter((r) => r.company.status !== "ecartee");
  for (const row of eligibleForTech) {
    children.push(
      new Paragraph({
        text: row.company.name || "—",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 120 },
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Note Technique globale : ", bold: true }),
          new TextRun({ text: `${fmtScore(row.techScore)} / ${techTotalWeight} pts` }),
        ],
        spacing: { after: 160 },
        indent: { left: 360 },
      })
    );

    // Détail par critère technique
    for (const criterion of technicalCriteria) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Critère : ${criterion.label} (${criterion.weight} %)`, bold: true })],
          spacing: { before: 160, after: 80 },
          indent: { left: 360 },
        })
      );

      if (criterion.subCriteria && criterion.subCriteria.length > 0) {
        // Sous-critères
        for (const sub of criterion.subCriteria) {
          const note = technicalNotes.find(
            (n) =>
              n.companyId === row.company.id &&
              n.criterionId === criterion.id &&
              n.subCriterionId === sub.id
          );
          const notationLabel = note?.notation
            ? NOTATION_LABELS[note.notation]
            : "Non noté";

          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `    ◦ ${sub.label} (${sub.weight} %) : `, italics: true }),
                new TextRun({ text: notationLabel, bold: !!note?.notation }),
              ],
              spacing: { before: 60, after: 60 },
              indent: { left: 720 },
            })
          );

          if (note?.comment?.trim()) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: "Appréciation : ", bold: true }),
                  new TextRun({ text: note.comment.trim() }),
                ],
                spacing: { after: 60 },
                indent: { left: 1080 },
              })
            );
          }
          if (note?.commentPositif?.trim()) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: "+ ", bold: true, color: "2E7D32" }),
                  new TextRun({ text: note.commentPositif.trim(), color: "2E7D32" }),
                ],
                spacing: { after: 60 },
                indent: { left: 1080 },
              })
            );
          }
          if (note?.commentNegatif?.trim()) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: "– ", bold: true, color: "C62828" }),
                  new TextRun({ text: note.commentNegatif.trim(), color: "C62828" }),
                ],
                spacing: { after: 60 },
                indent: { left: 1080 },
              })
            );
          }
          // Réponse aux questions de clarification
          if (note?.questionResponse?.trim()) {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: "Réponse apportée : ", bold: true, italics: true }),
                  new TextRun({ text: note.questionResponse.trim(), italics: true }),
                ],
                spacing: { after: 60 },
                indent: { left: 1080 },
              })
            );
          }
        }
      } else {
        // Critère sans sous-critère
        const note = technicalNotes.find(
          (n) =>
            n.companyId === row.company.id &&
            n.criterionId === criterion.id &&
            !n.subCriterionId
        );
        const notationLabel = note?.notation
          ? NOTATION_LABELS[note.notation]
          : "Non noté";

        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: "Notation : ", bold: true }),
              new TextRun({ text: notationLabel }),
            ],
            spacing: { after: 60 },
            indent: { left: 720 },
          })
        );

        if (note?.comment?.trim()) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "Appréciation : ", bold: true }),
                new TextRun({ text: note.comment.trim() }),
              ],
              spacing: { after: 60 },
              indent: { left: 720 },
            })
          );
        }
        if (note?.commentPositif?.trim()) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "+ ", bold: true, color: "2E7D32" }),
                new TextRun({ text: note.commentPositif.trim(), color: "2E7D32" }),
              ],
              spacing: { after: 60 },
              indent: { left: 720 },
            })
          );
        }
        if (note?.commentNegatif?.trim()) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "– ", bold: true, color: "C62828" }),
                new TextRun({ text: note.commentNegatif.trim(), color: "C62828" }),
              ],
              spacing: { after: 60 },
              indent: { left: 720 },
            })
          );
        }
        if (note?.questionResponse?.trim()) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: "Réponse apportée : ", bold: true, italics: true }),
                new TextRun({ text: note.questionResponse.trim(), italics: true }),
              ],
              spacing: { after: 60 },
              indent: { left: 720 },
            })
          );
        }
      }
    }
  }
  children.push(...emptyLine(1));

  // ══════════════════════════════════════════════════════════════════════
  // 7. CLASSEMENT FINAL
  // ══════════════════════════════════════════════════════════════════════
  children.push(
    new Paragraph({
      text: "6. Classement final",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );
  children.push(
    para(
      `Le classement est établi par ordre décroissant de note globale (sur ${maxTotal} pts maximum). ` +
        "Les entreprises écartées administrativement ne sont pas classées.",
      { spacing: 200 }
    )
  );

  children.push(buildRankingTable(sortedResults, maxTotal));
  children.push(...emptyLine(1));

  // ══════════════════════════════════════════════════════════════════════
  // 8. CONCLUSION / PROPOSITION D'ATTRIBUTION
  // ══════════════════════════════════════════════════════════════════════
  children.push(
    new Paragraph({
      text: "7. Conclusion et proposition d'attribution",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );

  if (attributaireResult) {
    const conclusionText =
      scenarioDescription ||
      `Il est proposé d'attribuer le marché (${lotLabel || "lot concerné"}) à l'entreprise ` +
        `${attributaireResult.company.name} pour un montant de ${fmtMontant(attributaireResult.priceTotal)} HT, ` +
        `qui a obtenu la meilleure note globale (${fmtScore(attributaireResult.globalScore)} / ${maxTotal} pts).`;

    children.push(
      new Paragraph({
        children: [new TextRun({ text: conclusionText, bold: false })],
        spacing: { after: 200 },
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Attributaire pressenti : ", bold: true }),
          new TextRun({ text: attributaireResult.company.name }),
        ],
        spacing: { after: 100 },
        indent: { left: 360 },
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Note globale : ", bold: true }),
          new TextRun({ text: `${fmtScore(attributaireResult.globalScore)} / ${maxTotal} pts` }),
        ],
        spacing: { after: 100 },
        indent: { left: 360 },
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Montant proposé : ", bold: true }),
          new TextRun({ text: `${fmtMontant(attributaireResult.priceTotal)} HT` }),
        ],
        spacing: { after: 200 },
        indent: { left: 360 },
      })
    );
  } else {
    children.push(
      para(
        "Aucun attributaire n'a été désigné à ce stade. La procédure est en cours.",
        { spacing: 200 }
      )
    );
  }
  children.push(...emptyLine(1));

  // ══════════════════════════════════════════════════════════════════════
  // 9. SIGNATURES
  // ══════════════════════════════════════════════════════════════════════
  children.push(
    new Paragraph({
      text: "8. Signatures",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    })
  );
  children.push(
    para(
      "Les soussignés certifient l'exactitude des informations contenues dans ce rapport.",
      { spacing: 200 }
    )
  );
  children.push(buildSignatureTable());

  // ══════════════════════════════════════════════════════════════════════
  // ASSEMBLAGE DU DOCUMENT
  // ══════════════════════════════════════════════════════════════════════
  const doc = new Document({
    creator: author || "CIRAD",
    title: `RAO — ${marketRef || projectName} — ${lotLabel}`,
    description: "Rapport d'Analyse des Offres généré automatiquement",
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 }, // ~2 cm
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = `rao-${sanitizeFilename(marketRef || projectName)}-lot${sanitizeFilename(lotNumber)}-${versionLabel}.docx`;
  saveAs(blob, fileName);
}
