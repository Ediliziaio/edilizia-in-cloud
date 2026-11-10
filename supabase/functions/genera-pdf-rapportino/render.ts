import { normalizzaModelloPdf } from "../_shared/modelliPdfOperativi.ts";
import { valoreInTesto, valoriDaStampare, type ValoreCampo } from "../_shared/moduliCantiere.ts";
import { PDFDocument, rgb, setCharacterSpacing, StandardFonts, type PDFFont, type PDFImage } from "https://esm.sh/pdf-lib@1.17.1";
// Il carattere del piè proprio (EB Garamond, Impresa Vulcano). Nel browser e nei test Vite usa il pacchetto locale
// (alias in vite.config.ts e vitest.config.ts): lo stesso fontkit 2.0.4 che genera-pos usa già.
// fontkit si carica solo quando serve (dentro fontDelPiede): se non arriva, Times; le altre aziende non lo toccano.
import { fontPiedeBase64, misurePiede, personalizzazioneDocumento, testoRigaPiede } from "../_shared/personalizzazioneDocumenti.ts";
// Lo stile unico dei documenti (10/11/2026): colori, testata, sezioni, tabelle, riquadri e piè vengono da lì.
import { accentoDocumento, colore as C, pagina as PG, riquadro as RQ, rgb01, sezione as SZ, tabella as TB, testata as TS } from "../_shared/stileDocumenti.ts";
import { compilatoDa, bloccoFasi, dayLabel, oraBreve, oreBrevi, record, reportSummary, rows, text, timestamp, type FaseBlocco, type PdfContext } from "./model.ts";

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
const daHex = (hex: string): Rgb => rgb(...rgb01(hex));

/**
 * Il rapportino come documento a blocchi, nello stile unico dei documenti (`_shared/stileDocumenti.ts`): testata col
 * logo a sinistra su bianco e il titolo a destra sopra un filetto d'accento, scheda della commessa, quattro contatori,
 * una scheda per ogni fase (avanzamento, materiali e foto di quella fase), poi squadra, tempi, segnalazioni, foto del
 * cantiere e firme.
 *
 * Il documento è operativo: mai paghe, GPS o costi (vedi model.ts).
 */
