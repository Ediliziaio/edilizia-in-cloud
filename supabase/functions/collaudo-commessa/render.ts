import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { printable, wrap } from "../genera-pdf-rapportino/render.ts";
import { outcomes, results, type AcceptanceContent } from "./model.ts";

export async function renderAcceptance(
  c: AcceptanceContent,
  context: {
    company: string;
    order: string;
    address: string;
    id: string;
    version: number;
  },
) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const blue = rgb(0.1, 0.23, 0.4),
    orange = rgb(0.96, 0.39, 0.06),
    ink = rgb(0.12, 0.17, 0.23),
    muted = rgb(0.39, 0.45, 0.52);
  let page = pdf.addPage([595.28, 841.89]),
    y = 790;
  const draw = (
    v: string,
    x: number,
    yy: number,
    size = 10,
    strong = false,
    color = ink,
  ) =>
    page.drawText(printable(v), {
      x,
      y: yy,
      size,
      font: strong ? bold : regular,
      color,
    });
  const ensure = (height: number) => {
    if (y - height < 65) {
      page = pdf.addPage([595.28, 841.89]);
      y = 782;
      draw("VERBALE DI VERIFICA / " + context.order, 42, 807, 8, true, blue);
    }
  };
  const paragraph = (v: string, size = 10, color = ink, strong = false) => {
    for (const line of wrap(v, strong ? bold : regular, size, 511)) {
      ensure(size + 5);
      draw(line, 42, y, size, strong, color);
      y -= size + 5;
    }
  };
  const section = (title: string) => {
    ensure(55);
    y -= 6;
    draw(title, 42, y, 11, true, blue);
    y -= 8;
    page.drawLine({
      start: { x: 42, y },
      end: { x: 553, y },
      color: orange,
      thickness: 1,
    });
    y -= 18;
  };
  paragraph(context.company, 11, blue, true);
  y -= 15;
  paragraph(c.title, 23, blue, true);
  y -= 5;
  paragraph("EDIZIONE NON FIRMATA", 9, orange, true);
  paragraph(
    "Documento operativo: non sostituisce certificazioni, dichiarazioni di conformità o verifiche riservate a tecnici abilitati.",
    9,
    muted,
  );
  section("01 / Riferimenti della verifica");
  for (const [label, value] of [
    ["Commessa", context.order],
    ["Cantiere", context.address],
    ["Data", c.date],
    ["Cliente", c.customer],
    ["Verificatore", c.inspector],
  ])
    paragraph(`${label}: ${value || "Non indicato"}`);
  y -= 8;
  paragraph(c.scope || "Perimetro della verifica da completare.");
  section("02 / Controlli effettuati");
  c.checks.forEach((v, i) => {
    ensure(40);
    paragraph(
      `${i + 1}. ${v.label} — ${results[v.result]}`,
      10,
      v.result === "reserve" ? orange : ink,
      true,
    );
    if (v.note) paragraph(v.note, 9);
    y -= 4;
  });
  section("03 / Esito e riserve");
  paragraph(
    outcomes[c.outcome],
    14,
    c.outcome === "positive" ? blue : orange,
    true,
  );
  paragraph(c.reservations || "Nessuna riserva indicata.");
  if (c.actions.length) {
    section("04 / Interventi da completare");
    c.actions.forEach((a, i) => {
      ensure(60);
      paragraph(`${i + 1}. ${a.work || "Attività da definire"}`, 10, ink, true);
      paragraph(
        `Responsabile: ${a.owner || "Da definire"} · Entro: ${a.due || "Da definire"}`,
        9,
        muted,
      );
      y -= 8;
    });
  }
  section("Documenti e istruzioni");
  paragraph(c.documents || "Da completare.");
  if (c.notes) {
    section("Note condivise con il cliente");
    paragraph(c.notes);
  }
  ensure(50);
  y -= 12;
  paragraph(
    "La registrazione di questo verbale non costituisce firma o accettazione del cliente, non approva costi extra e non modifica gli importi della commessa. Eventuali varianti richiedono approvazione separata.",
    9,
    muted,
  );
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(printable(`Rif. ${context.id} / v${context.version}`), {
      x: 42,
      y: 38,
      size: 7,
      font: regular,
      color: muted,
    });
    p.drawText(`${i + 1} / ${pages.length}`, {
      x: 515,
      y: 38,
      size: 8,
      font: bold,
      color: blue,
    });
  });
  return { bytes: await pdf.save(), pages: pages.length };
}
