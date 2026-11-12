import { describe, expect, it } from "vitest";
import {
  composizioneCosti,
  composizioneSal,
} from "@/lib/orders/generali/graficiPanoramica";

describe("grafici della panoramica generale", () => {
  it("raggruppa per categoria e conserva il totale al centesimo", () => {
    const c = composizioneCosti([
      { categoria: "materiali", valore: 100 },
      { categoria: "materiali", valore: 50.12 },
      { categoria: "manodopera", valore: 80.33 },
    ]);
    expect(c.totale).toBe(230.45);
    expect(c.categorie.find((r) => r.id === "materiali")?.valore).toBe(150.12);
    expect(c.conRettifiche).toBe(false);
  });
  it("non trasforma in spicchi positivi le rettifiche negative", () => {
    const c = composizioneCosti([
      { categoria: "materiali", valore: 100 },
      { categoria: "generali", valore: -20 },
    ]);
    expect(c.totale).toBe(80);
    expect(c.conRettifiche).toBe(true);
    expect(c.categorie.some((r) => r.valore === -20)).toBe(true);
  });
  it("accorpa le categorie minori senza perdere costi", () => {
    const c = composizioneCosti(
      Array.from({ length: 10 }, (_, i) => ({
        categoria: `c${i}`,
        valore: i + 1,
      })),
    );
    expect(c.categorie).toHaveLength(6);
    expect(c.totale).toBe(55);
    expect(c.categorie.reduce((s, r) => s + r.valore, 0)).toBe(55);
    expect(c.categorie.at(-1)).toMatchObject({
      id: "altre-categorie",
      valore: 15,
    });
  });
  it("zero e dati non numerici non generano fette", () => {
    expect(
      composizioneCosti([
        { categoria: "materiali", valore: 0 },
        { categoria: "noli", valore: NaN },
      ]),
    ).toMatchObject({ totale: 0, categorie: [] });
  });
  it("separa SAL e residuo sulla base contrattuale", () => {
    expect(composizioneSal(680_000, 149_799.6)).toEqual({
      contratto: 680_000,
      aSal: 149_799.6,
      residuo: 530_200.4,
      oltre: false,
      percentuale: 22,
    });
  });
  it("segnala il superamento del contratto senza nasconderlo nel grafico", () => {
    expect(composizioneSal(100, 120)).toMatchObject({
      residuo: -20,
      oltre: true,
      percentuale: 120,
    });
    expect(composizioneSal(null, 0)).toBeNull();
    expect(composizioneSal(0, 0)).toBeNull();
    expect(composizioneSal(100, -1)).toBeNull();
  });
});
