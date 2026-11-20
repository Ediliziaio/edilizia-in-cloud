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
import { segnaClausoleDelDocumento } from "@/lib/fea/clausoleDelDocumento";
import { geometriaLogo, nomeFontModello } from "./assetModello";
import { segnaCopertinaComputoPdf, segnaVoceComputoPdf } from "./destinazioniPdf";
import { haPaginaCopertina } from "./copertineComputo";

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
  const num = (n: number | null, min = 0) => n == null ? "-" : n.toLocaleString("it-IT", { minimumFractionDigits: min, maximumFractionDigits: 6, useGrouping: "always" });
  let y = m;
  const scalaTesto = (i.veste?.dimensioneTesto ?? 9.5) / 9.5;
  const scalaTitoli = (i.veste?.dimensioneSottotitoli ?? 11) / 11;
  const intestazioneVisibile = i.veste?.mostraIntestazione !== false;
  let ripetiIntestazioneTabella: (() => void) | null = null;
  const font = (size = 9.5, bold = false, color = t.inchiostro) => {
    const titolo = bold && size >= 11;
    doc.setFont(nomeFontModello(i.veste, titolo), bold ? "bold" : "normal");
    doc.setFontSize(size * (titolo ? scalaTitoli : scalaTesto)); doc.setTextColor(color);
  };
  const fontCopertina = (size: number, color: string) => {
    doc.setFont(nomeFontModello(i.veste, true), "bold"); doc.setFontSize(size); doc.setTextColor(color);
  };
  const wrap = (s: string, w = width): string[] => doc.splitTextToSize(s, w);
  const short = (s: string, w: number) => {
    s = s.replace(/\s+/g, " ").trim();
    while (doc.getTextWidth(s) > w && s.length) s = s.slice(0, -1);
    return s;
  };
  const testataContinua = (spazio = 0) => {
    const riferimento = i.numero || (stato ? "BOZZA" : "");
    const spazioNumero = intestazioneVisibile ? width * .48 : width;
    font(8, false, t.grigio); const righeNumero = wrap(riferimento, spazioNumero);
    const passoNumero = doc.getFontSize() * 1.3;
    righeNumero.forEach((r, n) => doc.text(r, right, y + n * passoNumero, { align: "right" }));
    if (intestazioneVisibile) { font(9, true, t.inchiostroMarca); doc.text(short(i.azienda || "Computo metrico", riferimento ? width - spazioNumero - 14 : width), m, y); }
    y += Math.max(12, righeNumero.length * passoNumero);
    font(7.5, false, t.grigio); const passoTitolo = doc.getFontSize() * 1.3;
    for (const r of wrap(i.titolo, width)) { doc.text(r, m, y); y += passoTitolo; }
    doc.setDrawColor(t.filetto); doc.setLineWidth(.5); doc.line(m, y + 3, right, y + 3); y += 15 + spazio;
  };
  const continuation = () => {
    doc.addPage(); y = m; testataContinua();
    ripetiIntestazioneTabella?.();
  };
  const ensure = (h: number) => { if (y + h > bottom) continuation(); };
  const paragraph = (s: string, size = 9.5, color = t.inchiostro, bold = false, w = width, x = m) => {
    font(size, bold, color);
    const passo = doc.getFontSize() * 1.35;
    const lines = wrap(s, w);
    for (const line of lines) { ensure(passo); font(size, bold, color); doc.text(line, x, y); y += passo; }
  };
  const rule = () => { ensure(9); doc.setDrawColor(t.filetto); doc.setLineWidth(.5); doc.line(m, y, right, y); y += 10; };
  const section = (numero: string, titolo: string, sottotitolo?: string) => {
    font(11, true); const lines = wrap(titolo, width - 27);
    const passo = doc.getFontSize() * 1.3;
    ensure(lines.length * passo + (sottotitolo ? 25 : 15));
    font(12, false, t.inchiostroMarca); doc.text(numero, m, y + 1);
    for (const line of lines) { font(11, true); doc.text(line, m + 27, y); y += passo; }
    if (sottotitolo) paragraph(sottotitolo, 7, t.grigio, false, width - 34, m + 34);
    y += 3; rule();
  };
  const labelValue = (label: string, value: string) => {
    ensure(32); paragraph(label.toUpperCase(), 7, t.grigio, true); paragraph(value, 9); y += 6;
  };
  const coppia = (campi: [string, string][]) => {
    const colonna = (width - 22) / 2;
    for (let offset = 0; offset < campi.length; offset += 2) {
      const riga = campi.slice(offset, offset + 2);
      font(9); const h = Math.max(...riga.map(([, v]) => wrap(v, colonna).length * 12.15 * scalaTesto + 12 * scalaTesto + 10));
      ensure(h); const base = y;
      riga.forEach(([label, value], k) => {
        y = base; const x = m + k * (colonna + 22);
        paragraph(label.toUpperCase(), 7, t.grigio, true, colonna, x);
        paragraph(value, 9, t.inchiostro, false, colonna, x);
      });
      y = base + h;
    }
  };
  // Una scelta esplicita usa una vera pagina di copertina. I modelli compatti precedenti mantengono la testata.
  const veste = i.veste;
  const stileCopertina = veste?.copertina ?? "piena";
  const editoriale = stileCopertina === "editoriale";
  const coperta = haPaginaCopertina(veste, i.sezioni?.copertina !== false);
  const logo = veste?.mostraLogo !== false ? veste?.logo : null;
  if (coperta) {
    segnaCopertinaComputoPdf(doc);
    const cm = m + (stileCopertina === "colonna" ? W * .14 : 0), cw = right - cm;
    const chiara = !["piena", "fotografica"].includes(stileCopertina);
    const c = chiara ? { fondo: editoriale || stileCopertina === "cornice" ? "#FAF8F4" : "#FFFFFF", testo: t.inchiostro, evidenza: t.inchiostroMarca } : coloriCopertina(t, {});
    // Niente trasparenze (jsPDF non le rende ovunque): i toni tenui sono il testo già mescolato col fondo.
    const mescola = (a: string, b: string, k: number) => {
      const n = (h: string, i0: number) => parseInt(h.replace("#", "").slice(i0, i0 + 2), 16);
      return "#" + [0, 2, 4].map(i0 => Math.round(n(a, i0) * (1 - k) + n(b, i0) * k).toString(16).padStart(2, "0")).join("");
    };
    const trama = mescola(c.fondo, c.testo, 0.06), tenue = mescola(c.fondo, c.testo, 0.72), filo = mescola(c.fondo, c.testo, 0.3);
    // Con la foto del progetto la parte alta è la foto, a tutta pagina; sotto, il fondo scuro con titolo e dati.
    const foto = i.immagineCopertina;
    const fotoH = foto || stileCopertina === "fotografica" ? Math.round(H * 0.44) : 0;
    doc.setFillColor(c.fondo); doc.rect(0, 0, W, H, "F");
    // La trama di un foglio millimetrato, appena visibile: è un computo, un documento tecnico.
    doc.setDrawColor(trama); doc.setLineWidth(0.3);
    if (editoriale) {
      doc.setFillColor(t.fondo); doc.rect(W * .74, 0, W * .26, H * .28, "F");
      doc.setDrawColor(filo); doc.setLineWidth(.7); doc.line(cm, H * .30, right, H * .30);
    } else if (stileCopertina === "piena") {
      for (let x = 0; x <= W; x += 24) doc.line(x, 0, x, H);
      for (let r = 0; r <= H; r += 24) doc.line(0, r, W, r);
    }
    if (foto) { try { doc.addImage(foto.dati, "JPEG", 0, 0, W, fotoH); } catch { /* una foto illeggibile non ferma il preventivo */ } }
    else if (stileCopertina === "fotografica") {
      doc.setFillColor(mescola(t.fondo, "#FFFFFF", .80)); doc.rect(0, 0, W, fotoH, "F");
      doc.setFillColor(mescola(t.fondo, "#FFFFFF", .55)); doc.rect(W * .08, fotoH * .35, W * .33, fotoH * .65, "F");
      doc.setFillColor(mescola(t.fondo, "#FFFFFF", .35)); doc.rect(W * .49, fotoH * .10, W * .42, fotoH * .90, "F");
      doc.setDrawColor("#FFFFFF"); doc.setLineWidth(.8); doc.line(0, fotoH * .82, W, fotoH * .82);
    }
    if (["piena", "editoriale", "fotografica"].includes(stileCopertina)) { doc.setFillColor(c.evidenza); doc.rect(0, fotoH, 7, H - fotoH, "F"); }
    if (stileCopertina === "fascia") { doc.setFillColor(t.fondo); doc.rect(0, 0, W, 22, "F"); }
    if (stileCopertina === "sobria") { doc.setDrawColor(filo); doc.setLineWidth(.6); doc.line(cm, H * .25, right, H * .25); }
    if (stileCopertina === "diagonale") {
      doc.setFillColor(t.fondo); doc.triangle(W * .56, 0, W, 0, W, H * .34, "F");
      doc.setFillColor(mescola(t.fondo, "#FFFFFF", .85)); doc.triangle(W * .78, H * .20, W, H * .34, W, H * .48, "F");
    }
    if (stileCopertina === "cornice") {
      doc.setDrawColor(t.fondo); doc.setLineWidth(1); doc.rect(22, 22, W - 44, H - 44);
      doc.setDrawColor(filo); doc.setLineWidth(.35); doc.rect(30, 30, W - 60, H - 60);
    }
    if (stileCopertina === "colonna") { doc.setFillColor(t.fondo); doc.rect(0, 0, W * .14, H, "F"); }
    let yc = 62;
    if (logo) {
      const { x, w, h } = geometriaLogo(veste, logo, cm, right);
      if (veste?.logoFondoBianco !== false) { doc.setFillColor("#FFFFFF"); doc.roundedRect(x - 8, yc - 30, w + 16, h + 14, 5, 5, "F"); }
      try { doc.addImage(logo.dati, logo.formato, x, yc - 23, w, h); } catch { /* un logo illeggibile non ferma il preventivo */ }
      yc += h + 15;
    }
    if (fotoH) yc = fotoH + 34;
    if (intestazioneVisibile) {
      font(15, true, c.testo); doc.text(short(i.azienda || "Preventivo con computo metrico", stileCopertina === "diagonale" && !fotoH ? cw * .60 : cw), cm, yc); yc += 15;
      if (i.dettagliAzienda) { font(8, false, tenue); (wrap(i.dettagliAzienda, stileCopertina === "diagonale" && !fotoH ? cw * .60 : cw) as string[]).slice(0, 2).forEach((r, k) => doc.text(r, cm, yc + k * 11 * scalaTesto)); }
    }
    yc = fotoH ? yc + 44 : H * 0.36;
    const occhiello = (i.soloRiepilogo ? "Piano dei lavori · sintesi per capitoli" : i.senzaPrezzi ? "Computo metrico · lavorazioni e quantità" : veste?.sopratitolo?.trim() || "Preventivo · computo metrico estimativo").toUpperCase();
    font(9, true, c.evidenza); for (const [n, r] of wrap(occhiello, cw).entries()) { doc.text(r, cm, yc + n * 13); }
    doc.setFillColor(c.evidenza); doc.rect(cm, yc + 9, 54, 2.5, "F"); yc += 46;
    let sizeTitolo = veste?.dimensioneTitolo ?? 34;
    fontCopertina(sizeTitolo, c.testo);
    let righeTitolo = wrap(i.titolo || "Preventivo", cw - 10);
    const limiteTitolo = H - 70 - 2 * 46 - 24 - (i.oggetto?.trim() ? 44 : 0);
    while (sizeTitolo > 18 && yc + (righeTitolo.length - 1) * sizeTitolo * 1.15 > limiteTitolo) {
      sizeTitolo--; fontCopertina(sizeTitolo, c.testo); righeTitolo = wrap(i.titolo || "Preventivo", cw - 10);
    }
    for (const r of righeTitolo) {
      if (yc > limiteTitolo) break; // Il titolo completo è riportato nei dati del lavoro.
      doc.text(r, cm, yc); yc += sizeTitolo * 1.15;
    }
    if (i.oggetto?.trim()) { yc += 4; font(12, false, tenue); for (const r of (wrap(i.oggetto.trim(), cw - 40) as string[]).slice(0, fotoH ? 2 : 4)) { doc.text(r, cm, yc); yc += 16; } }
    const campi = ([
      ["Committente", i.nascondiCliente ? "" : i.committente ?? ""], ["Luogo dei lavori", i.nascondiCliente ? "" : i.indirizzoIntervento ?? ""],
      ["Data", i.dataDocumento ?? ""], ["Preventivo n.", [i.numero, i.revisione && `rev. ${i.revisione}`].filter(Boolean).join(" · ")],
      ["Tecnico / referente", i.tecnico ?? ""],
    ] as [string, string][]).filter(([, v]) => v.trim());
    if (campi.length) {
      const col = (cw - 30) / 3, righe = Math.ceil(campi.length / 3);
      let yb = H - 70 - righe * 46;
      doc.setDrawColor(filo); doc.setLineWidth(0.6); doc.line(cm, yb - 18, right, yb - 18);
      campi.forEach(([etichetta, valore], k) => {
        const x = cm + (k % 3) * (col + 15), yy = yb + Math.floor(k / 3) * 46;
        font(6.8, true, c.evidenza); doc.text(etichetta.toUpperCase(), x, yy, { charSpace: 0.6 });
        font(10, true, c.testo); (wrap(valore, col) as string[]).slice(0, 2).forEach((r, n) => doc.text(r, x, yy + 14 + n * 12));
      });
      yb += righe * 46;
    }
    if (stato) { font(7.5, false, tenue); doc.text(stato, cm, H - 34); }
    doc.addPage(); y = cm; testataContinua(6);
    paragraph("Dati del lavoro", 16, t.inchiostro, true); y += 6;
  } else {
  // Prima pagina: identità e perimetro, senza ripetere il prezzo finale. La copertina la sceglie il modello
  // del computo dell'azienda: «piena» (fascia alta nel colore del marchio, quella di sempre), «fascia» (banda
  // sottile e testo scuro) o «sobria» (niente colore, solo un filetto).
  // Qui la copertina «piena» non arriva mai: ha la sua pagina sopra. Senza copertina si usa la banda sottile.
  const copertina: "fascia" | "sobria" = veste?.copertina === "sobria" ? "sobria" : "fascia";
  const suColore: boolean = false;
  const testoCopertina = suColore ? t.bianco : t.inchiostro;
  const geometria = logo ? geometriaLogo(veste, logo, m, right) : null;
  const logoW = geometria?.w ?? 0;
  const logoCentrato = !!logo && veste?.logoAllineamento === "centro";
  const logoSinistra = !!logo && (veste?.logoAllineamento ?? "sinistra") === "sinistra";
  const xTesto = logoSinistra ? m + logoW + 24 : m;
  const spazioTesto = width - (logo && !logoCentrato ? logoW + 24 : 0);
  const sizeTitolo = (veste?.dimensioneTitolo ?? 34) * 25 / 34;
  fontCopertina(sizeTitolo, testoCopertina); const titolo = wrap(i.titolo, width - 38);
  font(8); const metadati = wrap([i.numero, i.dataDocumento, i.revisione && `Rev. ${i.revisione}`].filter(Boolean).join("  |  ") || (stato ? "BOZZA" : " "), width - 38);
  font(13, true); const aziendaH = intestazioneVisibile ? wrap(i.azienda || "Preventivo con computo metrico", spazioTesto).length * 17.55 * scalaTitoli : 0;
  font(8); const dettagliH = intestazioneVisibile && i.dettagliAzienda ? wrap(i.dettagliAzienda, spazioTesto).length * 10.8 * scalaTesto : 0;
  const altezzaContenuto = m + (logoCentrato ? (geometria?.h ?? 0) + 18 + aziendaH + dettagliH : Math.max(aziendaH + dettagliH, geometria?.h ?? 0)) + 63 + titolo.length * sizeTitolo * 1.2 + metadati.length * 11;
  const heroH = suColore ? Math.max(235, altezzaContenuto) : altezzaContenuto - 10;
  if (copertina === "fascia") { doc.setFillColor(t.fondo); doc.rect(0, 0, W, 10, "F"); }
  if (logo && geometria) {
    const { x, w, h } = geometria, ly = m - 8;
    if (veste?.logoFondoBianco !== false) { doc.setFillColor("#FFFFFF"); doc.roundedRect(x - 6, ly - 6, w + 12, h + 12, 4, 4, "F"); }
    try { doc.addImage(logo.dati, logo.formato, x, ly, w, h); } catch { /* un logo illeggibile non ferma il preventivo */ }
    if (logoCentrato) y = m + h + 18;
  }
  if (intestazioneVisibile) {
    paragraph(i.azienda || "Preventivo con computo metrico", 13, suColore ? t.bianco : t.inchiostroMarca, true, spazioTesto, xTesto);
    if (i.dettagliAzienda) paragraph(i.dettagliAzienda, 8, suColore ? t.bianco : t.grigio, false, spazioTesto, xTesto);
  }
  y = Math.max(y, m + (geometria?.h ?? 0));
  if (i.immagineCopertina && i.sezioni?.copertina !== false) {
    const hFoto = width * .30;
    y += 18; doc.addImage(i.immagineCopertina.dati, "JPEG", m, y, width, hFoto); y += hFoto;
  }
  y += 27;
  const sopratitolo = veste?.sopratitolo?.trim().toUpperCase();
  font(8, true, suColore ? t.bianco : t.inchiostroMarca); doc.text(i.soloRiepilogo ? "PIANO DEI LAVORI / SINTESI PER CAPITOLI" : i.senzaPrezzi ? "COMPUTO METRICO / LAVORAZIONI E QUANTITÀ" : sopratitolo || "PREVENTIVO / COMPUTO METRICO ESTIMATIVO", m, y);
  y += 29;
  for (const line of titolo) { ensure(sizeTitolo * 1.2); fontCopertina(sizeTitolo, testoCopertina); doc.text(line, m, y); y += sizeTitolo * 1.2; }
  font(8, false, suColore ? t.bianco : t.grigio);
  metadati.forEach((line, k) => doc.text(line, m, y + 1 + k * 11));
  if (copertina === "sobria") { y += metadati.length * 11 + 8; doc.setDrawColor(t.fondo); doc.setLineWidth(1.2); doc.line(m, y, right, y); y += 25; }
  else y = Math.max(y + metadati.length * 11 + 15, heroH + 25);
  }
  if (stato && !coperta) { paragraph(stato, 8, t.grigio); y += 12; }
  const anagrafica: [string, string][] = [];
  if (!i.nascondiCliente) {
    anagrafica.push(["Committente", i.committente?.trim() || "Da definire"]);
    if (i.datiFiscaliCommittente?.trim()) anagrafica.push(["Dati fiscali", i.datiFiscaliCommittente.trim()]);
    if (i.indirizzoIntervento?.trim()) anagrafica.push(["Immobile / intervento", i.indirizzoIntervento.trim()]);
  }
  if (anagrafica.length) coppia(anagrafica);
  if (coperta) labelValue("Progetto", i.titolo);
  if (i.oggetto?.trim()) labelValue("Oggetto e perimetro dei lavori", i.oggetto.trim());
  const campiCustom = veste?.campiPersonalizzati?.filter(c => c.mostraNelDocumento && c.valore.trim()) ?? [];
  for (const campo of campiCustom) labelValue(campo.etichetta, campo.valore);
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
  let voceInCorso: VoceComputo | null = null;
  const metaVoce = (v: VoceComputo) => [i.mostraCodici === false ? "" : tariffaVoce(v), v.a_corpo && "A corpo", v.is_sicurezza && "Sicurezza", v.is_detrazione && "Detrazione", i.mostraFonti !== false && v.fonte_prezzo && `Fonte [${fonti.indexOf(v.fonte_prezzo.trim()) + 1}]`].filter(Boolean).join(" / ");
  const misuraSemplice = (v: VoceComputo) => {
    if (v.misure.length !== 1) return false;
    const misura = v.misure[0], formula = misura.formula?.trim() || "";
    return misura.quantita != null && misura.quantita === v.quantita
      && [misura.parti_uguali, misura.lunghezza, misura.larghezza, misura.altezza_peso].every(n => n == null)
      && (!/^[+-]?\d+(?:[.,]\d+)?$/.test(formula) || Number(formula.replace(",", ".")) === misura.quantita);
  };
  const riferimentoSemplice = (v: VoceComputo) => {
    const misura = v.misure[0], formula = misura?.formula?.trim() || "";
    return [misura?.descrizione?.trim(), formula && !/^[+-]?\d+(?:[.,]\d+)?$/.test(formula) && `Formula: ${formula}`].filter(Boolean).join(" / ");
  };
  font(7.5, true);
  const numeroW = Math.max(28, ...voci.map(v => doc.getTextWidth(numeroVoce(v)) + 18));
  font(7);
  const unitaW = Math.max(32, Math.min(57, Math.max(...voci.map(v => doc.getTextWidth(v.unita_misura || "-") + 14))));
  const colonne = [
    { label: "N.", w: numeroW, destra: false },
    { label: "DESCRIZIONE DELLA LAVORAZIONE", w: width - numeroW - unitaW - 62 - (mostraUnitari ? 70 : 0) - (mostraImporti ? 82 : 0), destra: false },
    { label: "U.M.", w: unitaW, destra: false },
    { label: "QUANTITÀ", w: 62, destra: true },
    ...(mostraUnitari ? [{ label: "PREZZO UNITARIO €", w: 70, destra: true }] : []),
    ...(mostraImporti ? [{ label: "IMPORTO VOCE €", w: 82, destra: true }] : []),
  ];
  const intestazioneTabella = () => {
    if (voceInCorso) { font(6.5, false, t.grigio); doc.text(`Voce ${numeroVoce(voceInCorso)} - continua`, m, y); y += 14; }
    font(6.1, true);
    const testi = colonne.map(c => wrap(c.label, c.w - 14)), passo = doc.getFontSize() * 1.3;
    const h = Math.max(25, Math.max(...testi.map(r => r.length)) * passo + 14);
    doc.setFillColor("#F1F4F7"); doc.rect(m, y, width, h, "F");
    let x = m;
    colonne.forEach((c, k) => {
      font(6.1, true);
      testi[k].forEach((riga, n) => doc.text(riga, c.destra ? x + c.w - 7 : x + 7, y + 12 + n * passo, { align: c.destra ? "right" : "left" }));
      x += c.w;
    });
    doc.setDrawColor(t.filetto); doc.setLineWidth(.35); doc.line(m, y + h, right, y + h);
    y += h;
  };
  type TestoCella = { testo: string; size: number; bold?: boolean; grigio?: boolean };
  const righeCella = (testo: string, w: number, size: number, bold = false, grigio = false): TestoCella[] => {
    font(size, bold); return wrap(testo, w - 14).map(testo => ({ testo, size, bold, grigio }));
  };
  const celleVoce = (v: VoceComputo): TestoCella[][] => {
    const descrizione = [
      ...righeCella(v.descrizione_estesa || v.descrizione_breve, colonne[1].w, 8),
      ...(metaVoce(v) ? righeCella(metaVoce(v), colonne[1].w, 6.5, false, true) : []),
      ...(i.dettaglioMisure !== false && misuraSemplice(v) && riferimentoSemplice(v) ? righeCella(`Misura: ${riferimentoSemplice(v)}`, colonne[1].w, 6.7, false, true) : []),
    ];
    return [
      righeCella(numeroVoce(v), colonne[0].w, 7.5, true), descrizione,
      [], [], ...(mostraUnitari ? [[]] : []), ...(mostraImporti ? [[]] : []),
    ];
  };
  const passoVoce = 8 * scalaTesto * 1.4;
  // Una sola griglia: descrizione e misure precedono sempre il riepilogo economico della voce.
  const disegnaCelle = (celle: TestoCella[][], passo: number, padding: number, riserva = 0, fondo?: string, alPrimoFrammento?: () => void) => {
    const lunghezza = Math.max(1, ...celle.map(r => r.length));
    let offset = 0;
    while (offset < lunghezza) {
      if (y + passo + padding * 2 + riserva > bottom) continuation();
      if (offset === 0) alPrimoFrammento?.();
      const quante = Math.min(lunghezza - offset, Math.max(1, Math.floor((bottom - y - padding * 2 - riserva) / passo)));
      const h = quante * passo + padding * 2;
      if (fondo) { doc.setFillColor(fondo); doc.rect(m + numeroW, y, width - numeroW, h, "F"); }
      let x = m;
      colonne.forEach((c, k) => {
        doc.setDrawColor(t.filetto); doc.setLineWidth(.25); doc.line(x, y, x, y + h);
        (celle[k] || []).slice(offset, offset + quante).forEach((riga, n) => {
          font(riga.size, riga.bold, riga.grigio ? t.grigio : t.inchiostro);
          doc.text(riga.testo, c.destra ? x + c.w - 7 : x + 7, y + padding + passo * .75 + n * passo, { align: c.destra ? "right" : "left" });
        });
        x += c.w;
      });
      doc.line(right, y, right, y + h); y += h; offset += quante;
      if (offset < lunghezza) continuation();
    }
  };
  const disegnaRigaVoce = (v: VoceComputo, sottoTitolo: boolean) => {
    const celle = celleVoce(v), lunghezza = Math.max(...celle.map(r => r.length));
    const altezza = lunghezza * passoVoce + 12;
    if (!sottoTitolo && altezza < bottom - m - 110 && y + altezza > bottom) continuation();
    disegnaCelle(celle, passoVoce, 6, 27, undefined, () => segnaVoceComputoPdf(doc, v.id, y));
  };
  const fattori = ["parti_uguali", "lunghezza", "larghezza", "altezza_peso"] as const;
  const nomiFattori = ["Parti", "Lung.", "Larg.", "H/Peso"];
  const righeMisura = (misura: VoceComputo["misure"][number]) => {
    const formula = misura.formula?.trim() || "";
    const valore = /^[+-]?\d+(?:[.,]\d+)?$/.test(formula) ? Number(formula.replace(",", ".")) : null;
    const ridondante = valore != null && misura.quantita != null && valore === misura.quantita;
    const dimensioni = fattori.flatMap((campo, k) => misura[campo] == null ? [] : [`${nomiFattori[k]} ${num(misura[campo])}`]).join(" / ");
    return [
      ...righeCella(misura.descrizione || "Misura", colonne[1].w, 7.2),
      ...(dimensioni ? righeCella(dimensioni, colonne[1].w, 6.7, false, true) : []),
      ...(formula && !ridondante ? righeCella(`Formula: ${formula}`, colonne[1].w, 6.7, false, true) : []),
    ];
  };
  const passoMisura = 7.2 * scalaTesto * 1.35;
  const misuraVoce = (misura: VoceComputo["misure"][number], ultima: boolean) => {
    const celle = [[], righeMisura(misura), [], righeCella(num(misura.quantita, 2), 62, 7.2), ...(mostraUnitari ? [[]] : []), ...(mostraImporti ? [[]] : [])];
    disegnaCelle(celle, passoMisura, 2, ultima ? altezzaSomma : 0);
  };
  const celleSomma = (v: VoceComputo): TestoCella[][] => [
    [], righeCella(v.is_detrazione ? "SI DETRAGGONO" : "SOMMANO", colonne[1].w, 7.2, true),
    righeCella(v.unita_misura || "-", unitaW, 7), righeCella(num(v.quantita, 2), 62, 7.5, true),
    ...(mostraUnitari ? [righeCella(v.prezzo_unitario_computo == null ? "Da definire" : formatEuro(v.prezzo_unitario_computo), 70, 7.5)] : []),
    ...(mostraImporti ? [righeCella(v.da_quantificare ? "Da quantificare" : v.importo_computo == null ? "Da definire" : formatEuro(v.importo_computo), 82, 7.5, true)] : []),
  ];
  const altezzaSomma = 7.5 * scalaTesto * 1.4 + 12;
  const sommaMisure = (v: VoceComputo) => {
    const celle = celleSomma(v);
    const h = Math.max(...celle.map(c => c.length)) * 7.5 * scalaTesto * 1.4 + 12;
    ensure(h); doc.setDrawColor(t.filetto); doc.setLineWidth(.3); doc.line(m + numeroW, y, right, y);
    disegnaCelle(celle, 7.5 * scalaTesto * 1.4, 6, 0, "#F1F4F7");
  };
  const altezzaVoce = (v: VoceComputo) => {
    let h = Math.max(...celleVoce(v).map(c => c.length)) * passoVoce + 12 + Math.max(...celleSomma(v).map(c => c.length)) * 7.5 * scalaTesto * 1.4 + 12;
    if (v.misure.length && i.dettaglioMisure !== false && !misuraSemplice(v)) {
      for (const misura of v.misure) h += righeMisura(misura).length * passoMisura + 4;
    }
    return h;
  };
  let comunePrecedente = "";
  const voce = (v: VoceComputo, sottoTitolo = false) => {
    ensure(Math.min(altezzaVoce(v), 230)); voceInCorso = v;
    if (v.descrizione_comune && v.descrizione_comune !== comunePrecedente) {
      y += 6; paragraph("DESCRIZIONE COMUNE DELLE LAVORAZIONI SEGUENTI", 6.5, t.grigio, true); y += 4;
      paragraph(v.descrizione_comune, 8); y += 8;
    }
    comunePrecedente = v.descrizione_comune || "";
    disegnaRigaVoce(v, sottoTitolo);
    if (v.misure.length && i.dettaglioMisure !== false && !misuraSemplice(v)) {
      const misure = [...v.misure].sort((a, b) => a.ordine - b.ordine);
      misure.forEach((misura, indice) => misuraVoce(misura, indice === misure.length - 1));
    }
    if (v.note_misure && i.dettaglioMisure !== false) {
      y += 5; paragraph("MISURE DI RIFERIMENTO DEL DOCUMENTO ORIGINALE", 6.5, t.grigio, true);
      paragraph(v.note_misure, 7.2, t.grigio, false, width - numeroW - 14, m + numeroW + 7); y += 5;
    }
    sommaMisure(v);
    doc.setDrawColor(t.filetto); doc.setLineWidth(.6); doc.line(m, y, right, y);
    voceInCorso = null;
  };
  const nodoConImporti = (n: NodoComputo): boolean => n.voci.some(v => v.importo_computo != null) || n.figli.some(nodoConImporti);
  // Si riserva spazio anche per i titoli annidati, la tabella e la prima voce.
  // Se la descrizione supera una pagina, comincia comunque sotto il suo titolo.
  const avvioNodo = (n: NodoComputo): number => {
    font(n.livello === 0 ? 11 : 12, true);
    const titoloH = wrap(n.nome, n.livello === 0 ? width - 27 : width).length * doc.getFontSize() * 1.35 + 15;
    return titoloH + (n.voci.length ? 30 + Math.min(altezzaVoce(n.voci[0]), 230) : n.figli[0] ? avvioNodo(n.figli[0]) : 0);
  };
  const visit = (n: NodoComputo, index: number) => {
    ripetiIntestazioneTabella = null;
    // La testata di un sottocapitolo ha la baseline sopra il bordo della tabella precedente.
    if (n.livello > 0) y += 16;
    ensure(avvioNodo(n));
    if (n.livello === 0) {
      section(String(index + 1).padStart(2, "0"), n.nome);
      pagineCapitoli.set(n, doc.getNumberOfPages());
    } else { ensure(55); paragraph(n.nome, 12, t.inchiostroMarca, true); y += 10; }
    if (n.voci.length) { ensure(55); intestazioneTabella(); ripetiIntestazioneTabella = intestazioneTabella; }
    n.voci.forEach((v, k) => voce(v, k === 0)); n.figli.forEach(child => visit(child, index));
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
    ensure((noto ? 110 : 75) + (sconto.importo > 0 ? 38 : 0));
    const xTotali = right - Math.min(width, 300);
    if (sconto.importo > 0 && haImporti) {
      font(9); doc.text("Totale dei lavori", xTotali, y); doc.text(money(totale), right, y, { align: "right" }); y += 18;
      doc.text(`${sconto.etichetta}${sconto.percentuale != null ? ` ${num(sconto.percentuale)}%` : ""}`, xTotali, y); doc.text(`-${money(sconto.importo)}`, right, y, { align: "right" }); y += 19;
      if (!noto) { font(9, true); doc.text("Imponibile", xTotali, y); doc.text(money(totale - sconto.importo), right, y, { align: "right" }); y += 18; }
    }
    if (noto) {
      font(9); doc.text("Imponibile", xTotali, y); doc.text(money(fiscale.imponibile), right, y, { align: "right" }); y += 18;
      const etichettaIva = fiscale.modalita === "non-applicabile" ? "IVA non applicabile" : `IVA ${num(fiscale.aliquota)}%`;
      doc.text(etichettaIva, xTotali, y); doc.text(money(fiscale.iva), right, y, { align: "right" }); y += 19;
    }
    ensure(46); y += 3; doc.setFillColor("#F1F4F7"); doc.rect(xTotali - 8, y - 5, right - xTotali + 8, 31, "F");
    const etichettaTotale = noto ? (fiscale.modalita === "non-applicabile" ? "TOTALE PREVENTIVO" : "TOTALE IVA INCLUSA") : "TOTALE IMPONIBILE";
    font(8, true); doc.setFontSize(Math.min(9, doc.getFontSize())); doc.text(i.parziale ? etichettaTotale.replace("TOTALE", "PARZIALE") : etichettaTotale, xTotali, y + 15);
    font(10.5, true); doc.setFontSize(Math.min(12, doc.getFontSize())); const totaleTxt = money(noto ? fiscale.totale : fiscale.imponibile);
    if (doc.getTextWidth(totaleTxt) > 150) doc.setFontSize(doc.getFontSize() * 150 / doc.getTextWidth(totaleTxt));
    doc.text(totaleTxt, right - 7, y + 15, { align: "right" }); y += 42;
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
    const dopo = disegnaCronoprogramma(doc, i.cronoprogramma, { margine: m, colore: t.fondo, tinta: t.tinta, inchiostro: t.inchiostro, grigio: t.grigio, filetto: t.filetto, titolo: i.titolo, fontFamiglia: nomeFontModello(veste) });
    if (dopo != null) y = dopo;
  }
  const note = [
    ["Lavorazioni incluse", i.inclusioni], ["Esclusioni e limiti", i.esclusioni],
    ["Tempi di esecuzione", i.tempi], ["Piano dei pagamenti", testoPianoPagamenti(i.ratePagamento, i.ivaModalita === "applicata", i.mostraImporti !== false, i.ritenutaPagamenti)], ["Modalità di pagamento", i.pagamenti], ["Note e condizioni", i.condizioni],
  ].filter((r): r is [string, string] => !!r[1]?.trim());
  if (note.length) {
    ensure(125); y += 12; paragraph("Perimetro e condizioni", 13, t.inchiostro, true); y += 6; rule();
    for (const [titolo, testo] of note) { ensure(48); paragraph(titolo, 9, t.inchiostroMarca, true); y += 2; paragraph(testo, 9); y += 8; }
  }
  if (i.condizioniContrattuali?.trim()) {
    const righeContratto = i.condizioniContrattuali.split("\n");
    font(13, true); let altezzaContratto = doc.getFontSize() * 1.35 + 34 + (i.contrattoOrigine ? 17 * scalaTesto : 0);
    for (const riga of righeContratto) {
      const r = riga.trim();
      if (!r) { altezzaContratto += 4; continue; }
      if (/^#{1,3}\s+condizioni contrattuali\s*$/i.test(r)) continue;
      const heading = /^#{1,3}\s/.test(r);
      font(heading ? 9.5 : 8.5, heading);
      const testo = r.replace(/^#{1,3}\s+/, "").replace(/^[-*]\s+/, "• ").replace(/\*\*(.+?)\*\*/g, "$1");
      altezzaContratto += wrap(testo).length * doc.getFontSize() * 1.35 + (heading ? 5 : 0);
    }
    // Se il contratto sta in una pagina, si tiene unito invece di lasciare l'ultima clausola da sola.
    ensure(altezzaContratto < bottom - m - 65 ? altezzaContratto : 110);
    y += 14; paragraph("Condizioni contrattuali", 13, t.inchiostro, true);
    if (i.contrattoOrigine) { y += 3; paragraph(`${i.contrattoOrigine.nome} · versione ${i.contrattoOrigine.versione}`, 7.5, t.grigio); }
    y += 6; rule();
    // Il testo arriva dal modello in Impostazioni: titoli «#»/«##» e righe «- » come nelle offerte del preventivo classico.
    for (const [index, riga] of righeContratto.entries()) {
      const r = riga.trim();
      if (!r) { y += 4; continue; }
      // Il titolo della sezione c'è già: un «# Condizioni contrattuali» in testa al testo sarebbe doppio.
      if (/^#{1,3}\s+condizioni contrattuali\s*$/i.test(r)) continue;
      if (/^#{1,3}\s/.test(r)) {
        font(9.5, true); const hTitolo = wrap(r.replace(/^#{1,3}\s+/, "")).length * doc.getFontSize() * 1.35;
        font(8.5); const seguente = righeContratto.slice(index + 1).find(s => s.trim()) ?? "";
        ensure(hTitolo + Math.min(3, wrap(seguente).length) * doc.getFontSize() * 1.35 + 10);
        y += 4; paragraph(r.replace(/^#{1,3}\s+/, ""), 9.5, t.inchiostroMarca, true); y += 1;
      }
      else paragraph(r.replace(/^[-*]\s+/, "• ").replace(/\*\*(.+?)\*\*/g, "$1"), 8.5);
    }
  }
  // La pagina «Accettazione proposta», come negli altri preventivi (29/10/2026): il preventivo firmato è il
  // contratto. Riepilogo di ciò che si firma, dichiarazione, firme di impresa, committente e cointestatario e,
  // se il modello le elenca, l'approvazione specifica delle clausole (artt. 1341-1342 c.c.) con una seconda firma.
  // Senza pagina di accettazione il documento non fa approvare clausole: la pagina di firma nemmeno (31/10/2026).
  if (!(veste?.mostraFirma && i.sezioni?.firme !== false && voci.length)) segnaClausoleDelDocumento([]);
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
    // Le stesse clausole vanno alla pagina di firma (31/10/2026): il cliente approva quelle stampate qui.
    segnaClausoleDelDocumento(clausole);
    if (clausole.length) {
      ensure(100); y += 12; rule();
      paragraph("APPROVAZIONE SPECIFICA (ARTT. 1341 E 1342 C.C.)", 8, t.inchiostroMarca, true); y += 4;
      paragraph("Il Committente, dopo averle rilette, approva specificamente le clausole seguenti:", 9, t.grigio); y += 6;
      for (const c of clausole) { paragraph(`- ${c}`, 9, t.inchiostro, false, width - 28, m + 14); y += 3; }
      ensure(85); y += 8;
      firma("LUOGO E DATA", "", m, terzo);
      firma("SECONDA FIRMA DEL COMMITTENTE", "", m + terzo + 16, terzo * 2 - 12);
      y += 75;
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
    if (veste?.mostraNumeriPagina !== false) doc.text(`Pagina ${p} di ${endPage}`, right, H - 23, { align: "right" });
  }
  doc.setPage(endPage);
  return doc;
}
