/**
 * La risposta del modello vero (2/11/2026, primo contratto letto online): `null` per quello che
 * non c'è, elenchi e date senza l'involucro `{ valore }`. Rate e fasi del contratto si perdevano.
 */
import { describe, expect, it } from "vitest";
import { frammentoDaRispostaAI } from "../../../shared/silvio-commessa/letturaAI.ts";

const TESTO = "--- Pagina 1 ---\nCorrispettivo a corpo: euro 48.000,00 oltre IVA 10%.\nPagamenti: 30% alla firma, 70% a fine lavori.\nPonteggio 3 giorni; Posa 6 giorni.";
const ctx = { fonte: { tipo: "contratto" as const, etichetta: "contratto.pdf" }, testo: TESTO };
const leggi = (aree: Record<string, unknown>) => frammentoDaRispostaAI({ aree }, ctx as never);

describe("la risposta del modello vero", () => {
  it("elenchi nudi: rate e fasi entrano, senza avvisi tecnici", () => {
    const f = leggi({
      economia: { "economia.total_amount": { valore: 48000, dove: "pagina 1", citazione: "euro 48.000,00", fiducia: 0.9 }, "economia.vat_rate": { valore: 10, dove: "pagina 1", citazione: "IVA 10%", fiducia: 0.9 } },
      pagamenti: { "pagamenti.rate": [{ label: "Alla firma", type: "deposit", percent: 30 }, { label: "Saldo", type: "balance", percent: 70 }] },
      fasi: { "fasi.order_work_phases": [{ name: "Ponteggio", giorni: 3 }, { name: "Posa", giorni: 6 }] },
    });
    expect(f.aree.pagamenti?.["pagamenti.rate"]?.valore).toHaveLength(2);
    expect(f.aree.fasi?.["fasi.order_work_phases"]?.valore).toHaveLength(2);
    expect(f.avvisi?.join(" ")).not.toMatch(/pagamenti\.rate|fasi\.order|valore/);
  });

  it("null e vuoti: non è un errore, il documento non ne parla", () => {
    const f = leggi({ fasi: { "fasi.work_end_date": null, "fasi.order_work_phases": [] }, pagamenti: { "pagamenti.rate": { valore: null } } });
    expect(f.avvisi ?? []).toEqual([]);
    expect(f.aree.fasi?.["fasi.work_end_date"]).toBeUndefined();
  });

  it("l'elenco dentro un oggetto con la citazione", () => {
    const f = leggi({ fasi: { "fasi.order_work_phases": { fasi: [{ name: "Ponteggio", giorni: 3 }], citazione: "Ponteggio 3 giorni", dove: "pagina 1" } } });
    expect(f.aree.fasi?.["fasi.order_work_phases"]?.valore).toHaveLength(1);
  });

  it("condizioni: i campi null non si dicono, e i nomi sono in italiano", () => {
    const f = leggi({ economia: { "economia.condizioni_contratto": { valore: { numero_contratto: { valore: "PROVA-1", dove: "pagina 1", citazione: "non c'è" }, durata_giorni: null, penale_giorno_eur: null, cig: "corto" } } } });
    const nota = String(f.aree.economia?.["economia.condizioni_contratto"]?.nota ?? "");
    expect(nota).not.toMatch(/durata|penale|numero_contratto|citazione/);
    expect(nota).toContain("numero del contratto");
    expect(nota).toContain("CIG");
  });

  it("rate calcolate dal modello sull'imponibile: valgono sul totale con l'IVA", () => {
    const f = leggi({
      economia: { "economia.total_amount": { valore: 48000, citazione: "euro 48.000,00" }, "economia.vat_rate": { valore: 10, citazione: "IVA 10%" } },
      pagamenti: { "pagamenti.rate": [{ label: "Firma", percent: 30, amount: 14400 }, { label: "Saldo", percent: 70, amount: 33600 }] },
    });
    const rate = f.aree.pagamenti?.["pagamenti.rate"]?.valore as { amount: number }[];
    expect(rate.map((r) => r.amount)).toEqual([15840, 36960]);
  });

  it("un importo scritto nel documento, diverso, resta", () => {
    const f = leggi({
      economia: { "economia.total_amount": { valore: 48000, citazione: "euro 48.000,00" }, "economia.vat_rate": { valore: 10, citazione: "IVA 10%" } },
      pagamenti: { "pagamenti.rate": [{ label: "Firma", percent: 30, amount: 16000 }] },
    });
    expect((f.aree.pagamenti?.["pagamenti.rate"]?.valore as { amount: number }[])[0].amount).toBe(16000);
  });

  it("date vuote: nessun avviso «data non valida»", () => {
    const f = leggi({ fasi: { "fasi.work_end_date": { valore: "", citazione: "" } } });
    expect(f.avvisi ?? []).toEqual([]);
  });

  it("0 e false senza citazione: il documento non ne parla, niente «subappalto non ammesso»", () => {
    const f = leggi({ economia: { "economia.condizioni_contratto": { valore: {
      numero_contratto: { valore: "PROVA-1", citazione: "PROVA-1" }, subappalto_ammesso: { valore: false, citazione: "" }, durata_giorni: 0, penale_giorno_eur: { valore: 0 },
    } } } });
    const v = f.aree.economia?.["economia.condizioni_contratto"]?.valore as Record<string, unknown>;
    expect(v.subappalto_ammesso).toBeUndefined();
    expect(v.durata_giorni).toBeUndefined();
    expect(v.penale_giorno_eur).toBeUndefined();
  });

  it("il cliente come oggetto nudo: il nome resta", () => {
    const f = leggi({ cliente: { "cliente.nome": { client_name: "Mario Verdi", client_company: null as string | null }, "cliente.contatto": { client_phone: "333 000 1122", client_email: "m@esempio.it" } } });
    expect((f.aree.cliente?.["cliente.nome"]?.valore as { client_name?: string }).client_name).toBe("Mario Verdi");
    expect(f.avvisi ?? []).toEqual([]);
  });

  it("«Inizio lavori» non è una fase", () => {
    const f = leggi({ fasi: { "fasi.order_work_phases": [{ name: "Inizio lavori", giorni: 14 }] } });
    expect(f.aree.fasi?.["fasi.order_work_phases"]).toBeUndefined();
  });

  describe("«più IVA» non si scorpora", () => {
    const conTesto = (testo: string, totale: number) => frammentoDaRispostaAI({ aree: {
      economia: { "economia.total_amount": { valore: totale, citazione: "12.000 euro piu IVA 10%", fiducia: 0.9 }, "economia.vat_rate": { valore: 10, citazione: "IVA 10%", fiducia: 0.9 } },
    } }, { fonte: { tipo: "testo" as const, etichetta: "testo" }, testo } as never);

    it("12.000 più IVA, il modello scrive 10.909,09: vale 12.000, da controllare", () => {
      const v = conTesto("Bagno a Monza, 12.000 euro piu IVA 10%, si parte lunedi", 10909.09).aree.economia?.["economia.total_amount"];
      expect(v?.valore).toBe(12000);
      expect(v?.stato).toBe("proposta");
    });

    it.each(["12.000 oltre IVA", "12.000 + IVA", "euro 12.000,00 IVA esclusa", "12mila euro piu IVA"])("«%s»", (frase) => {
      expect(conTesto(`Lavori: ${frase} al 10%`, 10909.09).aree.economia?.["economia.total_amount"]?.valore).toBe(12000);
    });

    it("«IVA inclusa»: lo scorporo resta", () => {
      expect(conTesto("Bagno, 12.000 euro IVA inclusa al 10%", 10909.09).aree.economia?.["economia.total_amount"]?.valore).toBe(10909.09);
    });

    it("la cifra giusta non si tocca", () => {
      expect(conTesto("Bagno, 12.000 euro piu IVA 10%", 12000).aree.economia?.["economia.total_amount"]?.valore).toBe(12000);
    });
  });

  it("contatti tutti vuoti: nessun avviso", () => {
    const f = leggi({ cliente: { "cliente.contatto": { client_phone: null as string | null, client_email: null as string | null } } });
    expect(f.avvisi ?? []).toEqual([]);
  });

  it("le rate sommano al totale al centesimo: l'ultima prende il resto", () => {
    const f = frammentoDaRispostaAI({ aree: {
      economia: { "economia.total_amount": { valore: 15000.5, citazione: "15.000,50" }, "economia.vat_rate": { valore: 10, citazione: "IVA 10%" } },
      pagamenti: { "pagamenti.rate": [{ label: "Firma", percent: 30 }, { label: "Saldo", percent: 70 }] },
    } }, { fonte: { tipo: "testo" as const, etichetta: "testo" }, testo: "15.000,50 piu IVA 10%" } as never);
    const rate = f.aree.pagamenti?.["pagamenti.rate"]?.valore as { amount: number }[];
    expect(rate.map((r) => r.amount)).toEqual([4950.17, 11550.38]);
  });

  it("un valore coi campi tutti vuoti non è un errore", () => {
    const vuoto = null as string | null;
    const f = leggi({ cliente: { "cliente.nome": { valore: { client_name: vuoto, client_company: vuoto } }, "cliente.contatto": { valore: { client_phone: "", client_email: vuoto } } } });
    expect(f.avvisi ?? []).toEqual([]);
  });
});
