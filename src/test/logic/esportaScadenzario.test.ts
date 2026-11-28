import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Scadenza } from "@/hooks/useScadenzario";
import {
  colonneDiSerie, colonneExportDaTabella, colonneValide, intestazioniCsv, righeCsv,
  calcolaTotali, costruisciRighe, dataIt, eur, generaPdf, vociTotale, generaXlsx, testoPdf, raggruppaRighe, RIGA_INTESTAZIONE_XLSX, testoSicuro, periodoNomeFile, pezzoNomeFile,
} from "@/lib/scadenzario/esportaScadenzario";

// I file d'esempio (da aprire a mano per guardarli) vanno nella cartella temporanea del sistema.
const SCRATCH = join(tmpdir(), "eic-esporta-scadenzario");

let n = 0;
const sc = (o: Record<string, unknown>): Scadenza => ({
  id: `s${n++}`, company_id: "c", tipo: "pagamento_fornitore", direction: "uscita", description: "x", amount: 100,
  due_date: "2026-11-30", status: "da_pagare", paid_amount: 0, payment_method: "riba", ...o,
}) as unknown as Scadenza;

const dati = (): Scadenza[] => [
  sc({ amount: 1234.5, due_date: "2026-11-30", suppliers: { name: "BETA SRL" }, company_costs: { name: "MATERIALE IDRAULICO ORDINE 12", documento_riferimento: "101" }, orders: { order_code: "C-12", description: "CANTIERE NORD" }, order_id: "o1" }),
  sc({ amount: 800, paid_amount: 300, status: "parziale", due_date: "2026-10-31", suppliers: { name: "ALFA SPA" }, company_costs: { name: "INERTI-STABILIZZATO", documento_riferimento: "202" }, orders: { order_code: "C-7", description: "CANTIERE SUD" } }),
  sc({ amount: 5000, direction: "entrata", tipo: "incasso_cliente", due_date: "2026-11-15", invoices: { invoice_number: "303", client_company_name: "Cliente Uno" } }),
  sc({ amount: 50, suppliers: { name: "=cmd|'/c calc'!A1" }, due_date: null, description: "@SUM(1)" }),
];

describe("esportaScadenzario: righe e totali", () => {
  it("costruisce le righe con numero, cantiere, lavorazione e importi numerici", () => {
    const r = costruisciRighe(dati(), "2026-09-01");
    expect(r[0]).toMatchObject({ numero: "101", controparte: "BETA SRL", cantiere: "C-12 CANTIERE NORD", lavorazione: "MATERIALE IDRAULICO ORDINE 12", importo: 1234.5, residuo: 1234.5, tipo: "Pagamento", modalita: expect.any(String) });
    expect(r[1].residuo).toBe(500);
    expect(r[1].stato).toBe("Parz. pagata");
    expect(r[2]).toMatchObject({ numero: "303", controparte: "Cliente Uno", tipo: "Incasso", stato: "Da incassare" });
    expect(typeof r[0].importo).toBe("number");
  });
  it("per fornitore/cliente le righe senza controparte vanno in fondo", () => {
    const righe = costruisciRighe([sc({ suppliers: null, description: "senza" }), sc({ suppliers: { name: "Zeta" } }), sc({ suppliers: { name: "Alfa" } })], "2026-09-01");
    expect(raggruppaRighe(righe, "controparte").map((g) => g.titolo)).toEqual(["Alfa", "Zeta", "Senza fornitore / cliente"]);
  });
  it("lo stato è quello della tabella: «Scaduta» se la data è passata e manca ancora qualcosa", () => {
    const r = costruisciRighe(dati(), "2026-12-15");
    expect(r.slice(0, 3).map((x) => x.stato)).toEqual(["Scaduta", "Scaduta", "Scaduta"]);
    expect(costruisciRighe([sc({ status: "pagata", paid_amount: 100, due_date: "2026-01-01" })], "2026-12-15")[0].stato).toBe("Pagata");
    expect(costruisciRighe([sc({ status: "annullata", due_date: "2026-01-01" })], "2026-12-15")[0].stato).toBe("Annullata");
  });
  it("totali separati tra incassi e pagamenti", () => {
    const t = calcolaTotali(costruisciRighe(dati()));
    expect(t.incassi).toBe(5000); expect(t.pagamenti).toBe(2084.5); expect(t.saldo).toBe(2915.5);
    expect(t.pagamentiResiduo).toBe(1784.5);
  });
  it("raggruppa per mese e per fornitore, ordinando", () => {
    const r = costruisciRighe(dati());
    expect(raggruppaRighe(r, "data").map((g) => g.titolo)).toEqual(["Ottobre 2026", "Novembre 2026", "Senza data"]);
    const f = raggruppaRighe(r, "controparte").map((g) => g.titolo);
    expect(f.slice(1)).toEqual(["ALFA SPA", "BETA SRL", "Cliente Uno"]);
  });
  it("testoPdf toglie i caratteri fuori WinAnsi", () => {
    expect(testoPdf("Saldo (incassi \u2212 pagamenti) \u2019x\u2019 \u2026")).toBe("Saldo (incassi - pagamenti) 'x' ...");
    expect(testoPdf("Modalit\u00E0 \u00B7 5 \u20AC")).toBe("Modalit\u00E0 \u00B7 5 \u20AC");
  });
  it("residuo: 0 se pagata o annullata, mai negativo", () => {
    const r = costruisciRighe([sc({ status: "pagata", amount: 100, paid_amount: 40 }), sc({ status: "annullata" }), sc({ amount: 100, paid_amount: 150 }), sc({ amount: 100, paid_amount: 30, status: "parziale" })]);
    expect(r.map((x) => x.residuo)).toEqual([0, 0, 0, 70]);
  });
  it("vociTotale: separa incassi e pagamenti solo se il gruppo li ha entrambi", () => {
    const r = costruisciRighe(dati());
    const solo = vociTotale(calcolaTotali(r.filter((x) => x.tipo === "Pagamento")), "Sub");
    expect(solo).toHaveLength(1); expect(solo[0][1]).toBe(-2084.5);
    const misto = vociTotale(calcolaTotali(r), "Sub");
    expect(misto.map((v) => v[1])).toEqual([5000, -2084.5, 2915.5]);
  });
  it("formati e anti-injection", () => {
    expect(eur(1234567.5)).toBe("1.234.567,50 €");
    expect(dataIt("2026-11-30")).toBe("30/11/2026");
    expect(testoSicuro("=1+1")).toBe("'=1+1");
    expect(testoSicuro("@SUM")).toBe("'@SUM");
  });
});

