import { describe, expect, it } from "vitest";
import { importiPerPeriodo, type EsitoLiquidazione } from "@/lib/contabilita/liquidazioneContabile";

const e = (v: number, a: number, extra: Partial<EsitoLiquidazione> = {}): EsitoLiquidazione => ({
  iva_vendite: v, iva_acquisti: a, saldo: v - a, credito_precedente: 0, compensato: 0,
  da_versare: Math.max(v - a, 0), a_credito: Math.max(a - v, 0), gia_liquidato: false, fonte: "scritture", ...extra,
});

describe("importi della liquidazione periodo per periodo", () => {
  it("un'anteprima dopo un'altra anteprima mostra solo il suo periodo (Scavolo ott/nov/dic)", () => {
    const [ott, nov, dic] = importiPerPeriodo([e(32815.76, 27789.76), e(37110.16, 32658.03), e(37110.16, 32658.03)]);
    expect(ott!.iva_vendite).toBe(32815.76);
    expect(nov!.iva_vendite).toBe(4294.4);
    expect(nov!.iva_acquisti).toBe(4868.27);
    expect(nov!.a_credito).toBe(573.87);
    expect(dic!.iva_vendite).toBe(0);
    expect(dic!.da_versare).toBe(0);
  });
  it("dopo un periodo registrato il saldo è già del solo periodo", () => {
    const [, ott] = importiPerPeriodo([e(0, 0, { gia_liquidato: true, registrata_iva_vendite: 70128.45, registrata_iva_acquisti: 51326.93 }), e(32815.76, 27789.76)]);
    expect(ott!.iva_vendite).toBe(32815.76);
  });
});
