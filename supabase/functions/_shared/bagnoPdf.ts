// Render del PDF "modello bagno" (verticale BAGNI) come vero PDF (pdf-lib).
// (28/09/2026) Logica pura e testabile: prende i dati del preventivo + il template
// estetico dell'azienda (bgn_template_pdf) e produce i byte del PDF. Copertina,
// chi siamo, perché noi (USP), il preventivo voce per voce, tempi (cronoprogramma)
// e garanzie. Nessun accesso al DB qui: li passa il chiamante (l'edge o un test).

import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 48;

export interface VoceBagno {
  name: string;
  description: string;
  quantity: number;
  unit_price: number;
  unit_of_measure: string | null;
  item_type: string | null;
}

export interface BagnoPdfInput {
  quote: {
    quote_number?: string | null;
    client_name?: string | null;
    subtotal?: number | null;
    vat_amount?: number | null;
    total?: number | null;
    validity_days?: number | null;
    created_at?: string | null;
  };
  righe: VoceBagno[];
  // riga bgn_template_pdf (jsonb/text mescolati): si legge in modo difensivo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: Record<string, any>;
  azienda: { name?: string | null; phone?: string | null; email?: string | null } | null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = (hex || "").replace("#", "").trim();
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(s || "1F4E5F", 16);
  if (!Number.isFinite(n)) return { r: 0.12, g: 0.31, b: 0.37 };
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
function col(hex: string) { const c = hexToRgb(hex); return rgb(c.r, c.g, c.b); }

// pdf-lib con StandardFonts codifica solo WinAnsi: i caratteri fuori set fanno
// lanciare drawText e rompono TUTTO il PDF. Qui si normalizzano/eliminano.
export function winAnsiSafe(str: string): string {
  return (str ?? "")
    .replace(/[‘’‚‹›]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[•●▪]/g, "-")
    // deno-lint-ignore no-control-regex
    .replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, "");
}

