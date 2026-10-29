import type { jsPDF } from "jspdf";
import type { IntestazioneComputo } from "./esportaComputo";
import { alberoComputo, numeroVoce, tariffaVoce, type NodoComputo, type VoceComputo } from "./alberoComputo";
import { formatEuro } from "./computoStrutturato";
import { creaTema } from "@/components/preventivi/pdf/temaDocumento";
import { calcolaIvaComputo } from "./ivaComputo";

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
  // Prima pagina: identità e perimetro, senza ripetere il prezzo finale.
  font(25, true); const titolo = wrap(i.titolo, width - 38);
  font(8); const metadati = wrap([i.numero, i.dataDocumento, i.revisione && `Rev. ${i.revisione}`].filter(Boolean).join("  |  ") || (stato ? "BOZZA" : " "), width - 38);
  font(13, true); const aziendaH = wrap(i.azienda || "Preventivo con computo metrico").length * 17.55;
  font(8); const dettagliH = i.dettagliAzienda ? wrap(i.dettagliAzienda).length * 10.8 : 0;
  const heroH = Math.max(235, m + aziendaH + dettagliH + 63 + titolo.length * 30 + metadati.length * 11);
  doc.setFillColor(t.fondo); doc.rect(0, 0, W, heroH, "F");
  paragraph(i.azienda || "Preventivo con computo metrico", 13, t.bianco, true);
  if (i.dettagliAzienda) paragraph(i.dettagliAzienda, 8, t.bianco);
  y += 27;
  font(8, true, t.bianco); doc.text(i.soloRiepilogo ? "PIANO DEI LAVORI / SINTESI PER CAPITOLI" : i.senzaPrezzi ? "COMPUTO METRICO / LAVORAZIONI E QUANTITÀ" : "PREVENTIVO / COMPUTO METRICO ESTIMATIVO", m, y);
  y += 29;
  for (const line of titolo) { font(25, true, t.bianco); doc.text(line, m, y); y += 30; }
  font(8, false, t.bianco);
  metadati.forEach((line, k) => doc.text(line, m, y + 1 + k * 11));
  y = heroH + 25;
  if (stato) { paragraph(stato, 8, t.grigio); y += 12; }
  const anagrafica: [string, string][] = [];
  if (!i.nascondiCliente) {
    anagrafica.push(["Committente", i.committente?.trim() || "Da definire"]);
    if (i.indirizzoIntervento?.trim()) anagrafica.push(["Immobile / intervento", i.indirizzoIntervento.trim()]);
  }
  if (anagrafica.length) coppia(anagrafica);
  if (i.oggetto?.trim()) labelValue("Oggetto e perimetro dei lavori", i.oggetto.trim());
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
  if (voci.length >= 4) {
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
  if (voci.length) continuation();

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

  if ((mostraImporti || i.soloRiepilogo) && voci.length) {
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
    const fiscale = calcolaIvaComputo(haImporti ? totale : null, i);
    const noto = fiscale.totale != null;
    ensure(noto ? 145 : 95);
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
    paragraph("Gli oneri di sicurezza eventualmente indicati nelle voci sono già compresi negli importi.", 8, t.grigio);
    }
  }
  const note = [
    ["Lavorazioni incluse", i.inclusioni], ["Esclusioni e limiti", i.esclusioni],
    ["Tempi di esecuzione", i.tempi], ["Modalità di pagamento", i.pagamenti], ["Note e condizioni", i.condizioni],
  ].filter((r): r is [string, string] => !!r[1]?.trim());
  if (note.length) {
    ensure(125); y += 12; paragraph("Perimetro e condizioni", 13, t.inchiostro, true); y += 6; rule();
    for (const [titolo, testo] of note) { ensure(48); paragraph(titolo, 9, t.inchiostroMarca, true); y += 2; paragraph(testo, 9); y += 8; }
  }
  const endPage = doc.getNumberOfPages();
  for (const ref of capitoliPagina) {
    doc.setPage(ref.page); font(9, false, t.grigio); doc.text(`pag. ${pagineCapitoli.get(ref.nodo) ?? "-"}`, right, ref.y, { align: "right" });
  }
  for (let p = 1; !i.senzaPiede && p <= endPage; p++) {
    doc.setPage(p); doc.setDrawColor(t.filetto); doc.line(m, H - 37, right, H - 37);
    font(7, false, t.grigio); doc.text(stato || i.azienda || "", m, H - 23);
    doc.text(`Pagina ${p} di ${endPage}`, right, H - 23, { align: "right" });
  }
  doc.setPage(endPage);
  return doc;
}