export async function renderRapportino(ctx: PdfContext, loadImage: (reference: string, kind: TipoImmagine) => Promise<Uint8Array | null>) {
  const modello = normalizzaModelloPdf(ctx.report.lavoro_completato === true ? "fine_lavori" : "rapportino", ctx.modelloPdf);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(modello.carattere === "times" ? StandardFonts.TimesRoman : modello.carattere === "courier" ? StandardFonts.Courier : StandardFonts.Helvetica);
  const bold = await pdf.embedFont(modello.carattere === "times" ? StandardFonts.TimesRomanBold : modello.carattere === "courier" ? StandardFonts.CourierBold : StandardFonts.HelveticaBold);
  const r = ctx.report, summary = reportSummary(r), order = record(r.ordine);
  const warnings = [...ctx.warnings];

  // Margini: quelli scelti nei Modelli PDF, altrimenti i 40 punti dello stile unico.
  const W = 595.28, H = 841.89, M = modello.margine ? modello.margine * 72 / 25.4 : PG.margineLaterale, CW = W - M * 2;
  // Il piè proprio (oggi solo Impresa Vulcano, 10/11/2026): le sue quattro righe al posto dei dati azienda, in EB
  // Garamond. Per tutte le altre `piede` è null e il piè è quello dello stile unico.
  const veste = personalizzazioneDocumento(text(ctx.company.id) || text(r.company_id));
  const misure = misurePiede(veste, CW);
  const piede = misure && veste.piedeRighe ? { misure, righe: veste.piedeRighe, ...await fontDelPiede(pdf) } : null;
  // Sopra il piè proprio, «Rif./Generato» in piccolo (e la nota di pagina, se c'è): il contenuto resta sopra di loro.
  const sopraPiede = piede ? piede.misure.ingombro + 4 : 0;
  const bottom = piede ? Math.max(72, Math.ceil(sopraPiede + 6 + (modello.notaPagina ? 8 : 0) + 8)) : 72;

  // I colori dello stile unico. Il fondo dei riquadri resta quello scelto nei Modelli PDF, se l'azienda l'ha scelto.
  const ink = daHex(C.inchiostro), muted = daHex(C.testoTenue), line = daHex(C.linea), white = rgb(1, 1, 1);
  const soft = modello.coloreRiquadri ? daHex(modello.coloreRiquadri) : daHex(C.fondoTenue), th = daHex(C.fondoIntestazione);
  const green = daHex(C.positivo), amber = daHex(C.avviso);
  // L'accento: il colore della veste (Vulcano), poi quello dell'azienda (Modelli PDF o marchio), poi il predefinito.
  const accent = daHex(accentoDocumento({ coloreVeste: veste.piedeColore, coloreAzienda: modello.colore || ctx.branding.primaryColor }));

  let page = pdf.addPage([W, H]);
  let y = H;
  const reportId = text(r.id) || "senza-identificativo";
  const shortId = reportId.slice(0, 8).toUpperCase();
  const fineLavori = r.lavoro_completato === true;
  const title = modello.titolo || (fineLavori ? "Rapporto di fine lavori" : "Rapportino giornaliero");
  const codiceCommessa = text(order.order_code);
  // Un rapportino di fine lavori o firmato è un documento per il cliente: i valori interni restano nell'app.
  const documentoPer = fineLavori || !!text(r.firma_cliente_url) ? "cliente" as const : "interno" as const;

  const T = (value: string, x: number, yy: number, size = 9, font: PDFFont = regular, color: Rgb = ink, opacity = 1) =>
    page.drawText(printable(value), { x, y: yy, size, font, color, ...(opacity < 1 ? { opacity } : {}) });
  const larghezza = (value: string, size: number, font: PDFFont = regular) => font.widthOfTextAtSize(printable(value), size);
  /** Testo con spaziatura tra le lettere (titoli di sezione, etichette): un solo drawText, la spaziatura è del PDF. */
  const spaziato = (value: string, x: number, yy: number, size: number, font: PDFFont, color: Rgb, spazio: number) => {
    page.pushOperators(setCharacterSpacing(spazio));
    T(value, x, yy, size, font, color);
    page.pushOperators(setCharacterSpacing(0));
  };
  /** Etichetta di un riquadro: 7,5 pt maiuscolo, testo tenue (o il tono dato). */
  const etichetta = (value: string, x: number, yy: number, color: Rgb = muted) => spaziato(value.toUpperCase(), x, yy, RQ.etichettaCorpo, regular, color, 0.5);
  const box = (x: number, yTop: number, w: number, h: number, color: Rgb) =>
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, color });
  const rrPath = (w: number, h: number, rad: number) => `M ${rad} 0 H ${w - rad} Q ${w} 0 ${w} ${rad} V ${h - rad} Q ${w} ${h} ${w - rad} ${h} H ${rad} Q 0 ${h} 0 ${h - rad} V ${rad} Q 0 0 ${rad} 0 Z`;
  const rbox = (x: number, yTop: number, w: number, h: number, rad: number, color: Rgb, border?: Rgb, spessore: number = RQ.bordo) =>
    page.drawSvgPath(rrPath(w, h, Math.min(rad, h / 2, w / 2)), { x, y: yTop, color, borderWidth: border ? spessore : 0, ...(border ? { borderColor: border } : {}) });
  /** Il riquadro dello stile: fondo tenue, bordo linea, raggio 3. */
  const quadro = (x: number, yTop: number, w: number, h: number) => rbox(x, yTop, w, h, RQ.raggio, soft, line);
  const filetto = (yy: number, x = M, w = CW, spessore: number = TB.filetto, color: Rgb = line) =>
    page.drawLine({ start: { x, y: yy }, end: { x: x + w, y: yy }, thickness: spessore, color });
  /** Etichetta di stato: 7 pt grassetto maiuscolo su fondo tenue; solo i positivi in verde. */
  const etichettaStato = (label: string, xDestra: number, yTop: number, positivo = false) => {
    const w = larghezza(label, 7, bold) + 12;
    rbox(xDestra - w, yTop, w, 13, 3, soft, line);
    T(label, xDestra - w + 6, yTop - 9.2, 7, bold, positivo ? green : muted);
    return w;
  };
  const barra = (x: number, yTop: number, w: number, pct: number, color: Rgb) => {
    rbox(x, yTop, w, 5, 2.5, line);
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
  // Dalla seconda pagina: una riga sola, titolo e riferimento, sopra un filetto sottile. Niente fasce colorate.
  const intestazioneSeguente = () => {
    const yy = H - PG.margineAlto - 4;
    T(`${title}${codiceCommessa ? `  |  ${codiceCommessa}` : ""}  |  ${dayLabel(r.data_lavoro)}`, M, yy, 8, bold, muted);
    const rif = `Rif. ${shortId}`;
    T(rif, W - M - larghezza(rif, 8, bold), yy, 8, bold, muted);
    filetto(yy - 6, M, CW, SZ.filetto);
  };
  const nextPage = () => { page = pdf.addPage([W, H]); intestazioneSeguente(); y = H - 54; };
  const ensure = (needed: number) => { if (y - needed < bottom) { nextPage(); return true; } return false; };
  /** Titolo di sezione: 8 pt grassetto maiuscolo spaziato, nel colore d'accento, con un filetto sottile sotto. */
  const sezione = (label: string, riserva = 60) => {
    // La riserva conta anche l'ingombro del titolo stesso (31 punti, 10 più di prima): mai un titolo solo in fondo.
    ensure(riserva + 10);
    y -= SZ.spazioPrima;
    spaziato(label.toUpperCase(), M, y - SZ.corpo * 0.75, SZ.corpo, bold, accent, SZ.spaziatura);
    y -= SZ.corpo + 3;
    filetto(y, M, CW, SZ.filetto);
    y -= SZ.spazioDopo;
  };
  const paragraph = (value: string, size: number = PG.corpo, color: Rgb = ink, width = CW, x = M) => {
    size = modello.dimensioneTesto || size;
    const lead = size * PG.interlinea;
    for (const l of wrap(value, regular, size, width)) { ensure(lead + 1); T(l, x, y - size, size, regular, color); y -= lead; }
  };

  /** Riquadro di testo: segnalazioni, descrizione, esito dell'ufficio. L'etichetta prende il tono (avviso, positivo). */
  const riquadro = (titolo: string | null, corpo: string, tono: Rgb = muted, size: number = RQ.valoreCorpo) => {
    const pad = RQ.padding, lead = size * PG.interlinea, interno = CW - pad * 2;
    const righe = wrap(corpo, regular, size, interno);
    let i = 0;
    do {
      const testa = i === 0 && titolo ? 14 : 0;
      ensure(testa + lead * Math.min(Math.max(righe.length - i, 1), 3) + pad * 2 + 6);
      const spazio = Math.floor((y - bottom - pad * 2 - 6 - testa) / lead);
      const quante = Math.max(1, Math.min(righe.length - i, spazio));
      const altezza = pad * 2 + testa + quante * lead - (lead - size);
      quadro(M, y, CW, altezza);
      if (testa) etichetta(titolo!, M + pad, y - pad - 5.5, tono);
      let yy = y - pad - testa - size * 0.8;
      righe.slice(i, i + quante).forEach(l => { T(l, M + pad, yy, size, regular, ink); yy -= lead; });
      y -= altezza + 6;
      i += quante;
    } while (i < righe.length);
  };

  /** Tabella: l'intestazione si ridisegna a ogni salto pagina; una riga più alta di una pagina si spezza. */
  const tabella = (etichette: string[], larghezze: number[], valori: string[][], allineamenti: ("l" | "r")[] = [], x0 = M, totale?: string[]) => {
    const totaleLarghezza = larghezze.reduce((a, b) => a + b, 0);
    const pad = TB.paddingOrizzontale, lead = 12;
    const cella = (l: string, i: number, xCella: number, yy: number, size: number, font: PDFFont, color: Rgb) => {
      const xTesto = allineamenti[i] === "r" ? xCella + larghezze[i] - pad - larghezza(l, size, font) : xCella + pad;
      T(l, xTesto, yy, size, font, color);
    };
    const intestazione = () => {
      box(x0, y, totaleLarghezza, 18, th);
      let x = x0;
      etichette.forEach((l, i) => { cella(l.toUpperCase(), i, x, y - 11.8, TB.intestazioneCorpo, bold, muted); x += larghezze[i]; });
      y -= 18;
    };
    ensure(52); intestazione();
    const riga = (cells: string[], indice: number, grassetto = false) => {
      const font = grassetto ? bold : regular;
      const lines = cells.map((c, i) => wrap(c, font, TB.corpo, larghezze[i] - pad * 2));
      const count = Math.max(1, ...lines.map(c => c.length));
      const rowHeight = Math.max(TB.altezzaRigaMin, count * lead + 6);
      // Ordinary rows stay whole. Only a row taller than a page may be split.
      if (rowHeight <= H - 54 - bottom - 18 && y - rowHeight < bottom) { nextPage(); intestazione(); }
      let offset = 0;
      while (offset < count) {
        if (y - 24 < bottom) { nextPage(); intestazione(); }
        const take = Math.min(count - offset, Math.max(1, Math.floor((y - bottom - 6) / lead)));
        const height = Math.max(TB.altezzaRigaMin, take * lead + 6);
        // Righe alternate solo se l'azienda le ha chieste nei Modelli PDF.
        if (!grassetto && modello.righeAlternate && indice % 2 === 1) box(x0, y, totaleLarghezza, height, soft);
        // Il totale: grassetto, con un filetto scuro sopra.
        if (grassetto) filetto(y, x0, totaleLarghezza, TB.filettoTotale, ink);
        let x = x0;
        lines.forEach((col, i) => { col.slice(offset, offset + take).forEach((l, j) => cella(l, i, x, y - 12.3 - j * lead, TB.corpo, font, ink)); x += larghezze[i]; });
        y -= height; offset += take;
        if (!grassetto) filetto(y, x0, totaleLarghezza);
        if (offset < count) { nextPage(); intestazione(); }
      }
    };
    valori.forEach((cells, idx) => riga(cells, idx));
    if (totale) riga(totale, 0, true);
    y -= 8;
  };

  /** I campi propri: nome sopra, valore sotto, due per riga; un testo lungo prende tutta la riga e può cambiare pagina. */
  const griglia = (valori: ValoreCampo[], x0 = M, largh = CW) => {
    const wCol = (largh - 6) / 2, pad = RQ.padding, lead = RQ.valoreCorpo * 1.3, leadNome = 9.5, size = RQ.valoreCorpo;
    // Il nome del campo resta come l'ha scritto l'azienda (unità come «kW», sigle): niente maiuscolo forzato.
    const nome = (v: ValoreCampo) => `${v.etichetta}${v.fase_nome ? ` (${v.fase_nome})` : ""}`;
    const nomiDi = (v: ValoreCampo, w: number) => wrap(nome(v), regular, RQ.etichettaCorpo, w - pad * 2 - 8).slice(0, 2);
    const cella = (v: ValoreCampo, x: number, w: number, yTop: number, righe: string[]) => {
      const nomi = nomiDi(v, w);
      nomi.forEach((l, i) => T(l, x + pad, yTop - pad - 5.5 - i * leadNome, RQ.etichettaCorpo, regular, muted));
      righe.forEach((l, i) => T(l, x + pad, yTop - pad - nomi.length * leadNome - 3 - size * 0.8 - i * lead, size, regular, ink));
    };
    const altezzaNome = (v: ValoreCampo, w: number) => nomiDi(v, w).length * leadNome + 3;
    for (let i = 0; i < valori.length;) {
      const a = valori[i], righeA = wrap(valoreInTesto(a), regular, size, wCol - pad * 2);
      if (righeA.length > 2) {
        const tutte = wrap(valoreInTesto(a), regular, size, largh - pad * 2);
        let fatte = 0, prima = true;
        while (fatte < tutte.length) {
          ensure(50);
          const testa = prima ? altezzaNome(a, largh) : 0;
          const quante = Math.min(tutte.length - fatte, Math.max(1, Math.floor((y - bottom - pad * 2 - testa) / lead)));
          const h = pad * 2 + testa + quante * lead - (lead - size);
          quadro(x0, y, largh, h);
          if (prima) cella(a, x0, largh, y, tutte.slice(0, quante));
          else tutte.slice(fatte, fatte + quante).forEach((l, k) => T(l, x0 + pad, y - pad - size * 0.8 - k * lead, size, regular, ink));
          y -= h + 4; fatte += quante; prima = false;
        }
        i += 1;
        continue;
      }
      const b = valori[i + 1];
      const righeB = b ? wrap(valoreInTesto(b), regular, size, wCol - pad * 2) : [];
      const insieme = !!b && righeB.length <= 2;
      const corpo = (n: number) => n * lead - (lead - size);
      const h = Math.max(altezzaNome(a, wCol) + corpo(righeA.length), insieme ? altezzaNome(b, wCol) + corpo(righeB.length) : 0) + pad * 2;
      ensure(h + 4);
      quadro(x0, y, wCol, h); cella(a, x0, wCol, y, righeA);
      if (insieme) { quadro(x0 + wCol + 6, y, wCol, h); cella(b, x0 + wCol + 6, wCol, y, righeB); }
      y -= h + 4; i += insieme ? 2 : 1;
    }
    y -= 4;
  };
  /** I campi di una fase: piccoli riquadri accanto all'avanzamento. Un testo lungo va in griglia. */
  const etichetteFase = (valori: ValoreCampo[], x0: number, largh: number) => {
    const corti = valori.filter(v => larghezza(`${v.etichetta}  ${valoreInTesto(v)}`, 8) + 16 <= largh);
    const lunghi = valori.filter(v => !corti.includes(v));
    if (corti.length) {
      ensure(26);
      y -= 6;
      let x = x0;
      for (const v of corti) {
        const testo = valoreInTesto(v);
        const w = larghezza(`${v.etichetta}  `, 8) + larghezza(testo, 8, bold) + 16;
        if (x + w > x0 + largh) { x = x0; y -= 22; ensure(22); }
        rbox(x, y, w, 18, RQ.raggio, soft, line);
        T(`${v.etichetta}  `, x + 8, y - 12.3, 8, regular, muted);
        T(testo, x + 8 + larghezza(`${v.etichetta}  `, 8), y - 12.3, 8, bold, ink);
        x += w + 6;
      }
      y -= 22;
    }
    if (lunghi.length) { y -= 4; griglia(lunghi.map(v => ({ ...v, fase_nome: undefined as string | undefined })), x0, largh); }
  };

  // ═════════ Testata ═════════
  // Logo a sinistra su bianco (mai in un riquadro né su una fascia), titolo a destra, filetto d'accento sotto.
  const companyName = text(ctx.company.name) || "Impresa";
  const top = H - PG.margineAlto;
  const logo = modello.mostraLogo && ctx.branding.logoUrl ? await embed(ctx.branding.logoUrl, "logo") : null;
  // Le misure del logo: quelle della veste (Vulcano: logo largo), altrimenti quelle dello stile; la scala dei Modelli PDF.
  const scalaLogo = modello.scalaLogo / 100;
  const misuraLogo = logo
    ? logo.scaleToFit((veste.logoLarghezzaMax ?? TS.logoLarghezzaMax) * scalaLogo, (veste.logoAltezza ?? TS.logoAltezza) * scalaLogo)
    : null;
  let fondoSinistra: number, larghezzaSinistra: number;
  if (logo && misuraLogo) {
    // Il nome è già nel logo, e i dati societari stanno nel piè: non si ripete.
    page.drawImage(logo, { x: M, y: top - misuraLogo.height, ...misuraLogo });
    fondoSinistra = top - misuraLogo.height;
    larghezzaSinistra = misuraLogo.width;
  } else {
    const righeNome = wrap(companyName, bold, TS.ragioneSocialeCorpo, CW * 0.5).slice(0, 2);
    righeNome.forEach((l, i) => T(l, M, top - 10.5 - i * 15, TS.ragioneSocialeCorpo, bold, ink));
    fondoSinistra = top - 10.5 - (righeNome.length - 1) * 15 - 3;
    larghezzaSinistra = Math.max(...righeNome.map(l => larghezza(l, TS.ragioneSocialeCorpo, bold)));
  }
  const xDestra = W - M;
  const righeTitolo = wrap(title, bold, TS.titoloCorpo, Math.max(150, CW - larghezzaSinistra - 24)).slice(0, 2);
  let yd = top - 11;
  righeTitolo.forEach((l, i) => { T(l, xDestra - larghezza(l, TS.titoloCorpo, bold), yd, TS.titoloCorpo, bold, ink); if (i < righeTitolo.length - 1) yd -= 17; });
  // Sotto il titolo: lo stato come etichetta, poi riferimento · data sulla stessa riga; sotto, il meteo.
  yd -= 15;
  const dataGrande = dayLabel(r.data_lavoro);
  const wData = larghezza(dataGrande, TS.sottotitoloCorpo);
  T(dataGrande, xDestra - wData, yd, TS.sottotitoloCorpo, regular, muted);
  const rifTesto = `Rif. ${shortId}  ·  `;
  const xRif = xDestra - wData - larghezza(rifTesto, TS.sottotitoloCorpo);
  T(rifTesto, xRif, yd, TS.sottotitoloCorpo, regular, muted);
  const yRif = yd;
  if (r.meteo) {
    yd -= 12;
    const meteo = `Meteo: ${text(r.meteo)}`;
    T(meteo, xDestra - larghezza(meteo, TS.sottotitoloCorpo), yd, TS.sottotitoloCorpo, regular, muted);
  }
  let fondoDestra = yd - 3.5;
  // «Da approvare» è un fatto interno: il cliente non deve leggerlo. Accanto al riferimento se c'è posto (un logo
  // largo come quello di Vulcano non lo lascia), altrimenti sotto, sempre allineata a destra.
  if (documentoPer === "interno" || summary.status !== "inviato") {
    const wStato = larghezza(summary.statusLabel, 7, bold) + 12;
    if (xRif - 8 - wStato >= M + larghezzaSinistra + 12) etichettaStato(summary.statusLabel, xRif - 8, yRif + 9.5, summary.status === "approvato");
    else { etichettaStato(summary.statusLabel, xDestra, yd - 5, summary.status === "approvato"); fondoDestra = yd - 18; }
  }
  const yFiletto = Math.min(fondoSinistra, fondoDestra) - TS.filettoDistanza;
  filetto(yFiletto, M, CW, TS.filettoSpessore, accent);
  y = yFiletto - TS.spazioDopo;

  if (modello.introduzione) { paragraph(modello.introduzione); y -= 6; }

  // ═════════ Scheda commessa ═════════
  {
    const pad = RQ.padding, interno = CW - pad * 2, leadV = 13;
    const colonne: [string, string, number][] = [
      ["CANTIERE", text(order.work_address) || text(order.indirizzo_lavori) || "-", interno * 0.44],
      ["CLIENTE", text(order.client_name) || "-", interno * 0.26],
      ["COMPILATORE", `${summary.author}\n${summary.authorRole}`, interno * 0.30],
    ];
    const descrizioneCommessa = wrap(text(order.description), regular, PG.corpo, interno).slice(0, 2);
    const righeColonne = colonne.map(([, v, w]) => wrap(v, regular, RQ.valoreCorpo, w - 12).slice(0, 3));
    const altezzaColonne = Math.max(...righeColonne.map(rg => rg.length)) * leadV;
    const yCodice = pad + 5.5 + 17;
    const yDescrizione = yCodice + (descrizioneCommessa.length ? 15 : 0);
    const yColonne = yDescrizione + Math.max(0, descrizioneCommessa.length - 1) * leadV + 10;
    const schedaH = yColonne + 14 + altezzaColonne + pad - 3;
    quadro(M, y, CW, schedaH);
    etichetta("COMMESSA", M + pad, y - pad - 5.5);
    T(codiceCommessa || "-", M + pad, y - yCodice, RQ.numeroCorpo, bold, ink);
    descrizioneCommessa.forEach((l, i) => T(l, M + pad, y - yDescrizione - i * leadV, PG.corpo, regular, muted));
    filetto(y - yColonne, M + pad, interno);
    let xc = M + pad;
    colonne.forEach(([etichettaColonna], i) => {
      etichetta(etichettaColonna, xc, y - yColonne - 12);
      righeColonne[i].forEach((l, j) => T(l, xc, y - yColonne - 14 - RQ.valoreCorpo - j * leadV, RQ.valoreCorpo, j === 0 && etichettaColonna === "COMPILATORE" ? bold : regular, j > 0 && etichettaColonna === "COMPILATORE" ? muted : ink));
      xc += colonne[i][2];
    });
    y -= schedaH + 10;
  }

  // Il motivo del rifiuto si legge subito, in cima.
  if (summary.status === "rifiutato") {
    riquadro("Rapportino rifiutato dall'ufficio", text(r.motivo_rifiuto) || "Motivazione non registrata.", amber);
  }

  // ═════════ Fine lavori: l'esito si legge subito ═════════
  if (fineLavori) {
    const firmaCliente = text(r.firma_cliente_url);
    const chi = text(r.firma_cliente_nome);
    riquadro(firmaCliente ? "Lavori confermati dal cliente" : "Conferma del cliente non acquisita",
      firmaCliente ? `${chi || "Il cliente"} ha confermato i lavori descritti in questo rapporto${r.firma_cliente_at ? ` il ${timestamp(r.firma_cliente_at)}` : ""}.` : "Questo rapporto non porta ancora la firma del cliente.",
      firmaCliente ? green : amber);
  }

  // ═════════ Contatori ═════════
  const fasiCompletate = blocchi.fasi.filter(f => f.percentuale === 100).length;
  const contatori: [string, string, string][] = [
    [summary.crew.length ? "ORE SQUADRA" : "ORE LAVORATE", oreBrevi(summary.total), summary.crew.length ? `${summary.crew.length} ${summary.crew.length === 1 ? "presenza" : "presenze"}` : (summary.extra ?? 0) > 0 ? `+ ${oreBrevi(summary.extra)} straordinario` : ""],
    ["LAVORAZIONI", String(blocchi.fasi.length), fasiCompletate ? `${fasiCompletate} ${fasiCompletate === 1 ? "completata" : "completate"}` : ""],
    ["MATERIALI", String(blocchi.totaleMateriali), ""],
    ["FOTO", String(blocchi.totaleFoto), ""],
  ];
  // Una conferma del cliente non ha ore né materiali: quattro zeri non dicono nulla.
  const vuoti = (v: string) => v === "0" || v === "0 h" || v === "-";
  if (!fineLavori || contatori.some(([, v]) => !vuoti(v))) {
    ensure(60);
    const hTessera = 46, wTessera = (CW - 3 * 8) / 4, pad = RQ.padding;
    contatori.forEach(([etich, valore, sotto], i) => {
      const x = M + i * (wTessera + 8);
      quadro(x, y, wTessera, hTessera);
      etichetta(etich, x + pad, y - pad - 5.5);
      // Le ore sono il numero che conta: nel colore d'accento.
      T(valore, x + pad, y - 35, RQ.numeroCorpo, regular, vuoti(valore) ? muted : i === 0 ? accent : ink);
      if (sotto) T(sotto, x + pad + larghezza(valore, RQ.numeroCorpo) + 5, y - 35, PG.nota, regular, muted);
    });
    y -= hTessera + 6;
  }

  // ═════════ Cosa è stato fatto ═════════
  sezione("Cosa è stato fatto", 100);
  riquadro(null, text(r.descrizione_lavori) || "Descrizione non registrata.");

  // ═════════ Lavorazioni: una scheda per fase ═════════
  const gapFoto = 8, interno = CW;
  const disegnaFoto = async (u: string, x: number, yTop: number, w: number, h: number) => {
    const n = numeroFoto.get(u) ?? 0;
    rbox(x, yTop, w, h, RQ.raggio, soft, line);
    const img = await embed(u, "photo");
    if (img) { const d = img.scaleToFit(w - 8, h - 8); page.drawImage(img, { x: x + (w - d.width) / 2, y: yTop - h + (h - d.height) / 2, ...d }); }
    else { T("Immagine non disponibile", x + 10, yTop - h / 2, PG.nota, regular, muted); warnings.push(`Foto ${n}: impossibile includere l'immagine. Rigenerare dopo la verifica dell'allegato.`); }
    rbox(x + 6, yTop - 6, 22, 12, RQ.raggio, ink);
    T(String(n), x + 6 + (22 - larghezza(String(n), 7, bold)) / 2, yTop - 14.5, 7, bold, white);
  };
  /** Tre per riga anche quando sono poche: si vedono bene e il rapportino resta compatto. */
  const impaginaFoto = (_n: number) => { const colonne = 3; return { colonne, w: (interno - gapFoto * (colonne - 1)) / colonne, h: 62 }; };
  const padFase = RQ.padding;
  const misureScheda = (f: FaseBlocco) => {
    const nomeRighe = wrap(f.nome, bold, 10.5, CW - padFase * 2 - 160).slice(0, 2);
    const testaH = padFase * 2 + nomeRighe.length * 14 - 3 + (f.percentuale !== null ? 11 : 0) + (f.ore !== null ? 12 : 0);
    const righeMateriali = f.materiali.map(m => Math.max(1, wrap(m.nome, regular, TB.corpo, interno - 70 - 56 - TB.paddingOrizzontale * 2).length));
    const materialiH = f.materiali.length ? 20 + 18 + righeMateriali.reduce((a, n) => a + Math.max(TB.altezzaRigaMin, n * 12 + 6), 0) + 8 : 0;
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
    // testata della fase: un riquadro, il nome in grassetto, lo stato e l'avanzamento a destra
    quadro(M, y, CW, testaH);
    nomeRighe.forEach((l, i) => T(l, M + padFase, y - padFase - 8 - i * 14, 10.5, bold, ink));
    const completata = f.percentuale === 100;
    const etichettaFase = completata ? "COMPLETATA" : f.percentuale !== null ? "IN CORSO" : "LAVORATA";
    const wEt = etichettaStato(etichettaFase, M + CW - padFase, y - padFase + 1, completata);
    let yy = y - padFase - nomeRighe.length * 14 + 3;
    if (f.percentuale !== null) {
      const testo = `${f.percentuale.toLocaleString("it-IT")}%`;
      T(testo, M + CW - padFase - wEt - 8 - larghezza(testo, RQ.numeroCorpo), y - padFase - 10.5, RQ.numeroCorpo, regular, completata ? green : accent);
      barra(M + padFase, yy - 3, CW - padFase * 2, f.percentuale, completata ? green : accent);
      yy -= 11;
    }
    if (f.ore !== null) T(`${oreBrevi(f.ore)} dichiarate su questa lavorazione`, M + padFase, yy - 9, PG.nota, regular, muted);
    y -= testaH + 2;
    // campi della fase
    etichetteFase(valoriDaStampare(f.campi, documentoPer), M, interno);
    // materiali della fase
    if (f.materiali.length) {
      ensure(18 + 30);
      etichetta("Materiali usati", M, y - 14);
      y -= 20;
      tabella(["Materiale", "Quantità", "Unità"], [interno - 70 - 56, 70, 56], f.materiali.map(m => [m.nome, m.quantita, m.unita]), ["l", "r", "l"], M);
    }
    // foto della fase
    if (f.foto.length) {
      for (let i = 0; i < f.foto.length; i += colonneFoto) {
        ensure(hFoto + 30 + (i === 0 ? 14 : 0));
        if (i === 0) { etichetta(`FOTO DELLA LAVORAZIONE (${f.foto.length})`, M, y - 14); y -= 20; }
        const inizio = y;
        for (let k = 0; k < colonneFoto && i + k < f.foto.length; k++) await disegnaFoto(f.foto[i + k], M + k * (wFoto + gapFoto), inizio, wFoto, hFoto);
        y = inizio - hFoto - 8;
      }
    }
    y -= 8;
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
    const hT = 44, pad = RQ.padding;
    let x = M; ensure(hT + 6);
    for (const [etich, valore] of eventi) {
      const w = Math.max(larghezza(etich, RQ.etichettaCorpo) + etich.length * 0.5, larghezza(valore, RQ.numeroCorpo)) + pad * 2;
      if (x + w > M + CW) { x = M; y -= hT + 8; ensure(hT + 6); }
      quadro(x, y, w, hT);
      etichetta(etich, x + pad, y - pad - 5.5);
      T(valore, x + pad, y - 34, RQ.numeroCorpo, regular, ink);
      x += w + 8;
    }
    y -= hT + 8;
  }

  // ═════════ Campi propri dell'azienda ═════════
  const valoriPropri = valoriDaStampare(blocchi.altriCampi, documentoPer);
  if (valoriPropri.length) {
    sezione("Altre informazioni", 70);
    griglia(valoriPropri);
  }

  // ═════════ Segnalazioni ═════════
  if (text(r.note)) {
    sezione("Note e segnalazioni", 120);
    riquadro("Da leggere", text(r.note), amber);
  }

  // ═════════ Foto del cantiere ═════════
  if (blocchi.altreFoto.length) {
    const colonneGenerali = blocchi.altreFoto.length > 2 ? 3 : 2;
    const wG = (CW - gapFoto * (colonneGenerali - 1)) / colonneGenerali, hG = colonneGenerali === 3 ? 112 : 140;
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
    riquadro(null, `Rapportino approvato il ${timestamp(r.approvato_at)}. L'approvazione del rapportino non è una firma del cliente.`);
  }

  // ═════════ Firme ═════════
  // La firma del cliente è solo del collaudo (rapporto di fine lavori). Il giornaliero lo firma chi lo compila.
  const firme = [
    { etichetta: "Firma del compilatore", ref: text(r.firma_operaio_url), nome: summary.author, data: "" },
    ...(fineLavori ? [{ etichetta: "Firma del cliente", ref: text(r.firma_cliente_url), nome: text(r.firma_cliente_nome), data: r.firma_cliente_at ? timestamp(r.firma_cliente_at) : "" }] : []),
  ].filter(s => s.ref || fineLavori);
  const chiEQuando = compilatoDa(r);
  const note: string[] = [];
  if (blocchi.fasi.length) note.push("Le ore di fase non si sommano alle presenze della squadra e non sostituiscono la verifica dell'ufficio.");
  if (summary.crew.length) note.push("Il totale usa solo le presenze elencate: le ore personali del compilatore non vengono sommate di nuovo. Le presenze esterne non determinano automaticamente un costo orario.");
  if (blocchi.totaleMateriali) note.push("Le quantità dichiarate non attestano uno scarico di magazzino.");
  note.push(ctx.punches.length
    ? "Eventi di chi compila, per questo cantiere e questa data: non sono un totale ore validato. Per turni oltre mezzanotte consultare anche la giornata adiacente nell'app."
    : "Nessuna timbratura di chi compila in questa giornata: le ore sono dichiarate.");
  // Le precisazioni non restano mai da sole su una pagina: si tengono insieme a chi ha compilato.
  const altezzaNote = documentoPer === "interno" ? 12 + wrap(note.join(" "), regular, PG.nota, CW).length * PG.nota * PG.interlinea : 0;
  if (!fineLavori && (chiEQuando || firme.length)) {
    // Chi ha compilato a sinistra; la firma a destra, sopra la sua riga e la sua didascalia.
    const firma = firme[0];
    const pad = RQ.padding, alto = firma ? 58 : 30;
    ensure(alto + 8 + altezzaNote);
    quadro(M, y, CW, alto);
    T(chiEQuando || summary.author, M + pad, y - alto / 2 - 3.5, RQ.valoreCorpo, regular, ink);
    if (firma) {
      const wFirma = 150, xFirma = M + CW - wFirma - pad;
      const img = await embed(firma.ref, "signature");
      if (img) { const d = img.scaleToFit(wFirma, 24); page.drawImage(img, { x: xFirma, y: y - pad - 24, ...d }); }
      else { T("Firma registrata, immagine non disponibile", xFirma, y - pad - 16, PG.nota, regular, muted); warnings.push(`${firma.etichetta}: immagine non inclusa.`); }
      filetto(y - pad - 28, xFirma, wFirma, 0.5, ink);
      T(firma.etichetta, xFirma, y - pad - 38, PG.nota, regular, muted);
    }
    y -= alto + 8;
  } else if (chiEQuando) {
    ensure(38);
    quadro(M, y, CW, 30);
    T(chiEQuando, M + RQ.padding, y - 18.5, RQ.valoreCorpo, regular, ink);
    y -= 38;
  }
  if (fineLavori && firme.length) {
    // Firme: una colonna ciascuna, l'immagine sopra una riga scura, sotto chi firma.
    sezione("Firme", 150);
    const wF = (CW - 24) / 2;
    ensure(100);
    for (let i = 0; i < firme.length; i++) {
      const s = firme[i], x = M + i * (wF + 24);
      const img = s.ref ? await embed(s.ref, "signature") : null;
      if (img) { const d = img.scaleToFit(wF, 46); page.drawImage(img, { x, y: y - 50 + (46 - d.height) / 2, ...d }); }
      else { T(s.ref ? "Firma registrata, immagine non disponibile" : "Firma non acquisita", x, y - 32, PG.nota, regular, muted); if (s.ref) warnings.push(`${s.etichetta}: immagine non inclusa.`); }
      filetto(y - 54, x, wF, 0.5, ink);
      T(s.etichetta, x, y - 64, PG.nota, regular, muted);
      if (s.nome) T(s.nome, x, y - 76, PG.nota, bold, ink);
      if (s.data) T(`Data registrata: ${s.data}`, x, y - 87, PG.nota, regular, muted);
    }
    y -= 98;
    if (fineLavori) paragraph("La firma si riferisce a questo rapportino: non approva costi extra e non sostituisce un verbale di collaudo con verifiche ed eventuali riserve.", PG.nota, muted);
  }

  // ═════════ Note del documento ═════════
  // Questo è un dato, non una precisazione: resta visibile anche nel documento per il cliente.
  if (!blocchi.fasi.length && (number0(r.percentuale_avanzamento) ?? 0) > 0) paragraph(`Avanzamento generale dichiarato della commessa: ${Number(r.percentuale_avanzamento).toLocaleString("it-IT")}%.`);
  // Precisazioni per l'ufficio: una nota piccola in fondo, e nel documento per il cliente non servono.
  if (documentoPer === "interno") {
    ensure(altezzaNote);
    y -= 6;
    filetto(y);
    y -= 5;
    paragraph(note.join(" "), PG.nota, muted);
  }
  if (warnings.length) {
    sezione("Avvertenze del documento", 70);
    for (const warning of [...new Set(warnings)]) paragraph(`- ${warning}`, PG.nota, muted);
  }

  if (modello.conclusione) { y -= 6; paragraph(modello.conclusione); }

  // ═════════ Piè di pagina ═════════
  // Riferimenti tecnici in una sola riga piccola sopra il piè; il piè è quello della veste o le righe societarie
  // centrate, con «Pag. n / m» sotto.
  const pages = pdf.getPages();
  const datiAzienda = [
    [companyName, text(ctx.company.legal_address), [text(ctx.company.legal_postal_code), text(ctx.company.legal_city), text(ctx.company.legal_province)].filter(Boolean).join(" "), ctx.company.vat_number ? `P.IVA ${text(ctx.company.vat_number)}` : ""].filter(Boolean).join(" | "),
    [text(ctx.company.phone), text(ctx.company.email)].filter(Boolean).join(" | "),
  ].filter(Boolean);
  const generato = `Generato ${timestamp(ctx.generatedAt)}${ctx.branding.hidePoweredBy ? "" : ` | ${ctx.branding.platformName || "Edilizia in Cloud"}`}`;
  const riferimenti = (yy: number) => {
    T(`Rif. ${shortId} | Edizione ${ctx.revision}`, M, yy, 6.5, regular, muted);
    T(generato, W - M - larghezza(generato, 6.5), yy, 6.5, regular, muted);
    if (modello.notaPagina) {
      const size = Math.min(6.5, CW / Math.max(1, larghezza(modello.notaPagina, 1)));
      T(modello.notaPagina, M, yy + 9, size, regular, muted);
    }
  };
  if (piede) {
    disegnaPiedeProprio(pages, piede, veste.piedeColore, {
      W, CW, numerazione: modello.numerazione,
      // Rif. ed edizione restano: dicono quale edizione del rapportino si ha in mano. Piccoli, in grigio, sopra il piè.
      dopo: (p) => { page = p; riferimenti(sopraPiede); },
    });
  } else pages.forEach((p, index) => {
    page = p;
    riferimenti(50);
    datiAzienda.forEach((l, i) => {
      const size = Math.min(7, CW / Math.max(1, larghezza(l, 1)));
      T(l, W / 2 - larghezza(l, size) / 2, 35 - i * 9, size, regular, muted);
    });
    const pagination = `Pag. ${index + 1} / ${pages.length}`;
    if (modello.numerazione) T(pagination, W / 2 - larghezza(pagination, 7) / 2, 14, 7, regular, muted);
  });
  pdf.setTitle(`${title} - ${dayLabel(r.data_lavoro)} - ${shortId}`);
  pdf.setAuthor(companyName);
  pdf.setSubject(`Rapportino ${reportId}; edizione ${ctx.revision}; ${summary.statusLabel}`);
  return { bytes: await pdf.save(), warnings: [...new Set(warnings)], pageCount: pages.length };
}


