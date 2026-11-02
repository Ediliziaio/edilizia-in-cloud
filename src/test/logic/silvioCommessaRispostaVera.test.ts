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
});
