/**
 * Esportazione del computo nel formato classico (come la stampa di PriMus):
 * N.ord | Tariffa | Designazione | par.ug. | lung. | larg. | H/peso | Quantità | Unitario | Importo,
 * con i capitoli, le righe di misura, «SOMMANO» per ogni voce e il riepilogo per capitoli.
 */
import { neutralizeCsvFormula } from "@/lib/csvExport";
import { alberoComputo, numeroVoce, tariffaVoce, type NodoComputo, type VoceComputo } from "./alberoComputo";
import type { QuadroEconomico } from "./quadroEconomico";
import { formatEuro } from "./computoStrutturato";
import type { AllegatoPdfComputo } from "./allegatiLocali";
import type { ImpostazioniIvaComputo } from "./ivaComputo";

export type RigaStampa =
  | { tipo: "capitolo"; livello: number; testo: string }
  | { tipo: "voce"; numero: string; tariffa: string; testo: string }
  | { tipo: "misura"; testo: string; pu: number | null; lu: number | null; la: number | null; h: number | null; q: number | null }
  | { tipo: "sommano"; testo: string; q: number | null; unitario: number | null; importo: number | null }
  | { tipo: "subtotale"; livello: number; testo: string; importo: number }
  | { tipo: "totale"; testo: string; importo: number };

export interface IntestazioneComputo extends ImpostazioniIvaComputo {
  titolo: string;
  commessa?: string | null;
  stazioneAppaltante?: string | null;
  cig?: string | null;
  cup?: string | null;
  stato?: string | null;
  quadro?: QuadroEconomico | null;
  committente?: string | null;
  oggetto?: string | null;
  senzaPrezzi?: boolean;
  presentazione?: "tecnico" | "preventivo";
  azienda?: string;
  dettagliAzienda?: string;
  colore?: string;
  numero?: string;
  indirizzoIntervento?: string;
  condizioni?: string;
  senzaPiede?: boolean;
  parziale?: string;
  nascondiCliente?: boolean;
  /**
   * «editoriale»: il preventivo per il cliente, una scheda per voce.
   * «primus»: il computo metrico come lo stampa PriMus (colonne, SOMMANO, riporto), con la veste dell'azienda.
   */
  impaginazione?: "editoriale" | "primus";
  dettaglioMisure?: boolean;
  dataDocumento?: string;
  revisione?: string;
  tecnico?: string;
  riferimentoPrezzi?: string;
  inclusioni?: string;
  esclusioni?: string;
  tempi?: string;
  pagamenti?: string;
  mostraPrezziUnitari?: boolean;
  mostraImporti?: boolean;
  mostraCodici?: boolean;
  mostraFonti?: boolean;
  soloRiepilogo?: boolean;
}

/** Le righe della stampa, nell'ordine: utile anche per i test. */
export function righeComputoClassico(voci: VoceComputo[]): RigaStampa[] {
  const { nodi, totale } = alberoComputo(voci);
  const righe: RigaStampa[] = [];
  const visita = (n: NodoComputo) => {
    righe.push({ tipo: "capitolo", livello: n.livello, testo: n.nome });
    n.figli.forEach(visita);
    for (const v of n.voci) {
      righe.push({ tipo: "voce", numero: numeroVoce(v), tariffa: tariffaVoce(v), testo: [v.descrizione_estesa || v.descrizione_breve,
        v.a_corpo ? "Lavorazione a corpo" : "", v.is_sicurezza ? "Oneri della sicurezza" : ""].filter(Boolean).join("\n") });
      for (const m of [...v.misure].sort((a, b) => a.ordine - b.ordine)) {
        righe.push({ tipo: "misura", testo: [m.descrizione, m.formula ? `(${m.formula})` : ""].filter(Boolean).join(" "),
          pu: m.parti_uguali, lu: m.lunghezza, la: m.larghezza, h: m.altezza_peso, q: m.quantita });
      }
      righe.push({ tipo: "sommano", testo: `${v.is_detrazione ? "SI DETRAGGONO" : "SOMMANO"} ${v.unita_misura ?? ""}`.trim(),
        q: v.quantita, unitario: v.prezzo_unitario_computo, importo: v.importo_computo });
    }
    righe.push({ tipo: "subtotale", livello: n.livello, testo: `Totale ${n.nome}`, importo: n.importo });
  };
  nodi.forEach(visita);
  righe.push({ tipo: "totale", testo: "TOTALE COMPUTO", importo: totale });
  return righe;
}