/**
 * EB Garamond incorporato, o Times se il file non arriva o fontkit non lo legge: il documento esce comunque.
 * `vero`: è il carattere proprio, che scrive anche ciò che Times (WinAnsi) non ha.
 */
async function fontDelPiede(pdf: PDFDocument): Promise<{ font: PDFFont; vero: boolean }> {
  try {
    const base64 = await fontPiedeBase64();
    if (base64) {
      creaFont = (await import("https://esm.sh/fontkit@2.0.4")).create;
      pdf.registerFontkit(fontkitPerPdfLib as unknown as Parameters<PDFDocument["registerFontkit"]>[0]);
      // Solo i glifi usati: pochi kB invece di 490.
      const font = await pdf.embedFont(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)), { subset: true });
      return { font, vero: true };
    }
  } catch { /* si ripiega su Times */ }
  return { font: await pdf.embedFont(StandardFonts.TimesRoman), vero: false };
}

/**
 * pdf-lib è fatto per @pdf-lib/fontkit, ma il sottoinsieme che quello produce per EB Garamond è rotto: il PDF si apre
 * e il testo si copia, ma metà delle lettere non si vede (provato il 10/11/2026 con pdftoppm). fontkit 2 lo fa giusto;
 * gli manca solo `encodeStream()`, sostituito da `encode()`. Qui il ponte: un flusso finto che dà tutto in una volta.
 */
