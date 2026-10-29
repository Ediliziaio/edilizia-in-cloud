import type { jsPDF } from "jspdf";
import { disegnaCronoprogramma } from "./stampaCronoprogramma";
import type { IntestazioneComputo } from "./esportaComputo";
import { alberoComputo, numeroVoce, tariffaVoce, type MisuraComputo, type NodoComputo, type VoceComputo } from "./alberoComputo";
import { formatEuro } from "./computoStrutturato";
import { calcolaIvaComputo } from "./ivaComputo";
import { calcolaSconto } from "./scontoComputo";
import { testoPianoPagamenti } from "./pianoPagamentiPdf";
import { creaTema } from "@/components/preventivi/pdf/temaDocumento";

/**
 * Il computo metrico come lo stampa PriMus, ma da guardare.
 *
 * La GRAMMATICA è quella di PriMus, perché è quella che un direttore dei
 * lavori sa leggere senza istruzioni: N./Tariffa, Designazione, par.ug.,
 * lung., larg., H/peso, Quantità, Unitario, Importo; le righe di misura sotto
 * la descrizione; la riga SOMMANO con quantità, prezzo e importo; il RIPORTO in
 * testa a ogni pagina e l'A RIPORTARE in fondo; il riepilogo per capitoli con
 * l'incidenza.
 *
 * La PRESENTAZIONE è dove PriMus è spoglio: il colore dell'azienda, i capitoli
 * come fasce, i totali di capitolo al loro posto, una voce spezzata fra due
 * pagine che dice da dove continua, le barre d'incidenza, il blocco IVA e il
 * riquadro firma.
 *
 * Verticale A4, come il computo di Genzano. Senza prezzi spariscono le
 * colonne Unitario e Importo e la designazione si allarga.
 */