function fmtEur(n: number): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const [intero, dec] = v.toFixed(2).split(".");
  const conMigliaia = intero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${conMigliaia},${dec} EUR`;
}

function stripHtml(html: string | null | undefined): string {
  return winAnsiSafe(
    (html ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
}

function senzaEnfasi(t: string): string { return winAnsiSafe((t ?? "").replace(/\*/g, "")); }

function wrap(text: string, font: Any, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const paragrafo of winAnsiSafe(text).split("\n")) {
    if (paragrafo.trim() === "") { out.push(""); continue; }
    let riga = "";
    for (const parola of paragrafo.split(/\s+/)) {
      const prova = riga ? `${riga} ${parola}` : parola;
      if (font.widthOfTextAtSize(prova, size) > maxW && riga) { out.push(riga); riga = parola; }
      else riga = prova;
    }
    if (riga) out.push(riga);
  }
  return out;
}

// Le foto stock (cover_image_url tipo "/cover-stock/bagni/2.jpg") sono asset
// pubblici del front-end: lato server vanno risolte sull'origine dell'app.
function risolviUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) {
    const base = (typeof Deno !== "undefined" ? Deno.env.get("APP_URL") : null) || "https://app.ediliziaincloud.com";
    return `${base.replace(/\/+$/, "")}${url}`;
  }
  return url;
}

async function scaricaImmagine(pdf: Any, url: string | null | undefined): Promise<{ img: Any; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const resp = await fetch(risolviUrl(url), { signal: AbortSignal.timeout(6000) });
    if (!resp.ok) return null;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const img = bytes[0] === 0x89 && bytes[1] === 0x50 ? await pdf.embedPng(bytes)
      : bytes[0] === 0xff && bytes[1] === 0xd8 ? await pdf.embedJpg(bytes) : null;
    if (!img) return null;
    return { img, w: img.width, h: img.height };
  } catch { return null; }
}

export async function renderBagnoPdf(input: BagnoPdfInput): Promise<{ bytes: Uint8Array; pages: number }> {
  const { quote, righe, azienda } = input;
  const t = input.template ?? {};
  const primario = String(t.color_primary || "#1F4E5F");
  const accento = String(t.color_accent || primario);

  const ragione = winAnsiSafe(String(t.ragione_sociale || azienda?.name || "La nostra impresa"));
  const contatti = [t.telefono || azienda?.phone, t.email || azienda?.email].filter(Boolean).map((x: Any) => winAnsiSafe(String(x))).join("  ·  ");
  const validitaGiorni = Number(quote.validity_days) || 30;
  const validityText = winAnsiSafe(String(t.validity_text || `Preventivo valido ${validitaGiorni} giorni.`));

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const inchiostro = rgb(0.13, 0.15, 0.17);
  const grigio = rgb(0.42, 0.45, 0.48);
  const contentW = A4.w - MARGIN * 2;

  const pagine: Any[] = [];
  let pg: Any;
  let y = 0;
  const nuovaPagina = () => { pg = pdf.addPage([A4.w, A4.h]); pagine.push(pg); y = A4.h - MARGIN; return pg; };
  const spazio = (needed: number) => { if (y - needed < MARGIN + 40) nuovaPagina(); };
  const testo = (s: string, x: number, size: number, f: Any, c: Any) => { pg.drawText(winAnsiSafe(s), { x, y, size, font: f, color: c }); };
  const paragrafo = (s: string, size: number, f: Any, c: Any, x = MARGIN, w = contentW, interlinea = 1.42) => {
    for (const l of wrap(s, f, size, w)) { spazio(size * interlinea); pg.drawText(l, { x, y, size, font: f, color: c }); y -= size * interlinea; }
  };
  const titoloSezione = (s: string) => {
    spazio(46); y -= 6;
    pg.drawRectangle({ x: MARGIN, y: y - 2, width: 26, height: 3, color: col(accento) });
    y -= 16; testo(s, MARGIN, 15, bold, col(primario)); y -= 22;
  };

  // ---- Copertina ----
  nuovaPagina();
  const cover = await scaricaImmagine(pdf, t.cover_image_url || t.pdf_cover_image_url);
  if (cover) {
    const scala = Math.max(A4.w / cover.w, A4.h / cover.h);
    const iw = cover.w * scala, ih = cover.h * scala;
    pg.drawImage(cover.img, { x: (A4.w - iw) / 2, y: (A4.h - ih) / 2, width: iw, height: ih });
    pg.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h, color: col(primario), opacity: 0.55 });
  } else {
    pg.drawRectangle({ x: 0, y: 0, width: A4.w, height: A4.h, color: col(primario) });
  }
  const logo = await scaricaImmagine(pdf, t.logo_url || t.cover_logo_url);
  if (logo) { const lw = 120, lh = logo.h * (lw / logo.w); pg.drawImage(logo.img, { x: MARGIN, y: A4.h - MARGIN - lh, width: lw, height: lh }); }
  else { pg.drawText(winAnsiSafe(ragione), { x: MARGIN, y: A4.h - MARGIN - 14, size: 14, font: bold, color: rgb(1, 1, 1) }); }

  y = 250;
  for (const l of wrap(senzaEnfasi(String(t.cover_title || "Il tuo nuovo bagno")), bold, 30, contentW)) {
    pg.drawText(l, { x: MARGIN, y, size: 30, font: bold, color: rgb(1, 1, 1) }); y -= 36;
  }
  y -= 8;
  const sott = t.cover_subtitle ? senzaEnfasi(String(t.cover_subtitle)) : "Preventivo di ristrutturazione";
  pg.drawText(winAnsiSafe(sott).slice(0, 90), { x: MARGIN, y, size: 13, font, color: rgb(0.92, 0.95, 0.96) }); y -= 40;
  const perChi = quote.client_name ? `Preparato per ${winAnsiSafe(String(quote.client_name))}` : "Preventivo personalizzato";
  pg.drawText(perChi, { x: MARGIN, y, size: 12, font: bold, color: rgb(1, 1, 1) }); y -= 18;
  const dataStr = new Date(quote.created_at ?? Date.now()).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  pg.drawText(winAnsiSafe(`${quote.quote_number ?? ""}  ·  ${dataStr}`), { x: MARGIN, y, size: 10.5, font, color: rgb(0.9, 0.93, 0.94) });

  // ---- Chi siamo + Perché noi ----
  const chiSiamo = stripHtml(t.chi_siamo);
  const usp: Any[] = Array.isArray(t.usp) ? t.usp : [];
  if (chiSiamo || usp.length > 0) {
    nuovaPagina();
    if (chiSiamo) { titoloSezione("Chi siamo"); paragrafo(chiSiamo, 11, font, inchiostro); y -= 10; }
    if (usp.length > 0) {
      titoloSezione("Perche' scegliere noi");
      for (const u of usp) {
        spazio(46);
        pg.drawCircle({ x: MARGIN + 4, y: y + 4, size: 3, color: col(accento) });
        pg.drawText(winAnsiSafe(String(u?.titolo ?? "")), { x: MARGIN + 14, y, size: 11.5, font: bold, color: inchiostro });
        y -= 15; paragrafo(String(u?.descrizione ?? ""), 10, font, grigio, MARGIN + 14, contentW - 14); y -= 8;
      }
    }
  }

  // ---- Il preventivo (voci) ----
  nuovaPagina();
  titoloSezione("Il tuo preventivo, voce per voce");
  const colImportoX = A4.w - MARGIN;
  const drawRigaVoce = (descr: string, qta: number, prezzo: number, um: string | null) => {
    const importo = qta * prezzo;
    const righeDescr = wrap(descr, font, 10, contentW - 160);
    spazio(righeDescr.length * 13 + 10);
    let first = true;
    for (const l of righeDescr) {
      pg.drawText(l, { x: MARGIN, y, size: 10, font, color: inchiostro });
      if (first) {
        const dett = `${qta % 1 === 0 ? qta : qta.toFixed(2)}${um ? " " + winAnsiSafe(um) : ""} x ${fmtEur(prezzo)}`;
        pg.drawText(winAnsiSafe(dett), { x: A4.w - MARGIN - 250, y, size: 8.5, font, color: grigio });
        const imp = fmtEur(importo);
        pg.drawText(imp, { x: colImportoX - bold.widthOfTextAtSize(imp, 10), y, size: 10, font: bold, color: inchiostro });
        first = false;
      }
      y -= 13;
    }
    y -= 5;
    pg.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: A4.w - MARGIN, y: y + 2 }, thickness: 0.4, color: rgb(0.88, 0.9, 0.92) });
    y -= 4;
  };
  let imponibileCalc = 0;
  for (const r of righe) { imponibileCalc += r.quantity * r.unit_price; drawRigaVoce(r.description || r.name, r.quantity, r.unit_price, r.unit_of_measure); }

  const imponibile = Number(quote.subtotal) || imponibileCalc;
  const iva = Number(quote.vat_amount) || 0;
  const totale = Number(quote.total) || (imponibile + iva);
  spazio(78); y -= 8;
  const boxX = A4.w - MARGIN - 240;
  const rigaTot = (lab: string, val: string, grande = false) => {
    const f = grande ? bold : font; const s = grande ? 12 : 10.5;
    pg.drawText(winAnsiSafe(lab), { x: boxX, y, size: s, font: f, color: grande ? col(primario) : grigio });
    pg.drawText(val, { x: colImportoX - f.widthOfTextAtSize(val, s), y, size: s, font: f, color: grande ? col(primario) : inchiostro });
    y -= grande ? 20 : 16;
  };
  rigaTot("Imponibile", fmtEur(imponibile));
  if (iva > 0) rigaTot("IVA", fmtEur(iva));
  pg.drawLine({ start: { x: boxX, y: y + 4 }, end: { x: colImportoX, y: y + 4 }, thickness: 0.8, color: col(accento) }); y -= 6;
  rigaTot("Totale", fmtEur(totale), true);

  // ---- Cronoprogramma ----
  const crono: Any[] = Array.isArray(t.cronoprogramma) ? t.cronoprogramma : [];
  if (crono.length > 0) {
    nuovaPagina(); titoloSezione("Come lavoriamo, giorno per giorno");
    let i = 1;
    for (const f of crono) {
      spazio(46);
      pg.drawCircle({ x: MARGIN + 5, y: y + 3, size: 9, color: col(accento) });
      pg.drawText(String(i), { x: MARGIN + (i < 10 ? 2 : -1), y, size: 10, font: bold, color: rgb(1, 1, 1) });
      const titoloFase = `${winAnsiSafe(String(f?.fase ?? ""))}${f?.durata ? "  (" + winAnsiSafe(String(f.durata)) + ")" : ""}`;
      pg.drawText(titoloFase, { x: MARGIN + 22, y, size: 11.5, font: bold, color: inchiostro });
      y -= 15; paragrafo(String(f?.descrizione ?? ""), 10, font, grigio, MARGIN + 22, contentW - 22); y -= 8; i++;
    }
  }

  // ---- Garanzie ----
  const garanzie: Any[] = Array.isArray(t.garanzie) ? t.garanzie : [];
  if (garanzie.length > 0) {
    nuovaPagina(); titoloSezione("Le nostre garanzie");
    for (const g of garanzie) {
      spazio(46);
      pg.drawCircle({ x: MARGIN + 4, y: y + 4, size: 3, color: col(accento) });
      pg.drawText(winAnsiSafe(String(g?.titolo ?? "")), { x: MARGIN + 14, y, size: 11.5, font: bold, color: inchiostro });
      y -= 15; paragrafo(String(g?.descrizione ?? ""), 10, font, grigio, MARGIN + 14, contentW - 14); y -= 8;
    }
    spazio(30); y -= 10; paragrafo(validityText, 9, italic, grigio);
  }

  // ---- Footer su ogni pagina (tranne copertina) ----
  const totPag = pagine.length;
  for (let i = 1; i < totPag; i++) {
    const p = pagine[i];
    p.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: A4.w - MARGIN, y: 34 }, thickness: 0.4, color: rgb(0.85, 0.87, 0.89) });
    p.drawText(winAnsiSafe(`${ragione}${contatti ? "  ·  " + contatti : ""}`).slice(0, 110), { x: MARGIN, y: 22, size: 7.5, font, color: grigio });
    const pn = `${winAnsiSafe(String(quote.quote_number ?? ""))}  ·  pag. ${i + 1}/${totPag}`;
    p.drawText(pn, { x: A4.w - MARGIN - font.widthOfTextAtSize(pn, 7.5), y: 22, size: 7.5, font, color: grigio });
  }

  const bytes = await pdf.save();
  return { bytes, pages: totPag };
}
