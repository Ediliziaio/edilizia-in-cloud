/**
 * L'IVA sul rendiconto (28/11/2026). Gli importi restano IVA esclusa — il rendiconto conta quantità
 * e tariffe — ma quando il contratto col committente è in inversione contabile il PDF lo deve dire:
 * un imponibile senza una parola sull'IVA fa aspettare al committente una fattura che non arriverà.
 */
import { describe, expect, it } from "vitest";
import { creaPdfOperativo } from "@/lib/documentiOperativi/pdf";
import type { DocumentoOperativo } from "@/lib/documentiOperativi/modello";

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
});
