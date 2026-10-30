// src/lib/orders/generali/rendicontoExcel.ts
// L'Excel del dossier: un foglio per sezione, con i numeri veri (celle numeriche in euro,
// percentuali come percentuali, date come date), per chi vuole rifare i conti o incollarli
// altrove. Stesse sezioni del PDF: entra solo quello che c'è in `DatiDossier`.
import { neutralizeCsvFormula } from "@/lib/csvExport";
import { NOMI_SEZIONE, giornoIt, type DatiDossier, type RigaPianoDossier } from "@/lib/orders/generali/rendiconto";
import type { TotaliColonne } from "@/lib/orders/generali/pianoConti";
import type { Worksheet } from "exceljs";

export const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Formato = "testo" | "euro" | "percento" | "numero" | "data" | "mese";
interface Colonna { titolo: string; formato?: Formato; larghezza?: number }
type Valore = string | number | null | undefined;

const FORMATI: Record<Formato, string | undefined> = {
  testo: undefined,
  euro: '#,##0.00 "€";[Red]-#,##0.00 "€"',
  percento: "0.0%",
  numero: "#,##0.##",
  data: "dd/mm/yyyy",
  mese: "mmm yyyy",
};

/** «2027-03-15» o «2027-03» → data vera (mezzogiorno UTC: nessun fuso la sposta di giorno). */
function data(v: Valore): Date | string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(v);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? "1"), 12)) : v;
}

function cella(v: Valore, f: Formato): unknown {
  if (v === null || v === undefined) return null;
  if (f === "data" || f === "mese") return data(v);
  if (typeof v === "string") return neutralizeCsvFormula(v);
  return Number.isFinite(v) ? v : null;
}