/** Riepilogo per capitoli: una riga per nodo, rientrata per livello, con l'incidenza %. */
export function riepilogoCapitoli(voci: VoceComputo[]): Array<{ livello: number; nome: string; importo: number; percentuale: number }> {
  const out: Array<{ livello: number; nome: string; importo: number; percentuale: number }> = [];
  const visita = (n: NodoComputo) => { out.push({ livello: n.livello, nome: n.nome, importo: n.importo, percentuale: n.percentuale }); n.figli.forEach(visita); };
  alberoComputo(voci).nodi.forEach(visita);
  return out;
}

export function nomeFileComputo(titolo: string, estensione: "xlsx" | "pdf") {
  const base = titolo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "computo";
  return `${base}.${estensione}`;
}

function scarica(dati: BlobPart, tipo: string, nomeFile: string) {
  const url = URL.createObjectURL(new Blob([dati], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nomeFile;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const testo = (s: string) => neutralizeCsvFormula(s);
const euro = (n: number | null | undefined) => n == null ? "" : formatEuro(n);
/** Punto delle migliaia, da 2 a 6 decimali per non perdere precisione nelle misure. */
const num = (n: number | null | undefined, dec = 2) => {
  if (n == null) return "";
  const [intera, decimali] = Math.abs(n).toFixed(Math.max(dec, 6)).split(".");
  const tagliati = decimali.replace(/0+$/, "").padEnd(dec, "0");
  return `${n < 0 ? "-" : ""}${intera.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${tagliati ? `,${tagliati}` : ""}`;
};

function righeQuadro(q: QuadroEconomico): Array<[string, number]> {
  return [
    ["Importo dei lavori", q.importo_lavori],
    ["di cui oneri della sicurezza (non soggetti a ribasso)", q.oneri_sicurezza],
    ["Importo soggetto a ribasso", q.soggetto_a_ribasso],
    [`Ribasso d'asta ${q.ribasso_percentuale.toLocaleString("it-IT")}%`, -q.ribasso_euro],
    ["Importo contrattuale", q.importo_contrattuale],
  ];
}

export async function esportaComputoXlsx(voci: VoceComputo[], intestazione: IntestazioneComputo): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Computo metrico");
  ws.columns = [
    { header: "N.ord", key: "n", width: 7 }, { header: "Tariffa", key: "t", width: 16 },
    { header: "Designazione dei lavori", key: "d", width: 70 }, { header: "par.ug.", key: "pu", width: 9 },
    { header: "lung.", key: "lu", width: 9 }, { header: "larg.", key: "la", width: 9 }, { header: "H/peso", key: "h", width: 9 },
    { header: "Quantità", key: "q", width: 12 }, { header: "Unitario", key: "u", width: 12 }, { header: "Importo", key: "i", width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const numFmt = "#,##0.00";
  for (const r of righeComputoClassico(voci)) {
    if (r.tipo === "capitolo") {
      const row = ws.addRow({ d: testo(r.testo) });
      row.font = { bold: true, size: r.livello === 0 ? 12 : 11 };
    } else if (r.tipo === "voce") {
      const row = ws.addRow({ n: testo(r.numero), t: testo(r.tariffa), d: testo(r.testo) });
      row.getCell("d").alignment = { wrapText: true, vertical: "top" };
      row.alignment = { vertical: "top" };
    } else if (r.tipo === "misura") {
      ws.addRow({ d: testo(r.testo), pu: r.pu, lu: r.lu, la: r.la, h: r.h, q: r.q }).font = { italic: true };
    } else if (r.tipo === "sommano") {
      const row = ws.addRow({ d: testo(r.testo), q: r.q, u: r.unitario, i: r.importo });
      row.font = { bold: true };
      row.getCell("d").alignment = { horizontal: "right" };
    } else {
      const row = ws.addRow({ d: testo(r.testo), i: r.importo });
      row.font = { bold: true };
    }
  }
  for (const k of ["q", "u", "i"]) ws.getColumn(k).numFmt = numFmt;
  for (const k of ["pu", "lu", "la", "h"]) ws.getColumn(k).numFmt = "#,##0.00##";

  const riep = wb.addWorksheet("Riepilogo");
  riep.columns = [{ header: "Capitolo", key: "c", width: 70 }, { header: "Importo", key: "i", width: 16 }, { header: "Incidenza %", key: "p", width: 12 }];
  riep.getRow(1).font = { bold: true };
  for (const c of riepilogoCapitoli(voci)) {
    const row = riep.addRow({ c: testo(`${"   ".repeat(c.livello)}${c.nome}`), i: c.importo, p: Math.round(c.percentuale * 1000) / 1000 });
    if (c.livello === 0) row.font = { bold: true };
  }
  riep.getColumn("i").numFmt = numFmt;
  if (intestazione.quadro) {
    riep.addRow({});
    riep.addRow({ c: "QUADRO ECONOMICO" }).font = { bold: true };
    for (const [etichetta, valore] of righeQuadro(intestazione.quadro)) riep.addRow({ c: etichetta, i: valore });
  }
  const buffer = await wb.xlsx.writeBuffer();
  scarica(buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", nomeFileComputo(intestazione.titolo, "xlsx"));
}

/** PDF orizzontale con le colonne classiche, «Riporto / A riportare» a ogni pagina e riepilogo finale. */
export async function generaComputoPdf(voci: VoceComputo[], intestazione: IntestazioneComputo) {
  const mod = await import("jspdf");
  const JsPDF = mod.default ?? (mod as typeof mod & { jsPDF?: typeof mod.default }).jsPDF;
  if (intestazione.impaginazione === "primus") {
    const { disegnaComputoPrimus } = await import("./stampaPrimus");
    return disegnaComputoPrimus(new JsPDF({ orientation: "portrait", unit: "pt", format: "a4" }), voci, intestazione);
  }
  if (intestazione.presentazione === "preventivo" || intestazione.impaginazione === "editoriale") {
    const { disegnaPreventivoComputo } = await import("./preventivoComputoPdf");
    return disegnaPreventivoComputo(new JsPDF({ orientation: "portrait", unit: "pt", format: "a4" }), voci, intestazione);
  }
  const doc = new JsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
  const m = 28;
  const completa = () => {
    if (intestazione.senzaPiede) return doc;
    const pagine = doc.getNumberOfPages();
    for (let p = 1; p <= pagine; p++) {
      doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
      doc.text(`Pagina ${p} di ${pagine}`, W - m, H - 12, { align: "right" });
    }
    return doc;
  };
  // x di destra di ogni colonna numerica, larghezza della designazione.
  const col = { n: m, t: m + 34, d: m + 110, pu: 520, lu: 565, la: 610, h: 655, q: 715, u: 770, i: W - m };
  const larghezzaDesc = col.pu - 40 - col.d;
  let y = 0; let pagina = 0; let progressivo = 0;
  const intestazionePagina = (riporto: boolean) => {
    pagina++;
    y = m;
    if (intestazione.azienda) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      const nome = doc.splitTextToSize(intestazione.azienda, W - 2 * m - 65) as string[];
      doc.text(nome, m, y + 8); y += nome.length * 11 + 7;
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    const titolo = doc.splitTextToSize(intestazione.titolo, W - 2 * m - 65) as string[];
    doc.text(titolo, m, y + 8);
    y += Math.max(0, titolo.length - 1) * 13;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const dettagli = [intestazione.commessa, intestazione.stazioneAppaltante && `Stazione appaltante: ${intestazione.stazioneAppaltante}`,
      intestazione.cig && `CIG ${intestazione.cig}`, intestazione.cup && `CUP ${intestazione.cup}`, intestazione.stato,
      intestazione.committente && `Committente: ${intestazione.committente}`, intestazione.oggetto,
      intestazione.numero && `Preventivo ${intestazione.numero}`, intestazione.indirizzoIntervento, intestazione.parziale].filter(Boolean).join(" · ");
    const metadati = dettagli ? doc.splitTextToSize(dettagli, W - 2 * m) as string[] : [];
    if (metadati.length) doc.text(metadati, m, y + 20);
    doc.text(`pag. ${pagina}`, W - m, y + 8, { align: "right" });
    y += 32 + Math.max(0, metadati.length - 1) * 10;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    doc.text("N.ord", col.n, y); doc.text("Tariffa", col.t, y); doc.text("DESIGNAZIONE DEI LAVORI", col.d, y);
    for (const [k, l] of [["pu", "par.ug."], ["lu", "lung."], ["la", "larg."], ["h", "H/peso"], ["q", "Quantità"], ["u", "Unitario"], ["i", "TOTALE"]] as const) {
      if (intestazione.senzaPrezzi && (k === "u" || k === "i")) continue;
      doc.text(l, col[k], y, { align: "right" });
    }
    y += 4; doc.setLineWidth(0.5); doc.line(m, y, W - m, y); y += 10;
    doc.setFont("helvetica", "normal");
    if (riporto && !intestazione.senzaPrezzi) { doc.setFont("helvetica", "bold"); doc.text("RIPORTO", col.d + 200, y); doc.text(euro(progressivo), col.i, y, { align: "right" }); doc.setFont("helvetica", "normal"); y += 12; }
  };
  const spazio = (h: number) => {
    if (y + h <= H - m - 16) return;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    if (!intestazione.senzaPrezzi) { doc.text("A RIPORTARE", col.d + 200, H - m - 4); doc.text(euro(progressivo), col.i, H - m - 4, { align: "right" }); }
    doc.addPage(); intestazionePagina(true);
  };
  const note = () => {
    if (!intestazione.condizioni?.trim()) return;
    if (y + 45 > H - m - 20) { doc.addPage(); pagina++; y = m + 10; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Note e condizioni", m, y + 10); y += 25;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const lines = doc.splitTextToSize(intestazione.condizioni.trim(), W - 2 * m) as string[];
    for (const text of lines) {
      if (y + 12 > H - m - 20) { doc.addPage(); pagina++; y = m + 10; }
      doc.text(text, m, y); y += 12;
    }
  };
  intestazionePagina(false);
  doc.setFontSize(7.5);
  for (const r of righeComputoClassico(voci)) {
    if (r.tipo === "capitolo") {
      doc.setFont("helvetica", "bold"); doc.setFontSize(r.livello === 0 ? 9 : 8);
      const linee = doc.splitTextToSize(r.testo, larghezzaDesc - r.livello * 10) as string[];
      for (const linea of linee) { spazio(14); doc.text(linea, col.d + r.livello * 10, y + 4); y += 14; }
      doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
    } else if (r.tipo === "voce") {
      const linee = doc.splitTextToSize(r.testo, larghezzaDesc) as string[];
      const tariffe = doc.splitTextToSize(r.tariffa, col.d - col.t - 6) as string[];
      const h = Math.max(linee.length, tariffe.length) * 9 + 2;
      spazio(Math.min(h, 120)); y += 2;
      doc.setFont("helvetica", "bold"); doc.text(r.numero, col.n, y); doc.setFont("helvetica", "normal");
      for (let i = 0; i < Math.max(linee.length, tariffe.length); i++) {
        spazio(10); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
        if (tariffe[i]) doc.text(tariffe[i], col.t, y);
        if (linee[i]) doc.text(linee[i], col.d, y);
        y += 9;
      }
    } else if (r.tipo === "misura") {
      const linee = doc.splitTextToSize(r.testo || "", larghezzaDesc) as string[];
      let yNum = y;
      for (const l of linee.length ? linee : [""]) {
        spazio(10); doc.setFont("helvetica", "italic"); doc.setFontSize(7.5);
        doc.text(l, col.d + 6, y); yNum = y; y += 9;
      }
      for (const [k, v] of [["pu", r.pu], ["lu", r.lu], ["la", r.la], ["h", r.h], ["q", r.q]] as const) if (v != null) doc.text(num(v), col[k], yNum, { align: "right" });
      doc.setFont("helvetica", "normal");
    } else if (r.tipo === "sommano") {
      spazio(14); y += 2;
      doc.setFont("helvetica", "bold");
      doc.text(r.testo, col.pu - 40, y, { align: "right" });
      doc.text(num(r.q), col.q, y, { align: "right" });
      if (!intestazione.senzaPrezzi) { doc.text(num(r.unitario), col.u, y, { align: "right" }); doc.text(euro(r.importo), col.i, y, { align: "right" }); }
      doc.setFont("helvetica", "normal");
      progressivo += r.importo ?? 0;
      y += 14;
    } else {
      if (intestazione.senzaPrezzi) continue;
      if (intestazione.azienda && r.tipo === "totale") continue;
      spazio(14);
      doc.setFont("helvetica", "bold");
      const linee = doc.splitTextToSize(r.testo, col.pu - 40 - m) as string[];
      for (const l of linee) { spazio(12); doc.text(l, col.pu - 40, y, { align: "right" }); y += 10; }
      doc.text(euro(r.importo), col.i, y - 10, { align: "right" });
      doc.setFont("helvetica", "normal"); y += r.tipo === "totale" ? 16 : 14;
    }
  }
  if (intestazione.senzaPrezzi) { note(); return completa(); }
  // Riepilogo per capitoli (e quadro economico).
  if (!intestazione.azienda || y > H - m - 130) { doc.addPage(); pagina++; y = m; }
  else y += 20;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Riepilogo per capitoli", m, y + 8); y += 26;
  doc.setFontSize(8);
  const headerRiepilogo = () => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("Capitolo", m, y); doc.text("Importo", W - m - 70, y, { align: "right" }); doc.text("Incid. %", W - m, y, { align: "right" }); y += 12;
  };
  const spazioRiepilogo = (h: number) => {
    if (y + h <= H - m - 20) return;
    doc.addPage(); pagina++; y = m + 10;
    headerRiepilogo();
  };
  headerRiepilogo();
  for (const c of riepilogoCapitoli(voci)) {
    doc.setFont("helvetica", c.livello === 0 ? "bold" : "normal");
    const linee = doc.splitTextToSize(c.nome, W - 2 * m - 160 - c.livello * 14) as string[];
    for (let i = 0; i < linee.length; i++) {
      spazioRiepilogo(12); doc.text(linee[i], m + c.livello * 14, y);
      if (i === 0) { doc.text(euro(c.importo), W - m - 70, y, { align: "right" }); doc.text(num(c.percentuale, 3), W - m, y, { align: "right" }); }
      y += 11;
    }
  }
  const totale = voci.reduce((s, v) => s + (Number(v.importo_computo) || 0), 0);
  spazioRiepilogo(25); doc.setFont("helvetica", "bold"); y += 4; doc.text(intestazione.parziale ? "PARZIALE" : "TOTALE", m, y); doc.text(euro(totale), W - m - 70, y, { align: "right" }); y += 18;
  if (intestazione.quadro) {
    if (y > H - m - 90) { doc.addPage(); y = m + 10; }
    doc.setFontSize(10); doc.text("Quadro economico", m, y); y += 14; doc.setFontSize(8);
    for (const [etichetta, valore] of righeQuadro(intestazione.quadro)) {
      doc.setFont("helvetica", etichetta === "Importo contrattuale" ? "bold" : "normal");
      doc.text(etichetta, m, y); doc.text(euro(valore), W - m - 70, y, { align: "right" }); y += 11;
    }
  }
  note(); return completa();
}

export async function generaDocumentoComputo(voci: VoceComputo[], intestazione: IntestazioneComputo, allegati: AllegatoPdfComputo[] = []): Promise<Blob> {
  const doc = await generaComputoPdf(voci, { ...intestazione, senzaPiede: !!allegati.length });
  if (!allegati.length) return doc.output("blob");
  const { appendiAllegatiPdf } = await import("./appendiAllegatiPdf");
  return appendiAllegatiPdf(doc.output("arraybuffer"), allegati);
}

export async function esportaComputoPdf(voci: VoceComputo[], intestazione: IntestazioneComputo, allegati: AllegatoPdfComputo[] = []): Promise<void> {
  const blob = await generaDocumentoComputo(voci, intestazione, allegati);
  scarica(blob, "application/pdf", nomeFileComputo(intestazione.titolo, "pdf"));
}
