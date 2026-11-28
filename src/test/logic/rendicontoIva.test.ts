/**
 * L'IVA sul rendiconto (28/11/2026). Gli importi restano IVA esclusa — il rendiconto conta quantità
 * e tariffe — ma quando il contratto col committente è in inversione contabile il PDF lo deve dire:
 * un imponibile senza una parola sull'IVA fa aspettare al committente una fattura che non arriverà.
 */
import { describe, expect, it } from "vitest";
import { creaPdfOperativo } from "@/lib/documentiOperativi/pdf";
import { totaliDocumento, type DocumentoOperativo } from "@/lib/documentiOperativi/modello";
import { totaleConIva } from "@/lib/rendiconti/rendicontiGiornalieri";

const azienda = { id: "d2000000-0000-4000-a000-000000000002", name: "Demo", business_name: "Demo Azienda 2 S.r.l.", righeSocietarie: ["Demo Azienda 2 S.r.l."] };
const testo = (pdf: { output: (t: "arraybuffer") => ArrayBuffer }) => Buffer.from(pdf.output("arraybuffer")).toString("latin1");
const rendiconto = (extra: Partial<DocumentoOperativo> = {}): DocumentoOperativo => ({
  tipo: "economia",
  rendicontoGiornaliero: true,
  numero: "12",
  data: "2026-11-28",
  periodo: "28/11/2026",
  destinatario: { nome: "Committente S.p.A." },
  commessa: "SIM-1",
  note: null,
  righe: [{ descrizione: "Operaio", unita: "h", quantita: 8, prezzo: 32, importo: 256, iva: null }],
  ...extra,
} as DocumentoOperativo);

describe("Rendiconto: l'IVA", () => {
  it("di serie: importi IVA esclusa, e nessuna clausola di inversione", () => {
    const t = testo(creaPdfOperativo(rendiconto(), azienda));
    expect(t).toContain("Totale IVA esclusa");
    expect(t).not.toContain("Inversione contabile");
  });

  it("col contratto in inversione contabile lo scrive, con la norma", () => {
    const t = testo(creaPdfOperativo(rendiconto({ inversioneContabile: true }), azienda));
    expect(t).toContain("Inversione contabile");
    expect(t).toContain("art. 17 c. 6 DPR 633/72");
    expect(t).toContain("Totale IVA esclusa"); // il totale non cambia: l'imponibile è quello
  });

  it("IVA aggiunta: imponibile, IVA e totale, sul documento e sul PDF", () => {
    const d = rendiconto({ ivaRendiconto: { pct: 22, compresa: false } });
    expect(totaliDocumento(d)).toEqual({ imponibile: 256, iva: 56.32, totale: 312.32 });
    const t = testo(creaPdfOperativo(d, azienda));
    expect(t).toMatch(/IVA 22%/i);
    expect(t).toContain("Totale IVA inclusa");
    expect(t).not.toContain("Totale IVA esclusa");
  });

  it("IVA compresa: il totale è la somma delle righe, imponibile e IVA si ricavano all'indietro", () => {
    const d = rendiconto({ ivaRendiconto: { pct: 10, compresa: true } });
    expect(totaliDocumento(d)).toEqual({ imponibile: 232.73, iva: 23.27, totale: 256 });
    const t = testo(creaPdfOperativo(d, azienda));
    // Le etichette dei riquadri si stampano in maiuscolo, e nel PDF le parentesi sono protette.
    expect(t).toMatch(/IVA 10%.{0,3}COMPRESA/i);
    expect(t).toMatch(/Totale .{0,3}IVA compresa/i);
  });

  it("l'inversione contabile vince sulla scelta: niente IVA, e lo scrive", () => {
    const d = rendiconto({ ivaRendiconto: { pct: 22, compresa: false }, inversioneContabile: true });
    expect(totaliDocumento(d).totale).toBe(256);
    const t = testo(creaPdfOperativo(d, azienda));
    expect(t).toContain("Inversione contabile");
  });

  it("il conto nell'editor è lo stesso del documento", () => {
    expect(totaleConIva(516.4, { iva_pct: 22, iva_compresa: false, inversione: false }))
      .toEqual({ imponibile: 516.4, iva: 113.61, totale: 630.01 });
    expect(totaleConIva(256, { iva_pct: 10, iva_compresa: true, inversione: false }))
      .toEqual({ imponibile: 232.73, iva: 23.27, totale: 256 });
    // In inversione contabile la scelta non si applica.
    expect(totaleConIva(100, { iva_pct: 22, iva_compresa: false, inversione: true }))
      .toEqual({ imponibile: 100, iva: 0, totale: 100 });
  });
});
