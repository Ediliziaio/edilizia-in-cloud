/**
 * La fattura RICEVUTA in forma leggibile (01/10/2026): dall'XML FatturaPA a una
 * pagina A4 con fornitore, righe, riepilogo IVA, totali e pagamento. Prima per le
 * ricevute c'era solo l'XML grezzo. Per l'XML di prova si usa lo stesso generatore
 * che spedisce le fatture: quello che un cliente emette è quello che un altro legge.
 */
import { describe, expect, it } from "vitest";
import { generateXML } from "../../../supabase/functions/_shared/generateXML";
import { fatturaRicevutaHtml } from "@/lib/fatturazione/fatturaRicevutaHtml";
import { calcolaRiga, calcolaTotaliDocumento } from "@/lib/fatturazione/calcoli";

const fornitore = {
  ragione_sociale: "Ferramenta Bianchi & Figli S.r.l.", partita_iva: "01234567897", codice_fiscale: "01234567897",
  indirizzo_via: "Via Roma 1", indirizzo_cap: "33080", indirizzo_comune: "Prata di Pordenone", indirizzo_provincia: "PN",
  indirizzo_nazione: "IT", regime_fiscale: "RF01", codice_sdi: "KRRH6B9",
};
const renova = {
  tipo_cliente: "B2B", ragione_sociale: "RENOVA SOLUTION S.R.L.", partita_iva: "01941970939", codice_fiscale: "01941970939",
  indirizzo_via: "Via Revedole 78/B", indirizzo_cap: "33170", indirizzo_comune: "Pordenone", indirizzo_provincia: "PN",
  indirizzo_nazione: "IT", codice_sdi: "PIC7CPS",
};

function xmlFattura(descrizione: string, tipo = "fattura", bollo = false) {
  const righe = [calcolaRiga({
    id: "r", numero_linea: 1, descrizione, quantita: 4, unita_misura: "PZ", prezzo_unitario: 850,
    aliquota_iva: "22", imponibile: 0, imposta: 0, totale_riga: 0,
  } as never)];
  const t = calcolaTotaliDocumento(righe, { bolloVirtuale: bollo });
  return generateXML({
    tipo, numero: "FT-2026-0042", data_emissione: "2026-09-24", cliente_snapshot: renova, righe,
    riepilogo_iva: t.riepilogo_iva, imponibile_totale: t.imponibile_totale, totale_documento: t.totale_documento,
    totale_da_pagare: t.totale_da_pagare, metodo_pagamento_codice: "MP05", iban_pagamento: "IT60X0542811101000000123456",
    scadenze_pagamento: [{ data_scadenza: "2026-10-24", importo: t.totale_da_pagare, metodo_pagamento: "MP05" }],
    bollo_virtuale: bollo,
  }, fornitore, "00001");
}

describe("fatturaRicevutaHtml", () => {
  it("mostra fornitore, numero, data, righe, totali e pagamento", () => {
    const v = fatturaRicevutaHtml(xmlFattura("Serramenti in PVC"), new DOMParser());
    expect(v).not.toBeNull();
    const h = v!.html;
    expect(h).toContain("Ferramenta Bianchi &amp; Figli S.r.l.");
    expect(h).toContain("FT-2026-0042");
    expect(h).toContain("24/09/2026");
    expect(h).toContain("Serramenti in PVC");
    expect(h).toMatch(/4\.?148,00/); // totale documento (3.400 + IVA 22%); l'italiano non raggruppa le migliaia a 4 cifre
    expect(h).toContain("24/10/2026");
    expect(h).toContain("IT60X0542811101000000123456");
    expect(h).toContain("Bonifico");
    expect(v!.titolo).toBe("Fattura FT-2026-0042 - Ferramenta Bianchi & Figli S.r.l.");
  });

  it("non fa passare HTML dal contenuto dell'XML (descrizione ostile)", () => {
    const v = fatturaRicevutaHtml(xmlFattura("<img src=x onerror=alert(1)>"), new DOMParser());
    expect(v!.html).not.toContain("<img src=x");
    expect(v!.html).toContain("&lt;img src=x");
  });

  it("la nota di credito si riconosce, il bollo compare", () => {
    const nc = fatturaRicevutaHtml(xmlFattura("Reso", "nota_credito"), new DOMParser())!.html;
    expect(nc).toContain("Nota di credito");
    const conBollo = fatturaRicevutaHtml(xmlFattura("Consulenza", "fattura", true), new DOMParser())!.html;
    expect(conBollo).toContain("Imposta di bollo");
  });

  it("un file che non è una fattura non produce una pagina", () => {
    expect(fatturaRicevutaHtml("<html>non sono una fattura</html>", new DOMParser())).toBeNull();
    expect(fatturaRicevutaHtml("", new DOMParser())).toBeNull();
  });
});

describe("PDF del fornitore dentro l'XML", () => {
  const conAllegato = (formato: string, nome: string, contenuto: string) =>
    xmlFattura("Fornitura").replace(
      "</FatturaElettronicaBody>",
      `<Allegati><NomeAttachment>${nome}</NomeAttachment><FormatoAttachment>${formato}</FormatoAttachment><Attachment>${contenuto}</Attachment></Allegati></FatturaElettronicaBody>`,
    );
  it("lo trova se è davvero un PDF", () => {
    const v = fatturaRicevutaHtml(conAllegato("PDF", "fattura.pdf", btoa("%PDF-1.4 prova")), new DOMParser());
    expect(v!.allegatiPdf).toEqual([{ nome: "fattura.pdf", base64: btoa("%PDF-1.4 prova") }]);
  });
  it("non lo scambia per PDF se il contenuto non lo è, o se non c'è", () => {
    expect(fatturaRicevutaHtml(conAllegato("PDF", "x.pdf", btoa("<html>no</html>")), new DOMParser())!.allegatiPdf).toEqual([]);
    expect(fatturaRicevutaHtml(conAllegato("XLS", "x.xls", btoa("%PDF")), new DOMParser())!.allegatiPdf).toEqual([]);
    expect(fatturaRicevutaHtml(xmlFattura("Fornitura"), new DOMParser())!.allegatiPdf).toEqual([]);
  });
});
