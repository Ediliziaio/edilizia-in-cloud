/**
 * «Verifica formale» di una fattura (01/10/2026): dice in parole cosa manca prima
 * che lo scopra lo SDI. Qui si prova che una fattura a posto passi e che i
 * problemi che fanno scartare (partita IVA, CAP, codice destinatario, PA) escano.
 */
import { describe, expect, it } from "vitest";
import { verificaFormale } from "@/lib/fatturazione/verificaFormale";
import { generateXML } from "../../../supabase/functions/_shared/generateXML";

const azienda = {
  ragione_sociale: "RENOVA SOLUTION S.R.L.", partita_iva: "01941970939", codice_fiscale: "01941970939", regime_fiscale: "RF18",
  indirizzo_via: "Via Revedole", indirizzo_cap: "33170", indirizzo_comune: "Pordenone", indirizzo_provincia: "PN",
  forma_giuridica: "SRL", codice_rea: "368513", rea_ufficio: "PN", capitale_sociale: 10000, socio_unico: false, stato_liquidazione: "LN",
};
const cliente = {
  tipo_cliente: "azienda", ragione_sociale: "Edil Veneta S.r.l.", partita_iva: "01234567897", codice_fiscale: "01234567897",
  indirizzo_via: "Via Roma 12", indirizzo_cap: "30100", indirizzo_comune: "Venezia", indirizzo_provincia: "VE", indirizzo_nazione: "IT", codice_sdi: "M5UXCR1",
};
const riga = { id: "r", numero_linea: 1, descrizione: "Serramenti", quantita: 4, unita_misura: "nr", prezzo_unitario: 850, aliquota_iva: "22", imponibile: 3400, imposta: 748, totale_riga: 4148 };
const doc = (cl: Record<string, unknown> = cliente) => ({
  tipo: "fattura", stato: "emessa", numero: "FPR 73/26", data_emissione: "2026-10-01", cliente_snapshot: cl, righe: [riga],
  riepilogo_iva: [{ aliquota: "22", imponibile: 3400, imposta: 748, esigibilita: "I" }],
  imponibile_totale: 3400, iva_totale: 748, totale_documento: 4148, totale_da_pagare: 4148, importo_pagato: 0,
  metodo_pagamento_codice: "MP05", scadenze_pagamento: [{ data_scadenza: "2026-10-31", importo: 4148, metodo_pagamento: "MP05" }],
}) as never;
const xml = (d: never) => generateXML(d, azienda as never, "00001");

describe("verificaFormale", () => {
  it("una fattura completa non ha errori", () => {
    const d = doc();
    const r = verificaFormale(d, azienda as never, xml(d));
    expect(r.errori).toBe(0);
    expect(r.voci.some((v) => v.testo.includes("XML contiene tutti gli elementi"))).toBe(true);
  });

  it("segnala partita IVA, CAP e codice destinatario sbagliati", () => {
    const d = doc({ ...cliente, partita_iva: "12345", indirizzo_cap: "30", codice_sdi: "ABC" });
    const r = verificaFormale(d, azienda as never, xml(d));
    const testi = r.voci.filter((v) => v.esito === "errore").map((v) => v.testo).join(" | ");
    expect(testi).toMatch(/Partita IVA del cliente/);
    expect(testi).toMatch(/CAP del cliente/);
    expect(testi).toMatch(/codice destinatario del cliente deve avere 7 caratteri/);
  });

  it("verso la PA il codice ufficio è di 6 caratteri", () => {
    const d = doc({ ...cliente, tipo_cliente: "PA", codice_sdi: "M5UXCR1" });
    expect(verificaFormale(d, azienda as never, null).voci.some((v) => v.esito === "errore" && /6 caratteri/.test(v.testo))).toBe(true);
  });

  it("senza codice né PEC è un avviso, non un errore", () => {
    const d = doc({ ...cliente, codice_sdi: "" });
    const r = verificaFormale(d, azienda as never, xml(d));
    expect(r.voci.some((v) => v.esito === "avviso" && /cassetto fiscale/.test(v.testo))).toBe(true);
    expect(r.voci.some((v) => v.esito === "errore" && /codice destinatario/i.test(v.testo))).toBe(false);
  });
});
