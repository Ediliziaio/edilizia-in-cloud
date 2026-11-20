import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { printable, wrap } from "../genera-pdf-rapportino/render.ts";
import { leggiValori, valoreInTesto, valoriDaStampare } from "../_shared/moduliCantiere.ts";
import { outcomes, results, type AcceptanceContent } from "./model.ts";

export async function renderAcceptance(
  c: AcceptanceContent,
  context: {
    company: string;
    logo?: Uint8Array;
    companyAddress?: string;
    companyVat?: string;
    companyEmail?: string;
    companyPhone?: string;
    order: string;
    address: string;
    id: string;
    version: number;
  },
  firma?: { immagine: Uint8Array; nome: string; quando: string },
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
    if (y - height < 115) {
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
    y -= 8;
    page.drawRectangle({ x: 42, y: y - 5, width: 3, height: 15, color: orange });
    draw(title, 53, y, 11, true, blue);
    y -= 13;
    page.drawLine({
      start: { x: 42, y },
      end: { x: 553, y },
      color: rgb(0.88, 0.9, 0.93),
      thickness: 0.7,
    });
    y -= 18;
  };
  // Una fascia di apertura dedicata distingue il verbale dai dati compilati.
  const titleLines = wrap(c.title, bold, 20, 511);
  const headerBottom = 730 - Math.max(0, titleLines.length - 1) * 23;
  page.drawRectangle({ x: 0, y: headerBottom, width: 595.28, height: 841.89 - headerBottom, color: blue });
  page.drawRectangle({ x: 42, y: 807, width: 28, height: 3, color: orange });
  draw(context.company, 42, 787, 10, true, rgb(0.86, 0.91, 0.97));
  if (context.logo) {
    try {
      const image = context.logo[0] === 137 && context.logo[1] === 80
        ? await pdf.embedPng(context.logo) : await pdf.embedJpg(context.logo);
      const size = image.scaleToFit(104, 30);
      page.drawRectangle({ x: 437, y: 773, width: 116, height: 42, color: rgb(1, 1, 1) });
      page.drawImage(image, { x: 495 - size.width / 2, y: 794 - size.height / 2, width: size.width, height: size.height });
    } catch { /* Formato del logo non supportato. */ }
  }
  y = 759;
  for (const line of titleLines) {
    draw(line, 42, y, 20, true, rgb(1, 1, 1));
    y -= 23;
  }
  y = headerBottom - 20;
  if (!firma) paragraph("EDIZIONE NON FIRMATA", 9, orange, true);
  paragraph(
    "Documento operativo: non sostituisce certificazioni, dichiarazioni di conformità o verifiche riservate a tecnici abilitati.",
    9,
    muted,
  );
  section("01 / Riferimenti della verifica");
  const riferimenti = [
    ["Cliente", c.customer], ["Commessa", context.order],
    ["Cantiere", context.address], ["Data", c.date],
    ["Verificatore", c.inspector],
  ];
  for (let i = 0; i < riferimenti.length; i += 2) {
    const coppia = riferimenti.slice(i, i + 2);
    const righe = coppia.map(([, value]) => wrap(value || "Non indicato", regular, 10, 220));
    const height = 34 + Math.max(...righe.map(lines => lines.length)) * 13;
    ensure(height + 4);
    const top = y + 9;
    page.drawRectangle({ x: 42, y: top - height, width: 511, height, color: rgb(0.965, 0.976, 0.987), borderColor: rgb(0.87, 0.9, 0.94), borderWidth: 0.5 });
    coppia.forEach(([label], colonna) => {
      const x = 54 + colonna * 255;
      draw(label.toUpperCase(), x, top - 15, 8, true, muted);
      righe[colonna].forEach((line, index) => draw(line, x, top - 30 - index * 13, 10, true));
    });
    y -= height + 4;
  }
  y -= 8;
  paragraph(c.scope || "Perimetro della verifica da completare.");
  section("02 / Controlli effettuati");
  c.checks.forEach((v, i) => {
    const lines = wrap(`${i + 1}. ${v.label}`, bold, 9, 365);
    const height = Math.max(25, lines.length * 13 + 10);
    ensure(height + 2);
    const bottom = y - height + 8;
    page.drawRectangle({ x: 42, y: bottom, width: 511, height, color: i % 2 ? rgb(0.97, 0.98, 0.99) : rgb(1, 1, 1), borderColor: rgb(0.88, 0.91, 0.94), borderWidth: 0.4 });
    page.drawRectangle({ x: 53, y: y - 3, width: 8, height: 8, borderColor: blue, borderWidth: 0.8, color: v.result === "ok" ? blue : rgb(1, 1, 1) });
    for (const [index, line] of lines.entries()) draw(line, 70, y, 9, true, ink);
    draw(results[v.result], 453, y, 8, true, v.result === "reserve" ? orange : blue);
    y -= height + 2;
    if (v.note) { paragraph(v.note, 9); y -= 4; }
  });
  // Il verbale è un documento per il cliente: i valori interni restano nell'app.
  const valoriCliente = valoriDaStampare(leggiValori(c.valori), "cliente");
  if (valoriCliente.length) {
    ensure(100);
    section("Dati del collaudo");
    for (let i = 0; i < valoriCliente.length; i += 2) {
      const coppia = valoriCliente.slice(i, i + 2);
      const etichette = coppia.map(v => wrap(v.etichetta, bold, 9, 235));
      const valori = coppia.map(v => wrap(valoreInTesto(v) || "Non indicato", regular, 10, 235));
      const height = 7 + Math.max(...etichette.map(righe => righe.length)) * 14 + Math.max(...valori.map(righe => righe.length)) * 15;
      ensure(height);
      const top = y;
      coppia.forEach((_, colonna) => {
        const x = 42 + colonna * 260;
        etichette[colonna].forEach((riga, indice) => draw(riga, x, top - indice * 14, 9, true, muted));
        const base = top - Math.max(...etichette.map(righe => righe.length)) * 14;
        valori[colonna].forEach((riga, indice) => draw(riga, x, base - indice * 15, 10));
      });
      y -= height;
    }
  }
  section("03 / Esito e riserve");
  ensure(52);
  page.drawRectangle({ x: 42, y: y - 24, width: 511, height: 38, color: rgb(0.94, 0.97, 0.99), borderColor: rgb(0.8, 0.87, 0.93), borderWidth: 0.7 });
  draw("ESITO DELLA VERIFICA", 54, y + 1, 8, true, muted);
  draw(outcomes[c.outcome], 54, y - 14, 12, true, c.outcome === "positive" ? blue : orange);
  y -= 40;
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
  section("Condizioni di accettazione");
  paragraph("Il cliente prende visione dei controlli, dell’esito e delle eventuali riserve riportate nel presente verbale.", 10);
  y -= 4;
  paragraph("La firma del cliente attesta la presa visione secondo l’esito indicato. Eventuali lavori o costi aggiuntivi richiedono una conferma separata.", 9, muted);
  ensure(50);
  y -= 12;
  paragraph(
    firma ? "La firma non approva costi extra e non modifica gli importi della commessa. Eventuali varianti richiedono approvazione separata." :
    "La registrazione di questo verbale non costituisce firma o accettazione del cliente, non approva costi extra e non modifica gli importi della commessa. Eventuali varianti richiedono approvazione separata.",
    9,
    muted,
  );
  if (!firma) {
    ensure(95);
    for (const [x, label] of [[42, "COMMITTENTE"], [304, "IMPRESA ESECUTRICE"]] as const) {
      page.drawRectangle({ x, y: y - 65, width: 249, height: 68, borderColor: rgb(0.82, 0.86, 0.91), borderWidth: 0.7 });
      draw(label, x + 12, y - 13, 8, true, muted);
      draw("Luogo e data", x + 12, y - 34, 8, false, muted);
      draw("Firma", x + 12, y - 54, 8, false, muted);
    }
    y -= 79;
  }
  if (firma) {
    const immagine = await pdf.embedPng(firma.immagine);
    const d = immagine.scaleToFit(200, 60);
    // La firma acquisita e lo spazio per l'impresa restano sulla stessa pagina.
    ensure(d.height + 120);
    section("Firma del cliente");
    const altezzaFirma = Math.max(68, d.height + 16);
    page.drawRectangle({ x: 304, y: y - altezzaFirma, width: 249, height: altezzaFirma, borderColor: rgb(0.82, 0.86, 0.91), borderWidth: 0.7 });
    draw("IMPRESA ESECUTRICE", 316, y - 14, 8, true, muted);
    draw("Luogo e data", 316, y - 35, 8, false, muted);
    draw("Firma", 316, y - 55, 8, false, muted);
    page.drawImage(immagine, { x: 42, y: y - d.height, width: d.width, height: d.height });
    y -= altezzaFirma + 14;
    paragraph(`Firmato su schermo da ${firma.nome} il ${firma.quando}.`, 10, ink, true);
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: 42, y: 85 }, end: { x: 553, y: 85 }, color: rgb(0.84, 0.88, 0.92), thickness: 0.7 });
    const centered = (text: string, font: typeof regular, size: number, y: number, color = muted) => {
      const safe = printable(text);
      p.drawText(safe, { x: (595.28 - font.widthOfTextAtSize(safe, size)) / 2, y, size, font, color });
    };
    centered(context.company, bold, 8, 71, blue);
    const details = [
      context.companyAddress,
      context.companyVat ? `P. IVA ${context.companyVat}` : "",
      context.companyPhone,
      context.companyEmail,
    ].filter(Boolean).join("  ·  ");
    const footerLines = wrap(details, regular, 7, 445).slice(0, 3);
    footerLines.forEach((line, lineIndex) => centered(line, regular, 7, 58 - lineIndex * 10));
    p.drawText(printable(`Rif. ${context.id} / v${context.version}`), {
      x: 42, y: 27, size: 7, font: regular, color: muted,
    });
    p.drawText(`${i + 1} / ${pages.length}`, {
      x: 515, y: 27, size: 8, font: bold, color: blue,
    });
  });
  return { bytes: await pdf.save(), pages: pages.length };
}