let creaFont: unknown = null;
interface SottoinsiemeFontkit { encode(): Uint8Array; encodeStream?: () => unknown }
const fontkitPerPdfLib = {
  create(byte: Uint8Array) {
    // I tipi di fontkit chiedono un Buffer di Node; legge anche un Uint8Array, che è ciò che pdf-lib gli passa.
    const font = (creaFont as unknown as (b: Uint8Array) => { createSubset(): SottoinsiemeFontkit })(byte);
    const crea = font.createSubset.bind(font);
    font.createSubset = () => {
      const sottoinsieme = crea();
      sottoinsieme.encodeStream = () => {
        const ascolti: Record<string, (v?: unknown) => void> = {};
        let partito = false;
        const flusso = {
          on(evento: string, fn: (v?: unknown) => void) {
            ascolti[evento] = fn;
            // pdf-lib registra data, end ed error in fila: si parte quando ha finito.
            if (!partito) {
              partito = true;
              queueMicrotask(() => {
                try { ascolti.data?.(sottoinsieme.encode()); ascolti.end?.(); } catch (e) { ascolti.error?.(e); }
              });
            }
            return flusso;
          },
        };
        return flusso;
      };
      return sottoinsieme;
    };
    return font;
  },
};

const coloreHex = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/**
 * Il piè proprio, come `disegnaPiedeJsPdf` per i documenti jsPDF: righe centrate senza filetto, il titolo più grande,
 * le altre che scendono insieme di corpo se la più lunga non sta nella larghezza utile, l'email sottolineata nel suo
 * colore; sotto, «Pag. n / m». Coordinate pdf-lib: dal fondo del foglio verso l'alto.
 */
