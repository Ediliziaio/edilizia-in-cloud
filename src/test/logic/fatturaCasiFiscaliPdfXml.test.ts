/**
 * I casi fiscali meno comuni, letti nei due documenti (16/11/2026): ritenuta
 * d'acconto, cassa previdenziale, rivalsa INPS, bollo, sconto sul totale, nota
 * di credito, reverse charge interno (N6.3) e regime forfettario.
 *
 * Per ognuno: i conti li fa il motore vero (calcolaTotaliDocumento), poi si
 * guarda che cosa legge il cliente nel PDF e che cosa riceve l'Agenzia nell'XML.
 * Ogni XML passa dallo schema ufficiale FatturaPA 1.2.2.
 */
import { describe, expect, it, vi } from "vitest";
import { generateXML } from "../../../supabase/functions/_shared/generateXML";
import { documentoHtml } from "../../../supabase/functions/generate-native-pdf/documentoHtml";
import { calcolaRiga, calcolaTotaliDocumento, type TotaliOptions } from "@/lib/fatturazione/calcoli";
import type { RigaDocumento } from "@/types/fatturazione";
import { valoriXml } from "@/lib/fatturazione/xmlLeggibile";

vi.mock("../../../supabase/functions/_shared/generateXML", async (originale) =>
  (await import("../helpers/xsdSuOgniXml")).conRegistro(await originale()));
import { ogniXmlNelloSchema } from "../helpers/xsdSuOgniXml";
ogniXmlNelloSchema();

const azienda = {
  ragione_sociale: "Studio Tecnico Demo", partita_iva: "99999999999", codice_fiscale: "99999999999",
  indirizzo_via: "Via dei Cantieri", indirizzo_numero_civico: "24", indirizzo_cap: "20099",
  indirizzo_comune: "Sesto San Giovanni", indirizzo_provincia: "MI", indirizzo_nazione: "IT",
  regime_fiscale: "RF01", codice_sdi: "ABCDEFG",
};

const cliente = {
  tipo_cliente: "B2B", ragione_sociale: "Edile Rossi srl", partita_iva: "01234567897", codice_sdi: "M5UXCR1",
  indirizzo_via: "Via Roma 10", indirizzo_cap: "20100", indirizzo_comune: "Milano", indirizzo_provincia: "MI", indirizzo_nazione: "IT",
};

const riga = (descrizione: string, quantita: number, prezzo: number, aliquota: string, extra: Record<string, unknown> = {}) =>
  calcolaRiga({
    id: `r-${descrizione}`, numero_linea: 1, descrizione, quantita, unita_misura: "pz", prezzo_unitario: prezzo,
    aliquota_iva: aliquota, imponibile: 0, imposta: 0, totale_riga: 0, ...extra,
  } as unknown as RigaDocumento);

/** Il documento completo come lo salva l'editor: righe calcolate + totali del motore. */
function documento(base: Record<string, unknown>, righe: RigaDocumento[], opzioni: TotaliOptions = {}) {
  const totali = calcolaTotaliDocumento(righe, opzioni);
  return {
    tipo: "fattura", numero: "FT 1/26", data_emissione: "2026-11-16", stato: "emessa",
    cliente_snapshot: cliente, metodo_pagamento_codice: "MP05", iban_pagamento: "IT00X9999900000000000000001",
    righe: righe.map((r, i) => ({ ...r, numero_linea: i + 1 })),
    riepilogo_iva: totali.riepilogo_iva,
    subtotale: totali.subtotale, imponibile_totale: totali.imponibile_totale, iva_totale: totali.iva_totale,
    totale_documento: totali.totale_documento, totale_da_pagare: totali.totale_da_pagare,
    sconto_globale_valore: totali.scontoGlobaleValore, ritenuta_importo: totali.ritenuta_importo,
    cassa_importo: totali.cassa_importo, rivalsa_importo: totali.rivalsa_importo,
    altra_ritenuta_importo: totali.altra_ritenuta_importo,
    ...base,
  } as Record<string, unknown>;
}

const testoSenzaTag = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

const euro = (n: number) => `${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" as unknown as boolean })} €`;

