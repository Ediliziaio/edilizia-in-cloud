/**
 * Vocabolario unico degli stati preventivo. Il 2026-09-02 in produzione TUTTI
 * i preventivi erano al maschile ("accettato") mentre il flusso applicativo
 * ragiona al femminile ("accettata"): bottoni spariti, cron e reminder a vuoto.
 * La mappa qui deve restare identica a public.normalizza_stato_preventivo.
 */
import { describe, it, expect } from "vitest";
import {
  STATI_PREVENTIVO,
  isStatoPreventivoCanonico,
  normalizzaStatoPreventivo,
} from "../../../supabase/functions/_shared/statoPreventivo";

describe("normalizzaStatoPreventivo", () => {
  it("riporta il maschile dei seed e di Silvio al canonico", () => {
    expect(normalizzaStatoPreventivo("inviato")).toBe("inviata");
    expect(normalizzaStatoPreventivo("accettato")).toBe("accettata");
    expect(normalizzaStatoPreventivo("rifiutato")).toBe("rifiutata");
    expect(normalizzaStatoPreventivo("scaduto")).toBe("scaduta");
    expect(normalizzaStatoPreventivo("visto")).toBe("inviata");
    expect(normalizzaStatoPreventivo("firmato")).toBe("accettata");
  });

  it("accetta inglese, maiuscole e spazi", () => {
    expect(normalizzaStatoPreventivo(" Sent ")).toBe("inviata");
    expect(normalizzaStatoPreventivo("ACCEPTED")).toBe("accettata");
    expect(normalizzaStatoPreventivo("won")).toBe("accettata");
    expect(normalizzaStatoPreventivo("expired")).toBe("scaduta");
    expect(normalizzaStatoPreventivo("cancelled")).toBe("annullata");
  });

  it("lascia intatto il canonico e non inventa nulla per gli sconosciuti", () => {
    for (const stato of STATI_PREVENTIVO) expect(normalizzaStatoPreventivo(stato)).toBe(stato);
    expect(normalizzaStatoPreventivo("in_revisione")).toBe("in_revisione");
    expect(normalizzaStatoPreventivo(null)).toBe("");
    expect(isStatoPreventivoCanonico("accettata")).toBe(true);
    expect(isStatoPreventivoCanonico("accettato")).toBe(false);
  });
});
