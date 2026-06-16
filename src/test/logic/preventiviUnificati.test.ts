import { describe, it, expect } from "vitest";
import {
  mapClassicoStato,
  mapSerramentiStato,
  mapFotovoltaicoStato,
  type UnifiedStato,
} from "@/lib/preventivi/statoUnificato";

/**
 * Questi test bloccano il contratto delle mappature di stato cross-modulo.
 * La vista DB `v_preventivi_unificati` (migration 20270915000000) rispecchia
 * ESATTAMENTE queste tabelle nelle sue espressioni CASE: se una di queste
 * asserzioni cambia, va aggiornata anche la vista (e viceversa).
 */

const VALID: UnifiedStato[] = ["bozza", "in_corso", "vinto", "perso", "altro"];

describe("preventivi unificati — mapClassicoStato (quotes.status)", () => {
  const cases: Array<[string, UnifiedStato]> = [
    ["bozza", "bozza"],
    ["draft", "bozza"],
    ["inviata", "in_corso"],
    ["sent", "in_corso"],
    ["viewed", "in_corso"],
    ["visualizzata", "in_corso"],
    ["pending", "in_corso"],
    ["accettata", "vinto"],
    ["accepted", "vinto"],
    ["firmata", "vinto"],
    ["signed", "vinto"],
    ["convertita", "vinto"],
    ["rifiutata", "perso"],
    ["rejected", "perso"],
    ["scaduta", "perso"],
    ["expired", "perso"],
  ];
  it.each(cases)("status '%s' → %s", (input, expected) => {
    expect(mapClassicoStato(input)).toBe(expected);
  });
  it("valore sconosciuto/null → altro", () => {
    expect(mapClassicoStato("qualcosa")).toBe("altro");
    expect(mapClassicoStato(null)).toBe("altro");
    expect(mapClassicoStato(undefined)).toBe("altro");
  });
});

describe("preventivi unificati — mapSerramentiStato (sr_progetti.stato)", () => {
  const cases: Array<[string, UnifiedStato]> = [
    ["bozza", "bozza"],
    ["da_consegnare", "in_corso"],
    ["consegnato", "in_corso"],
    ["in_valutazione", "in_corso"],
    ["accettato", "vinto"],
    ["rifiutato", "perso"],
    ["scaduto", "perso"],
  ];
  it.each(cases)("stato '%s' → %s", (input, expected) => {
    expect(mapSerramentiStato(input)).toBe(expected);
  });
  it("valore sconosciuto/null → altro", () => {
    expect(mapSerramentiStato("archiviato")).toBe("altro");
    expect(mapSerramentiStato(null)).toBe("altro");
  });
});

describe("preventivi unificati — mapFotovoltaicoStato (fv_progetti.stato)", () => {
  const cases: Array<[string, UnifiedStato]> = [
    ["bozza", "bozza"],
    ["configurato", "in_corso"],
    ["emesso", "in_corso"],
    ["firmato", "vinto"],
    ["annullato", "perso"],
  ];
  it.each(cases)("stato '%s' → %s", (input, expected) => {
    expect(mapFotovoltaicoStato(input)).toBe(expected);
  });
  it("valore sconosciuto/null → altro", () => {
    expect(mapFotovoltaicoStato("boh")).toBe("altro");
    expect(mapFotovoltaicoStato(null)).toBe("altro");
  });
});

describe("preventivi unificati — invarianti", () => {
  it("ogni mapper ritorna sempre uno dei 5 stati validi", () => {
    const samples = [null, undefined, "", "x", "bozza", "firmato", "accettata", "scaduto"];
    for (const s of samples) {
      expect(VALID).toContain(mapClassicoStato(s));
      expect(VALID).toContain(mapSerramentiStato(s));
      expect(VALID).toContain(mapFotovoltaicoStato(s));
    }
  });
});