describe("esportaScadenzario: file", () => {
  const meta = { titolo: "Scadenzario", azienda: "Azienda Prova Srl", periodo: "01/11/2026 – 30/11/2026", filtri: ["Solo uscite", "Metodo: Ri.Ba."], ordine: "controparte" as const, dataStampa: new Date(2026, 10, 28) };

  it("xlsx: intestazioni, numeri veri, date vere, formule di totale, niente injection", async () => {
    const righe = costruisciRighe(dati());
    const buf = await generaXlsx(righe, meta);
    mkdirSync(SCRATCH, { recursive: true });
    writeFileSync(`${SCRATCH}/scadenzario_esempio.xlsx`, Buffer.from(buf));
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    const ws = wb.getWorksheet("Scadenzario")!;
    const h = ws.getRow(RIGA_INTESTAZIONE_XLSX);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => h.getCell(i).value)).toEqual(["Scadenza", "N. documento", "Fornitore / Cliente", "Cantiere", "Lavorazione / Descrizione", "Modalità", "Importo", "Residuo", "Stato"]);
    expect(String(ws.getRow(1).getCell(1).value)).toBe("Scadenzario");
    expect(String(ws.getRow(4).getCell(1).value)).toContain("Metodo: Ri.Ba.");
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: RIGA_INTESTAZIONE_XLSX });
    expect(ws.autoFilter).toBeTruthy();
    const p = RIGA_INTESTAZIONE_XLSX + 1;
    // ordinato per fornitore: ALFA, BETA, Cliente Uno e la riga col nome «=cmd»
    const nomi = [0, 1, 2, 3].map((k) => String(ws.getRow(p + k).getCell(3).value));
    expect(nomi.some((x) => x.startsWith("'=cmd"))).toBe(true);
    const beta = [0, 1, 2, 3].map((k) => ws.getRow(p + k)).find((r) => r.getCell(3).value === "BETA SRL")!;
    expect(typeof beta.getCell(7).value).toBe("number");
    expect(beta.getCell(7).value).toBe(1234.5);
    expect(beta.getCell(1).value).toBeInstanceOf(Date);
    expect(beta.getCell(7).numFmt).toContain("#,##0.00");
    const tot = ws.getRow(p + 4 + 1);
    expect(tot.getCell(7).value).toMatchObject({ formula: expect.stringContaining("SUBTOTAL(109") });
    expect((tot.getCell(7).value as { result: number }).result).toBe(5000);
    expect(tot.getCell(6).value).toBe("Totale incassi (righe visibili)");
    expect((ws.getRow(p + 4 + 2).getCell(7).value as { result: number }).result).toBe(2084.5);
    const saldo = ws.getRow(p + 4 + 1 + 2);
    expect((saldo.getCell(7).value as { formula: string }).formula).toBe(`G${p + 4 + 1}-G${p + 4 + 2}`);
    expect((saldo.getCell(7).value as { result: number }).result).toBe(2915.5);
  });

  it("pdf: genera senza errori anche con molte righe", async () => {
    const molte: Scadenza[] = Array.from({ length: 1500 }, (_, i) => sc({ amount: i + 1, due_date: `2026-${String((i % 12) + 1).padStart(2, "0")}-15`, suppliers: { name: `Fornitore ${i % 40}` }, description: "Descrizione molto lunga ".repeat(6), company_costs: { name: "Lavorazione lunga ".repeat(5), documento_riferimento: String(i) }, orders: { order_code: `C-${i % 9}`, description: "CANTIERE" } }));
    const buf = await generaPdf(costruisciRighe([...dati(), ...molte]), { ...meta, ordine: "data" });
    expect(Buffer.from(buf).subarray(0, 5).toString()).toBe("%PDF-");
    const piccolo = await generaPdf(costruisciRighe(dati()), meta);
    writeFileSync(`${SCRATCH}/scadenzario_esempio.pdf`, Buffer.from(piccolo));
    expect(piccolo.byteLength).toBeGreaterThan(1000);
  }, 60000);
});