export function disegnaComputoPrimus(doc: jsPDF, voci: VoceComputo[], i: IntestazioneComputo): jsPDF {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const m = 28, destra = W - m, larghezza = W - m * 2, fondo = H - 42;
  const t = creaTema({ primario: i.colore });
  const conPrezzi = !i.senzaPrezzi && i.mostraImporti !== false;
  const conUnitari = conPrezzi && i.mostraPrezziUnitari !== false;
  const conMisure = i.dettaglioMisure !== false;
  const conCodici = i.mostraCodici !== false;
  const { nodi, totale } = alberoComputo(voci);

  // Colonne: x del bordo DESTRO di ogni colonna numerica (i numeri si allineano lì).
  const c = conPrezzi
    ? { pu: 330, lu: 362, la: 394, h: 426, q: 472, u: 517, imp: destra - 2, dim: 30 }
    : { pu: 404, lu: 444, la: 484, h: 524, q: destra - 2, u: 0, imp: 0, dim: 38 };
  const xNumero = m + 2, xDesc = m + 54, fineDesc = c.pu - c.dim - 6, largDesc = fineDesc - xDesc;

  const font = (size = 7.5, stile: "normal" | "bold" | "italic" | "bolditalic" = "normal", colore = t.inchiostro) => {
    doc.setFont("helvetica", stile); doc.setFontSize(size); doc.setTextColor(colore);
  };
  const avvolgi = (s: string, w: number): string[] => doc.splitTextToSize(s, w);
  const accorcia = (s: string, w: number) => {
    if (doc.getTextWidth(s) <= w) return s;
    while (s.length > 1 && doc.getTextWidth(`${s}…`) > w) s = s.slice(0, -1);
    return `${s}…`;
  };
  const due = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });
  /** Le dimensioni come in PriMus: due decimali, tre quando servono (0,625). */
  const dimensione = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 3, useGrouping: "always" });
  /** Un numero allineato a destra nella sua colonna: se non ci sta, si rimpicciolisce invece di sconfinare. */
  const numeroA = (testo: string, x: number, w: number, size = 7.5, stile: "normal" | "bold" = "normal", colore = t.inchiostro) => {
    let s = size;
    font(s, stile, colore);
    while (s > 5 && doc.getTextWidth(testo) > w) { s -= 0.5; font(s, stile, colore); }
    doc.text(testo, x, y, { align: "right" });
    font(size, stile, colore);
  };
  const filetto = (da = m, a = destra, colore = t.filetto, spessore = 0.4) => {
    doc.setDrawColor(colore); doc.setLineWidth(spessore); doc.line(da, y, a, y);
  };

  let y = m;
  let riportato = 0;
  let pagineTabella = false;
  let voceInCorso: { numero: string; descrizione: string } | null = null;

  // ── Testata di ogni pagina dopo la prima ────────────────────────────────
  const testataCorrente = () => {
    font(8, "bold", t.inchiostroMarca); doc.text(accorcia(i.azienda || "Computo metrico", larghezza - 160), m, m);
    font(7, "normal", t.grigio);
    doc.text(accorcia([conPrezzi ? "Computo metrico estimativo" : "Computo metrico", i.numero].filter(Boolean).join(" · "), 160), destra, m, { align: "right" });
    font(7, "normal", t.grigioChiaro); doc.text(accorcia(i.titolo, larghezza), m, m + 10);
    y = m + 16; filetto(); y += 8;
  };

  // ── Intestazione delle colonne, come PriMus: due righe ─────────────────
  const intestazioneColonne = () => {
    const alto = 22;
    doc.setFillColor(t.tinta); doc.rect(m, y - 8, larghezza, alto, "F");
    font(6, "bold", t.inchiostroMarca);
    doc.text("N.", xNumero, y); doc.text("DESIGNAZIONE DEI LAVORI", xDesc, y);
    doc.text("DIMENSIONI", (c.pu - c.dim + c.h) / 2, y, { align: "center" });
    doc.text("QUANTITÀ", c.q, y, { align: "right" });
    if (conPrezzi) doc.text("IMPORTI", (c.u - 34 + c.imp) / 2, y, { align: "center" });
    y += 8;
    font(5.8, "normal", t.grigio);
    if (conCodici) doc.text("TARIFFA", xNumero, y);
    ([["par.ug.", c.pu], ["lung.", c.lu], ["larg.", c.la], ["H/peso", c.h]] as const).forEach(([s, x]) => doc.text(s, x, y, { align: "right" }));
    if (conUnitari) doc.text("unitario", c.u, y, { align: "right" });
    if (conPrezzi) doc.text("totale", c.imp, y, { align: "right" });
    y += 10;
  };

  const rigaRiporto = (etichetta: string) => {
    doc.setFillColor(t.cartaCalda); doc.rect(m, y - 8, larghezza, 12, "F");
    font(7, "bold", t.grigio); doc.text(etichetta, fineDesc, y, { align: "right" });
    numeroA(formatEuro(riportato), c.imp, 70, 7.5, "bold");
    y += 10;
  };

  const nuovaPagina = () => {
    if (conPrezzi && pagineTabella) { y = fondo - 2; rigaRiporto("A RIPORTARE"); }
    doc.addPage(); testataCorrente();
    if (pagineTabella) {
      intestazioneColonne();
      if (conPrezzi) rigaRiporto("RIPORTO");
      if (voceInCorso) {
        font(6.5, "italic", t.grigioChiaro);
        doc.text(accorcia(`segue voce ${voceInCorso.numero} · ${voceInCorso.descrizione}`, fineDesc - xDesc), xDesc, y);
        y += 9;
      }
    }
  };
  const serve = (h: number) => { if (y + h > fondo - (conPrezzi ? 12 : 0)) nuovaPagina(); };

  // ── Prima pagina: chi, che cosa, per chi ───────────────────────────────
  const intestazioneDocumento = () => {
    const banda = 64;
    doc.setFillColor(t.fondo); doc.rect(0, 0, W, banda, "F");
    const logo = i.veste?.mostraLogo !== false ? i.veste?.logo : null;
    if (logo) {
      // Il logo a destra nella banda, su un fondo bianco: quasi nessun logo si legge sul colore del marchio.
      const h = 40, w = Math.min(140, h * logo.larghezza / logo.altezza);
      doc.setFillColor("#FFFFFF"); doc.roundedRect(destra - w - 8, 12, w + 8, h, 3, 3, "F");
      try { doc.addImage(logo.dati, logo.formato, destra - w - 4, 14, w, h - 4); } catch { /* un logo illeggibile non ferma il computo */ }
    }
    font(12, "bold", t.bianco); doc.text(accorcia(i.azienda || "", larghezza - (logo ? 160 : 0)), m, 30);
    if (i.dettagliAzienda) { font(7, "normal", t.bianco); doc.text(accorcia(i.dettagliAzienda, larghezza - (logo ? 160 : 0)), m, 44); }
    y = banda + 26;
    font(7, "bold", t.inchiostroMarca);
    doc.text((conPrezzi ? "COMPUTO METRICO ESTIMATIVO" : "COMPUTO METRICO").split("").join(" "), m, y);
    if (i.numero || i.revisione) {
      font(7, "normal", t.grigio);
      doc.text([i.numero && `N. ${i.numero}`, i.revisione && `Rev. ${i.revisione}`].filter(Boolean).join("  ·  "), destra, y, { align: "right" });
    }
    y += 16;
    font(17, "bold");
    for (const riga of avvolgi(i.titolo, larghezza).slice(0, 3)) { doc.text(riga, m, y); y += 20; }
    y += 2;
    const campi = ([
      ["Committente", i.nascondiCliente ? "" : i.committente],
      ["Luogo dei lavori", i.nascondiCliente ? "" : i.indirizzoIntervento],
      ["Data", i.dataDocumento], ["Tecnico o referente", i.tecnico],
    ] as const).filter(([, v]) => v?.trim()) as Array<readonly [string, string]>;
    const col = (larghezza - 20) / 2;
    for (let k = 0; k < campi.length; k += 2) {
      const coppia = campi.slice(k, k + 2);
      const righe = coppia.map(([, v]) => avvolgi(v, col).slice(0, 3));
      const alto = 10 + Math.max(...righe.map(r => r.length)) * 10;
      coppia.forEach(([etichetta], j) => {
        const x = m + j * (col + 20);
        font(6, "bold", t.grigioChiaro); doc.text(etichetta.toUpperCase(), x, y);
        font(8.5, "normal"); righe[j].forEach((r, n) => doc.text(r, x, y + 11 + n * 10));
      });
      y += alto + 6;
    }
    if (i.oggetto?.trim()) {
      font(6, "bold", t.grigioChiaro); doc.text("OGGETTO DEI LAVORI", m, y); y += 11;
      font(8.5, "normal");
      for (const riga of avvolgi(i.oggetto, larghezza).slice(0, 6)) { doc.text(riga, m, y); y += 10.5; }
      y += 4;
    }
    if (i.parziale) {
      const righe = avvolgi(i.parziale, larghezza - 16);
      doc.setFillColor("#FFF7E6"); doc.rect(m, y - 2, larghezza, righe.length * 9.5 + 10, "F");
      font(7.5, "bold", "#8A5A00"); righe.forEach((r, n) => doc.text(r, m + 8, y + 8 + n * 9.5));
      y += righe.length * 9.5 + 16;
    }
    y += 6;
  };

  // ── Una voce: descrizione, misure, SOMMANO ─────────────────────────────
  const disegnaMisura = (mis: MisuraComputo, ultima: boolean, v: VoceComputo) => {
    const formula = mis.formula && mis.parti_uguali === null && mis.lunghezza === null && mis.larghezza === null && mis.altezza_peso === null ? mis.formula : null;
    // La formula è scritta come l'ha scritta chi l'ha inserita: in stampa i decimali vanno con la virgola.
    const testo = [mis.descrizione?.trim(), formula && `= ${formula.replace(/(\d)\.(\d)/g, "$1,$2")}`].filter(Boolean).join("   ");
    font(7, "normal", t.grigio);
    const righe = testo ? avvolgi(testo, largDesc - 8) : [""];
    serve(righe.length * 8.6 + (ultima ? 22 : 0));
    righe.forEach((r, n) => { font(7, "normal", t.grigio); doc.text(r, xDesc + 8, y + n * 8.6); });
    const dims = [[mis.parti_uguali, c.pu], [mis.lunghezza, c.lu], [mis.larghezza, c.la], [mis.altezza_peso, c.h]] as const;
    for (const [n, x] of dims) if (n !== null && n !== undefined) numeroA(dimensione(n), x, c.dim - 2, 7, "normal", t.inchiostro);
    if (mis.quantita !== null && mis.quantita !== undefined) {
      numeroA(due(mis.quantita), c.q, 44, 7, "normal", mis.quantita < 0 || v.is_detrazione ? "#B42318" : t.inchiostro);
    }
    y += righe.length * 8.6;
  };

  /** Cosa serve per disegnare una voce, e quanto spazio minimo chiede in pagina. */
  const preparaVoce = (v: VoceComputo) => {
    const descrizione = (v.descrizione_estesa || v.descrizione_breve || "").trim();
    font(7.5, "normal");
    const righe = avvolgi(descrizione, largDesc);
    const marcatori = [v.a_corpo && "A corpo", v.is_sicurezza && "Oneri della sicurezza", v.is_detrazione && "In detrazione"].filter(Boolean) as string[];
    const tariffa = conCodici ? tariffaVoce(v) : "";
    font(6.2, "normal");
    const righeTariffa = tariffa ? avvolgi(tariffa, xDesc - xNumero - 6).slice(0, 3) : [];
    const misure = conMisure ? v.misure : [];
    // La descrizione non resta orfana in fondo alla pagina: con lei almeno la prima misura e il SOMMANO.
    // Una descrizione più lunga di mezza pagina può spezzarsi: chiederla intera la manderebbe sempre a capo.
    const minimo = Math.min(Math.max(righe.length * 9.2, 10 + righeTariffa.length * 7.5), (fondo - m) / 2)
      + (marcatori.length ? 9 : 0) + (misure.length ? 9 : 0) + 20;
    return { descrizione, righe, marcatori, righeTariffa, misure, minimo };
  };
  /** La prima voce che si disegna sotto un nodo: la sua intestazione non deve restare sola. */
  const primaVoce = (n: NodoComputo): VoceComputo | undefined => n.voci[0] ?? (n.figli[0] && primaVoce(n.figli[0]));
  const minimoSotto = (n: NodoComputo) => { const v = primaVoce(n); return v ? preparaVoce(v).minimo : 0; };

  const disegnaVoce = (v: VoceComputo) => {
    const numero = numeroVoce(v);
    const { descrizione, righe, marcatori, righeTariffa, misure, minimo } = preparaVoce(v);
    serve(minimo);
    const inizio = y;
    const pagina = doc.getNumberOfPages();
    font(7.5, "bold", t.inchiostroMarca); doc.text(numero, xNumero, y);
    righeTariffa.forEach((r, n) => { font(6.2, "normal", t.grigio); doc.text(r, xNumero, y + 8 + n * 7.5); });
    for (const r of righe) {
      // Una descrizione più lunga di una pagina continua sulla successiva, col «segue».
      if (y + 9.2 > fondo - (conPrezzi ? 12 : 0)) { voceInCorso = { numero, descrizione }; nuovaPagina(); }
      font(7.5, "normal"); doc.text(r, xDesc, y); y += 9.2;
    }
    // La colonna dei codici può essere più alta della descrizione; conta solo se la voce non ha cambiato pagina.
    if (doc.getNumberOfPages() === pagina) y = Math.max(y, inizio + 10 + righeTariffa.length * 7.5);
    if (marcatori.length) { font(6.3, "italic", t.inchiostroMarca); doc.text(marcatori.join("  ·  "), xDesc, y); y += 9; }
    voceInCorso = { numero, descrizione };
    misure.forEach((mis, n) => disegnaMisura(mis, n === misure.length - 1, v));

    // SOMMANO
    serve(20);
    y += 3;
    filetto(c.q - 46, conPrezzi ? c.imp : c.q, t.grigioChiaro, 0.4);
    y += 8;
    font(7, "bold", t.grigio); doc.text(`SOMMANO ${v.unita_misura || ""}`.trim(), fineDesc, y, { align: "right" });
    if (v.quantita !== null) numeroA(due(v.quantita), c.q, 44, 7.5, "bold");
    if (conUnitari && v.prezzo_unitario_computo !== null) numeroA(due(v.prezzo_unitario_computo), c.u, 42, 7.5);
    if (conPrezzi) numeroA(v.importo_computo === null ? "da definire" : formatEuro(v.importo_computo), c.imp, 54, 7.5, "bold", v.importo_computo === null ? "#8A5A00" : t.inchiostro);
    riportato += v.importo_computo ?? 0;
    voceInCorso = null;
    y += 9;
    filetto(m, destra, t.filetto, 0.3);
    y += 9;
  };

  // ── Capitoli, categorie, sotto-categorie ───────────────────────────────
  const numeri: number[] = [];
  const disegnaNodo = (nodo: NodoComputo, livello: number, posizione: number) => {
    numeri[livello] = posizione; numeri.length = livello + 1;
    const codice = numeri.map(n => String(n).padStart(2, "0")).join(".");
    const reale = nodo.chiave !== "/tutto";
    if (reale) {
      // L'intestazione si porta dietro le intestazioni dei livelli sotto e la prima voce: niente fasce orfane in fondo alla pagina.
      const sotto = (n: NodoComputo, l: number): number => (n.figli[0] ? (l === 0 ? 22 : 14) + sotto(n.figli[0], l + 1) : 0);
      serve((livello === 0 ? 16 : livello === 1 ? 13 : 10) + sotto(nodo, livello) + minimoSotto(nodo));
      if (livello === 0) {
        doc.setFillColor(t.fondo); doc.rect(m, y - 9, larghezza, 15, "F");
        font(8, "bold", t.bianco); doc.text(`${codice}   ${accorcia(nodo.nome.toUpperCase(), largDesc + 150)}`, m + 6, y + 1);
        y += 16;
      } else if (livello === 1) {
        font(7.5, "bold", t.inchiostroMarca); doc.text(`${codice}  ${accorcia(nodo.nome, largDesc + 120)}`, xDesc, y);
        y += 4; filetto(xDesc, fineDesc, t.tintaForte, 0.6); y += 9;
      } else {
        font(7, "italic", t.grigio); doc.text(`${codice}  ${accorcia(nodo.nome, largDesc + 100)}`, xDesc, y);
        y += 10;
      }
    }
    nodo.voci.forEach(disegnaVoce);
    nodo.figli.forEach((f, k) => disegnaNodo(f, livello + 1, k + 1));
    if (reale && conPrezzi && livello <= 1) {
      serve(18);
      if (livello === 0) { doc.setFillColor(t.tinta); doc.rect(m, y - 8, larghezza, 13, "F"); }
      font(livello === 0 ? 7.5 : 7, "bold", livello === 0 ? t.inchiostroMarca : t.grigio);
      doc.text(accorcia(`Totale ${codice} · ${nodo.nome}`, fineDesc - xDesc), xDesc, y);
      numeroA(formatEuro(nodo.importo), c.imp, 70, livello === 0 ? 8 : 7.5, "bold", livello === 0 ? t.inchiostroMarca : t.grigio);
      y += livello === 0 ? 16 : 12;
    }
  };

  // ── Riepilogo per capitoli ─────────────────────────────────────────────
  const disegnaRiepilogo = () => {
    const capitoli = nodi.filter(n => n.chiave !== "/tutto");
    serve(capitoli.length > 1 ? 150 : 110);
    y += 10;
    font(12, "bold"); doc.text("Riepilogo", m, y); y += 12;
    font(7, "normal", t.grigio); doc.text("Importi per capitolo e categoria, con l'incidenza sul totale dei lavori.", m, y); y += 14;
    const xBarra = c.u - 120, largBarra = 90;
    if (capitoli.length) {
      doc.setFillColor(t.tinta); doc.rect(m, y - 8, larghezza, 12, "F");
      font(6, "bold", t.inchiostroMarca);
      doc.text("CAPITOLO", m + 6, y); doc.text("INCIDENZA", xBarra, y); doc.text("IMPORTO", c.imp, y, { align: "right" });
      y += 12;
      const righe: Array<{ codice: string; nome: string; importo: number; perc: number; livello: number }> = [];
      capitoli.forEach((cap, k) => {
        righe.push({ codice: String(k + 1).padStart(2, "0"), nome: cap.nome, importo: cap.importo, perc: cap.percentuale, livello: 0 });
        cap.figli.forEach((cat, j) => righe.push({ codice: `${String(k + 1).padStart(2, "0")}.${String(j + 1).padStart(2, "0")}`, nome: cat.nome, importo: cat.importo, perc: cat.percentuale, livello: 1 }));
      });
      for (const r of righe) {
        serve(13);
        const x = m + 6 + r.livello * 14;
        font(r.livello ? 7 : 7.5, r.livello ? "normal" : "bold", r.livello ? t.grigio : t.inchiostro);
        doc.text(`${r.codice}  ${accorcia(r.nome, xBarra - x - 34)}`, x, y);
        if (r.livello === 0) {
          doc.setFillColor(t.filetto); doc.rect(xBarra, y - 5, largBarra, 4, "F");
          doc.setFillColor(t.marca); doc.rect(xBarra, y - 5, Math.max(0.6, largBarra * Math.min(1, Math.abs(r.perc) / 100)), 4, "F");
        }
        font(6.8, "normal", t.grigio); doc.text(`${due(r.perc)} %`, xBarra + largBarra + 34, y, { align: "right" });
        numeroA(formatEuro(r.importo), c.imp, 80, r.livello ? 7 : 7.5, r.livello ? "normal" : "bold", r.livello ? t.grigio : t.inchiostro);
        y += r.livello ? 10.5 : 12.5;
      }
      y += 2; filetto(m, destra, t.grigioChiaro, 0.5); y += 12;
    }
    const sicurezza = voci.filter(v => v.is_sicurezza).reduce((s, v) => s + (v.importo_computo ?? 0), 0);
    const riga = (etichetta: string, valore: string, forte = false, colore = t.inchiostro) => {
      serve(14);
      font(forte ? 8.5 : 7.5, forte ? "bold" : "normal", colore); doc.text(etichetta, c.u - 160, y);
      numeroA(valore, c.imp, 110, forte ? 9 : 7.5, forte ? "bold" : "normal", colore);
      y += forte ? 14 : 12;
    };
    riga("Totale dei lavori", `${formatEuro(totale)} €`, true);
    if (sicurezza) riga("di cui oneri della sicurezza", `${formatEuro(sicurezza)} €`, false, t.grigio);
    // Lo sconto è una riga del riepilogo: le voci restano ai loro prezzi, l'IVA si calcola sul netto.
    const sconto = calcolaSconto(totale, i.sconto, sicurezza);
    if (sconto.importo > 0) {
      riga(`${sconto.etichetta}${sconto.percentuale != null ? ` ${due(sconto.percentuale).replace(",00", "")} %` : ""}`, `-${formatEuro(sconto.importo)} €`);
      riga("Imponibile", `${formatEuro(totale - sconto.importo)} €`, true);
    }
    const iva = calcolaIvaComputo(totale - sconto.importo, i);
    if (iva.modalita === "applicata" && iva.iva !== null && iva.totale !== null) {
      riga(`IVA ${due(iva.aliquota ?? 0).replace(",00", "")} %`, `${formatEuro(iva.iva)} €`);
      serve(30); y += 4;
      doc.setFillColor(t.fondo); doc.rect(c.u - 168, y - 11, destra - (c.u - 168), 22, "F");
      font(8, "bold", t.bianco); doc.text("TOTALE IVA INCLUSA", c.u - 160, y + 3);
      font(11, "bold", t.bianco); doc.text(`${formatEuro(iva.totale)} €`, c.imp - 4, y + 4, { align: "right" });
      y += 24;
    } else if (iva.modalita === "non-applicabile") {
      riga("IVA non applicabile", "", false, t.grigio);
    } else {
      riga("IVA da definire", "", false, t.grigio);
    }
    if (i.ivaNota?.trim()) {
      font(6.8, "italic", t.grigio);
      for (const r of avvolgi(i.ivaNota, larghezza - (c.u - 160 - m))) { serve(9); doc.text(r, c.u - 160, y); y += 9; }
    }
  };

  const disegnaNote = () => {
    const fonti = i.mostraFonti === false ? [] : [...new Set(voci.map(v => v.fonte_prezzo?.trim()).filter((s): s is string => !!s))];
    const blocchi = ([
      ["Riferimenti dei prezzi", [i.riferimentoPrezzi, ...fonti.map((f, k) => `[${k + 1}] ${f}`)].filter(Boolean).join("\n")],
      ["Voci opzionali, non comprese nel totale", (i.vociOpzionali ?? []).map(o => `${o.descrizione.split("\n")[0]} - ${o.quantita ?? "-"} ${o.unita}${conPrezzi && o.importo != null ? `: ${formatEuro(o.importo)} €` : ""}`).join("\n")],
      ["Piano dei pagamenti", testoPianoPagamenti(i.ratePagamento, i.ivaModalita === "applicata")],
      ["Modalità di pagamento", i.pagamenti ?? ""],
      ["Note e condizioni", i.condizioni ?? ""],
    ] as const).filter(([, s]) => s.trim());
    for (const [titolo, testo] of blocchi) {
      serve(40); y += 8;
      font(8, "bold", t.inchiostroMarca); doc.text(titolo, m, y); y += 11;
      font(7.2, "normal", t.grigio);
      for (const r of avvolgi(testo, larghezza)) { serve(9.5); font(7.2, "normal", t.grigio); doc.text(r, m, y); y += 9.5; }
    }
  };

  const disegnaFirma = () => {
    if (!i.tecnico?.trim() && !i.dataDocumento?.trim()) return;
    serve(70); y += 22;
    if (i.dataDocumento?.trim()) {
      font(6, "bold", t.grigioChiaro); doc.text("DATA", m, y);
      font(8.5, "normal"); doc.text(i.dataDocumento, m, y + 12);
    }
    const xF = destra - 190;
    font(6, "bold", t.grigioChiaro); doc.text("IL TECNICO / REFERENTE", xF, y);
    font(8.5, "normal");
    const nome = i.tecnico?.trim() ? avvolgi(i.tecnico, 190).slice(0, 2) : [];
    nome.forEach((r, n) => { font(8.5, "normal"); doc.text(r, xF, y + 12 + n * 10.5); });
    y += 40 + Math.max(0, nome.length - 1) * 10.5; filetto(xF, destra, t.grigioChiaro, 0.5); y += 4;
  };

  // ── Impaginazione ──────────────────────────────────────────────────────
  intestazioneDocumento();
  pagineTabella = true;
  intestazioneColonne();
  nodi.forEach((n, k) => disegnaNodo(n, 0, k + 1));
  // Finita la tabella non c'è più niente da riportare: la pagina del riepilogo non ripete colonne e RIPORTO.
  pagineTabella = false;
  if (conPrezzi) disegnaRiepilogo();
  if (i.cronoprogramma?.fasi.length) {
    const dopo = disegnaCronoprogramma(doc, i.cronoprogramma, { margine: m, colore: t.fondo, tinta: t.tinta, inchiostro: t.inchiostro, grigio: t.grigio, filetto: t.filetto, titolo: i.titolo });
    if (dopo != null) y = dopo;
  }
  disegnaNote();
  disegnaFirma();

  // Piede: stato e numero di pagina, su ogni pagina.
  const pagine = doc.getNumberOfPages();
  for (let p = 1; p <= pagine; p++) {
    doc.setPage(p);
    y = H - 24; filetto(m, destra, t.filetto, 0.4);
    font(6.5, "normal", t.grigioChiaro);
    doc.text(accorcia(i.parziale ? "Bozza parziale: lavorazioni da completare" : i.stato || i.veste?.piePagina?.trim() || i.azienda || "", larghezza - 80), m, H - 14);
    doc.text(`Pagina ${p} di ${pagine}`, destra, H - 14, { align: "right" });
  }
  return doc;
}
