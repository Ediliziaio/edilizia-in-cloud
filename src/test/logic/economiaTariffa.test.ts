import { describe, expect, it } from "vitest";
import {
  costoTariffaConosciuto,
  formatPrezzoUnitario,
  prezzoMinimoPerMargine,
  semaforoMargineTariffa,
} from "@/lib/tariffe/economiaTariffa";
import {
  costoLavorazioneModificato,
  leggiCostoLavorazione,
} from "@/lib/tariffe/costoLavorazione";

describe("Economia della tariffa: precisione e dati mancanti", () => {
  it("distingue uno zero confermato dallo zero predefinito del vecchio database", () => {
    const t = { costo_interno: 0, prezzo_costo: 0 };
    expect(costoTariffaConosciuto(t)).toBeNull();
    expect(
      costoTariffaConosciuto({
        ...t,
        custom_field_values: {
          _costo_lavorazione: {
            versione: 1,
            modalita: "manuale",
            costo_applicato: 0,
            costo_diretto_impostato: true,
          },
        },
      }),
    ).toBe(0);
    expect(
      costoTariffaConosciuto({
        ...t,
        custom_field_values: {
          _costo_lavorazione: {
            versione: 1,
            modalita: "manuale",
            costo_applicato: 0,
            costo_diretto_impostato: false,
          },
        },
      }),
    ).toBeNull();
    expect(
      costoTariffaConosciuto({ costo_interno: 0, prezzo_costo: 0.0044 }),
    ).toBe(0.0044);
  });
  it("mostra un prezzo al kg molto piccolo senza trasformarlo in zero", () => {
    expect(formatPrezzoUnitario(0.0044)).toContain("0,0044");
    expect(formatPrezzoUnitario(25)).toContain("25,00");
  });
  it.each([15, 30, 99, 0])(
    "il prezzo suggerito raggiunge davvero il margine %s%%",
    (soglia) => {
      const costo = 0.0044;
      const prezzo = prezzoMinimoPerMargine(costo, soglia)!;
      expect(((prezzo - costo) / prezzo) * 100).toBeGreaterThanOrEqual(
        soglia - 1e-9,
      );
      expect(prezzo * 1e4).toBeCloseTo(Math.round(prezzo * 1e4), 6);
    },
  );
  it("non propone importi impossibili o una divisione per zero", () => {
    expect(prezzoMinimoPerMargine(80, 100)).toBeNull();
    expect(prezzoMinimoPerMargine(1e8, 30)).toBeNull();
    expect(prezzoMinimoPerMargine(0, 30)).toBeNull();
  });
  it("rispetta la soglia configurata anche per un margine del 20%", () => {
    expect(semaforoMargineTariffa(20, 30).text).toBe("text-amber-600");
    expect(semaforoMargineTariffa(20, 15).text).toBe("text-emerald-600");
    expect(semaforoMargineTariffa(null, 30).label).toBe(
      "Margine non calcolabile",
    );
  });
  it("non sovrascrive un adeguamento minimo del costo con il vecchio calcolo della squadra", () => {
    const c = {
      ...leggiCostoLavorazione(null),
      modalita: "interna" as const,
      costo_applicato: 0.0044,
    };
    expect(costoLavorazioneModificato(c, 0.0045)).toBe(true);
    expect(costoLavorazioneModificato(c, 0.0044)).toBe(false);
  });
});
