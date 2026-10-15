import { describe, expect, it } from "vitest";
import { contrattoPreventivo } from "../../../supabase/functions/_shared/destinazioneVocePreventivo";
describe("contratto nella conversione, anche senza materiali", () => {
  it("prezzo a corpo: mantiene l'imponibile dopo lo sconto e il totale salvato", () => {
    expect(contrattoPreventivo({subtotal:12000,discount_amount:1200,vat_amount:2376,total:13176})).toEqual({imponibile:10800,aliquotaMedia:22,totaleIvato:13176});
  });
  it("aliquote miste: conserva la stessa aliquota media del flusso esistente", () => {
    expect(contrattoPreventivo({subtotal:6000,discount_amount:0,vat_amount:760,total:6760})).toEqual({imponibile:6000,aliquotaMedia:12.67,totaleIvato:6760});
  });
  it("IVA zero valida", () => {expect(contrattoPreventivo({subtotal:120,vat_amount:0,total:120})).toEqual({imponibile:120,aliquotaMedia:0,totaleIvato:120});});
  it("preventivo legacy con il solo totale", () => {expect(contrattoPreventivo({total:120})).toEqual({imponibile:120,aliquotaMedia:0,totaleIvato:120});});
});
