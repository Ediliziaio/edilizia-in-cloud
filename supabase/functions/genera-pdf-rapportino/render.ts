import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage } from "https://esm.sh/pdf-lib@1.17.1";
import { dayLabel, hours, number, percentage, record, reportSummary, rows, text, timestamp, type PdfContext } from "./model.ts";

/** Keep paragraph breaks; replace unsupported glyphs explicitly instead of crashing. */
export function printable(value: string): string {
  return value.normalize("NFC").replace(/[–—]/g, "-").replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(/[^\x20-\x7E\xA0-\xFF\n‘’“”…€]/g, "?");
}
export function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const result: string[] = [];
  for (const paragraph of printable(value).split("\n")) {
    if (!paragraph.trim()) { result.push(""); continue; }
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      if (font.widthOfTextAtSize(line ? `${line} ${word}` : word, size) <= width) { line = line ? `${line} ${word}` : word; continue; }
      if (line) result.push(line);
      line = "";
      for (const char of word) {
        if (line && font.widthOfTextAtSize(line + char, size) > width) { result.push(line); line = ""; }
        line += char;
      }
    }
    if (line) result.push(line);
  }
  return result;
}

export async function renderRapportino(ctx: PdfContext, loadImage: (reference: string, kind: "photo" | "signature" | "logo") => Promise<Uint8Array | null>) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const r = ctx.report, summary = reportSummary(r), order = record(r.ordine);
  const warnings = [...ctx.warnings];
  const W = 595.28, H = 841.89, M = 42, CW = W - M * 2, bottom = 62;
  const ink = rgb(.12, .18, .25), muted = rgb(.40, .45, .50), line = rgb(.86, .89, .91), pale = rgb(.96, .97, .98);
  const match = /^#?([a-f0-9]{6})$/i.exec(ctx.branding.primaryColor ?? "");
  const hex = match ? parseInt(match[1], 16) : 0xf97415;
  const accent = rgb(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
  let page = pdf.addPage([W, H]), y = H - M;
  const draw = (value: string, x: number, yy: number, size = 9, font = regular, color = ink) => page.drawText(printable(value), { x, y: yy, size, font, color });
  const rule = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: .6, color: line });
  const reportId = text(r.id) || "senza-identificativo";
  const shortId = reportId.slice(0, 8).toUpperCase();
  const title = r.lavoro_completato === true ? "Rapporto di fine lavori" : "Rapportino giornaliero";
  const nextPage = () => {
    page = pdf.addPage([W, H]);
    draw(`${title} | ${shortId} | ${dayLabel(r.data_lavoro)}`, M, H - 35, 8, bold, muted);
    rule(H - 46);
    y = H - 68;
  };
  const ensure = (needed: number) => { if (y - needed < bottom) { nextPage(); return true; } return false; };
  const paragraph = (value: string, size = 9.5, color = ink, width = CW, x = M) => {
    for (const l of wrap(value, regular, size, width)) { ensure(size + 5); draw(l, x, y, size, regular, color); y -= size + 4; }
  };
  const section = (label: string, reserve = 35) => { ensure(reserve + 25); y -= 6; draw(label, M, y, 11, bold); y -= 8; rule(y); y -= 17; };
  const field = (label: string, value: string) => {
    const lines = wrap(value || "Non disponibile", regular, 9, CW - 92);
    lines.forEach((l, i) => { ensure(14); if (i === 0) draw(label, M, y, 8, bold, muted); draw(l, M + 92, y, 9); y -= 13; });
    y -= 3;
  };
  const table = (labels: string[], widths: number[], values: string[][]) => {
    const header = () => {
      page.drawRectangle({ x: M, y: y - 17, width: CW, height: 21, color: pale });
      let x = M;
      labels.forEach((l, i) => { draw(l, x + 7, y - 10, 8, bold, muted); x += widths[i]; });
      y -= 23;
    };
    ensure(50); header();
    values.forEach((cells, idx) => {
      const lines = cells.map((c, i) => wrap(c, regular, 9, widths[i] - 14));
      const count = Math.max(1, ...lines.map(c => c.length));
      const rowHeight = count * 12 + 9;
      // Ordinary rows stay whole. Only a row taller than a page may be split.
      if (rowHeight <= H - 68 - bottom - 23 && y - rowHeight < bottom) { nextPage(); header(); }
      // Split very long rows into page-sized chunks, repeating column headers.
      let offset = 0;
      while (offset < count) {
        if (y - 25 < bottom) { nextPage(); header(); }
        const take = Math.min(count - offset, Math.max(1, Math.floor((y - bottom - 9) / 12)));
        const height = take * 12 + 9;
        if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - height + 4, width: CW, height, color: rgb(.984, .987, .990) });
        let x = M;
        lines.forEach((col, i) => { col.slice(offset, offset + take).forEach((l, j) => draw(l, x + 7, y - 9 - j * 12, 9)); x += widths[i]; });
        y -= height; offset += take;
        if (offset < count) { nextPage(); header(); }
      }
    });
    y -= 10;
  };
  const embed = async (ref: string, kind: "photo" | "signature" | "logo"): Promise<PDFImage | null> => {
    try {
      const bytes = await loadImage(ref, kind);
      if (!bytes) return null;
      return bytes[0] === 137 && bytes[1] === 80 ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    } catch { return null; }
  };

  // Compact company identity. Failed optional branding never looks like a missing work photo.
  const logo = ctx.branding.logoUrl ? await embed(ctx.branding.logoUrl, "logo") : null;
  const logoSpace = logo ? 68 : 0;
  if (logo) { const d = logo.scaleToFit(55, 38); page.drawImage(logo, { x: M, y: y - d.height + 9, ...d }); }
  const companyName = text(ctx.company.name) || "Impresa";
  for (const l of wrap(companyName, bold, 13, CW - logoSpace)) { draw(l, M + logoSpace, y, 13, bold); y -= 16; }
  const contacts = [text(ctx.company.legal_address), text(ctx.company.legal_city), text(ctx.company.phone), text(ctx.company.email), ctx.company.vat_number ? `P.IVA ${text(ctx.company.vat_number)}` : ""].filter(Boolean).join(" | ");
  if (contacts) paragraph(contacts, 8, muted, CW - logoSpace, M + logoSpace);
  y -= 12;
  page.drawRectangle({ x: M, y, width: 38, height: 3, color: accent }); y -= 28;
  draw(title, M, y, 22, bold); y -= 19;
  draw(`${dayLabel(r.data_lavoro)}  |  Rif. ${shortId}`, M, y, 10, regular, muted); y -= 23;
  draw(summary.statusLabel, M, y, 8, bold, summary.status === "rifiutato" ? rgb(.65, .18, .16) : ink); y -= 20;
  field("COMMESSA", [text(order.order_code), text(order.description)].filter(Boolean).join(" - "));
  field("CANTIERE", text(order.work_address) || text(order.indirizzo_lavori));
  field("CLIENTE", text(order.client_name));
  field("COMPILATORE", `${summary.author} | ${summary.authorRole}`);
  // created_at is registration, NOT an invented submission timestamp for historic drafts.
  field("REGISTRATO IL", timestamp(r.created_at));

  const indicators = [
    [summary.crew.length ? "ORE PRESENZE DICHIARATE" : "ORE DICHIARATE", hours(summary.total)],
    [summary.crew.length ? "VOCI DI PRESENZA" : "TIPO DI RAPPORTINO", summary.crew.length ? String(summary.crew.length) : "Individuale"],
    ["LAVORAZIONI SELEZIONATE", String(rows(r.fasi_lavorate).length)],
  ];
  ensure(65); y -= 2;
  indicators.forEach(([label, value], i) => {
    const width = (CW - 16) / 3, x = M + i * (width + 8);
    page.drawRectangle({ x, y: y - 48, width, height: 48, color: pale });
    draw(label, x + 9, y - 14, 6.8, bold, muted); draw(value, x + 9, y - 34, 13, bold);
  }); y -= 63;

  section("Lavori eseguiti");
  paragraph(text(r.descrizione_lavori) || "Descrizione non registrata."); y -= 6;
  const phases = rows(r.fasi_lavorate);
  if (phases.length) {
    section("Lavorazioni e avanzamento dichiarato", 60);
    const names = new Map(ctx.phases.map(p => [text(p.id), text(p.name)]));
    table(["Lavorazione", "Avanzamento dichiarato"], [CW - 148, 148], phases.map(p => [text(p.nome) || text(p.name) || names.get(text(p.phase_id)) || `Lavorazione ${text(p.phase_id) || "non identificata"}`, percentage(p.percentuale)]));
    paragraph("Percentuali riferite alle singole lavorazioni, non alle ore della giornata. La dichiarazione non sostituisce la verifica dell'ufficio.", 8, muted);
  } else if (number(r.percentuale_avanzamento) !== null) {
    paragraph(`Avanzamento generale dichiarato della commessa: ${percentage(r.percentuale_avanzamento)}.`, 8, muted);
  }
  if (summary.crew.length) {
    section("Squadra dichiarata nel rapportino", 65);
    table(["Persona / impresa", "Inquadramento", "Ore dichiarate"], [CW - 230, 130, 100], summary.crew.map(p => [text(p.nome) || "Nome non registrato", p.subappaltatore_id ? "Subappaltatore" : p.employee_id ? "Personale interno" : "Non specificato", hours(p.ore)]));
    paragraph("Il totale usa solo le presenze elencate: le ore personali del compilatore non vengono sommate di nuovo. Le presenze esterne non determinano automaticamente un costo orario.", 8, muted);
  }
  // Keep an ordinary day's time events together; long histories can paginate.
  section("Tempi del compilatore", ctx.punches.length ? 95 + Math.min(ctx.punches.length, 12) * 21 : 58);
  paragraph(`Ore ordinarie dichiarate: ${hours(summary.own)} | Straordinario dichiarato: ${hours(summary.extra)}`, 9);
  if (ctx.punches.length) {
    const types: Record<string, string> = { entrata: "Entrata", uscita: "Uscita", pausa_inizio: "Inizio pausa", pausa_fine: "Fine pausa" };
    table(["Evento", "Data e ora (Italia)"], [CW / 2, CW / 2], ctx.punches.map(p => [types[text(p.tipo)] || text(p.tipo), timestamp(p.timestamp_evento)]));
    paragraph("Eventi del solo compilatore, di questo cantiere e di questa data. Non sono un totale ore validato. Per turni oltre mezzanotte consultare anche la giornata adiacente nell'app.", 8, muted);
  } else paragraph("Nessuna timbratura disponibile per il compilatore su questo cantiere nella giornata. Le ore sopra sono dichiarate, non verificate automaticamente.", 8, muted);

  const materials = rows(r.materiali_usati);
  if (materials.length) {
    section("Materiali utilizzati", 65);
    table(["Materiale", "Quantità", "Unità", "Registrazione"], [CW - 215, 60, 55, 100], materials.map(m => [text(m.nome) || "Non specificato", number(m.quantita)?.toLocaleString("it-IT") ?? "Non indicata", text(m.unita) || "-", m.da_furgone === true ? "Dal furgone" : m.order_item_id ? "Articolo commessa" : "Dichiarazione manuale"]));
    paragraph("Quantità dichiarate nel rapportino: non attestano da sole uno scarico di magazzino.", 8, muted);
  }
  if (r.meteo) paragraph(`Meteo registrato: ${text(r.meteo)}`, 8, muted);
  if (text(r.note)) { section("Note e segnalazioni"); paragraph(text(r.note)); }
  if (summary.status === "approvato") { section("Verifica dell'ufficio"); paragraph(`Rapportino approvato il ${timestamp(r.approvato_at)}. L'approvazione del rapportino non è una firma del cliente.`); }
  if (summary.status === "rifiutato") { section("Esito della verifica"); paragraph(`Rapportino rifiutato. ${text(r.motivo_rifiuto) || "Motivazione non registrata."}`); }

  // Photography has its own pages: consistent large images, no orphan headings.
  const photos = Array.isArray(r.foto_urls) ? r.foto_urls.filter((u): u is string => typeof u === "string" && !!u) : [];
  for (let i = 0; i < photos.length; i++) {
    if (i % 2 === 0) { nextPage(); section("Documentazione fotografica", 270); }
    const img = await embed(photos[i], "photo");
    const height = 244;
    ensure(height + 35);
    page.drawRectangle({ x: M, y: y - height, width: CW, height, color: pale, borderColor: line, borderWidth: .6 });
    if (img) { const d = img.scaleToFit(CW - 14, height - 14); page.drawImage(img, { x: M + (CW - d.width) / 2, y: y - height + (height - d.height) / 2, ...d }); }
    else { draw("Immagine non disponibile", M + 16, y - 110, 11, bold, muted); warnings.push(`Foto ${i + 1}: impossibile includere l'immagine. Rigenerare dopo la verifica dell'allegato.`); }
    y -= height + 15;
    draw(`Foto ${i + 1} di ${photos.length} | Allegata al rapportino del ${dayLabel(r.data_lavoro)}`, M, y, 8, regular, muted); y -= 26;
  }

  const signatures = [
    { label: "Firma del compilatore", ref: text(r.firma_operaio_url), name: summary.author, date: "" },
    { label: "Firma del cliente", ref: text(r.firma_cliente_url), name: text(r.firma_cliente_nome), date: r.firma_cliente_at ? timestamp(r.firma_cliente_at) : "" },
  ].filter(s => s.ref || r.lavoro_completato === true);
  if (signatures.length) {
    section("Firme", 165);
    for (const sig of signatures) {
      const img = sig.ref ? await embed(sig.ref, "signature") : null;
      ensure(140); draw(sig.label, M, y, 9, bold); y -= 14;
      if (img) { const d = img.scaleToFit(210, 58); page.drawImage(img, { x: M, y: y - d.height, ...d }); y -= 64; }
      else { paragraph(sig.ref ? "Firma registrata, immagine non disponibile." : "Firma non acquisita.", 9, muted); if (sig.ref) warnings.push(`${sig.label}: immagine non inclusa.`); }
      if (sig.name) paragraph(sig.name, 8, muted);
      if (sig.date) paragraph(`Data registrata: ${sig.date}`, 8, muted);
      y -= 8;
    }
  }
  if (warnings.length) { section("Avvertenze del documento"); for (const warning of [...new Set(warnings)]) paragraph(`- ${warning}`, 8, muted); }

  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    page = p; rule(47);
    draw(`Rif. ${shortId} | Edizione ${ctx.revision}`, M, 34, 7, regular, muted);
    draw(`Generato ${timestamp(ctx.generatedAt)}${ctx.branding.hidePoweredBy ? "" : ` | ${ctx.branding.platformName || "Edilizia in Cloud"}`}`, M, 23, 6.6, regular, muted);
    const pagination = `${index + 1} / ${pages.length}`;
    draw(pagination, W - M - regular.widthOfTextAtSize(pagination, 8), 33, 8, bold, muted);
  });
  pdf.setTitle(`${title} - ${dayLabel(r.data_lavoro)} - ${shortId}`);
  pdf.setAuthor(companyName);
  pdf.setSubject(`Rapportino ${reportId}; edizione ${ctx.revision}; ${summary.statusLabel}`);
  return { bytes: await pdf.save(), warnings: [...new Set(warnings)], pageCount: pages.length };
}
