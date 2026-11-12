import { expect, it } from "vitest";
import {
  asseEuro,
  nelPeriodoCassa,
  serieCassaEffettiva,
} from "@/lib/orders/generali/cassaLettura";
import type { MeseOperazione } from "@/lib/orders/generali/cassaOperazione";
const mese = (mese: string, p: Partial<MeseOperazione>): MeseOperazione => ({
  mese,
  incassato: 0,
  pagato: 0,
  entrateAttese: 0,
  usciteAttese: 0,
  versato: 0,
  rimborsato: 0,
  oneriFinanziari: 0,
  capitaleAtteso: 0,
  rimborsiAttesi: 0,
  finanziariAttesi: 0,
  ...p,
});
it("non aggiunge le fonti alla cassa e conserva il cumulato precedente al filtro", () => {
  const righe = [
    mese("2026-11", { pagato: 18300, versato: 500000 }),
    mese("2026-12", {
      incassato: 25000,
      entrateAttese: 30000,
      usciteAttese: 10000,
    }),
  ];
  const futuro = serieCassaEffettiva(righe, "registrati").filter((r) =>
    nelPeriodoCassa(r.mese, "futuro", "2026-12-01"),
  );
  expect(futuro[0]).toMatchObject({
    entrate: 250,
    pagamenti: 0,
    netto: 250,
    cumulato: 67,
  });
  expect(serieCassaEffettiva(righe, "attesi")[1]).toMatchObject({
    entrate: 300,
    pagamenti: 100,
    cumulato: 200,
  });
});
it("mantiene rettifiche con segno e centesimi", () => {
  expect(
    serieCassaEffettiva(
      [mese("2026-11", { incassato: -122, pagato: 1001 })],
      "registrati",
    )[0],
  ).toMatchObject({ entrate: -1.22, pagamenti: 10.01, cumulato: -11.23 });
});
it("non arrotonda tutti gli importi piccoli a 0k sull’asse", () => {
  expect(asseEuro(150)).toBe("150");
  expect(asseEuro(-150)).toBe("-150");
  expect(asseEuro(12500)).toBe("12,5k");
});
