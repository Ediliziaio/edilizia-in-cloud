import { describe, expect, it } from "vitest";
import { leggiQuanteUnita, meseCorrente, unitaDiPartenza } from "@/lib/orders/generali/avvio";

/** Creare una generale già pronta da riempire (02/11/2026). */
describe("partire con le unità già pronte", () => {
  it("vuoto vuol dire nessuna unità, non un errore", () => {
    expect(leggiQuanteUnita("  ")).toBe(0);
    expect(leggiQuanteUnita("6")).toBe(6);
  });
  it("rifiuta quello che non è un numero intero, o è oltre il massimo di una serie", () => {
    for (const t of ["sei", "2,5", "-1", "101"]) expect(leggiQuanteUnita(t)).toBeNull();
  });
  it("prepara A1…An con solo la sigla: il resto si completa dopo", () => {
    expect(unitaDiPartenza(0)).toEqual([]);
    const u = unitaDiPartenza(3);
    expect(u.map((x) => x.sigla)).toEqual(["A1", "A2", "A3"]);
    expect(u[0]).toMatchObject({ prezzo_listino: null, millesimi: null });
  });
  it("il mese è quello di oggi, con lo zero davanti", () => {
    expect(meseCorrente(new Date(2026, 2, 15))).toBe("2026-03");
  });
});
