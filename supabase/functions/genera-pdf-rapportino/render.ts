import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage } from "https://esm.sh/pdf-lib@1.17.1";
import { bloccoFasi, dayLabel, inchiostroSu, oraBreve, oreBrevi, record, reportSummary, rows, text, timestamp, type FaseBlocco, type PdfContext } from "./model.ts";

/** Keep paragraph breaks; replace unsupported glyphs explicitly instead of crashing. */
export function printable(value: string): string {
  return value.normalize("NFC").replace(/[–—]/g, "-").replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(/[^\x20-\x7E\xA0-\xFF\n‘’“”…€]/gu, "?");
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

type Rgb = ReturnType<typeof rgb>;
type TipoImmagine = "photo" | "signature" | "logo";

/**
 * Il rapportino come documento a blocchi: fascia con i colori dell'azienda, scheda della commessa,
 * quattro contatori, una scheda per ogni fase (avanzamento, materiali e foto di quella fase),
 * poi squadra, tempi, segnalazioni, foto del cantiere e firme.
 *
 * Il documento è operativo: mai paghe, GPS o costi (vedi model.ts).
 */
export async function renderRapportino(ctx: PdfContext, loadImage: (reference: string, kind: TipoImmagine) => Promise<Uint8Array | null>) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const r = ctx.report, summary = reportSummary(r), order = record(r.ordine);
  const warnings = [...ctx.warnings];

  const W = 595.28, H = 841.89, M = 36, CW = W - M * 2, bottom = 60;
  const ink = rgb(.11, .15, .21), muted = rgb(.40, .44, .50), faint = rgb(.60, .64, .69), line = rgb(.88, .90, .92), pale = rgb(.955, .964, .974), white = rgb(1, 1, 1);
  const green = rgb(.10, .50, .32), greenPale = rgb(.89, .96, .92), amber = rgb(.62, .40, .05), amberPale = rgb(1, .96, .86), red = rgb(.68, .17, .14), redPale = rgb(.99, .92, .91);
  const mix = (a: Rgb, b: Rgb, t: number) => rgb(a.red * (1 - t) + b.red * t, a.green * (1 - t) + b.green * t, a.blue * (1 - t) + b.blue * t);

  // Colore dell'azienda: la fascia lo usa com'è (testo bianco o scuro, secondo il contrasto); come testo su
  // bianco si scurisce se è troppo chiaro per leggersi.
  const match = /^#?([a-f0-9]{6})$/i.exec(ctx.branding.primaryColor ?? "");
  const hex = match ? parseInt(match[1], 16) : 0xf97415;
  const accent = rgb(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
  const onAccent = inchiostroSu(hex) === "white" ? white : ink;
  const luminanza = (c: Rgb) => { const f = (v: number) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); return 0.2126 * f(c.red) + 0.7152 * f(c.green) + 0.0722 * f(c.blue); };
  const accentText = 1.05 / (luminanza(accent) + 0.05) >= 3.5 ? accent : mix(accent, ink, 0.6);
  const accentPale = mix(accent, white, 0.9);

  let page = pdf.addPage([W, H]);
  let y = H;
  const reportId = text(r.id) || "senza-identificativo";
  const shortId = reportId.slice(0, 8).toUpperCase();
  const fineLavori = r.lavoro_completato === true;
  const title = fineLavori ? "Rapporto di fine lavori" : "Rapportino giornaliero";
  const codiceCommessa = text(order.order_code);

  const T = (value: string, x: number, yy: number, size = 9, font: PDFFont = regular, color: Rgb = ink, opacity = 1) =>
    page.drawText(printable(value), { x, y: yy, size, font, color, ...(opacity < 1 ? { opacity } : {}) });
  const larghezza = (value: string, size: number, font: PDFFont = regular) => font.widthOfTextAtSize(printable(value), size);
  const box = (x: number, yTop: number, w: number, h: number, color: Rgb, border?: Rgb) =>
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, color, ...(border ? { borderColor: border, borderWidth: .6 } : {}) });
  const rrPath = (w: number, h: number, rad: number) => `M ${rad} 0 H ${w - rad} Q ${w} 0 ${w} ${rad} V ${h - rad} Q ${w} ${h} ${w - rad} ${h} H ${rad} Q 0 ${h} 0 ${h - rad} V ${rad} Q 0 0 ${rad} 0 Z`;
  const rbox = (x: number, yTop: number, w: number, h: number, rad: number, color: Rgb, border?: Rgb) =>
    page.drawSvgPath(rrPath(w, h, Math.min(rad, h / 2, w / 2)), { x, y: yTop, color, borderWidth: border ? .6 : 0, ...(border ? { borderColor: border } : {}) });
  const rule = (yy: number, x = M, w = CW) => page.drawLine({ start: { x, y: yy }, end: { x: x + w, y: yy }, thickness: .6, color: line });
  const pill = (label: string, x: number, yTop: number, bg: Rgb, fg: Rgb) => {
    const w = larghezza(label, 6.8, bold) + 14;
    rbox(x, yTop, w, 14, 7, bg); T(label, x + 7, yTop - 10, 6.8, bold, fg);
    return w;
  };
  const barra = (x: number, yTop: number, w: number, pct: number, color: Rgb) => {
    rbox(x, yTop, w, 5, 2.5, rgb(.89, .91, .93));
    if (pct > 0) rbox(x, yTop, Math.max(5, w * Math.min(pct, 100) / 100), 5, 2.5, color);
  };

  // ── Immagini: si scaricano a gruppi di quattro, si incorporano una volta sola ──
  const bytes = new Map<string, Promise<Uint8Array | null>>();
  const scarica = (ref: string, kind: TipoImmagine) => {
    let p = bytes.get(ref);
    if (!p) { p = loadImage(ref, kind).catch((): null => null); bytes.set(ref, p); }
    return p;
  };
  const incorporate = new Map<string, PDFImage | null>();
  const embed = async (ref: string, kind: TipoImmagine): Promise<PDFImage | null> => {
    if (incorporate.has(ref)) return incorporate.get(ref) ?? null;
    let img: PDFImage | null = null;
    try {
      const b = await scarica(ref, kind);
      if (b) img = b[0] === 137 && b[1] === 80 ? await pdf.embedPng(b) : await pdf.embedJpg(b);
    } catch { img = null; }
    incorporate.set(ref, img);
    return img;
  };

  const nomiFasi = new Map(ctx.phases.map(p => [text(p.id), text(p.name)]));
  const blocchi = bloccoFasi(r, nomiFasi);
  const ordineFoto = [...blocchi.fasi.flatMap(f => f.foto), ...blocchi.altreFoto];
  const numeroFoto = new Map(ordineFoto.map((u, i) => [u, i + 1]));
  for (let i = 0; i < ordineFoto.length; i += 4) await Promise.all(ordineFoto.slice(i, i + 4).map(u => scarica(u, "photo")));

  // ── Pagine ──
  const intestazioneSeguente = () => {
    box(0, H, W, 5, accent);
    T(`${title}${codiceCommessa ? `  |  ${codiceCommessa}` : ""}  |  ${dayLabel(r.data_lavoro)}`, M, H - 26, 8, bold, muted);
    const rif = `Rif. ${shortId}`;
    T(rif, W - M - larghezza(rif, 8, bold), H - 26, 8, bold, muted);
    rule(H - 36);
  };
  const nextPage = () => { page = pdf.addPage([W, H]); intestazioneSeguente(); y = H - 54; };
  const ensure = (needed: number) => { if (y - needed < bottom) { nextPage(); return true; } return false; };
  const sezione = (label: string, riserva = 60) => {
    ensure(riserva);
    y -= 8;
    box(M, y, 3.5, 12, accent);
    T(label.toUpperCase(), M + 10, y - 9.5, 9.5, bold, ink);
    y -= 24;
  };
  const paragraph = (value: string, size = 9.5, color: Rgb = ink, width = CW, x = M) => {
    for (const l of wrap(value, regular, size, width)) { ensure(size + 5); T(l, x, y - size, size, regular, color); y -= size + 4; }
  };

  /** Riquadro di testo con barra colorata a sinistra: segnalazioni, descrizione, esito dell'ufficio. */
  const riquadro = (titolo: string | null, corpo: string, tono: { bg: Rgb; barra: Rgb; titolo: Rgb }, size = 10) => {
    const lead = size + 4.5, interno = CW - 30;
    const righe = wrap(corpo, regular, size, interno);
    let i = 0;
    do {
      const testa = i === 0 && titolo ? 17 : 0;
      ensure(testa + lead * Math.min(Math.max(righe.length - i, 1), 3) + 22);
      const spazio = Math.floor((y - bottom - 22 - testa) / lead);
      const quante = Math.max(1, Math.min(righe.length - i, spazio));
      const altezza = testa + quante * lead + 18;
      box(M, y, CW, altezza, tono.bg);
      box(M, y, 3.5, altezza, tono.barra);
      let yy = y - 15;
      if (testa) { T(titolo!.toUpperCase(), M + 15, yy, 7.4, bold, tono.titolo); yy -= 17; }
      righe.slice(i, i + quante).forEach(l => { T(l, M + 15, yy, size, regular, ink); yy -= lead; });
      y -= altezza + 8;
      i += quante;
    } while (i < righe.length);
  };

  /** Tabella: l'intestazione si ridisegna a ogni salto pagina; una riga più alta di una pagina si spezza. */
  const tabella = (etichette: string[], larghezze: number[], valori: string[][], allineamenti: ("l" | "r")[] = [], x0 = M, totale?: string[]) => {
    const totaleLarghezza = larghezze.reduce((a, b) => a + b, 0);
    const cella = (l: string, i: number, xCella: number, yy: number, size: number, font: PDFFont, color: Rgb) => {
      const xTesto = allineamenti[i] === "r" ? xCella + larghezze[i] - 8 - larghezza(l, size, font) : xCella + 8;
      T(l, xTesto, yy, size, font, color);
    };
    const intestazione = () => {
      box(x0, y, totaleLarghezza, 18, pale);
      let x = x0;
      etichette.forEach((l, i) => { cella(l.toUpperCase(), i, x, y - 12, 6.6, bold, muted); x += larghezze[i]; });
      y -= 18;
    };
    ensure(52); intestazione();
    const riga = (cells: string[], indice: number, grassetto = false) => {
      const font = grassetto ? bold : regular;
      const lines = cells.map((c, i) => wrap(c, font, 8.8, larghezze[i] - 16));
      const count = Math.max(1, ...lines.map(c => c.length));
      const rowHeight = count * 11.5 + 8;
      // Ordinary rows stay whole. Only a row taller than a page may be split.
      if (rowHeight <= H - 54 - bottom - 18 && y - rowHeight < bottom) { nextPage(); intestazione(); }
      let offset = 0;
      while (offset < count) {
        if (y - 24 < bottom) { nextPage(); intestazione(); }
        const take = Math.min(count - offset, Math.max(1, Math.floor((y - bottom - 8) / 11.5)));
        const height = take * 11.5 + 8;
        if (!grassetto && indice % 2 === 1) box(x0, y, totaleLarghezza, height, rgb(.982, .986, .990));
        if (grassetto) box(x0, y, totaleLarghezza, height, pale);
        let x = x0;
        lines.forEach((col, i) => { col.slice(offset, offset + take).forEach((l, j) => cella(l, i, x, y - 11 - j * 11.5, 8.8, font, ink)); x += larghezze[i]; });
        y -= height; offset += take;
        rule(y, x0, totaleLarghezza);
        if (offset < count) { nextPage(); intestazione(); }
      }
    };
    valori.forEach((cells, idx) => riga(cells, idx));
    if (totale) riga(totale, 0, true);
    y -= 8;
  };

  // ═════════ Fascia di intestazione ═════════
  const fasciaH = 96;
  box(0, H, W, fasciaH, accent);
  const logo = ctx.branding.logoUrl ? await embed(ctx.branding.logoUrl, "logo") : null;
  const companyName = text(ctx.company.name) || "Impresa";
  const logoW = 66;
  if (logo) {
    rbox(M, H - 22, logoW, 52, 8, white);
    const d = logo.scaleToFit(logoW - 12, 40);
    page.drawImage(logo, { x: M + (logoW - d.width) / 2, y: H - 22 - 26 - d.height / 2, ...d });
  }
  const xNome = M + (logo ? logoW + 14 : 0);
  const larghezzaNome = 300 - (logo ? logoW + 14 : 0);
  const righeNome = wrap(companyName, bold, 14, larghezzaNome).slice(0, 2);
  let yNome = H - 38;
  righeNome.forEach(l => { T(l, xNome, yNome, 14, bold, onAccent); yNome -= 17; });
  const contatti = [text(ctx.company.legal_address), text(ctx.company.legal_city), text(ctx.company.phone), text(ctx.company.email), ctx.company.vat_number ? `P.IVA ${text(ctx.company.vat_number)}` : ""].filter(Boolean).join("  |  ");
  wrap(contatti, regular, 7.4, larghezzaNome).slice(0, 2).forEach(l => { T(l, xNome, yNome - 2, 7.4, regular, onAccent, .85); yNome -= 10; });
  const xDestra = W - M;
  const etichetta = title.toUpperCase();
  T(etichetta, xDestra - larghezza(etichetta, 8, bold), H - 32, 8, bold, onAccent, .9);
  const dataGrande = dayLabel(r.data_lavoro);
  T(dataGrande, xDestra - larghezza(dataGrande, 19, bold), H - 55, 19, bold, onAccent);
  const rifTesto = `Rif. ${shortId}${r.meteo ? `  |  Meteo: ${text(r.meteo)}` : ""}`;
  T(rifTesto, xDestra - larghezza(rifTesto, 8), H - 72, 8, regular, onAccent, .9);
  y = H - fasciaH - 16;

  // ═════════ Scheda commessa ═════════
  const colonne: [string, string, number][] = [
    ["CANTIERE", text(order.work_address) || text(order.indirizzo_lavori) || "-", 232],
    ["CLIENTE", text(order.client_name) || "-", 130],
    ["COMPILATORE", `${summary.author}\n${summary.authorRole}`, 161],
  ];
  const descrizioneCommessa = wrap(text(order.description), regular, 9.5, CW - 28 - 120).slice(0, 2);
  const righeColonne = colonne.map(([, v, w]) => wrap(v, regular, 9, w - 14).slice(0, 3));
  const altezzaColonne = Math.max(...righeColonne.map(rg => rg.length)) * 11.5;
  const schedaH = 18 + 16 + descrizioneCommessa.length * 12 + 8 + 22 + altezzaColonne + 6;
  box(M, y, CW, schedaH, white, line);
  box(M, y, 4, schedaH, accent);
  T("COMMESSA", M + 16, y - 15, 6.8, bold, muted);
  T(codiceCommessa || "-", M + 16, y - 30, 13, bold, ink);
  const colore = { rifiutato: [redPale, red], approvato: [greenPale, green] } as Record<string, [Rgb, Rgb]>;
  const [statoBg, statoFg] = colore[summary.status] ?? [amberPale, amber];
  const wStato = larghezza(summary.statusLabel, 6.8, bold) + 14;
  pill(summary.statusLabel, M + CW - 14 - wStato, y - 12, statoBg, statoFg);
  descrizioneCommessa.forEach((l, i) => T(l, M + 16, y - 44 - i * 12, 9.5, regular, muted));
  const yColonne = y - 18 - 16 - descrizioneCommessa.length * 12 - 8;
  rule(yColonne + 2, M + 16, CW - 30);
  let xc = M + 16;
  colonne.forEach(([etichettaColonna], i) => {
    T(etichettaColonna, xc, yColonne - 12, 6.6, bold, muted);
    righeColonne[i].forEach((l, j) => T(l, xc, yColonne - 24 - j * 11.5, 9, j === 0 && etichettaColonna === "COMPILATORE" ? bold : regular, j > 0 && etichettaColonna === "COMPILATORE" ? muted : ink));
    xc += colonne[i][2];
  });
  y -= schedaH + 12;

  // Il motivo del rifiuto si legge subito, in cima.
  if (summary.status === "rifiutato") {
    riquadro("Rapportino rifiutato dall'ufficio", text(r.motivo_rifiuto) || "Motivazione non registrata.", { bg: redPale, barra: red, titolo: red });
  }

  // ═════════ Contatori ═════════
  const fasiCompletate = blocchi.fasi.filter(f => f.percentuale === 100).length;
  const contatori: [string, string, string][] = [
    [summary.crew.length ? "ORE SQUADRA" : "ORE LAVORATE", oreBrevi(summary.total), summary.crew.length ? `${summary.crew.length} ${summary.crew.length === 1 ? "presenza" : "presenze"}` : (summary.extra ?? 0) > 0 ? `+ ${oreBrevi(summary.extra)} straordinario` : ""],
    ["LAVORAZIONI", String(blocchi.fasi.length), fasiCompletate ? `${fasiCompletate} ${fasiCompletate === 1 ? "completata" : "completate"}` : ""],
    ["MATERIALI", String(blocchi.totaleMateriali), ""],
    ["FOTO", String(blocchi.totaleFoto), ""],
  ];
  ensure(70);
  const wTessera = (CW - 3 * 8) / 4;
  contatori.forEach(([etich, valore, sotto], i) => {
    const x = M + i * (wTessera + 8);
    box(x, y, wTessera, 56, pale);
    box(x, y, wTessera, 3, accent);
    T(etich, x + 11, y - 18, 6.6, bold, muted);
    T(valore, x + 11, y - 40, 19, bold, valore === "0" || valore === "0 h" || valore === "-" ? faint : ink);
    if (sotto) T(sotto, x + 11 + larghezza(valore, 19, bold) + 6, y - 40, 7.2, regular, muted);
  });
  y -= 56 + 10;

  // ═════════ Cosa è stato fatto ═════════
  sezione("Cosa è stato fatto", 100);
  riquadro(null, text(r.descrizione_lavori) || "Descrizione non registrata.", { bg: pale, barra: accent, titolo: muted });

  // ═════════ Lavorazioni: una scheda per fase ═════════
  const gapFoto = 8, interno = CW - 24;
  const disegnaFoto = async (u: string, x: number, yTop: number, w: number, h: number) => {
    const n = numeroFoto.get(u) ?? 0;
    box(x, yTop, w, h, pale, line);
    const img = await embed(u, "photo");
    if (img) { const d = img.scaleToFit(w - 8, h - 8); page.drawImage(img, { x: x + (w - d.width) / 2, y: yTop - h + (h - d.height) / 2, ...d }); }
    else { T("Immagine non disponibile", x + 10, yTop - h / 2, 8.5, bold, muted); warnings.push(`Foto ${n}: impossibile includere l'immagine. Rigenerare dopo la verifica dell'allegato.`); }
    rbox(x + 6, yTop - 6, 26, 13, 6.5, ink);
    T(String(n), x + 6 + (26 - larghezza(String(n), 7, bold)) / 2, yTop - 15, 7, bold, white);
  };
  /** Con poche foto si fanno grandi (due per riga), con molte piccole (tre). */
  const impaginaFoto = (n: number) => { const colonne = n <= 2 ? 2 : 3; return { colonne, w: (interno - gapFoto * (colonne - 1)) / colonne, h: colonne === 2 ? 148 : 104 }; };
  const misureScheda = (f: FaseBlocco) => {
    const nomeRighe = wrap(f.nome, bold, 11, CW - 24 - 150).slice(0, 2);
    const testaH = 14 + nomeRighe.length * 14 + (f.percentuale !== null ? 16 : 6) + (f.ore !== null ? 11 : 0);
    const righeMateriali = f.materiali.map(m => Math.max(1, wrap(m.nome, regular, 8.8, interno - 8 - 70 - 56 - 16).length));
    const materialiH = f.materiali.length ? 18 + righeMateriali.reduce((a, n) => a + n * 11.5 + 8, 0) + 14 : 0;
    const foto = impaginaFoto(f.foto.length);
    // Il minimo che deve stare insieme alla testata: il primo pezzo del corpo, al massimo 140 punti.
    const minimo = testaH + Math.min(materialiH || (f.foto.length ? foto.h + 34 : 0), 140);
    return { nomeRighe, testaH, minimo, foto };
  };
  const scheda = async (f: FaseBlocco, titolo?: string) => {
    const { nomeRighe, testaH, minimo, foto } = misureScheda(f);
    const { colonne: colonneFoto, w: wFoto, h: hFoto } = foto;
    // Il titolo della sezione viaggia con la prima scheda: mai solo in fondo a una pagina.
    if (titolo) sezione(titolo, minimo + 36); else ensure(minimo + 10);
    // testata
    box(M, y, CW, testaH, accentPale);
    box(M, y, 4, testaH, accent);
    let yy = y - 20;
    nomeRighe.forEach(l => { T(l, M + 16, yy, 11, bold, ink); yy -= 14; });
    const completata = f.percentuale === 100;
    const etichettaStato = completata ? "COMPLETATA" : f.percentuale !== null ? "IN CORSO" : "LAVORATA";
    const wPill = larghezza(etichettaStato, 6.8, bold) + 14;
    pill(etichettaStato, M + CW - 12 - wPill, y - 10, completata ? greenPale : rgb(1, 1, 1), completata ? green : muted);
    if (f.percentuale !== null) {
      const testo = `${f.percentuale.toLocaleString("it-IT")}%`;
      T(testo, M + CW - 12 - wPill - 8 - larghezza(testo, 14, bold), y - 22, 14, bold, accentText);
      barra(M + 16, y - testaH + 11, CW - 32, f.percentuale, completata ? green : accent);
    }
    if (f.ore !== null) T(`${oreBrevi(f.ore)} dichiarate su questa lavorazione`, M + 16, y - testaH + (f.percentuale !== null ? 22 : 8), 7.4, regular, muted);
    y -= testaH;
    // Barra colorata a sinistra del corpo della scheda: solo se il pezzo sta tutto su una pagina.
    const barraLato = (inizio: number, paginaInizio: number) => { if (pdf.getPageCount() === paginaInizio) box(M, inizio, 2.5, inizio - y, accent); };
    // materiali della fase
    if (f.materiali.length) {
      ensure(18 + 30);
      const inizio = y, paginaInizio = pdf.getPageCount();
      T("MATERIALI USATI", M + 16, y - 14, 6.8, bold, muted);
      y -= 20;
      tabella(["Materiale", "Quantità", "Unità"], [interno - 10 - 70 - 56, 70, 56], f.materiali.map(m => [m.nome, m.quantita, m.unita]), ["l", "r", "l"], M + 12);
      barraLato(inizio, paginaInizio);
    }
    // foto della fase
    if (f.foto.length) {
      for (let i = 0; i < f.foto.length; i += colonneFoto) {
        ensure(hFoto + 30 + (i === 0 ? 14 : 0));
        const top = y, paginaInizio = pdf.getPageCount();
        if (i === 0) { T(`FOTO DELLA LAVORAZIONE (${f.foto.length})`, M + 16, y - 14, 6.8, bold, muted); y -= 20; }
        const inizio = y;
        for (let k = 0; k < colonneFoto && i + k < f.foto.length; k++) await disegnaFoto(f.foto[i + k], M + 12 + k * (wFoto + gapFoto), inizio, wFoto, hFoto);
        y = inizio - hFoto - 8;
        barraLato(top, paginaInizio);
      }
    }
    y -= 12;
  };
  for (const [i, f] of blocchi.fasi.entries()) await scheda(f, i === 0 ? (blocchi.fasi.length === 1 ? "Lavorazione" : "Lavorazioni") : undefined);

  // ═════════ Materiali non legati a una fase ═════════
  if (blocchi.altriMateriali.length) {
    sezione(blocchi.fasi.length ? "Altri materiali" : "Materiali utilizzati", 100);
    tabella(["Materiale", "Quantità", "Unità", "Registrazione"], [CW - 70 - 56 - 110, 70, 56, 110], blocchi.altriMateriali.map(m => [m.nome, m.quantita, m.unita, m.origine]), ["l", "r", "l", "l"]);
  }

  // ═════════ Squadra ═════════
  if (summary.crew.length) {
    sezione("Squadra", 100);
    tabella(["Persona / impresa", "Inquadramento", "Ore"], [CW - 130 - 90, 130, 90],
      summary.crew.map(p => [text(p.nome) || "Nome non registrato", p.subappaltatore_id ? "Subappaltatore" : p.employee_id ? "Personale interno" : "Non specificato", oreBrevi(p.ore)]),
      ["l", "l", "r"], M, ["Totale presenze", "", oreBrevi(summary.total)]);
  }

  // ═════════ Tempi ═════════
  const tipi: Record<string, string> = { entrata: "ENTRATA", uscita: "USCITA", pausa_inizio: "INIZIO PAUSA", pausa_fine: "FINE PAUSA" };
  const eventi = ctx.punches.map(p => [tipi[text(p.tipo)] || text(p.tipo).toUpperCase(), oraBreve(p.timestamp_evento)] as [string, string]);
  if ((summary.extra ?? 0) > 0) eventi.push(["STRAORDINARIO", oreBrevi(summary.extra)]);
  if (eventi.length) {
    sezione("Tempi di chi compila", 80);
    let x = M; ensure(44);
    for (const [etich, valore] of eventi) {
      const w = Math.max(larghezza(etich, 6.6, bold), larghezza(valore, 12, bold)) + 22;
      if (x + w > M + CW) { x = M; y -= 46; ensure(44); }
      box(x, y, w, 38, pale, line);
      T(etich, x + 11, y - 13, 6.6, bold, muted);
      T(valore, x + 11, y - 30, 12, bold, ink);
      x += w + 8;
    }
    y -= 46;
  }

  // ═════════ Segnalazioni ═════════
  if (text(r.note)) {
    sezione("Note e segnalazioni", 120);
    riquadro("Da leggere", text(r.note), { bg: amberPale, barra: amber, titolo: amber });
  }

  // ═════════ Foto del cantiere ═════════
  if (blocchi.altreFoto.length) {
    const colonneGenerali = blocchi.altreFoto.length > 4 ? 3 : 2;
    const wG = (CW - gapFoto * (colonneGenerali - 1)) / colonneGenerali, hG = colonneGenerali === 3 ? 118 : 172;
    sezione(blocchi.fasi.some(f => f.foto.length) ? "Altre foto del cantiere" : "Documentazione fotografica", hG + 22 + 36);
    for (let i = 0; i < blocchi.altreFoto.length; i += colonneGenerali) {
      ensure(hG + 22);
      const inizio = y;
      for (let k = 0; k < colonneGenerali && i + k < blocchi.altreFoto.length; k++) await disegnaFoto(blocchi.altreFoto[i + k], M + k * (wG + gapFoto), inizio, wG, hG);
      y = inizio - hG - 14;
    }
  }

  // ═════════ Verifica dell'ufficio ═════════
  if (summary.status === "approvato") {
    sezione("Verifica dell'ufficio", 110);
    riquadro(null, `Rapportino approvato il ${timestamp(r.approvato_at)}. L'approvazione del rapportino non è una firma del cliente.`, { bg: greenPale, barra: green, titolo: green });
  }

  // ═════════ Firme ═════════
  const firme = [
    { etichetta: "Firma del compilatore", ref: text(r.firma_operaio_url), nome: summary.author, data: "" },
    { etichetta: "Firma del cliente", ref: text(r.firma_cliente_url), nome: text(r.firma_cliente_nome), data: r.firma_cliente_at ? timestamp(r.firma_cliente_at) : "" },
  ].filter(s => s.ref || fineLavori);
  if (firme.length) {
    sezione("Firme", 150);
    const wF = (CW - 12) / 2;
    ensure(112);
    for (let i = 0; i < firme.length; i++) {
      const s = firme[i], x = M + i * (wF + 12);
      box(x, y, wF, 104, white, line);
      T(s.etichetta.toUpperCase(), x + 12, y - 15, 6.8, bold, muted);
      const img = s.ref ? await embed(s.ref, "signature") : null;
      if (img) { const d = img.scaleToFit(wF - 24, 46); page.drawImage(img, { x: x + 12, y: y - 24 - 46 + (46 - d.height) / 2, ...d }); }
      else { T(s.ref ? "Firma registrata, immagine non disponibile" : "Firma non acquisita", x + 12, y - 52, 8.5, regular, faint); if (s.ref) warnings.push(`${s.etichetta}: immagine non inclusa.`); }
      rule(y - 76, x + 12, wF - 24);
      if (s.nome) T(s.nome, x + 12, y - 88, 8.5, bold, ink);
      if (s.data) T(`Data registrata: ${s.data}`, x + 12, y - 99, 7, regular, muted);
    }
    y -= 112;
    paragraph("La firma si riferisce a questo rapportino: non approva costi extra e non sostituisce un verbale di collaudo con verifiche ed eventuali riserve.", 7.4, muted);
  }

  // ═════════ Note del documento ═════════
  const note: string[] = [];
  if (blocchi.fasi.length) note.push("Ore e avanzamenti riferiti alle singole lavorazioni: le ore di fase non si sommano di nuovo alle presenze della squadra. La dichiarazione non sostituisce la verifica dell'ufficio.");
  if (summary.crew.length) note.push("Il totale usa solo le presenze elencate: le ore personali del compilatore non vengono sommate di nuovo. Le presenze esterne non determinano automaticamente un costo orario.");
  if (blocchi.totaleMateriali) note.push("Quantità dichiarate nel rapportino: non attestano da sole uno scarico di magazzino.");
  note.push(ctx.punches.length
    ? "Eventi di chi compila, per questo cantiere e questa data: non sono un totale ore validato. Per turni oltre mezzanotte consultare anche la giornata adiacente nell'app."
    : "Nessuna timbratura disponibile per chi compila su questo cantiere nella giornata: le ore sono dichiarate, non verificate automaticamente.");
  if (!blocchi.fasi.length && (number0(r.percentuale_avanzamento) ?? 0) > 0) note.push(`Avanzamento generale dichiarato della commessa: ${Number(r.percentuale_avanzamento).toLocaleString("it-IT")}%.`);
  sezione("Note del documento", 80);
  for (const n of note) paragraph(n, 7.4, muted);
  if (warnings.length) {
    sezione("Avvertenze del documento", 70);
    for (const warning of [...new Set(warnings)]) paragraph(`- ${warning}`, 7.8, muted);
  }

  // ═════════ Piè di pagina ═════════
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    page = p; rule(47);
    T(`Rif. ${shortId} | Edizione ${ctx.revision}`, M, 34, 7, regular, muted);
    T(`Generato ${timestamp(ctx.generatedAt)}${ctx.branding.hidePoweredBy ? "" : ` | ${ctx.branding.platformName || "Edilizia in Cloud"}`}`, M, 23, 6.6, regular, muted);
    const pagination = `${index + 1} / ${pages.length}`;
    T(pagination, W - M - larghezza(pagination, 8, bold), 33, 8, bold, muted);
  });
  pdf.setTitle(`${title} - ${dayLabel(r.data_lavoro)} - ${shortId}`);
  pdf.setAuthor(companyName);
  pdf.setSubject(`Rapportino ${reportId}; edizione ${ctx.revision}; ${summary.statusLabel}`);
  return { bytes: await pdf.save(), warnings: [...new Set(warnings)], pageCount: pages.length };
}

/** Un numero valido (≥ 0) o null: l'avanzamento generale di un rapportino senza fasi. */
function number0(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
