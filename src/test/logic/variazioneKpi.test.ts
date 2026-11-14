// Le frasi della variazione sotto le schede dei report (venditori e call center), 14/11/2026.
import { describe, expect, it } from "vitest";
import { variazionePercento, variazionePunti } from "@/lib/reporting/variazioneKpi";

describe("Variazione delle schede dei report", () => {
  it("i tassi in punti, verdi se salgono", () => {
    expect(variazionePunti(45.5, 40)).toEqual({ testo: "▲ +5,5 pt vs periodo precedente", buona: true });
    expect(variazionePunti(30, 40)).toEqual({ testo: "▼ -10 pt vs periodo precedente", buona: false });
    expect(variazionePunti(40, 40)).toEqual({ testo: "= periodo precedente", buona: null });
  });

  it("tempi e tentativi: scendere è il buono", () => {
    // Speed to lead da 12 a 9 minuti: −25%, verde.
    expect(variazionePercento(9, 12, true)).toEqual({ testo: "▼ -25% vs periodo precedente", buona: true });
  });

  it("senza il periodo prima niente frase; da zero è «nuovo»", () => {
    expect(variazionePercento(5, null)).toBeNull();
    expect(variazionePercento(5, 0)).toEqual({ testo: "nuovo rispetto al periodo precedente", buona: true });
  });
});
