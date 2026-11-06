import { describe, expect, it } from "vitest";
import { floorConfigSummary } from "@/lib/render/floorConfigSummary";

describe("riepilogo storico pavimento", () => {
  it("separa i residui parquet dal gres senza modificare i dati salvati", () => {
    const config = Object.freeze({ tipo: "gres_porcellanato", effetto_visivo: "cemento", formato_piastrella: "120x120", colore_mode: "legno", essenza_legno: "noce", larghezza_listello_mm: 90, lunghezza_listello_mm: 600 });
    const result = floorConfigSummary(config);
    expect(Object.fromEntries(result.active)).toEqual({ tipo: "gres_porcellanato", effetto_visivo: "cemento", formato_piastrella: "120x120" });
    expect(Object.fromEntries(result.other)).toEqual({ colore_mode: "legno", essenza_legno: "noce", larghezza_listello_mm: 90, lunghezza_listello_mm: 600 });
    expect(config.larghezza_listello_mm).toBe(90);
  });
  it("conserva listelli del parquet, essenza del gres effetto legno e valori zero", () => {
    expect(Object.fromEntries(floorConfigSummary({ tipo: "parquet_massello", larghezza_listello_mm: 90, fuga_larghezza_mm: 0 }).active)).toMatchObject({ larghezza_listello_mm: 90, fuga_larghezza_mm: 0 });
    expect(Object.fromEntries(floorConfigSummary({ tipo: "gres_porcellanato", effetto_visivo: "legno", essenza_legno: "noce" }).active)).toHaveProperty("essenza_legno", "noce");
  });
  it("non espone parametri interni e conserva campi di materiali sconosciuti", () => {
    const result = floorConfigSummary({ tipo: "futuro", larghezza_listello_mm: 123, provider: "riservato", prompt: "riservato", aperto: false, vuoto: null });
    expect(Object.fromEntries(result.active)).toEqual({ tipo: "futuro", larghezza_listello_mm: 123, aperto: false });
    expect(result.other).toEqual([]);
  });
  it("separa moduli e listelli per le superfici continue", () => {
    expect(Object.fromEntries(floorConfigSummary({ tipo: "resina_continua", formato_piastrella: "60x60", larghezza_listello_mm: 90 }).active)).toEqual({ tipo: "resina_continua" });
  });
});
