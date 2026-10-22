import { describe, expect, it } from "vitest";
import {
  classificaManuale,
  classificaPrevisto,
  classificaRegistrato,
  normalizzaCategoria,
  VOCI_CASSA,
} from "@/lib/controlloGestione/vociCassa";
import {
  costruisciRendiconto,
  dettagliCella,
  rateMutui,
  righeEsportazione,
  type MovimentoRegistrato,
} from "@/lib/controlloGestione/rendicontoCassa";
import { recordedCashFlow } from "@/lib/controlloGestione/recordedCashFlow";
import type { ForecastMovement } from "@/lib/finance/forecastLedger";

const OGGI = "2026-10-22";
const ipotesi = { includeOverdueIncome: false, includeOverdueExpense: false, includeEstimates: true };

describe("mappa categoria → voce", () => {
  it("normalizza maiuscole, spazi e accenti", () => {
    expect(normalizzaCategoria("Incassi fatture")).toBe("incassi_fatture");
    expect(normalizzaCategoria(" Pubblicità ")).toBe("pubblicita");
    expect(normalizzaCategoria("Materiali e forniture")).toBe("materiali_e_forniture");
  });

  it("legge la categoria della prima nota e, se dice «altro», quella della spesa collegata", () => {
    const u = (category: string | null, costCategory: string | null = null, extra = {}) =>
      classificaRegistrato({ direction: "uscita", category, costCategory, ...extra }).voce;
    expect(u("subappalti")).toBe("usc_subappalti");
    expect(u("stipendi")).toBe("usc_personale");
    expect(u("altro", "INPS")).toBe("usc_contributi");
    expect(u("altro", "trasporti_noleggi")).toBe("usc_mezzi");
    expect(u("altro", "commercialista")).toBe("usc_consulenze");
    expect(u("altro", "leasing")).toBe("fin_leasing");
    expect(u("altro", "interessi")).toBe("fin_mutui_interessi");
    expect(u("Costi Aziendali", "Utenze")).toBe("usc_generali");
    expect(u("Attrezzature")).toBe("inv_cespiti");
    expect(u("giroconto")).toBe("usc_giroconti");
    // «pagamento_fornitore» cede il passo alla spesa che dice cosa si è pagato.
    expect(u("pagamento_fornitore", "materiali")).toBe("usc_materiali");
    expect(u("pagamento_fornitore", "affitti")).toBe("usc_generali");
    expect(u("pagamento_fornitore", null)).toBe("usc_materiali");
    // Senza categoria ma pagato a un fornitore: materiali, non «altro».
    expect(u("altro", null, { supplierId: "s1" })).toBe("usc_materiali");
  });

  it("mette in «Altre uscite» / «Altri incassi» ciò che non riconosce, e lo dice", () => {
    expect(classificaRegistrato({ direction: "uscita", category: "boh" })).toEqual({ voce: "usc_altre", nonClassificato: true });
    expect(classificaRegistrato({ direction: "entrata", category: "regalo" })).toEqual({ voce: "inc_altri", nonClassificato: true });
  });

  it("riconosce gli incassi: fatture, acconti dalle rate, giroconti, finanziamenti", () => {
    const e = (category: string | null, extra = {}) => classificaRegistrato({ direction: "entrata", category, ...extra }).voce;
    expect(e("Incassi fatture")).toBe("inc_clienti");
    expect(e("incasso", { installmentType: "deposit" })).toBe("inc_acconti");
    expect(e("giroconto")).toBe("inc_giroconti");
    expect(e("finanziamento")).toBe("fin_entrate");
    expect(e(null, { invoiceId: "f1" })).toBe("inc_clienti");
  });

  it("classifica i movimenti del Previsionale con le sue categorie", () => {
    const m = (p: Partial<ForecastMovement>) =>
      classificaPrevisto({ category: "altri", direction: "out", source: "", description: "", sourceCategory: null, ...p }).voce;
    expect(m({ category: "clienti", direction: "in" })).toBe("inc_clienti");
    expect(m({ category: "clienti", direction: "in", sourceCategory: "deposit" })).toBe("inc_acconti");
    expect(m({ category: "blocca-prezzo", direction: "in" })).toBe("inc_incentivi");
    expect(m({ category: "blocca-prezzo" })).toBe("usc_blocca_prezzo");
    expect(m({ category: "fornitori" })).toBe("usc_materiali");
    expect(m({ category: "squadre" })).toBe("usc_subappalti");
    expect(m({ category: "personale" })).toBe("usc_personale");
    expect(m({ category: "provvigioni" })).toBe("usc_provvigioni");
    expect(m({ category: "fisco", source: "Stima IVA" })).toBe("usc_iva");
    expect(m({ category: "fisco", source: "F24 registrato", description: "IVA mensile" })).toBe("usc_iva");
    expect(m({ category: "fisco", source: "F24 registrato", description: "Ritenute dipendenti" })).toBe("usc_contributi");
    expect(m({ sourceCategory: "affitti" })).toBe("usc_generali");
    expect(m({ category: "fornitori", sourceCategory: "subappalti" })).toBe("usc_subappalti");
    expect(classificaPrevisto({ category: "altri", direction: "out", source: "", description: "", sourceCategory: null }).nonClassificato).toBe(true);
  });

  it("le voci manuali restano voci manuali, nel gruppo giusto", () => {
    expect(classificaManuale("Anticipo socio", "entrata")).toBe("fin_manuali");
    expect(classificaManuale("Mutuo", "uscita")).toBe("fin_manuali");
    expect(classificaManuale("F24", "uscita")).toBe("usc_manuali");
    expect(classificaManuale("SAL", "entrata")).toBe("inc_manuali");
  });

  it("Demo 2: nessun movimento registrato del 2026 finisce in «altro»", () => {
    // Combinazioni reali (categoria prima nota, categoria spesa, fornitore, collegato a fattura) lette
    // dal database il 22/10/2026, con il numero di movimenti.
    const combinazioni: [string, string, string | null, boolean, boolean, number][] = [
      ["entrata", "Incassi fatture", null, false, true, 182],
      ["entrata", "giroconto", null, false, false, 9],
      ["entrata", "incasso", null, false, false, 1],
      ["uscita", "pagamento_fornitore", "materiali", true, false, 40],
      ["uscita", "subappalti", "subappalti", false, false, 20],
      ["uscita", "subappalti", "subappalti", true, false, 2],
      ["uscita", "stipendi", "stipendi", false, false, 13],
      ["uscita", "altro", "stipendi", false, false, 25],
      ["uscita", "altro", "INPS", false, false, 17],
      ["uscita", "altro", "trasporti_noleggi", false, false, 44],
      ["uscita", "altro", "utenze", true, false, 9],
      ["uscita", "altro", "telefonia", true, false, 9],
      ["uscita", "altro", "cancelleria", true, false, 9],
      ["uscita", "altro", "commercialista", true, false, 9],
      ["uscita", "altro", "consulenza_lavoro", true, false, 9],
      ["uscita", "altro", "struttura_servizi", true, false, 9],
      ["uscita", "altro", "marketing", true, false, 9],
      ["uscita", "altro", "affitti", true, false, 9],
      ["uscita", "altro", "software", true, false, 8],
      ["uscita", "altro", "leasing", true, false, 9],
      ["uscita", "altro", "assicurazioni", false, false, 9],
      ["uscita", "altro", "manutenzione", true, false, 11],
      ["uscita", "giroconto", null, false, false, 9],
      ["uscita", "materiali", "materiali", true, false, 3],
      ["uscita", "trasporti_noleggi", "trasporti_noleggi", true, false, 3],
      ["uscita", "merci", "merci", true, false, 1],
      ["uscita", "manutenzione", "manutenzione", true, false, 1],
      ["uscita", "software", "software", true, false, 1],
      ["uscita", "carburante", "carburante", true, false, 1],
      ["uscita", "commercialista", "commercialista", true, false, 1],
      ["uscita", "Costi Aziendali", "Utenze", true, false, 1],
      ["uscita", "trasferte", "trasferte", true, false, 1],
      ["uscita", "affitti", "affitti", true, false, 1],
      ["uscita", "pubblicita", "pubblicita", true, false, 1],
    ];
    const altro = combinazioni
      .filter(([direction, category, costCategory, sup, linked]) =>
        classificaRegistrato({ direction, category, costCategory, supplierId: sup ? "s" : null, invoiceId: linked ? "f" : null }).nonClassificato,
      )
      .reduce((s, c) => s + c[5], 0);
    expect(altro).toBe(0);
    // Categorie delle spese ancora da pagare (e ricorrenti) della Demo 2: nessuna in «Altre uscite».
    for (const c of ["materiali", "subappalti", "Veicoli", "Servizi", "Telefonia", "Professionisti", "Immobili", "Assicurazioni", "Software", "Utenze", "rifiuti", "TFR", "f24", "Attrezzature", "imu"])
      expect(classificaPrevisto({ category: "altri", direction: "out", source: "Spesa registrata", description: "", sourceCategory: c }).nonClassificato, c).toBe(false);
  });
});

