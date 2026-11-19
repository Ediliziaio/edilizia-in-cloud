import { describe, expect, it } from "vitest";
import { misuraVuota, voceVuota } from "@/lib/computo/editorNativo";
import { aggiornaMisurePreventivo, descrizioneConMisure, quantitaDaMisure, rileggiMisurePreventivo, rigaConMisure, righeConMisureIncomplete, righePreventivoDaComputo, salvaMisurePreventivo, type MisurePreventivo } from "@/lib/preventivi/misurePreventivo";
import { readQuoteDraft, serializeQuoteDraft } from "@/lib/preventivi/quoteDraft";
import type { QuoteItemPro } from "@/types/quoteItem";

const riga = (): QuoteItemPro => ({ name: "Cartongesso", description: "Doppia lastra", quantity: 20, unit_price: 40, discount_percent: 10, vat_rate: 22,
  item_type: "service", item_category: "posa", unit_of_measure: "mq", sort_order: 0, prezzo_acquisto: 12, mostra_nel_pdf: true, is_optional: false });
const misure = (): MisurePreventivo => ({ attive: true, manuale: 20, righe: [
  { ...misuraVuota(), descrizione: "Soggiorno", parti: "2", lunghezza: "3,5", altezza: "2,7" },
  { ...misuraVuota(), descrizione: "Vano porta", formula: "-(0,9*2,1)" },
] });

describe("unico preventivo, quantità manuali e computate", () => {
  it("somma misure e detrazioni, poi lascia IVA e sconto alla normale riga", () => {
    const r = rigaConMisure(riga(), misure());
    expect(r.quantity).toBe(17.01);
    expect(r.unit_price).toBe(40); expect(r.discount_percent).toBe(10); expect(r.vat_rate).toBe(22);
    expect(descrizioneConMisure(r)).toContain("Soggiorno: 2 × 3,5 × 2,7 = 18,9 mq");
    expect(descrizioneConMisure(r)).toContain("Vano porta: -(0,9*2,1) = -1,89 mq");
  });
  it("passa alla quantità manuale e riattiva le misure senza perdere nulla", () => {
    const m = misure(), r = rigaConMisure(riga(), m);
    const manuale = rigaConMisure(r, { ...m, attive: false });
    expect(manuale.quantity).toBe(20); expect(manuale.misureComputo?.righe).toEqual(m.righe);
    expect(descrizioneConMisure(manuale)).toBe("Doppia lastra");
    expect(rigaConMisure(manuale, m).quantity).toBe(17.01);
  });
  it.each(["1/0", "window.alert(1)", "2+", "-1e20", "1e20"])("blocca formula non valida o quantità fuori limite: %s", formula => {
    const m = { ...misure(), righe: [{ ...misuraVuota(), formula }] };
    expect(quantitaDaMisure(m)).toBeNull();
    const r = rigaConMisure(riga(), m);
    expect(r.quantity).toBe(20); expect(righeConMisureIncomplete([r])).toBe(1);
  });
  it("round trip di bozza locale e documento salvato, senza duplicare il dettaglio nel PDF", () => {
    const originale = rigaConMisure(riga(), misure());
    const bozza = readQuoteDraft(serializeQuoteDraft({ items: [originale] }));
    expect(bozza.items![0]).toEqual(originale);
    const custom = salvaMisurePreventivo({ cliente: "esistente", _template_values: { luogo: "Roma" } }, bozza.items!);
    const salvata = { ...originale, description: descrizioneConMisure(originale) };
    delete salvata.misureComputo;
    const riaperta = rileggiMisurePreventivo(salvata, 0, custom);
    expect(riaperta).toEqual(originale);
    expect(descrizioneConMisure(riaperta)).toBe(salvata.description);
    expect(custom.cliente).toBe("esistente"); expect(custom._template_values).toEqual({ luogo: "Roma" });
    expect(salvaMisurePreventivo(custom, [riga()])).not.toHaveProperty("_misure_preventivo");
  });
  it("non modifica preventivi vecchi e non applica metadati a una riga riscritta altrove", () => {
    const r = riga(); expect(rileggiMisurePreventivo(r, 0, null)).toBe(r);
    const descrizione = "\n  Testo con rientri\n\nSecondo paragrafo\n";
    expect(descrizioneConMisure({ ...r, description: descrizione })).toBe(descrizione);
    const custom = salvaMisurePreventivo({}, [rigaConMisure(r, misure())]);
    const cambiata = { ...r, description: "Testo modificato dall'altro editor" };
    expect(rileggiMisurePreventivo(cambiata, 0, custom)).toBe(cambiata);
  });
  it("importa un computo con formule e percentuali nello stesso preventivo", () => {
    const v = { ...voceVuota(), descrizione: "Cappotto", unita: "mq", prezzo: "30", misure: misure().righe };
    const percentuale = { ...voceVuota(), descrizione: "Oneri", unita: "%", quantita: "1000", prezzo: "5" };
    const righe = righePreventivoDaComputo([v, percentuale], 10, 3);
    expect(righe[0]).toMatchObject({ quantity: 17.01, unit_price: 30, vat_rate: 10, sort_order: 3 });
    expect(righe[0].misureComputo?.righe).toEqual(v.misure);
    expect(righe[1]).toMatchObject({ quantity: 1, unit_price: 50, unit_of_measure: "corpo" });
    expect(v.prezzo).toBe("30");
  });
  it("aggiorna le pose legate, rispettando quelle con una quantità calcolata da misure proprie", () => {
    const prodotto = { ...riga(), client_temp_id: "prodotto", quantity: 10 };
    const posa = { ...riga(), parent_temp_id: "prodotto", quantity: 20 };
    const posaMisurata = rigaConMisure({ ...posa }, misure());
    const aggiornate = aggiornaMisurePreventivo([prodotto, posa, posaMisurata], 0, { ...misure(), righe: [{ ...misuraVuota(), formula: "12" }] });
    expect(aggiornate[0].quantity).toBe(12); expect(aggiornate[1].quantity).toBe(24);
    expect(aggiornate[2]).toBe(posaMisurata); expect(prodotto.quantity).toBe(10);
  });
});
