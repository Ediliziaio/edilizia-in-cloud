import type { jsPDF } from "jspdf";
import type { IntestazioneComputo } from "./esportaComputo";
import { alberoComputo, numeroVoce, tariffaVoce, type NodoComputo, type VoceComputo } from "./alberoComputo";
import { formatEuro } from "./computoStrutturato";
import { coloriCopertina, creaTema } from "@/components/preventivi/pdf/temaDocumento";
import { AVVERTENZA_DETRAZIONE } from "./detrazioneComputo";
import { calcolaIvaComputo } from "./ivaComputo";
import { calcolaSconto, oneriSicurezza } from "./scontoComputo";
import { testoPianoPagamenti } from "./pianoPagamentiPdf";
import { disegnaCronoprogramma } from "./stampaCronoprogramma";

/** Stesso tema dei preventivi edili; dettaglio metrico mantenuto nel motore comune. */
export function disegnaPreventivoComputo(doc: jsPDF, voci: VoceComputo[], i: IntestazioneComputo): jsPDF {
  // Stato stampato in testa e a piè di pagina: vuoto nel documento definitivo, «Bozza…» nelle anteprime e se non detto.
  const stato = i.stato ?? "Bozza locale - non inviata";
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const m = 40, right = W - m, width = W - m * 2, bottom = H - 48;
  const t = creaTema({ primario: i.colore });
  const { nodi, totale } = alberoComputo(voci);
  const fonti = i.mostraFonti === false ? [] : [...new Set(voci.map(v => v.fonte_prezzo?.trim()).filter((s): s is string => !!s))];
  const mostraImporti = !i.senzaPrezzi && i.mostraImporti !== false;
  const mostraUnitari = !i.senzaPrezzi && i.mostraPrezziUnitari !== false && !i.soloRiepilogo;
  const haImporti = voci.some(v => v.importo_computo != null);
  const money = (n: number | null) => n == null ? "Da definire" : `${formatEuro(n)} €`;
  const num = (n: number | null, min = 0) => n == null ? "-" : n.toLocaleString("it-IT", { minimumFractionDigits: min, maximumFractionDigits: 6 });
  let y = m;
  let ripetiIntestazioneTabella: (() => void) | null = null;
  const font = (size = 9.5, bold = false, color = t.inchiostro) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(color);
  };
  const wrap = (s: string, w = width): string[] => doc.splitTextToSize(s, w);
  const short = (s: string, w: number) => {
    while (doc.getTextWidth(s) > w && s.length) s = s.slice(0, -1);
    return s;
  };
  const continuation = () => {
    doc.addPage(); y = m;
    font(9, true, t.inchiostroMarca); doc.text(short(i.azienda || "Computo metrico", width - 110), m, y);
    font(8, false, t.grigio); doc.text(short(i.numero || (stato ? "BOZZA" : ""), 100), right, y, { align: "right" });
    y += 12; font(7.5, false, t.grigio); doc.text(short(i.titolo, width), m, y);
    doc.setDrawColor(t.filetto); doc.setLineWidth(.5); doc.line(m, y + 7, right, y + 7); y += 24;
    ripetiIntestazioneTabella?.();
  };
  const ensure = (h: number) => { if (y + h > bottom) continuation(); };
  const paragraph = (s: string, size = 9.5, color = t.inchiostro, bold = false, w = width, x = m) => {
    font(size, bold, color);
    const lines = wrap(s, w);
    for (const line of lines) { ensure(size * 1.35); font(size, bold, color); doc.text(line, x, y); y += size * 1.35; }
  };
  const rule = () => { ensure(9); doc.setDrawColor(t.filetto); doc.setLineWidth(.5); doc.line(m, y, right, y); y += 10; };
  const section = (numero: string, titolo: string, sottotitolo?: string) => {
    font(11, true); const lines = wrap(titolo, width - 27);
    ensure(lines.length * 14 + (sottotitolo ? 25 : 15));
    font(12, false, t.inchiostroMarca); doc.text(numero, m, y + 1);
    for (const line of lines) { font(11, true); doc.text(line, m + 27, y); y += 14; }
    if (sottotitolo) paragraph(sottotitolo, 7, t.grigio, false, width - 34, m + 34);
    y += 3; rule();
  };
  const labelValue = (label: string, value: string) => {
    ensure(32); paragraph(label.toUpperCase(), 7, t.grigio, true); paragraph(value, 9); y += 6;
  };
  const coppia = (campi: [string, string][]) => {
    const colonna = (width - 22) / 2;
    font(9); const h = Math.max(...campi.map(([, v]) => wrap(v, colonna).length * 12.15 + 22));
    ensure(h); const base = y;
    campi.forEach(([label, value], k) => {
      y = base; const x = m + k * (colonna + 22);
      paragraph(label.toUpperCase(), 7, t.grigio, true, colonna, x);
      paragraph(value, 9, t.inchiostro, false, colonna, x);
    });
    y = base + h;
  };
  // La copertina (29/10/2026): con «piena» è una pagina intera, scura, con la trama di un foglio millimetrato, il
  // logo, il titolo grande e i dati del lavoro in fondo; il documento comincia dalla pagina dopo. Le altre due
  // («fascia», «sobria») restano una testata sulla prima pagina. Mai il prezzo in copertina.
  const veste = i.veste;
  const coperta = (veste?.copertina ?? "piena") === "piena" && i.sezioni?.copertina !== false;
  const logo = veste?.mostraLogo !== false ? veste?.logo : null;
  if (coperta) {
    const c = coloriCopertina(t, {});
    // Niente trasparenze (jsPDF non le rende ovunque): i toni tenui sono il testo già mescolato col fondo.
    const mescola = (a: string, b: string, k: number) => {
      const n = (h: string, i0: number) => parseInt(h.replace("#", "").slice(i0, i0 + 2), 16);
      return "#" + [0, 2, 4].map(i0 => Math.round(n(a, i0) * (1 - k) + n(b, i0) * k).toString(16).padStart(2, "0")).join("");
    };
    const trama = mescola(c.fondo, c.testo, 0.06), tenue = mescola(c.fondo, c.testo, 0.72), filo = mescola(c.fondo, c.testo, 0.3);
    // Con la foto del progetto la parte alta è la foto, a tutta pagina; sotto, il fondo scuro con titolo e dati.
    const foto = i.immagineCopertina;
    const fotoH = foto ? Math.round(H * 0.44) : 0;
    doc.setFillColor(c.fondo); doc.rect(0, 0, W, H, "F");
    // La trama di un foglio millimetrato, appena visibile: è un computo, un documento tecnico.
    doc.setDrawColor(trama); doc.setLineWidth(0.3);
    for (let x = 0; x <= W; x += 24) doc.line(x, 0, x, H);
    for (let r = 0; r <= H; r += 24) doc.line(0, r, W, r);
    if (foto) { try { doc.addImage(foto.dati, "JPEG", 0, 0, W, fotoH); } catch { /* una foto illeggibile non ferma il preventivo */ } }
    doc.setFillColor(c.evidenza); doc.rect(0, fotoH, 7, H - fotoH, "F");
    let yc = 62;
    if (logo) {
      const lw = Math.min(170, 50 * logo.larghezza / logo.altezza);
      doc.setFillColor("#FFFFFF"); doc.roundedRect(m - 8, yc - 30, lw + 16, 64, 5, 5, "F");
      try { doc.addImage(logo.dati, logo.formato, m, yc - 23, lw, 50); } catch { /* un logo illeggibile non ferma il preventivo */ }
      yc += 60;
    }
    if (foto) yc = fotoH + 34;
    font(15, true, c.testo); doc.text(short(i.azienda || "Preventivo con computo metrico", width), m, yc); yc += 15;
    if (i.dettagliAzienda) { font(8, false, tenue); (wrap(i.dettagliAzienda, width) as string[]).slice(0, 2).forEach((r, k) => doc.text(r, m, yc + k * 11)); }
    yc = foto ? yc + 44 : H * 0.36;
    const occhiello = (i.soloRiepilogo ? "Piano dei lavori · sintesi per capitoli" : i.senzaPrezzi ? "Computo metrico · lavorazioni e quantità" : veste?.sopratitolo?.trim() || "Preventivo · computo metrico estimativo").toUpperCase();
    font(9, true, c.evidenza); doc.text(occhiello, m, yc, { charSpace: 0.8 });
    doc.setFillColor(c.evidenza); doc.rect(m, yc + 9, 54, 2.5, "F"); yc += 46;
    font(34, true, c.testo);
    for (const r of (wrap(i.titolo || "Preventivo", width - 10) as string[]).slice(0, foto ? 2 : 4)) { doc.text(r, m, yc); yc += 39; }
    if (i.oggetto?.trim()) { yc += 4; font(12, false, tenue); for (const r of (wrap(i.oggetto.trim(), width - 40) as string[]).slice(0, foto ? 2 : 4)) { doc.text(r, m, yc); yc += 16; } }
    const campi = ([
      ["Committente", i.nascondiCliente ? "" : i.committente ?? ""], ["Luogo dei lavori", i.nascondiCliente ? "" : i.indirizzoIntervento ?? ""],
      ["Data", i.dataDocumento ?? ""], ["Preventivo n.", [i.numero, i.revisione && `rev. ${i.revisione}`].filter(Boolean).join(" · ")],
      ["Tecnico / referente", i.tecnico ?? ""],
    ] as [string, string][]).filter(([, v]) => v.trim());
    if (campi.length) {
      const col = (width - 30) / 3, righe = Math.ceil(campi.length / 3);
      let yb = H - 70 - righe * 46;
      doc.setDrawColor(filo); doc.setLineWidth(0.6); doc.line(m, yb - 18, right, yb - 18);
      campi.forEach(([etichetta, valore], k) => {
        const x = m + (k % 3) * (col + 15), yy = yb + Math.floor(k / 3) * 46;
        font(6.8, true, c.evidenza); doc.text(etichetta.toUpperCase(), x, yy, { charSpace: 0.6 });
        font(10, true, c.testo); (wrap(valore, col) as string[]).slice(0, 2).forEach((r, n) => doc.text(r, x, yy + 14 + n * 12));
      });
      yb += righe * 46;
    }
    if (stato) { font(7.5, false, tenue); doc.text(stato, m, H - 34); }
    doc.addPage(); y = m;
    font(9, true, t.inchiostroMarca); doc.text(short(i.azienda || "Computo metrico", width - 110), m, y);
    font(8, false, t.grigio); doc.text(short(i.numero || "", 100), right, y, { align: "right" });
    y += 12; font(7.5, false, t.grigio); doc.text(short(i.titolo, width), m, y);
    doc.setDrawColor(t.filetto); doc.setLineWidth(.5); doc.line(m, y + 7, right, y + 7); y += 30;
    paragraph("Dati del lavoro", 16, t.inchiostro, true); y += 6;
  } else {
  // Prima pagina: identità e perimetro, senza ripetere il prezzo finale. La copertina la sceglie il modello
  // del computo dell'azienda: «piena» (fascia alta nel colore del marchio, quella di sempre), «fascia» (banda
  // sottile e testo scuro) o «sobria» (niente colore, solo un filetto).
  // Qui la copertina «piena» non arriva mai: ha la sua pagina sopra. Senza copertina si usa la banda sottile.
  const copertina: "fascia" | "sobria" = veste?.copertina === "sobria" ? "sobria" : "fascia";
  const suColore: boolean = false;
  const testoCopertina = suColore ? t.bianco : t.inchiostro;
  const logoW = logo ? Math.min(150, 46 * logo.larghezza / logo.altezza) : 0;
  const spazioTesto = width - (logo ? logoW + 24 : 0);
  font(25, true); const titolo = wrap(i.titolo, width - 38);
  font(8); const metadati = wrap([i.numero, i.dataDocumento, i.revisione && `Rev. ${i.revisione}`].filter(Boolean).join("  |  ") || (stato ? "BOZZA" : " "), width - 38);
  font(13, true); const aziendaH = wrap(i.azienda || "Preventivo con computo metrico", spazioTesto).length * 17.55;
  font(8); const dettagliH = i.dettagliAzienda ? wrap(i.dettagliAzienda, spazioTesto).length * 10.8 : 0;
  const altezzaContenuto = m + aziendaH + dettagliH + 63 + titolo.length * 30 + metadati.length * 11;
  const heroH = suColore ? Math.max(235, altezzaContenuto) : altezzaContenuto - 10;
  if (copertina === "fascia") { doc.setFillColor(t.fondo); doc.rect(0, 0, W, 10, "F"); }
  if (logo) {
    const lx = right - logoW, ly = m - 8;
    if (suColore) { doc.setFillColor("#FFFFFF"); doc.roundedRect(lx - 6, ly - 6, logoW + 12, 58, 4, 4, "F"); }
    try { doc.addImage(logo.dati, logo.formato, lx, ly, logoW, 46); } catch { /* un logo illeggibile non ferma il preventivo */ }
  }
  paragraph(i.azienda || "Preventivo con computo metrico", 13, suColore ? t.bianco : t.inchiostroMarca, true, spazioTesto);
  if (i.dettagliAzienda) paragraph(i.dettagliAzienda, 8, suColore ? t.bianco : t.grigio, false, spazioTesto);
  y += 27;
  const sopratitolo = veste?.sopratitolo?.trim().toUpperCase();
  font(8, true, suColore ? t.bianco : t.inchiostroMarca); doc.text(i.soloRiepilogo ? "PIANO DEI LAVORI / SINTESI PER CAPITOLI" : i.senzaPrezzi ? "COMPUTO METRICO / LAVORAZIONI E QUANTITÀ" : sopratitolo || "PREVENTIVO / COMPUTO METRICO ESTIMATIVO", m, y);
  y += 29;
  for (const line of titolo) { font(25, true, testoCopertina); doc.text(line, m, y); y += 30; }
  font(8, false, suColore ? t.bianco : t.grigio);
  metadati.forEach((line, k) => doc.text(line, m, y + 1 + k * 11));
  if (copertina === "sobria") { y += metadati.length * 11 + 8; doc.setDrawColor(t.fondo); doc.setLineWidth(1.2); doc.line(m, y, right, y); y += 25; }
  else y = heroH + 25;
  }
  if (stato && !coperta) { paragraph(stato, 8, t.grigio); y += 12; }
  const anagrafica: [string, string][] = [];
  if (!i.nascondiCliente) {
    anagrafica.push(["Committente", i.committente?.trim() || "Da definire"]);
    if (i.indirizzoIntervento?.trim()) anagrafica.push(["Immobile / intervento", i.indirizzoIntervento.trim()]);
  }
  if (anagrafica.length) coppia(anagrafica);
  if (i.oggetto?.trim()) labelValue("Oggetto e perimetro dei lavori", i.oggetto.trim());
  if (veste?.premessa?.trim()) { y += 4; paragraph(veste.premessa.trim(), 9.5); y += 10; }
  const riferimenti: [string, string][] = [];
  if (i.tecnico?.trim()) riferimenti.push(["Tecnico / referente", i.tecnico.trim()]);
  if (i.mostraFonti !== false && i.riferimentoPrezzi?.trim()) riferimenti.push(["Riferimenti dei prezzi", i.riferimentoPrezzi.trim()]);
  if (riferimenti.length) coppia(riferimenti);
  if (fonti.length) {
    ensure(35); paragraph("FONTI DELLE VOCI", 7.5, t.grigio, true);
    fonti.forEach((fonte, index) => paragraph(`[${index + 1}] ${fonte}`, 8, t.grigio)); y += 8;
  }
  if (i.parziale) { paragraph(i.parziale, 9, "#945A16"); y += 12; }
  const capitoliPagina: { page: number; y: number; nodo: NodoComputo }[] = [];
  if (voci.length >= 4 && i.sezioni?.indice !== false) {
    ensure(65); y += 6; paragraph("Il piano dei lavori", 16, t.inchiostro, true); y += 8;
    for (const [index, n] of nodi.entries()) {
      font(9); const lines = wrap(n.nome, width - 100); ensure(lines.length * 12 + 10);
      font(8, true, t.inchiostroMarca); doc.text(String(index + 1).padStart(2, "0"), m, y);
      lines.forEach((l, k) => { font(9); doc.text(l, m + 28, y + k * 12); });
      capitoliPagina.push({ page: doc.getNumberOfPages(), y, nodo: n });
      y += lines.length * 12 + 5;
    }
    y += 7; paragraph(`${voci.length} lavorazioni · ${nodi.length} capitoli. ${i.soloRiepilogo ? "Il documento presenta il riepilogo per capitoli, senza il dettaglio delle singole lavorazioni." : i.senzaPrezzi ? "Il dettaglio delle quantità segue nelle pagine successive." : "Il dettaglio delle quantità e il riepilogo seguono nelle pagine successive."}`, 8, t.grigio);
  }
  // Le lavorazioni partono sotto, se c'è posto: una pagina 2 con mezzo foglio bianco sembrava un documento interrotto.
  if (voci.length && !i.soloRiepilogo) { if (y > H * 0.6) continuation(); else y += 20; }
  else if (voci.length) continuation();

  const pagineCapitoli = new Map<NodoComputo, number>();
  const finaliCapitolo = new Set<string>();
  const raccogliVoci = (n: NodoComputo): VoceComputo[] => [...n.voci, ...n.figli.flatMap(raccogliVoci)];
  nodi.forEach(n => { const ultima = raccogliVoci(n).at(-1); if (ultima) finaliCapitolo.add(ultima.id); });
  const measuresHeader = () => {
    ensure(26); doc.setFillColor(t.tinta); doc.rect(m, y - 9, width, 16, "F");
    font(6.5, true, t.inchiostroMarca); doc.text("MISURAZIONI", m + 6, y + 1);
    ["PARTI", "LUNG.", "LARG.", "H/PESO", "QUANTITÀ"].forEach((s, k) => doc.text(s, m + [282, 329, 376, 423, width - 7][k], y + 1, { align: "right" })); y += 18;
  };
  // «A misura» è il caso normale: scritto su ogni voce era solo rumore sopra la descrizione (29/10/2026).
  const metaVoce = (v: VoceComputo) => [i.mostraCodici === false ? "" : tariffaVoce(v), v.a_corpo && "A corpo", v.is_sicurezza && "Sicurezza", v.is_detrazione && "Detrazione", i.mostraFonti !== false && v.fonte_prezzo && `Fonte [${fonti.indexOf(v.fonte_prezzo.trim()) + 1}]`].filter(Boolean).join("  /  ");
  const colonne = [
    { titolo: "N.", larghezza: 24, destra: false },
    { titolo: "DESCRIZIONE DELLA LAVORAZIONE", larghezza: width - 24 - 30 - 58 - (mostraUnitari ? 73 : 0) - (mostraImporti ? 79 : 0), destra: false },
    { titolo: "U.M.", larghezza: 30, destra: false },
    { titolo: "QUANTITÀ", larghezza: 58, destra: true },
    ...(mostraUnitari ? [{ titolo: "PREZZO UNITARIO", larghezza: 73, destra: true }] : []),
    ...(mostraImporti ? [{ titolo: "IMPORTO VOCE", larghezza: 79, destra: true }] : []),
  ];
  const intestazioneTabella = () => {
    doc.setFillColor(t.tinta); doc.rect(m, y - 9, width, 22, "F");
    let x = m;
    for (const colonna of colonne) {
      font(6.2, true, t.inchiostroMarca);
      doc.text(colonna.titolo, colonna.destra ? x + colonna.larghezza - 5 : x + 5, y + 4, { align: colonna.destra ? "right" : "left" });
      x += colonna.larghezza;
    }
    y += 22;
  };
  // Una riga può proseguire su più pagine senza troncare descrizioni o valori.
  const rigaTabella = (celle: string[], evidenza = false) => {
    const righe = celle.map((testo, k) => { font(k === 1 ? 8.5 : 7.5); return wrap(testo, colonne[k].larghezza - 10); });
    const lunghezza = Math.max(...righe.map(r => r.length), 1);
    const altezza = lunghezza * 11 + 8;
    if (altezza < bottom - m - 70 && y + altezza > bottom) continuation();
    let offset = 0;
    while (offset < lunghezza) {
      if (bottom - y < 35) continuation();
      const count = Math.min(lunghezza - offset, Math.max(1, Math.floor((bottom - y - 8) / 11)));
      const h = count * 11 + 8;
      doc.setDrawColor(t.filetto); doc.setLineWidth(.35);
      let x = m;
      colonne.forEach((colonna, k) => {
        doc.rect(x, y - 9, colonna.larghezza, h);
        righe[k].slice(offset, offset + count).forEach((line, n) => {
          font(k === 1 ? 8.5 : 7.5, evidenza || (k === colonne.length - 1 && mostraImporti), k === 1 ? t.inchiostro : t.inchiostroMarca);
          doc.text(line, colonna.destra ? x + colonna.larghezza - 5 : x + 5, y + 2 + n * 11, { align: colonna.destra ? "right" : "left" });
        });
        x += colonna.larghezza;
      });
      y += h; offset += count;
      if (offset < lunghezza) continuation();
    }
  };
  const altezzaVoce = (v: VoceComputo) => {
    font(8.5); const descr = wrap([metaVoce(v), v.descrizione_estesa || v.descrizione_breve].filter(Boolean).join("\n"), colonne[1].larghezza - 10).length * 11.5;
    let h = descr + 34;
    if (v.misure.length && i.dettaglioMisure !== false) {
      h += 18;
      for (const misura of v.misure) h += wrap([misura.descrizione || "Misurazione", misura.formula && `Formula: ${misura.formula}`].filter(Boolean).join(" / "), 235).length * 10 + 8;
    }
    return h;
  };
  let comunePrecedente = "";
  const voce = (v: VoceComputo) => {
    const nuovaComune = !!v.descrizione_comune && v.descrizione_comune !== comunePrecedente;
    font(9); const hComune = nuovaComune ? wrap(v.descrizione_comune!).length * 12.15 + 18 : 0;
    const h = altezzaVoce(v) + hComune;
    const riserva = mostraImporti && finaliCapitolo.has(v.id) ? 24 : 0;
    ensure(Math.min(h, 120) + riserva);
    if (nuovaComune) {
      y += 6;
      paragraph("DESCRIZIONE COMUNE DELLE LAVORAZIONI SEGUENTI", 6.5, t.inchiostroMarca, true); y += 2;
      paragraph(v.descrizione_comune!, 9); y += 7;
    }
    comunePrecedente = v.descrizione_comune || "";
    rigaTabella([
      numeroVoce(v), [metaVoce(v), v.descrizione_estesa || v.descrizione_breve].filter(Boolean).join("\n"),
      v.unita_misura || "-", num(v.quantita),
      ...(mostraUnitari ? [money(v.prezzo_unitario_computo)] : []),
      ...(mostraImporti ? [money(v.importo_computo)] : []),
    ]);
    if (v.misure.length && i.dettaglioMisure !== false) {
      y += 5;
      measuresHeader();
      for (const misura of [...v.misure].sort((a, b) => a.ordine - b.ordine)) {
        font(7.5); const desc = wrap([misura.descrizione || "Misurazione", misura.formula && `Formula: ${misura.formula}`].filter(Boolean).join(" / "), 235);
        const h = desc.length * 10 + 8;
        if (y + Math.min(h, 100) > bottom) { continuation(); measuresHeader(); }
        const firstPage = doc.getNumberOfPages(), firstY = y;
        for (const d of desc) {
          if (y + 10 > bottom) { continuation(); measuresHeader(); }
          font(7.5); doc.text(d, m + 6, y); y += 10;
        }
        const lastPage = doc.getNumberOfPages(), lastY = y;
        doc.setPage(firstPage);
        [misura.parti_uguali, misura.lunghezza, misura.larghezza, misura.altezza_peso, misura.quantita].forEach((n, k) => {
          font(7.5, k === 4); const text = num(n); const w = k === 4 ? 60 : 43;
          if (doc.getTextWidth(text) > w) doc.setFontSize(Math.max(6, 8 * w / doc.getTextWidth(text)));
          doc.text(text, m + [282, 329, 376, 423, width - 7][k], firstY, { align: "right" });
        });
        doc.setPage(lastPage); y = lastY;
        y += 2; doc.setDrawColor(t.filetto); doc.setLineWidth(.3); doc.line(m, y, right, y); y += 6;
      }
    }
    if (v.note_misure && i.dettaglioMisure !== false) {
      ensure(45); y += 5; paragraph("MISURE DI RIFERIMENTO DEL DOCUMENTO ORIGINALE", 6.5, t.inchiostroMarca, true);
      paragraph(v.note_misure, 7.5, t.grigio); y += 6;
    }
    if (v.misure.length > 1 && i.dettaglioMisure !== false) {
      ensure(20); font(7.5, true, t.inchiostroMarca); doc.text(`${v.is_detrazione ? "SI DETRAGGONO" : "SOMMANO"} ${num(v.quantita)} ${v.unita_misura || ""}`, right - 5, y, { align: "right" }); y += 15;
    }
  };
  const nodoConImporti = (n: NodoComputo): boolean => n.voci.some(v => v.importo_computo != null) || n.figli.some(nodoConImporti);
  const visit = (n: NodoComputo, index: number) => {
    ripetiIntestazioneTabella = null;
    if (n.livello === 0) {
      const prima = (nodo: NodoComputo): VoceComputo | undefined => nodo.voci[0] || nodo.figli.map(prima).find(Boolean);
      const primaVoce = prima(n);
      if (primaVoce) ensure(Math.min(altezzaVoce(primaVoce), 110) + 65);
      section(String(index + 1).padStart(2, "0"), n.nome);
      pagineCapitoli.set(n, doc.getNumberOfPages());
    } else { ensure(55); paragraph(n.nome, 12, t.inchiostroMarca, true); y += 10; }
    if (n.voci.length) { ensure(55); intestazioneTabella(); ripetiIntestazioneTabella = intestazioneTabella; }
    n.voci.forEach(voce); n.figli.forEach(child => visit(child, index));
    ripetiIntestazioneTabella = null;
    if (mostraImporti && n.livello === 0) {
      y += 10; ensure(24); font(8, true, t.inchiostroMarca); doc.text("SUBTOTALE CAPITOLO", m, y);
      doc.text(money(nodoConImporti(n) ? n.importo : null), right, y, { align: "right" }); y += 20;
    }
  };
  if (!i.soloRiepilogo) nodi.forEach((n, k) => { if (n.numeroVoci) visit(n, k); });
  if (!voci.length) paragraph("Le lavorazioni compariranno qui durante la compilazione.", 10, t.grigio);

  if ((mostraImporti || i.soloRiepilogo) && voci.length && i.sezioni?.riepilogo !== false) {
    const riepilogoH = 130 + nodi.length * 29;
    ensure(Math.min(riepilogoH, bottom - m - 100));
    section(i.soloRiepilogo ? "01" : String(nodi.length + 1).padStart(2, "0"), mostraImporti ? "Riepilogo economico" : "Riepilogo delle lavorazioni", i.soloRiepilogo ? "Sintesi per capitoli - dettaglio delle singole voci non incluso" : "Importi raggruppati per capitolo di lavorazione");
    for (const n of nodi) {
      font(9); const labels = wrap(n.nome, width - 140); ensure(labels.length * 12 + 20);
      if (i.soloRiepilogo) pagineCapitoli.set(n, doc.getNumberOfPages());
      labels.forEach((l, k) => { font(9); doc.text(l, m, y + k * 12); });
      font(9, true); doc.text(mostraImporti ? money(nodoConImporti(n) ? n.importo : null) : `${n.numeroVoci} voci`, right, y, { align: "right" });
      y += labels.length * 12 + 4;
      if (mostraImporti && totale > 0 && n.importo >= 0 && !i.parziale) {
        doc.setFillColor(t.tinta); doc.rect(m, y, width, 3, "F");
        doc.setFillColor(t.fondo); doc.rect(m, y, Math.min(width, Math.max(0, n.importo / totale * width)), 3, "F"); y += 7;
      }
      y += 6;
    }
    if (mostraImporti) {
    // Lo sconto è una riga del riepilogo: le voci restano ai loro prezzi, l'IVA si calcola sul netto.
    const sconto = calcolaSconto(totale, i.sconto, oneriSicurezza(voci));
    const fiscale = calcolaIvaComputo(haImporti ? totale - sconto.importo : null, i);
    const noto = fiscale.totale != null;
    ensure((noto ? 145 : 95) + (sconto.importo > 0 ? 38 : 0));
    if (sconto.importo > 0 && haImporti) {
      font(9); doc.text("Totale dei lavori", m, y); doc.text(money(totale), right, y, { align: "right" }); y += 18;
      doc.text(`${sconto.etichetta}${sconto.percentuale != null ? ` ${num(sconto.percentuale)}%` : ""}`, m, y); doc.text(`-${money(sconto.importo)}`, right, y, { align: "right" }); y += 19;
      if (!noto) { font(9, true); doc.text("Imponibile", m, y); doc.text(money(totale - sconto.importo), right, y, { align: "right" }); y += 18; }
    }
    if (noto) {
      font(9); doc.text("Imponibile", m, y); doc.text(money(fiscale.imponibile), right, y, { align: "right" }); y += 18;
      const etichettaIva = fiscale.modalita === "non-applicabile" ? "IVA non applicabile" : `IVA ${num(fiscale.aliquota)}%`;
      doc.text(etichettaIva, m, y); doc.text(money(fiscale.iva), right, y, { align: "right" }); y += 19;
    }
    ensure(76); y += 5; doc.setFillColor(t.fondo); doc.rect(m, y - 5, width, 52, "F");
    const etichettaTotale = noto ? (fiscale.modalita === "non-applicabile" ? "TOTALE PREVENTIVO" : "TOTALE IVA INCLUSA") : "TOTALE IMPONIBILE";
    font(9, true, t.bianco); doc.text(i.parziale ? etichettaTotale.replace("TOTALE", "PARZIALE") : etichettaTotale, m + 15, y + 16);
    font(19, true, t.bianco); const totaleTxt = money(noto ? fiscale.totale : fiscale.imponibile);
    if (doc.getTextWidth(totaleTxt) > 230) doc.setFontSize(17);
    doc.text(totaleTxt, right - 15, y + 34, { align: "right" }); y += 65;
    if (!noto) paragraph(fiscale.errore ? "IVA DA COMPLETARE - totale IVA inclusa non determinato." : fiscale.modalita === "da-definire" ? "IVA DA DEFINIRE - importi esposti al netto dell'IVA; totale IVA inclusa non determinato." : "Importi da completare - totale non determinato.", 8, t.grigio);
    if (i.ivaNota?.trim()) paragraph(i.ivaNota.trim(), 8, t.grigio);
    const oneri = oneriSicurezza(voci);
    paragraph(oneri > 0 ? `Di cui oneri della sicurezza ${money(oneri)}, compresi negli importi e non soggetti a ribasso.` : "Gli oneri di sicurezza eventualmente indicati nelle voci sono già compresi negli importi.", 8, t.grigio);
    }
  }
  // Le voci opzionali: proposte al cliente, fuori dal totale, con il loro importo per decidere.
  if (i.vociOpzionali?.length && !i.soloRiepilogo) {
    ensure(90); y += 14; paragraph("Voci opzionali", 13, t.inchiostro, true); paragraph("Proposte in aggiunta: non sono comprese nel totale del preventivo.", 8.5, t.grigio); y += 4; rule();
    for (const o of i.vociOpzionali) {
      const righe = wrap(o.descrizione, width - 190) as string[];
      ensure(righe.length * 11 + 12);
      righe.slice(0, 4).forEach((r, k) => { font(9, k === 0); doc.text(r, m, y + k * 11); });
      font(8.5, false, t.grigio); doc.text(`${o.quantita == null ? "-" : num(o.quantita)} ${o.unita}${mostraUnitari && o.prezzo != null ? ` × ${money(o.prezzo)}` : ""}`, right - 90, y, { align: "right" });
      if (mostraImporti) { font(9, true); doc.text(money(o.importo), right, y, { align: "right" }); }
      y += Math.min(4, righe.length) * 11 + 8;
    }
  }
  if (i.calcoloDetrazione && !i.calcoloDetrazione.errore && voci.length) {
    const d = i.calcoloDetrazione;
    ensure(170); y += 14; paragraph("Detrazione fiscale", 13, t.inchiostro, true); y += 2; paragraph(d.nome, 8.5, t.grigio); y += 4; rule();
    const righe: [string, string][] = [["Spesa detraibile", money(d.base)], [`Detrazione ${num(d.percentuale)}%`, money(d.detraibile)], [`In ${d.anni} rate annuali da`, money(d.rata)]];
    for (const [k, v] of righe) { font(9); doc.text(k, m, y); doc.text(v, right, y, { align: "right" }); y += 17; }
    doc.setFillColor(t.tinta); doc.rect(m, y - 4, width, 30, "F");
    font(9, true, t.inchiostroMarca); doc.text("COSTO EFFETTIVO DOPO LA DETRAZIONE", m + 12, y + 15);
    font(13, true, t.inchiostroMarca); doc.text(money(d.netto), right - 12, y + 16, { align: "right" }); y += 40;
    if (d.nota.trim()) paragraph(d.nota.trim(), 8.5, t.grigio);
    paragraph(AVVERTENZA_DETRAZIONE, 7.5, t.grigio); y += 6;
  }
  if (i.cronoprogramma?.fasi.length && voci.length) {
    const dopo = disegnaCronoprogramma(doc, i.cronoprogramma, { margine: m, colore: t.fondo, tinta: t.tinta, inchiostro: t.inchiostro, grigio: t.grigio, filetto: t.filetto, titolo: i.titolo });
    if (dopo != null) y = dopo;
  }
  const note = [
    ["Lavorazioni incluse", i.inclusioni], ["Esclusioni e limiti", i.esclusioni],
    ["Tempi di esecuzione", i.tempi], ["Piano dei pagamenti", testoPianoPagamenti(i.ratePagamento, i.ivaModalita === "applicata")], ["Modalità di pagamento", i.pagamenti], ["Note e condizioni", i.condizioni],
  ].filter((r): r is [string, string] => !!r[1]?.trim());
  if (note.length) {
    ensure(125); y += 12; paragraph("Perimetro e condizioni", 13, t.inchiostro, true); y += 6; rule();
    for (const [titolo, testo] of note) { ensure(48); paragraph(titolo, 9, t.inchiostroMarca, true); y += 2; paragraph(testo, 9); y += 8; }
  }
  if (i.condizioniContrattuali?.trim()) {
    ensure(110); y += 14; paragraph("Condizioni contrattuali", 13, t.inchiostro, true); y += 6; rule();
    // Il testo arriva dal modello in Impostazioni: titoli «#»/«##» e righe «- » come nelle offerte del preventivo classico.
    for (const riga of i.condizioniContrattuali.split("\n")) {
      const r = riga.trim();
      if (!r) { y += 4; continue; }
      // Il titolo della sezione c'è già: un «# Condizioni contrattuali» in testa al testo sarebbe doppio.
      if (/^#{1,3}\s+condizioni contrattuali\s*$/i.test(r)) continue;
      if (/^#{1,3}\s/.test(r)) { ensure(30); y += 4; paragraph(r.replace(/^#{1,3}\s+/, ""), 9.5, t.inchiostroMarca, true); y += 1; }
      else paragraph(r.replace(/^[-*]\s+/, "• ").replace(/\*\*(.+?)\*\*/g, "$1"), 8.5);
    }
  }
  // La pagina «Accettazione proposta», come negli altri preventivi (29/10/2026): il preventivo firmato è il
  // contratto. Riepilogo di ciò che si firma, dichiarazione, firme di impresa, committente e cointestatario e,
  // se il modello le elenca, l'approvazione specifica delle clausole (artt. 1341-1342 c.c.) con una seconda firma.
  if (veste?.mostraFirma && i.sezioni?.firme !== false && voci.length) {
    doc.addPage(); y = m + 6;
    font(8, true, t.inchiostroMarca); doc.text("PER ACCETTAZIONE", m, y, { charSpace: 1.2 }); y += 26;
    font(21, true); doc.text("ACCETTAZIONE PROPOSTA", m, y); y += 22;
    const scontoFinale = calcolaSconto(totale, i.sconto, oneriSicurezza(voci)).importo;
    const fiscaleFinale = calcolaIvaComputo(haImporti ? totale - scontoFinale : null, i);
    const importo = fiscaleFinale.totale != null
      ? `${money(fiscaleFinale.totale)} · ${fiscaleFinale.modalita === "non-applicabile" ? "IVA non applicabile" : "IVA inclusa"}`
      : `${money(fiscaleFinale.imponibile)} · IVA esclusa`;
    const riepilogo: [string, string][] = ([
      ["Impresa", i.azienda ?? ""], ["Committente", i.nascondiCliente ? "" : i.committente ?? ""], ["Oggetto", i.oggetto?.trim() || i.titolo],
      ["Luogo dei lavori", i.nascondiCliente ? "" : i.indirizzoIntervento ?? ""],
      ["Documento", [i.numero ? `Preventivo ${i.numero}` : "Preventivo", i.dataDocumento && `del ${i.dataDocumento}`].filter(Boolean).join(" ")],
      ["Importo", mostraImporti ? importo : ""],
      ["Validità", veste.giorniValidita ? `${veste.giorniValidita} giorni dalla data del documento` : ""],
    ] as [string, string][]).filter(([, v]) => v.trim());
    const alto = riepilogo.reduce((h, [, v]) => h + Math.max(1, wrap(v, width - 150).length) * 12 + 8, 20);
    doc.setFillColor(t.cartaCalda); doc.rect(m, y, width, alto, "F");
    let yr = y + 18;
    for (const [k, v] of riepilogo) {
      font(7.5, true, t.grigio); doc.text(k.toUpperCase(), m + 14, yr);
      const righe = wrap(v, width - 150) as string[];
      font(9.5, k === "Importo"); righe.forEach((r, n) => doc.text(r, m + 130, yr + n * 12));
      yr += Math.max(1, righe.length) * 12 + 8;
    }
    y += alto + 18;
    paragraph("Il Committente dichiara di aver ricevuto, letto e accettato il presente documento in ogni sua parte - il computo delle lavorazioni, l'importo e le condizioni che lo accompagnano - e ne sottoscrive il contenuto.", 9.5);
    y += 26;
    const firma = (etichetta: string, chi: string, x: number, w: number) => {
      doc.setDrawColor(t.inchiostro); doc.setLineWidth(.6); doc.line(x, y + 34, x + w, y + 34);
      font(7, true, t.grigio); doc.text(etichetta, x, y + 46);
      if (chi) { font(8.5); doc.text(short(chi, w), x, y + 58); }
    };
    const terzo = (width - 32) / 3;
    const committente = i.nascondiCliente ? "" : i.firmaCommittente ?? i.committente ?? "";
    const cointestatario = i.nascondiCliente ? "" : i.firmaCointestatario ?? "";
    firma("LUOGO E DATA", "", m, terzo);
    firma("PER L'IMPRESA", veste.firmatario?.trim() || i.azienda || "", m + terzo + 16, terzo);
    firma("FIRMA DEL COMMITTENTE", committente?.trim() ?? "", m + 2 * (terzo + 16), terzo);
    y += 70;
    if (cointestatario?.trim()) { firma("FIRMA DEL COINTESTATARIO", cointestatario.trim(), m + 2 * (terzo + 16), terzo); y += 70; }
    const clausole = (veste.clausoleDaApprovare ?? "").split("\n").map(r => r.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
    if (clausole.length) {
      const h = 60 + clausole.length * 13 + 60;
      ensure(h); y += 10;
      doc.setDrawColor(t.inchiostro); doc.setLineWidth(.8); doc.rect(m, y, width, h);
      let yc = y + 18;
      font(8, true); doc.text("APPROVAZIONE SPECIFICA (ARTT. 1341 E 1342 C.C.)", m + 14, yc); yc += 14;
      font(9, false, t.grigio); doc.text("Il Committente, dopo averle rilette, approva specificamente le clausole seguenti:", m + 14, yc); yc += 14;
      for (const c of clausole) { font(9); doc.text(short(`- ${c}`, width - 28), m + 14, yc); yc += 13; }
      const ys = y; y = yc - 4;
      firma("LUOGO E DATA", "", m + 14, terzo);
      firma("SECONDA FIRMA DEL COMMITTENTE", "", m + 14 + terzo + 16, terzo * 2 - 12);
      y = ys + h + 10;
    }
  }
  const endPage = doc.getNumberOfPages();
  for (const ref of capitoliPagina) {
    doc.setPage(ref.page); font(9, false, t.grigio); doc.text(`pag. ${pagineCapitoli.get(ref.nodo) ?? "-"}`, right, ref.y, { align: "right" });
  }
  for (let p = 1; !i.senzaPiede && p <= endPage; p++) {
    if (p === 1 && coperta) continue;
    doc.setPage(p); doc.setDrawColor(t.filetto); doc.line(m, H - 37, right, H - 37);
    font(7, false, t.grigio); doc.text(short(stato || veste?.piePagina?.trim() || i.azienda || "", width - 90), m, H - 23);
    doc.text(`Pagina ${p} di ${endPage}`, right, H - 23, { align: "right" });
  }
  doc.setPage(endPage);
  return doc;
}
