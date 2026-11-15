// Lotto 2 di docs/piano-commessa-generale-da-documenti.md: la fotografia della lettura (finta).
import { describe, expect, it } from "vitest";
import { contaPagine, copioneFinto, fotoAl, lettaTutta } from "@/lib/orders/generali/daDocumenti/letturaFinta";
import { controlli, statoCampo } from "@/lib/orders/generali/daDocumenti/controlli";

const copione = copioneFinto();

describe("lettura finta", () => {
  it("all'inizio niente è letto e niente costa", () => {
    const f = fotoAl(copione, 0);
    expect(f.fase).toBe("caricamento");
    expect(contaPagine(f).chiuse).toBe(0);
    expect(f.arrivati).toHaveLength(0);
    expect(f.costo).toBe(0);
    expect(lettaTutta(f)).toBe(false);
  });

  it("alla fine ogni pagina ha uno stato finale e il costo è la stima", () => {
    const f = fotoAl(copione, copione.durata);
    expect(f.finita).toBe(true);
    expect(lettaTutta(f)).toBe(true);
    expect(f.costo).toBeCloseTo(f.stimaCosto, 3);
    const c = contaPagine(f);
    expect(c.bianca).toBeGreaterThan(0);
    expect(c.esclusa).toBe(1);
    expect(c.illeggibile).toBe(1);
    expect(c.parser).toBe(1);
  });

  it("le pagine si chiudono in ordine e una sola alla volta è in lettura", () => {
    let prima = -1;
    for (let ms = 0; ms <= copione.durata; ms += 137) {
      const f = fotoAl(copione, ms);
      const c = contaPagine(f);
      expect(c.chiuse).toBeGreaterThanOrEqual(prima);
      expect(c.in_lettura).toBeLessThanOrEqual(1);
      prima = c.chiuse;
    }
  });

  it("il tempo restante si stima solo dopo qualche pagina, poi scende", () => {
    expect(fotoAl(copione, 1300).restante).toBeNull();
    const a = fotoAl(copione, copione.durata * 0.4).restante!;
    const b = fotoAl(copione, copione.durata * 0.7).restante!;
    expect(b).toBeLessThan(a);
    expect(fotoAl(copione, copione.durata).restante).toBe(0);
  });

  it("i dati arrivano con file, pagina e citazione; la penale è in conflitto", () => {
    const f = fotoAl(copione, copione.durata);
    expect(f.arrivati.every((a) => a.occorrenza.file && a.occorrenza.pagina > 0 && a.occorrenza.citazione)).toBe(true);
    expect(statoCampo("appalto_pubblico", "penale_permille", f.dati).stato).toBe("conflitto");
    expect(statoCampo("appalto_pubblico", "contratto_numero", f.dati).stato).toBe("a_mano");
  });

  it("i dati inventati sono coerenti: gli unici controlli non verdi sono quelli senza dati", () => {
    const ctrl = controlli("appalto_pubblico", fotoAl(copione, copione.durata).dati);
    expect(ctrl.filter((c) => c.esito === "errore" || c.esito === "avviso")).toEqual([]);
    expect(ctrl.find((c) => c.id === "importo_contrattuale")!.esito).toBe("ok");
  });
});
