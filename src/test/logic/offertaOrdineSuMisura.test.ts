import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { descrizioneConMisure, eBloccoMisure, misureRigaCommessa, statoMisuraLeggibile } from "@/lib/acquisti/misureSuDocumenti";
import { buildOdaEmailBody } from "@/lib/odaEmail";
import { buildRdoEmailBody } from "@/lib/rdoEmail";

const base = { odaNumber: "ODA-2026-0001", subtotal: 100, vatTotal: 22, total: 122 };
const riga = { description: "Finestra 2 ante — Cucina", quantity: 1, unit_price: 100, line_total: 100 };

describe("offerta e ordine su misura", () => {
  it("il documento porta Rif. e misure solo per le righe su misura", () => {
    const testo = "Rif. Cucina — L 1200 × H 1400 mm — misura telaio — misure definitive";
    expect(descrizioneConMisure("Finestra", testo)).toBe(`Finestra\n${testo}`);
    expect(descrizioneConMisure("Silicone", null)).toBe("Silicone");
    expect(descrizioneConMisure("Silicone", "", "nota")).toBe("Silicone\nnota");
  });

  it("email dell'ordine: dichiara quali misure, con gli articoli normali come prima", () => {
    const conMisure = buildOdaEmailBody({ ...base, righe: [{ ...riga, dettaglio: "Rif. Cucina\nmisure provvisorie" }] });
    expect(conMisure).toContain("Rif. Cucina<br>misure provvisorie");
    const normale = buildOdaEmailBody({ ...base, righe: [riga] });
    expect(normale).not.toContain("<br><span");
  });

  it("email della richiesta: le misure vanno a capo", () => {
    const html = buildRdoEmailBody({ rfqNumber: "RDO-2026-0001", titolo: "T", righe: [{ descrizione: "Finestra", quantita: 1, note: "Rif. Bagno\nL 800" }] });
    expect(html).toContain("Rif. Bagno<br>L 800");
  });

  it("riconosce il blocco del database dal suo codice", () => {
    expect(eBloccoMisure({ code: "MIS01", message: "x" })).toBe(true);
    expect(eBloccoMisure({ code: "23505" })).toBe(false);
    expect(eBloccoMisure(null)).toBe(false);
    expect(statoMisuraLeggibile("rilevato")).toBe("rilevate, da confermare");
    expect(statoMisuraLeggibile("da_rilevare")).toBe("da rilevare");
  });

  it("PDF della commessa: le definitive vincono, gli articoli normali non cambiano", () => {
    expect(misureRigaCommessa({ gruppo_id: "g", riferimento: "P3", misure_da_ordinare: { larghezza_mm: 790, altezza_mm: 990 }, misure_preventivo: { larghezza: 800, altezza: 1000 } }))
      .toBe("Rif. P3 · L 790 × H 990 mm (definitive)");
    expect(misureRigaCommessa({ measure_status: "da_rilevare", misure_preventivo: { larghezza: 800, altezza: 1000 } }))
      .toBe("L 800 × H 1000 mm (provvisorie)");
    expect(misureRigaCommessa({ riferimento: "Cucina" })).toBeNull();
  });

  const sql = readFileSync("supabase/migrations/20290103100000_offerta_ordine_su_misura.sql", "utf8");
  it("il blocco sta nel database e vale solo uscendo dalla bozza", () => {
    expect(sql).toContain("before update of status on public.purchase_orders");
    expect(sql).toContain("errcode = 'MIS01'");
    expect(sql).toContain("new.status in ('bozza', 'annullato')");
  });
  it("non invade il nome della funzione del sopralluogo", () => {
    expect(sql).not.toContain("misure_normalizza");
  });
  it("gli articoli normali non ricevono misure", () => {
    expect(sql).toContain("if oi.gruppo_id is null and oi.measure_status is null then");
  });
});