describe("esportaScadenzario: colonne scelte", () => {
  const meta = { titolo: "Scadenzario", azienda: "Azienda Prova Srl", filtri: [] as string[], ordine: "data" as const, dataStampa: new Date(2026, 10, 28) };
  const carica = async (colonne: string[]) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await generaXlsx(costruisciRighe(dati()), meta, colonne));
    return wb.getWorksheet("Scadenzario")!;
  };

  it("mappa le colonne della tabella in quelle dell'export", () => {
    expect(colonneExportDaTabella(["scadenza", "documento", "importo"])).toEqual(["data", "numero", "cantiere", "importo"]);
    expect(colonneExportDaTabella(["stato", "controparte", "descrizione", "metodo", "residuo", "tipo"])).toEqual(["stato", "controparte", "lavorazione", "modalita", "residuo", "tipo"]);
    expect(colonneExportDaTabella(["sconosciuta"])).toEqual(colonneDiSerie("xlsx"));
    expect(colonneExportDaTabella(undefined)).toHaveLength(10);
    expect(colonneValide(["importo", "importo", "boh", "data"], "xlsx")).toEqual(["importo", "data"]);
    expect(colonneValide([], "pdf")).not.toContain("tipo");
  });

  it("csv: solo le colonne scelte, nell'ordine scelto", () => {
    const r = costruisciRighe(dati());
    const righe = righeCsv(r, ["importo", "controparte"]);
    // «Tipo» si aggiunge in coda: gli importi sono positivi e senza lui non si capisce il verso.
    expect(Object.keys(righe[0])).toEqual(["importo", "controparte", "tipo"]);
    expect(righe[0]).toMatchObject({ importo: "1234,5", controparte: "BETA SRL" });
    expect(intestazioniCsv(["importo", "controparte"])).toEqual([{ key: "importo", label: "Importo" }, { key: "controparte", label: "Fornitore / Cliente" }, { key: "tipo", label: "Tipo" }]);
    expect(Object.keys(righeCsv(r, ["tipo", "importo"])[0])).toEqual(["tipo", "importo"]);
    expect(Object.keys(righeCsv(r)[0])).toHaveLength(10);
  });

  it("xlsx: cinque colonne in un altro ordine, con i totali giusti e il Tipo nascosto", async () => {
    const ws = await carica(["controparte", "importo", "data", "stato", "residuo"]);
    const h = ws.getRow(RIGA_INTESTAZIONE_XLSX);
    expect([1, 2, 3, 4, 5].map((i) => h.getCell(i).value)).toEqual(["Fornitore / Cliente", "Importo", "Scadenza", "Stato", "Residuo"]);
    const p = RIGA_INTESTAZIONE_XLSX + 1;
    expect(ws.getRow(p).getCell(1).value).toBe("ALFA SPA");
    expect(ws.getRow(p).getCell(2).value).toBe(800);
    expect(ws.getRow(p).getCell(3).value).toBeInstanceOf(Date);
    const nTipo = [6, 7, 8].find((i) => h.getCell(i).value === "Tipo")!;
    expect(nTipo).toBeDefined();
    expect(ws.getColumn(nTipo).hidden).toBe(true);
    expect(ws.getRow(p + 1).getCell(nTipo).value).toBe("Incasso");
    const inc = ws.getRow(p + 4 + 1), pag = ws.getRow(p + 4 + 2);
    expect(inc.getCell(1).value).toBe("Totale incassi (righe visibili)");
    const f = inc.getCell(2).value as { formula: string; result: number };
    expect(f.result).toBe(5000);
    expect(f.formula).toContain(`${ws.getColumn(nTipo).letter}$${p}`);
    expect((pag.getCell(2).value as { result: number }).result).toBe(2084.5);
    expect((pag.getCell(5).value as { result: number }).result).toBe(1784.5);
    expect(ws.autoFilter).toBeTruthy();
  });

  it("xlsx: con Tipo scelto non aggiunge colonne nascoste; senza Importo né Residuo niente totali", async () => {
    const conTipo = await carica(["tipo", "importo"]);
    const p = RIGA_INTESTAZIONE_XLSX + 1;
    expect(conTipo.getColumn(3).hidden).toBeFalsy();
    expect((conTipo.getRow(p + 4 + 1).getCell(2).value as { formula: string }).formula).toContain("A$" + p);
    const senza = await carica(["controparte", "stato"]);
    expect(senza.getRow(p + 5).getCell(1).value).toBeNull();
    expect(senza.getRow(p + 5).getCell(2).value).toBeNull();
    expect(senza.getRow(p + 4).getCell(1).value).toBeNull();
  });

  it("«Note»: spenta di serie, si accende a mano e finisce nell'xlsx e nel CSV", async () => {
    for (const f of ["xlsx", "pdf", "csv"] as const) expect(colonneDiSerie(f)).not.toContain("note");
    expect(colonneExportDaTabella(["scadenza", "importo"])).not.toContain("note");
    expect(Object.keys(righeCsv(costruisciRighe(dati()))[0])).not.toContain("note");
    const con = dati(); (con[0] as unknown as { note_export: string }).note_export = "Fatt. 101: da verificare | =SUM(1)";
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await generaXlsx(costruisciRighe(con), meta, ["controparte", "note"]));
    const ws = wb.getWorksheet("Scadenzario")!;
    expect(ws.getRow(RIGA_INTESTAZIONE_XLSX).getCell(2).value).toBe("Note");
    const celle = [1, 2, 3, 4].map((i) => String(ws.getRow(RIGA_INTESTAZIONE_XLSX + i).getCell(2).value ?? ""));
    expect(celle).toContain("Fatt. 101: da verificare | =SUM(1)".replace(/^=/, "'="));
  });

  it("xlsx: solo importi, l'etichetta dei totali va in una colonna in più", async () => {
    const ws = await carica(["importo", "residuo"]);
    const p = RIGA_INTESTAZIONE_XLSX + 1;
    expect(ws.getRow(p + 4 + 1).getCell(3).value).toBe("Totale incassi (righe visibili)");
    expect((ws.getRow(p + 4 + 1).getCell(1).value as { result: number }).result).toBe(5000);
  });

  it("pdf: poche colonne, una sola, o senza importi: genera comunque (esempio nello scratchpad)", async () => {
    const r = costruisciRighe(dati());
    const m = { ...meta, periodo: "01/10/2026 – 30/11/2026", filtri: ["Solo uscite"] };
    const scelte = ["data", "controparte", "numero", "importo", "stato"];
    const cinque = await generaPdf(r, m, scelte);
    mkdirSync(SCRATCH, { recursive: true });
    writeFileSync(`${SCRATCH}/scadenzario_cinque_colonne.pdf`, Buffer.from(cinque));
    writeFileSync(`${SCRATCH}/scadenzario_cinque_colonne.xlsx`, Buffer.from(await generaXlsx(r, m, scelte)));
    for (const c of [["controparte"], ["stato", "data"], ["importo", "residuo"], ["residuo", "tipo", "data"], undefined]) {
      expect(Buffer.from(await generaPdf(r, m, c)).subarray(0, 5).toString()).toBe("%PDF-");
    }
    expect(cinque.byteLength).toBeGreaterThan(1000);
  }, 60000);
});

describe("nome file del periodo", () => {
  it("anno intero, un mese, più mesi", () => {
    expect(pezzoNomeFile("Edilmateriali Roma S.r.l.")).toBe("edilmateriali-roma-s-r-l");
    expect(pezzoNomeFile("Società Edile Città")).toBe("societa-edile-citta");
    expect(pezzoNomeFile(null)).toBe("");
    expect(periodoNomeFile({ from: "2026-01-01", to: "2026-12-31" }, "2026")).toBe("2026");
    expect(periodoNomeFile(null, "2026")).toBe("2026");
    expect(periodoNomeFile({ from: "2026-03-01", to: "2026-03-31" }, "2026")).toBe("2026-03");
    expect(periodoNomeFile({ from: "2026-03-05", to: "2026-06-30" }, "2026")).toBe("2026-03-05_2026-06-30");
  });
});