function disegnaPiedeProprio(
  pages: ReturnType<PDFDocument["getPages"]>,
  piede: { misure: NonNullable<ReturnType<typeof misurePiede>>; righe: NonNullable<ReturnType<typeof personalizzazioneDocumento>["piedeRighe"]>; font: PDFFont; vero: boolean },
  colorePiede: string | null,
  o: { W: number; CW: number; numerazione: boolean; dopo: (p: ReturnType<PDFDocument["getPages"]>[number]) => void },
) {
  const { misure: m, righe, font } = piede;
  const colore = coloreHex(colorePiede ?? "#1C1650");
  // Times scrive solo WinAnsi: il «–» sì, il resto che non ha diventa «?» invece di far fallire il documento.
  const scritta = (t: string) => piede.vero ? t : t.normalize("NFC").replace(/[^\x20-\x7E\xA0-\xFF‘’“”…€–—]/gu, "?");
  let corpo = m.corpo;
  const piuLunga = Math.max(...righe.filter((r) => !r.titolo).map((r) => font.widthOfTextAtSize(scritta(testoRigaPiede(r)), corpo)));
  if (piuLunga > o.CW) corpo = (corpo * o.CW) / piuLunga;
  // La linea di base di ogni riga: dal fondo delle righe verso l'alto, a circa un quarto di riga dal fondo della sua.
  const basi: number[] = [];
  let fondo = m.fondoRigheDalFondo;
  for (let i = righe.length - 1; i >= 0; i--) {
    const alta = righe[i].titolo ? m.rigaTitolo : corpo * 1.25;
    basi[i] = fondo + alta * 0.27;
    fondo += alta;
  }
  pages.forEach((p, index) => {
    righe.forEach((riga, i) => {
      const c = riga.titolo ? m.corpoTitolo : corpo;
      const pezzi = riga.parti.map((parte) => {
        const testo = scritta(parte.testo);
        return { ...parte, testo, larghezza: font.widthOfTextAtSize(testo, c) };
      });
      let x = o.W / 2 - pezzi.reduce((s, parte) => s + parte.larghezza, 0) / 2;
      for (const parte of pezzi) {
        const col = parte.colore ? coloreHex(parte.colore) : colore;
        p.drawText(parte.testo, { x, y: basi[i], size: c, font, color: col });
        if (parte.sottolineato) {
          const yy = basi[i] - c * 0.12;
          p.drawLine({ start: { x, y: yy }, end: { x: x + parte.larghezza, y: yy }, thickness: c * 0.05, color: col });
        }
        x += parte.larghezza;
      }
    });
    if (o.numerazione) {
      const pagina = `Pag. ${index + 1} / ${pages.length}`;
      p.drawText(pagina, { x: o.W / 2 - font.widthOfTextAtSize(pagina, m.corpoPagina) / 2, y: m.cimaPaginaDalFondo - m.corpoPagina * 0.8, size: m.corpoPagina, font, color: colore });
    }
    o.dopo(p);
  });
}

/** Un numero valido (≥ 0) o null: l'avanzamento generale di un rapportino senza fasi. */
function number0(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
