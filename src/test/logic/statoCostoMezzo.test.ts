import { describe, expect, it } from "vitest";
import { statoCostoMezzo } from "@/lib/mezzi/economiaPiani";

const riga = (p: { dal?: string; previsto?: number | null; registrato?: number; invalidi?: number; scostamento?: number | null }) => ({
  piano: { dal: p.dal ?? "2026-10-01" }, previsto: p.previsto === undefined ? 500 : p.previsto, registrato: p.registrato ?? 0, invalidi: p.invalidi ?? 0, scostamento: p.scostamento ?? null,
});
const oggi = "2026-11-02";

describe("Il costo di un mezzo in commessa", () => {
  it("un mezzo già in uso, con un previsto e nessun costo, è da registrare: il margine non lo vede", () => {
    expect(statoCostoMezzo(riga({}), oggi)).toEqual({ chiave: "daRegistrare", testo: "Costo da registrare" });
  });
  it("un mezzo che deve ancora arrivare non è un problema", () => {
    expect(statoCostoMezzo(riga({ dal: "2026-12-01" }), oggi).chiave).toBe("programmato");
  });
  it("senza importo previsto né costi lo dice", () => {
    expect(statoCostoMezzo(riga({ previsto: null }), oggi).chiave).toBe("senzaPrevisto");
  });
  it("registrato: oltre il previsto o in linea", () => {
    expect(statoCostoMezzo(riga({ registrato: 600, scostamento: 100 }), oggi).chiave).toBe("oltre");
    expect(statoCostoMezzo(riga({ registrato: 500, scostamento: 0 }), oggi).chiave).toBe("registrato");
    expect(statoCostoMezzo(riga({ previsto: null, registrato: 500 }), oggi).chiave).toBe("registrato");
  });
  it("un collegamento non più valido viene prima di tutto", () => {
    expect(statoCostoMezzo(riga({ registrato: 500, invalidi: 1 }), oggi).chiave).toBe("verifica");
  });
});
