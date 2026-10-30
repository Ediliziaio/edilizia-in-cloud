/**
 * Gli avvisi di controllo che le funzioni di lettura allegano alla risposta
 * (`controlli.warnings`) diventano righe da mostrare: solo ciò che merita
 * l'occhio di chi conferma, prima gli errori, senza fidarsi della forma.
 */
import { describe, expect, it } from "vitest";
import { avvisiDaMostrare, righeAvvisiLettura } from "@/lib/documenti/avvisiLettura";

const w = (severity: string, message: string, extra: Record<string, unknown> = {}) => ({ code: "x", severity, message, ...extra });

describe("avvisiDaMostrare", () => {
  it("scarta gli informativi e mette prima gli errori, poi gli avvisi, nell'ordine di arrivo", () => {
    const controlli = { warnings: [w("warn", "A"), w("info", "I"), w("error", "E"), w("warn", "B")] };
    expect(avvisiDaMostrare(controlli).map((a) => a.message)).toEqual(["E", "A", "B"]);
  });
  it("taglia al massimo richiesto, tenendo i più gravi", () => {
    const controlli = { warnings: [w("warn", "1"), w("warn", "2"), w("error", "3"), w("warn", "4")] };
    expect(avvisiDaMostrare(controlli, 2).map((a) => a.message)).toEqual(["3", "1"]);
  });
  it("ignora ciò che non ha la forma di un avviso", () => {
    const controlli = { warnings: [null, "testo", 5, {}, w("warn", ""), w("warn", "   "), w("grave", "gravità sconosciuta"), { message: "senza gravità" }, w("warn", "buono")] };
    expect(avvisiDaMostrare(controlli).map((a) => a.message)).toEqual(["buono"]);
  });
  it("risposte senza controlli o fatte male non rompono niente", () => {
    for (const v of [undefined, null, "boh", 7, {}, { warnings: "no" }, { warnings: null }, []]) {
      expect(avvisiDaMostrare(v)).toEqual([]);
    }
  });
});

describe("righeAvvisiLettura", () => {
  it("un simbolo per gravità e il messaggio senza spazi attorno", () => {
    const controlli = { warnings: [w("error", "  Totale 1300,00 ≠ imponibile + IVA 1220,00 "), w("warn", "Data nel futuro")] };
    expect(righeAvvisiLettura(controlli)).toEqual(["⛔ Totale 1300,00 ≠ imponibile + IVA 1220,00", "⚠️ Data nel futuro"]);
  });
  it("niente da dire → nessuna riga", () => {
    expect(righeAvvisiLettura({ warnings: [w("info", "solo informazione")] })).toEqual([]);
    expect(righeAvvisiLettura(undefined)).toEqual([]);
  });
});