describe("Parcella con cassa previdenziale, ritenuta d'acconto e bollo", () => {
  const righe = [riga("Progettazione esecutiva", 1, 5000, "22")];
  const doc = documento(
    {
      tipo: "parcella", numero: "PA 7/26",
      cassa_previdenziale: true, cassa_aliquota: 4, cassa_tipo: "TC22", cassa_aliquota_iva: "22", cassa_ritenuta: true,
      cassa_imponibile: 5000,
      ritenuta_acconto: true, ritenuta_aliquota: 20, ritenuta_tipo: "RT01", ritenuta_causale: "A",
      bollo_virtuale: true, bollo_importo: 2,
      note_documento: "Compenso come da preventivo del 10/09/2026.",
    },
    righe,
    { cassaPrevidenziale: true, cassaAliquota: 4, cassaAliquotaIva: "22", cassaRitenuta: true, ritenutaAcconto: true, ritenutaAliquota: 20, bolloVirtuale: true, bolloImporto: 2 },
  );
  const xml = generateXML(doc as never, azienda as never, "00001");
  const html = documentoHtml(doc as never, azienda as never);
  const testo = testoSenzaTag(html);

  it("i conti: cassa sull'imponibile, IVA su imponibile + cassa, ritenuta su imponibile + cassa", () => {
    expect(doc.cassa_importo).toBe(200); // 4% di 5.000
    expect(doc.iva_totale).toBe(1144); // 22% di 5.200
    expect(doc.ritenuta_importo).toBe(1040); // 20% di 5.200 (cassa compresa)
    expect(doc.totale_documento).toBe(6346); // 5.000 + 200 + 1.144 + 2 di bollo
    expect(doc.totale_da_pagare).toBe(5306); // meno la ritenuta
  });

  it("l'XML porta DatiCassaPrevidenziale, DatiRitenuta e DatiBollo con gli stessi numeri", () => {
    expect(valoriXml(xml, "TipoCassa")).toEqual(["TC22"]);
    expect(valoriXml(xml, "ImportoContributoCassa")).toEqual(["200.00"]);
    expect(valoriXml(xml, "ImponibileCassa")).toEqual(["5000.00"]);
    expect(valoriXml(xml, "TipoRitenuta")).toEqual(["RT01"]);
    expect(valoriXml(xml, "ImportoRitenuta")).toEqual(["1040.00"]);
    expect(valoriXml(xml, "AliquotaRitenuta")).toEqual(["20.00"]);
    expect(valoriXml(xml, "CausalePagamento")).toEqual(["A"]);
    expect(valoriXml(xml, "BolloVirtuale")).toEqual(["SI"]);
    expect(valoriXml(xml, "ImportoBollo")).toEqual(["2.00"]);
    expect(valoriXml(xml, "ImportoTotaleDocumento")).toEqual(["6346.00"]);
    // La riga è soggetta a ritenuta: lo schema vuole che almeno una lo dica.
    expect(valoriXml(xml, "Ritenuta")).toContain("SI");
  });

  it("il PDF spiega al cliente perché paga 5.306,00 € e non 6.346,00 €", () => {
    expect(testo).toContain("Cassa previdenziale");
    expect(testo).toContain(euro(200));
    expect(testo).toContain("Imposta di bollo");
    expect(testo).toContain("Ritenuta d'acconto");
    expect(testo).toContain("−1.040,00 €"); // col segno meno tipografico
    expect(testo).toContain("Totale documento");
    expect(testo).toContain(euro(6346));
    expect(testo).toContain("Netto a pagare");
    expect(testo).toContain(euro(5306));
  });

  it("il foglio non lascia buchi: pagamento sotto il riepilogo IVA, note sotto i totali", () => {
    const sinistra = html.slice(html.indexOf('fd-colonna fd-sinistra'), html.indexOf('fd-colonna fd-destra'));
    const destra = html.slice(html.indexOf('fd-colonna fd-destra'));
    expect(sinistra).toContain("fd-riepilogo");
    expect(sinistra).toContain("fd-pagamento");
    expect(destra).toContain("fd-totali");
    expect(destra).toContain("fd-note");
  });
});

describe("Rivalsa INPS e seconda ritenuta", () => {
  const righe = [riga("Consulenza", 1, 2000, "22")];
  const doc = documento(
    {
      rivalsa_inps: true, rivalsa_aliquota: 4, rivalsa_tipo: "TC22",
      altra_ritenuta: true, altra_ritenuta_aliquota: 4, altra_ritenuta_tipo: "RT03", altra_ritenuta_causale: "W",
    },
    righe,
    { rivalsaInps: true, rivalsaAliquota: 4, altraRitenuta: true, altraRitenutaAliquota: 4 },
  );
  const xml = generateXML(doc as never, azienda as never, "00002");
  const testo = testoSenzaTag(documentoHtml(doc as never, azienda as never));

  it("stanno in tutti e due, con lo stesso importo", () => {
    expect(doc.rivalsa_importo).toBe(80);
    expect(doc.altra_ritenuta_importo).toBe(80);
    expect(valoriXml(xml, "ImportoContributoCassa")).toEqual(["80.00"]);
    expect(valoriXml(xml, "ImportoRitenuta")).toEqual(["80.00"]);
    expect(valoriXml(xml, "TipoRitenuta")).toEqual(["RT03"]);
    expect(testo).toContain("Rivalsa INPS");
    expect(testo).toContain("Altra ritenuta");
    expect(testo).toContain(euro(80));
  });
});