export async function creaExcelDossier(d: DatiDossier): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = d.azienda.nome;
  wb.title = `Rendiconto ${d.operazione.nome}`;
  wb.created = new Date();

  /** Un foglio: titolo in alto, poi le tabelle una sotto l'altra. */
  const foglio = (nome: string): Worksheet => {
    const ws = wb.addWorksheet(nome.slice(0, 31));
    ws.getCell("A1").value = `${d.operazione.nome} · ${nome}`;
    ws.getCell("A1").font = { bold: true, size: 13, color: { argb: "FF1E3A5F" } };
    ws.getCell("A2").value = `${d.azienda.nome} · rendiconto al ${giornoIt(d.data)}`;
    ws.getCell("A2").font = { size: 9, color: { argb: "FF6B7280" } };
    return ws;
  };
  /** Scrive una tabella dalla prima riga libera (lasciandone una vuota). Restituisce la riga dopo. */
  const tabella = (ws: Worksheet, colonne: Colonna[], righe: Valore[][], opz: { titolo?: string; totale?: Valore[] } = {}) => {
    let r = ws.rowCount + 2;
    if (opz.titolo) {
      ws.getCell(r, 1).value = opz.titolo;
      ws.getCell(r, 1).font = { bold: true };
      r += 1;
    }
    const intestazione = ws.getRow(r);
    colonne.forEach((c, j) => {
      const x = intestazione.getCell(j + 1);
      x.value = c.titolo;
      x.font = { bold: true, color: { argb: "FFFFFFFF" } };
      x.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      const col = ws.getColumn(j + 1);
      col.width = Math.max(col.width ?? 10, c.larghezza ?? (c.formato && c.formato !== "testo" ? 15 : 24));
    });
    const scrivi = (valori: Valore[], grassetto: boolean) => {
      r += 1;
      const riga = ws.getRow(r);
      valori.forEach((v, j) => {
        const f = colonne[j]?.formato ?? "testo";
        const x = riga.getCell(j + 1);
        x.value = cella(v, f) as never;
        if (FORMATI[f]) x.numFmt = FORMATI[f]!;
        if (grassetto) x.font = { bold: true };
      });
    };
    for (const riga of righe) scrivi(riga, false);
    if (opz.totale) scrivi(opz.totale, true);
  };
  /** Coppie etichetta → valore, una per riga, sotto un'intestazione. */
  const elenco = (ws: Worksheet, coppie: [string, Valore, Formato][]) => {
    tabella(ws, [{ titolo: "Voce", larghezza: 36 }, { titolo: "Valore", larghezza: 22 }], []);
    for (const [e, v, f] of coppie) {
      const r = ws.rowCount + 1;
      ws.getCell(r, 1).value = e;
      const x = ws.getCell(r, 2);
      x.value = cella(v, f) as never;
      if (FORMATI[f]) x.numFmt = FORMATI[f]!;
    }
  };

  // Copertina: cosa contiene il file.
  const info = foglio("Dossier");
  elenco(info, [
    ["Azienda", d.azienda.nome, "testo"],
    ["Operazione", d.operazione.nome, "testo"],
    ["Codice", d.operazione.codice, "testo"],
    ["Tipo di operazione", d.operazione.modelloNome, "testo"],
    [d.operazione.clienteEtichetta, d.operazione.cliente, "testo"],
    ["Data", d.data, "data"],
    ["Periodo dal", d.periodo.dal, "data"],
    ["Periodo al", d.periodo.al, "data"],
    ["Sezioni", d.sezioni.map((x) => NOMI_SEZIONE[x].nome).join(", "), "testo"],
    ["Note", "Importi in euro al netto dell'IVA. Le stime sono calcolate sul piano economico alla data del dossier.", "testo"],
  ]);

  if (d.sintesi) {
    const ws = foglio("Sintesi");
    tabella(ws, [{ titolo: "Numero chiave", larghezza: 34 }, { titolo: "Valore", larghezza: 20 }, { titolo: "Nota", larghezza: 30 }], []);
    for (const n of d.sintesi.numeri) {
      const r = ws.rowCount + 1;
      ws.getCell(r, 1).value = n.etichetta;
      const x = ws.getCell(r, 2);
      x.value = cella(n.valore, n.formato === "euro" ? "euro" : n.formato === "percento" ? "percento" : "testo") as never;
      if (n.formato === "euro") x.numFmt = FORMATI.euro!;
      if (n.formato === "percento") x.numFmt = FORMATI.percento!;
      ws.getCell(r, 3).value = n.nota ? neutralizeCsvFormula(n.nota) : null;
    }
    tabella(ws, [{ titolo: "Semaforo", larghezza: 34 }, { titolo: "Colore", larghezza: 20 }, { titolo: "Perché", larghezza: 60 }],
      d.sintesi.semafori.map((x) => [x.titolo, x.tono === "verde" ? "Verde" : x.tono === "giallo" ? "Giallo" : "Rosso", x.testo]));
  }

  if (d.avanzamento) {
    const ws = foglio("Avanzamento");
    const a = d.avanzamento;
    const conImporti = a.scala !== null;
    tabella(ws,
      [{ titolo: "Codice", larghezza: 12 }, { titolo: d.operazione.figliaTante, larghezza: 34 }, { titolo: "Stato", larghezza: 18 }, { titolo: "Avanzamento", formato: "percento" },
        ...(conImporti ? (["Importo", "Eseguito", "Fatturato", "Incassato"] as const).map((t) => ({ titolo: t, formato: "euro" as const })) : [])],
      a.figlie.map((f) => [f.codice, f.nome, f.stato, f.avanzamento / 100, ...(conImporti ? [f.importo, f.eseguito, f.fatturato, f.incassato] : [])]),
      { totale: ["", "Totale", "", a.medio === null ? null : a.medio / 100, ...(conImporti ? [a.scala!.assegnato, a.scala!.eseguito, a.scala!.fatturato, a.scala!.incassato] : [])] });
  }

  if (d.foto.length > 0) {
    const ws = foglio("Foto");
    tabella(ws, [{ titolo: "Data", formato: "data" }, { titolo: "Foto", larghezza: 70 }], d.foto.map((f) => [f.data, f.didascalia]));
  }

  if (d.piano) {
    const ws = foglio("Piano economico");
    const col: Colonna[] = [{ titolo: "Voce", larghezza: 34 }, ...["Previsto", "Reale", "A finire", "Stima finale", "Scostamento"].map((t) => ({ titolo: t, formato: "euro" as const }))];
    const righe = (x: RigaPianoDossier[]) => x.map((r) => [r.etichetta, r.previsto, r.reale, r.aFinire, r.stima, r.scostamento]);
    const tot = (nome: string, t: TotaliColonne) => [nome, t.previsto, t.reale, t.aFinire, t.stima, t.scostamento];
    if (d.piano.versione) ws.getCell("A3").value = d.piano.versione;
    tabella(ws, col, righe(d.piano.ricavi), { titolo: "Ricavi", totale: tot("Totale ricavi", d.piano.totali.ricavi) });
    tabella(ws, col, righe(d.piano.costi), { titolo: "Costi", totale: tot("Totale costi", d.piano.totali.costi) });
    tabella(ws, col, [], { titolo: "Risultato", totale: tot("Margine", d.piano.totali.margine) });
    const k = d.piano.indicatori;
    elenco(ws, [
      ["Margine sui ricavi", k.marginePct, "percento"], ["ROI (margine sui costi)", k.roi, "percento"], ["TIR annuo", k.tir, "percento"],
      ["Durata (mesi)", k.durataMesi, "numero"], ["Costo di cantiere al m²", k.costoMq, "euro"], ["Ricavo al m²", k.prezzoMq, "euro"], ["Pareggio al m²", k.pareggioMq, "euro"],
    ]);
  }

  if (d.andamento) {
    const ws = foglio("Andamento");
    tabella(ws,
      [{ titolo: "Mese", formato: "mese" }, ...["Ricavi stimati", "Costi stimati", "Margine stimato", "Margine previsto", "Capitale investito"].map((t) => ({ titolo: t, formato: "euro" as const }))],
      d.andamento.map((x) => [x.mese, x.ricaviStima, x.costiStima, x.margineStima, x.marginePrevisto, x.capitaleInvestito]));
  }

  if (d.cassa) {
    const ws = foglio("Flusso di cassa");
    const c = d.cassa;
    tabella(ws,
      [{ titolo: "Mese", formato: "mese" }, ...["Entrate", "Uscite", "Netto", "Cumulato"].map((t) => ({ titolo: t, formato: "euro" as const })), { titolo: "Reale o stima", larghezza: 14 }],
      c.mesi.map((m) => [m.mese, m.entrate, m.uscite, m.netto, m.cumulato, m.passato ? "Reale" : "Stima"]));
    tabella(ws, [{ titolo: "Capitale", larghezza: 34 }, { titolo: "Importo", formato: "euro" }, { titolo: "Mese", formato: "mese" }], [
      ["Capitale massimo impegnato (stima)", c.capitaleMassimo, c.meseCapitaleMassimo],
      ["Capitale massimo previsto", c.capitaleMassimoPrevisto, null],
      ["Capitale investito oggi", c.capitaleInvestitoOggi, null],
    ]);
  }

  if (d.fonti) {
    const ws = foglio("Fonti e debito");
    const f = d.fonti;
    tabella(ws, [{ titolo: "Fonte", larghezza: 30 }, { titolo: "Impegno", formato: "euro" }, { titolo: "Dentro oggi", formato: "euro" }],
      f.copertura.map((x) => [x.nome, x.impegno, x.dentro]),
      { titolo: "Copertura", totale: ["Totale", f.totali.impegno, f.totali.dentro] });
    if (f.debito.length > 0) {
      tabella(ws,
        [{ titolo: "Fonte", larghezza: 30 }, { titolo: "Forma", larghezza: 18 }, { titolo: "Deliberato", formato: "euro" }, { titolo: "Erogato", formato: "euro" }, { titolo: "Tasso", formato: "percento" }, { titolo: "Scadenza", formato: "data" }, { titolo: "Interessi stimati", formato: "euro" }],
        f.debito.map((x) => [x.nome, x.forma, x.impegno, x.dentro, x.tassoPct === null ? null : x.tassoPct / 100, x.scadenza, x.interessi]),
        { titolo: "Debito" });
    }
    const rr = f.rendimenti;
    tabella(ws, [{ titolo: "Voce", larghezza: 34 }, { titolo: "Euro", formato: "euro" }, { titolo: "Percentuale", formato: "percento" }], [
      ["Interessi del debito (stima)", f.costoDebito.interessi, null],
      ["Spese del debito", f.costoDebito.spese, null],
      ["Costo del debito", f.costoDebito.totale, f.costoDebito.costoAnnuo],
      ["Ancora scoperto sul picco", f.scoperto, null],
      ...(rr ? [
        ["Margine prima del debito", rr.margineProgetto, rr.roi],
        ["Capitale massimo (base del ROI)", rr.capitaleProgetto, null],
        ["TIR del progetto", null, rr.tirProgetto],
        ["Utile dei mezzi propri (ROE)", rr.utileMezziPropri, rr.roe],
        ["TIR dei mezzi propri", null, rr.tirMezziPropri],
        ["Effetto leva (ROE − ROI)", null, rr.leva],
      ] as Valore[][] : []),
    ], { titolo: "Costo del debito e rendimenti" });
  }

  if (d.investitori) {
    const ws = foglio("Soci e investitori");
    const inv = d.investitori;
    tabella(ws,
      [{ titolo: "Nome", larghezza: 30 }, { titolo: "Tipo", larghezza: 22 }, { titolo: "Impegno", formato: "euro" }, { titolo: "Dentro oggi", formato: "euro" }, { titolo: "Rendimento", larghezza: 12 },
        { titolo: "Rendimento stimato", formato: "euro" }, { titolo: "Già pagato", formato: "euro" }, { titolo: "Rendimento %", formato: "percento" }, { titolo: "TIR", formato: "percento" }, { titolo: "Quota utile", formato: "percento" }, { titolo: "Spetta a fine", formato: "euro" }],
      inv.map((x) => [x.nome, x.tipo, x.impegno, x.dentro, x.rendimentoNome, x.rendimentoStima, x.giaPagato, x.rendimentoPct, x.tir, x.quotaPct, x.spettaAFine]),
      { totale: ["Totale", "", inv.reduce((t, x) => t + x.impegno, 0), inv.reduce((t, x) => t + x.dentro, 0), "", inv.reduce((t, x) => t + x.rendimentoStima, 0), inv.reduce((t, x) => t + x.giaPagato, 0), null, null, null, inv.reduce((t, x) => t + x.spettaAFine, 0)] });
  }

  if (d.unita) {
    const ws = foglio("Unità");
    const u = d.unita;
    const conImporti = u.venduto !== null;
    tabella(ws,
      [{ titolo: "Unità", larghezza: 14 }, { titolo: "Tipologia", larghezza: 18 }, { titolo: "m²", formato: "numero" }, { titolo: "Stato", larghezza: 16 },
        ...(conImporti ? [{ titolo: "Prezzo", formato: "euro" as const }, { titolo: "Incassato", formato: "euro" as const }, { titolo: "Residuo", formato: "euro" as const }] : [])],
      u.elenco.map((x) => [x.sigla, x.tipologia, x.mq, x.stato, ...(conImporti ? [x.prezzo, x.incassato, x.residuo] : [])]));
    tabella(ws, [{ titolo: "Riepilogo", larghezza: 30 }, { titolo: "Numero", formato: "numero" }, { titolo: "Importo", formato: "euro" }], [
      ["Rogitate", u.conteggi.rogitata, null],
      ["A compromesso", u.conteggi.compromesso, null],
      ["Venduto (compromessi e rogiti)", u.conteggi.compromesso + u.conteggi.rogitata, u.venduto],
      ["Prenotate", u.conteggi.prenotata, u.prenotato],
      ["Libere (a listino)", u.conteggi.libera, u.inVendita],
      ["Incassato dagli acquirenti", null, u.incassato],
      ["Da incassare sul venduto", null, u.daIncassare],
    ]);
  }

  if (d.contratto) {
    const ws = foglio("Contratto");
    const k = d.contratto;
    const v = k.valore;
    tabella(ws, [{ titolo: "Voce", larghezza: 36 }, { titolo: "Importo", formato: "euro" }, { titolo: "Data", formato: "data" }], [
      ["Importo a base", v?.base ?? null, k.dataFirma],
      ["Ribasso", v ? -v.ribasso : null, null],
      ["Oneri della sicurezza", v?.sicurezza ?? null, null],
      ["Atti aggiuntivi e varianti", v?.atti ?? null, null],
      ["Valore aggiornato", v?.aggiornato ?? null, null],
      ["Messo a SAL", k.aSal, null],
      ["Fatturato", k.fatture.emesso, null],
      ["Incassato", k.fatture.incassato, null],
      ["Ritenute trattenute", k.ritenute.trattenute, null],
      ["Ritenute svincolate", k.ritenute.svincolate, null],
      ["Ritenute da svincolare", k.ritenute.daSvincolare, null],
      ["Anticipazione ricevuta", k.anticipazione.importo, null],
      ["Anticipazione recuperata", k.anticipazione.recuperato, null],
      ["Anticipazione da recuperare", k.anticipazione.daRecuperare, null],
      ["Penale maturata", k.penale?.importo ?? null, null],
      ["Consegna dei lavori", null, k.consegna],
      ["Fine prevista", null, k.finePrevista],
      ["Fine aggiornata con le proroghe", null, k.fineAggiornata],
      ["Ultimazione", null, k.ultimazione],
    ], { titolo: [k.riferimento, k.cig ? `CIG ${k.cig}` : null, k.cup ? `CUP ${k.cup}` : null].filter(Boolean).join(" · ") || undefined });
    if (k.atti.length > 0) {
      tabella(ws, [{ titolo: "Tipo", larghezza: 18 }, { titolo: "Numero", larghezza: 10 }, { titolo: "Data", formato: "data" }, { titolo: "Descrizione", larghezza: 40 }, { titolo: "Giorni di proroga", formato: "numero" }, { titolo: "Importo", formato: "euro" }],
        k.atti.map((a) => [a.tipo, a.numero, a.data, a.descrizione, a.giorniProroga, a.importo]), { titolo: "Atti aggiuntivi" });
    }
    if (k.garanzie.length > 0) {
      tabella(ws, [{ titolo: "Garanzia", larghezza: 30 }, { titolo: "Garante", larghezza: 24 }, { titolo: "Numero", larghezza: 14 }, { titolo: "Importo", formato: "euro" }, { titolo: "Scadenza", formato: "data" }, { titolo: "Svincolata il", formato: "data" }],
        k.garanzie.map((g) => [g.tipo, g.garante, g.numero, g.importo, g.scadenza, g.svincolataIl]), { titolo: "Garanzie" });
    }
    if (k.sal.length > 0) {
      const sal = foglio("SAL");
      tabella(sal,
        [{ titolo: "SAL", formato: "numero" }, { titolo: "Al", formato: "data" }, { titolo: "Stato", larghezza: 22 }, ...["Cumulativo", "Questo SAL", "Ritenuta", "Recupero anticipazione", "Netto"].map((t) => ({ titolo: t, formato: "euro" as const }))],
        k.sal.map((x) => [x.numero, x.al, x.stato, x.cumulativo, x.lordo, x.ritenuta, x.recupero, x.netto]),
        { totale: ["", "", "Totale", k.aSal, k.sal.reduce((t, x) => t + x.lordo, 0), k.sal.reduce((t, x) => t + x.ritenuta, 0), k.sal.reduce((t, x) => t + x.recupero, 0), k.sal.reduce((t, x) => t + x.netto, 0)] });
    }
  }

  if (d.documenti) {
    const ws = foglio("Documenti");
    const k = d.documenti;
    const STATO: Record<string, string> = { presente: "Presente", mancante: "Manca", in_scadenza: "In scadenza", scaduto: "Scaduto", non_serve: "Non serve" };
    tabella(ws, [{ titolo: "Documento dell'operazione", larghezza: 40 }, { titolo: "Obbligatorio", larghezza: 12 }, { titolo: "Stato", larghezza: 14 }, { titolo: "Scadenza", formato: "data" }],
      k.generale.map((x) => [x.nome, x.obbligatoria ? "Sì" : "No", STATO[x.stato], x.scadenza]));
    if (k.figlie.length > 0) {
      tabella(ws, [{ titolo: `Documento su ogni ${d.operazione.figliaTante.toLowerCase()}`, larghezza: 40 }, { titolo: "Presenti", formato: "numero" }, { titolo: "Su", formato: "numero" }, { titolo: "Da fare", formato: "numero" }],
        k.figlie.map((x) => [x.nome, x.presenti, x.valgono, x.daFare]));
    }
  }

  if (d.note) {
    const ws = foglio("Note");
    ws.getCell("A4").value = neutralizeCsvFormula(d.note);
    ws.getCell("A4").alignment = { wrapText: true, vertical: "top" };
    ws.getColumn(1).width = 100;
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