const reg = (id: string, direction: "entrata" | "uscita", amount: number, entry_date: string, category: string, extra: Partial<MovimentoRegistrato> = {}): MovimentoRegistrato =>
  ({ id, direction, amount, entry_date, category, ...extra });
const prev = (id: string, direction: "in" | "out", cents: number, date: string | null, extra: Partial<ForecastMovement> = {}): ForecastMovement => ({
  id,
  description: id,
  counterparty: "",
  category: direction === "in" ? "clienti" : "fornitori",
  direction,
  cents,
  date,
  source: "Test",
  href: "/x",
  estimated: false,
  ...extra,
});

describe("rendiconto: consuntivo + previsione", () => {
  const registrati = [
    reg("a", "entrata", 1000, "2026-01-15", "Incassi fatture"),
    reg("b", "uscita", 400, "2026-01-20", "altro", { costCategory: "INPS" }),
    reg("c", "uscita", 300, "2026-03-02", "subappalti"),
    reg("d", "entrata", 200, "2026-10-05", "Incassi fatture"),
    reg("e", "uscita", 50, "2026-10-21", "giroconto"),
    reg("f", "entrata", 50, "2026-10-21", "giroconto"),
    reg("x", "uscita", -5, "2026-02-01", "altro"),
  ];
  const previsti = [
    prev("rata-ott", "in", 70000, "2026-10-30"),
    prev("forn-nov", "out", 25000, "2026-11-10"),
    prev("scaduto", "in", 999900, "2026-09-01"),
    prev("stima", "out", 10000, "2026-12-01", { estimated: true, category: "personale" }),
  ];
  const base = {
    anno: 2026,
    today: OGGI,
    saldoOggiCents: 500000,
    saldoFonte: "banca" as const,
    registrati,
    previsti,
    ipotesi,
  };

  it("mesi passati a consuntivo, ottobre in corso, poi previsione", () => {
    const r = costruisciRendiconto(base);
    expect(r.colonne.map((c) => c.tipo)).toEqual([
      ...Array(9).fill("consuntivo"),
      "in-corso",
      "previsione",
      "previsione",
    ]);
  });

  it("i totali registrati per mese sono quelli della prima nota (stessa regola di recordedCashFlow)", () => {
    const r = costruisciRendiconto(base);
    const atteso = recordedCashFlow(registrati.map((x) => ({ ...x, amount: x.amount as number })), 2026);
    expect(r.entrateRegistrate.map((c) => c / 100)).toEqual(atteso.months.map((m) => m.income));
    expect(r.usciteRegistrate.map((c) => c / 100)).toEqual(atteso.months.map((m) => m.expense));
    expect(r.registratiScartati).toBe(1);
    // Gennaio: 1.000 incassati, 400 di contributi.
    expect(r.righe.inc_clienti[0]).toBe(100000);
    expect(r.righe.usc_contributi[0]).toBe(-40000);
  });

  it("ottobre somma registrato fino a oggi e previsto da oggi", () => {
    const r = costruisciRendiconto(base);
    expect(r.righe.inc_clienti[9]).toBe(20000 + 70000);
    expect(r.righe.inc_giroconti[9]).toBe(5000);
    expect(r.righe.usc_giroconti[9]).toBe(-5000);
    expect(dettagliCella(r, ["inc_clienti"], 10).map((d) => d.tipo)).toEqual(["registrato", "previsto"]);
  });

  it("i saldi si concatenano: fine = inizio + flusso netto, e il saldo di oggi torna", () => {
    const r = costruisciRendiconto(base);
    for (let i = 0; i < 12; i++) {
      expect(r.saldoFine[i]).toBe((r.saldoInizio[i] as number) + r.flussoNetto[i]);
      if (i > 0) expect(r.saldoInizio[i]).toBe(r.saldoFine[i - 1]);
    }
    // Inizio anno = saldo di oggi meno il registrato dell'anno (1000-400-300+200-50+50 = 500 €).
    expect(r.saldoInizio[0]).toBe(500000 - 50000);
    // A fine ottobre: saldo di oggi + il previsto rimasto di ottobre.
    expect(r.saldoFine[9]).toBe(500000 + 70000);
    expect(r.saldo.ricostruito).toBe(true);
    expect(r.flussoNetto[0]).toBe(r.flussoOperativo[0] + r.gruppi.investimenti[0] + r.gruppi.finanziamenti[0]);
  });

  it("gli scaduti restano fuori finché non si accende l'interruttore; le stime si possono spegnere", () => {
    const fuori = costruisciRendiconto(base);
    expect(fuori.esclusi.incassiScaduti).toEqual({ numero: 1, cents: 999900 });
    const dentro = costruisciRendiconto({ ...base, ipotesi: { ...ipotesi, includeOverdueIncome: true } });
    // L'incasso scaduto cade oggi, come nel Previsionale.
    expect(dentro.righe.inc_clienti[9]).toBe(fuori.righe.inc_clienti[9] + 999900);
    const senzaStime = costruisciRendiconto({ ...base, ipotesi: { ...ipotesi, includeEstimates: false } });
    expect(senzaStime.righe.usc_personale[11]).toBe(0);
    expect(senzaStime.esclusi.stime.numero).toBe(1);
  });

  it("il punto più basso viene dalla proiezione giornaliera del Previsionale", () => {
    const r = costruisciRendiconto(base);
    expect(r.kpi.minimo).toEqual({ cents: 500000, data: OGGI, giornaliero: true });
    expect(r.kpi.saldoFineAnno).toBe(500000 + 70000 - 25000 - 10000);
  });

  it("senza saldo dei conti i saldi sono «—» e lo spiega", () => {
    const r = costruisciRendiconto({ ...base, saldoOggiCents: null });
    expect(r.saldoInizio.every((s) => s === null)).toBe(true);
    expect(r.saldo.avviso).toMatch(/Tesoreria/);
    expect(r.righe.inc_clienti[0]).toBe(100000);
  });

  it("un anno passato è tutto consuntivo, con il saldo ricostruito dai movimenti dopo l'anno", () => {
    const r = costruisciRendiconto({
      ...base,
      anno: 2025,
      registrati: [reg("p", "entrata", 300, "2025-06-01", "Incassi fatture")],
      flussoDopoAnnoCents: 20000,
      previsti: previsti,
    });
    expect(r.colonne.every((c) => c.tipo === "consuntivo")).toBe(true);
    expect(r.saldoFine[11]).toBe(500000 - 20000);
    expect(r.saldoInizio[0]).toBe(500000 - 20000 - 30000);
    expect(r.righe.inc_clienti.reduce((a, b) => a + b, 0)).toBe(30000);
    expect(r.kpi.minimo?.giornaliero).toBe(false);
    const ignoto = costruisciRendiconto({ ...base, anno: 2025, registrati: [], flussoDopoAnnoCents: null });
    expect(ignoto.saldoFine[11]).toBeNull();
  });

  it("mutui e voci manuali entrano nei finanziamenti", () => {
    const r = costruisciRendiconto({
      ...base,
      mutui: [{ id: "m1", banca: "Banca", descrizione: "Mutuo", capitale_residuo: 120000, tasso_pct: 6, rata_mensile: 2000, data_inizio: "2024-01-01", data_fine: "2034-01-01" }],
      manuali: [{ id: "v1", anno: 2026, mese: 11, tipo: "entrata", categoria: "Anticipo socio", descrizione: "Versamento soci", importo: 5000, ricorrente: false }],
    });
    // Ottobre: la rata dell'1 è già passata. Novembre: interessi 120.000 × 6% / 12 = 600 €.
    expect(r.righe.fin_mutui_interessi[9]).toBe(0);
    expect(r.righe.fin_mutui_interessi[10]).toBe(-60000);
    expect(r.righe.fin_mutui_capitale[10]).toBe(-140000);
    expect(r.righe.fin_manuali[10]).toBe(500000);
    expect(r.gruppi.finanziamenti[10]).toBe(500000 - 200000);
  });

  it("le rate del mutuo si fermano a fine debito", () => {
    const rate = rateMutui([{ id: "m", capitale_residuo: 1500, tasso_pct: 0, rata_mensile: 1000 }], OGGI, "2027-12-31");
    expect(rate.map((m) => m.cents)).toEqual([100000, 50000]);
  });

  it("l'Excel ha tutte le righe: saldi, gruppi, flussi", () => {
    const righe = righeEsportazione(costruisciRendiconto(base));
    const voci = righe.map((r) => r.voce.trim());
    expect(voci[0]).toBe("Saldo di cassa a inizio mese");
    expect(voci).toContain("FLUSSO DELLA GESTIONE OPERATIVA");
    expect(voci.at(-1)).toBe("SALDO DI CASSA A FINE MESE");
    expect(righe.find((r) => r.voce.trim() === "Totale incassi")?.valori[0]).toBe(1000);
    // Le voci fisse ci sono tutte, anche a zero.
    for (const v of VOCI_CASSA.filter((x) => x.sempre)) expect(voci).toContain(v.label);
  });
});