describe("Sconto sul totale", () => {
  const righe = [riga("Fornitura", 10, 100, "22")];
  const doc = documento({ sconto_globale_percentuale: 10 }, righe, { scontoGlobalePerc: 10 });
  const xml = generateXML(doc as never, azienda as never, "00003");
  const testo = testoSenzaTag(documentoHtml(doc as never, azienda as never));

  it("il PDF mostra le righe prima dello sconto, poi lo sconto; l'XML l'imponibile già scontato", () => {
    expect(doc.sconto_globale_valore).toBe(100);
    expect(doc.imponibile_totale).toBe(900);
    expect(testo).toContain("Totale righe");
    expect(testo).toContain("Sconto 10%");
    expect(testo).toContain("−100,00 €");
    expect(valoriXml(xml, "ImponibileImporto")).toEqual(["900.00"]);
    expect(valoriXml(xml, "ImportoTotaleDocumento")).toEqual(["1098.00"]);
    expect(testo).toContain(euro(1098));
  });
});

describe("Nota di credito", () => {
  const righe = [riga("Storno fornitura", 1, 500, "22")];
  const doc = documento(
    { tipo: "nota_credito", numero: "NC 2/26", fattura_collegata: { numero: "FT 1/26", data: "2026-10-02" }, documento_correlato_id: "doc-1" },
    righe,
  );
  const xml = generateXML(doc as never, azienda as never, "00004");
  const testo = testoSenzaTag(documentoHtml(doc as never, azienda as never));

  it("è una TD04 che dichiara la fattura rettificata, e il PDF lo dice", () => {
    expect(valoriXml(xml, "TipoDocumento")).toEqual(["TD04"]);
    expect(valoriXml(xml, "IdDocumento")).toContain("FT 1/26");
    expect(testo).toContain("NOTA DI CREDITO");
    expect(testo).toContain("Documento rettificato n. FT 1/26 · del 02/10/2026");
    expect(testo).toContain("Totale nota di credito");
  });
});

describe("Reverse charge interno (subappalto edile, N6.3)", () => {
  const righe = [riga("Posa in opera — subappalto", 1, 3000, "0", { natura_iva: "N6_3" })];
  const doc = documento({ numero: "FT 9/26" }, righe);
  const xml = generateXML(doc as never, azienda as never, "00005");
  const testo = testoSenzaTag(documentoHtml(doc as never, azienda as never));

  it("l'XML scrive natura e riferimento normativo; il PDF la norma per esteso", () => {
    // Due volte: sulla riga e nel riepilogo.
    expect(valoriXml(xml, "Natura")).toEqual(["N6.3", "N6.3"]);
    expect(valoriXml(xml, "RiferimentoNormativo")[0]).toMatch(/inversione contabile|17/i);
    expect(testo).toContain("Note fiscali");
    expect(testo).toContain("N6.3");
    expect(testo).toContain("0% (N6.3)");
    expect(doc.iva_totale).toBe(0);
    expect(doc.totale_da_pagare).toBe(3000);
  });
});

describe("Regime forfettario (RF19)", () => {
  const forfettaria = { ...azienda, regime_fiscale: "RF19" };
  const righe = [riga("Prestazione professionale", 1, 1000, "0", { natura_iva: "N2_2" })];
  const doc = documento({ numero: "FT 4/26", bollo_virtuale: true, bollo_importo: 2 }, righe, { bolloVirtuale: true, bolloImporto: 2 });
  const xml = generateXML(doc as never, forfettaria as never, "00006");
  const testo = testoSenzaTag(documentoHtml(doc as never, forfettaria as never));

  it("l'XML dichiara RF19 e il PDF scrive la dicitura di legge, bollo compreso", () => {
    expect(valoriXml(xml, "RegimeFiscale")).toEqual(["RF19"]);
    expect(testo).toContain("art. 1, commi da 54 a 89, L. n. 190/2014");
    expect(testo).toContain("Imposta di bollo");
    expect(valoriXml(xml, "ImportoBollo")).toEqual(["2.00"]);
    expect(doc.totale_documento).toBe(1002);
  });
});
