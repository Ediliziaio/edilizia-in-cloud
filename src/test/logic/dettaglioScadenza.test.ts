import { describe, expect, it } from "vitest";
import { notaLeggibile, tempoScadenza } from "@/lib/finance/dettaglioScadenza";

const base = { direction: "entrata" as const, amount: 100, paid_amount: 0, paid_date: null as string | null, status: "da_pagare" };

describe("i tempi di una scadenza, in parole", () => {
  it("aperta: scaduta, oggi, tra pochi giorni, più avanti", () => {
    expect(tempoScadenza({ ...base, due_date: "2026-11-04" }, "2026-11-16")).toEqual({ testo: "Scaduta da 12 giorni", tono: "cattivo" });
    expect(tempoScadenza({ ...base, due_date: "2026-11-16" }, "2026-11-16").testo).toBe("Scade oggi");
    expect(tempoScadenza({ ...base, due_date: "2026-11-17" }, "2026-11-16")).toEqual({ testo: "Scade tra 1 giorno", tono: "attenzione" });
    expect(tempoScadenza({ ...base, due_date: "2026-12-31" }, "2026-11-16").tono).toBe("neutro");
  });
  it("saldata: quanto prima o dopo la scadenza", () => {
    const pagata = { ...base, status: "pagata", paid_amount: 100 };
    expect(tempoScadenza({ ...pagata, due_date: "2026-01-02", paid_date: "2026-01-07" }).testo).toBe("Incassata 5 giorni dopo la scadenza");
    expect(tempoScadenza({ ...pagata, due_date: "2026-01-02", paid_date: "2026-01-02" }).testo).toBe("Incassata il giorno della scadenza");
    expect(tempoScadenza({ ...pagata, direction: "uscita", due_date: "2026-01-10", paid_date: "2026-01-08" }).testo).toBe("Pagata 2 giorni prima della scadenza");
  });
});

describe("nota senza etichette tecniche", () => {
  it("toglie [DOC:uuid] e lascia il resto", () => {
    expect(notaLeggibile("[DOC:47f15b07-7341-4e8e-ac6d-48334a4d5b81] Pagata in contanti")).toBe("Pagata in contanti");
    expect(notaLeggibile(null)).toBe("");
  });
});
