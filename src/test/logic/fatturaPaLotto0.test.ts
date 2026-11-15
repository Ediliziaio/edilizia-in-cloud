/**
 * Fattura alla Pubblica Amministrazione, lotto 0 del piano
 * docs/piano-clienti-pa-commessa-fattura.md (15/11/2026): gli errori che
 * facevano partire fatture PA sbagliate.
 *
 * - lo split payment nell'XML seguiva «ogni PA», non la fattura;
 * - «Crea fattura» con profilo PA per un cliente segnato B2B dava FPR12;
 * - cambiando cliente in bozza restavano CIG, CUP e split del precedente;
 * - il codice commessa/convenzione non arrivava mai nell'XML.
 */
import { describe, expect, it } from "vitest";
import { generateXML } from "../../../supabase/functions/_shared/generateXML";
import { calcolaRiga, calcolaTotaliDocumento } from "@/lib/fatturazione/calcoli";
import { splitPredefinito, tipoClienteDaProfilo } from "@/lib/fatturazione/fatturaPa";
import { avvisiXmlPa } from "@/lib/fatturazione/scaricaXml";
import { editorReducer, riferimentiDelCliente, type EditorState } from "@/pages/azienda/fatturazione/editor/useEditorState";
import { bozzaFatturaCertificato } from "@/lib/computo/fatturaCertificato";
import type { ClienteSnapshot } from "@/types/fatturazione";

const azienda = {
  ragione_sociale: "IMPRESA PROVA S.R.L.", partita_iva: "01234567897", codice_fiscale: "01234567897",
  indirizzo_via: "Via Roma", indirizzo_numero_civico: "1", indirizzo_cap: "33170", indirizzo_comune: "Pordenone",
  indirizzo_provincia: "PN", indirizzo_nazione: "IT", regime_fiscale: "RF01", codice_sdi: "KRRH6B9",
};
const comune = {
  tipo_cliente: "PA", ragione_sociale: "Comune di Prova", codice_fiscale: "80012345678", codice_sdi: "UF12AB",
  indirizzo_via: "Piazza Municipio 1", indirizzo_cap: "33080", indirizzo_comune: "Prova", indirizzo_provincia: "PN", indirizzo_nazione: "IT",
};

const riga = calcolaRiga({
  id: "r1", numero_linea: 1, descrizione: "Lavori SAL 1", quantita: 1, unita_misura: "a corpo",
  prezzo_unitario: 1000, aliquota_iva: "22", imponibile: 0, imposta: 0, totale_riga: 0,
} as never);

/** Una fattura PA come la salva l'editor: totali calcolati sull'esigibilità della fattura. */
function fatturaPa(esigibilita: "I" | "S" | null, extra: Record<string, unknown> = {}, cliente: Record<string, unknown> = comune) {
  const split = esigibilita === "S";
  const t = calcolaTotaliDocumento([riga], { splitPayment: split, esigibilitaDefault: esigibilita ?? undefined });
  return {
    tipo: "fattura_pa", numero: "FT-2026-0100", data_emissione: "2026-11-15", cliente_snapshot: cliente,
    righe: [riga], riepilogo_iva: t.riepilogo_iva, imponibile_totale: t.imponibile_totale, iva_totale: t.iva_totale,
    totale_documento: t.totale_documento, totale_da_pagare: t.totale_da_pagare, metodo_pagamento_codice: "MP05",
    scadenze_pagamento: [], esigibilita_iva: esigibilita, cig: "Z1A2B3C4D5", cup: "J12F34000000001", ...extra,
  };
}
const xml = (doc: Record<string, unknown>, az: Record<string, unknown> = azienda) =>
  new DOMParser().parseFromString(generateXML(doc, az, "00001"), "application/xml");
const testi = (d: Document, tag: string) => Array.from(d.getElementsByTagName(tag)).map((e) => e.textContent ?? "");

describe("XML di una fattura PA", () => {
  it("FPA12, Codice Univoco Ufficio di 6 caratteri, CUP prima del CIG", () => {
    const d = xml(fatturaPa("S"));
    expect(d.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(d.documentElement.getAttribute("versione")).toBe("FPA12");
    expect(testi(d, "FormatoTrasmissione")).toEqual(["FPA12"]);
    expect(testi(d, "CodiceDestinatario")).toEqual(["UF12AB"]);
    expect(testi(d, "CodiceCIG")).toEqual(["Z1A2B3C4D5"]);
    expect(testi(d, "CodiceCUP")).toEqual(["J12F34000000001"]);
    const ordine = d.getElementsByTagName("DatiOrdineAcquisto")[0];
    expect(Array.from(ordine.children).map((e) => e.tagName)).toEqual(["IdDocumento", "CodiceCUP", "CodiceCIG"]);
  });

  it("split acceso: esigibilità S, pagamento senza IVA, dicitura in causale", () => {
    const d = xml(fatturaPa("S"));
    expect(testi(d, "EsigibilitaIVA")).toEqual(["S"]);
    expect(testi(d, "ImportoTotaleDocumento")).toEqual(["1220.00"]);
    expect(testi(d, "ImportoPagamento")).toEqual(["1000.00"]);
    expect(testi(d, "Causale").join(" ")).toMatch(/17-ter/);
  });

  it("split spento sulla fattura: l'XML non dice split, anche se l'azienda lo tiene acceso", () => {
    const d = xml(fatturaPa("I"), { ...azienda, split_payment_pa: true });
    expect(testi(d, "EsigibilitaIVA")).toEqual(["I"]);
    expect(testi(d, "ImportoPagamento")).toEqual(["1220.00"]);
    expect(testi(d, "Causale").join(" ")).not.toMatch(/scissione|17-ter/i);
  });

  it("split spento dopo averlo scritto: la dicitura rimasta in causale non arriva allo SDI", () => {
    const d = xml(fatturaPa("I", { causale: ["SAL n. 1", "Scissione dei pagamenti ai sensi dell'art. 17-ter del DPR 633/72"] }));
    expect(testi(d, "Causale")).toEqual(["SAL n. 1"]);
  });

  it("riepilogo con S ma fattura in I: vince la fattura", () => {
    const doc = fatturaPa("I");
    doc.riepilogo_iva = doc.riepilogo_iva.map((r) => ({ ...r, esigibilita: "S" as const }));
    expect(testi(xml(doc), "EsigibilitaIVA")).toEqual(["I"]);
  });

  it("esigibilità non scritta: segue le righe del riepilogo (su cui è calcolato il totale)", () => {
    expect(testi(xml(fatturaPa(null)), "EsigibilitaIVA")).toEqual(["I"]);
  });

  it("codice commessa/convenzione: nel suo tag, dopo Data e prima di CUP e CIG", () => {
    const d = xml(fatturaPa("S", {
      riferimenti_ordine: [{ IdDocumento: "ORD-77", Data: "2026-10-01" }],
      codice_commessa_convenzione: "CONV-CONSIP-12",
    }));
    const ordine = d.getElementsByTagName("DatiOrdineAcquisto")[0];
    expect(Array.from(ordine.children).map((e) => e.tagName))
      .toEqual(["IdDocumento", "Data", "CodiceCommessaConvenzione", "CodiceCUP", "CodiceCIG"]);
    expect(testi(d, "CodiceCommessaConvenzione")).toEqual(["CONV-CONSIP-12"]);
  });

  it("codice convenzione senza ordine: IdDocumento «0» e il codice", () => {
    const d = xml(fatturaPa("S", { codice_commessa_convenzione: "CONV-9", cig: undefined, cup: undefined }));
    expect(testi(d, "IdDocumento")).toEqual(["0"]);
    expect(testi(d, "CodiceCommessaConvenzione")).toEqual(["CONV-9"]);
  });

  it("codice convenzione uguale al numero dell'ordine: non si ripete", () => {
    const d = xml(fatturaPa("S", { riferimenti_ordine: [{ IdDocumento: "ORD-2026-88" }], codice_commessa_convenzione: "ORD-2026-88" }));
    expect(testi(d, "CodiceCommessaConvenzione")).toEqual([]);
  });

  it("CIG senza ordine: resta IdDocumento «0» (accettato dallo SDI)", () => {
    expect(testi(xml(fatturaPa("S")), "IdDocumento")).toEqual(["0"]);
  });

  it("PA senza codice ufficio: 000000 nell'XML e avviso per «Scarica XML»", () => {
    const senza = { ...comune, codice_sdi: "", pec: "protocollo@pec.comune.prova.it" };
    const d = xml(fatturaPa("S", {}, senza));
    expect(testi(d, "CodiceDestinatario")).toEqual(["000000"]);
    expect(avvisiXmlPa({ tipo: "fattura_pa", cliente_snapshot: senza as ClienteSnapshot })[0]).toMatch(/Codice Univoco Ufficio/);
    expect(avvisiXmlPa({ tipo: "fattura_pa", cliente_snapshot: { ...comune, codice_sdi: "ABC1234" } as ClienteSnapshot })[0]).toMatch(/7 caratteri/);
    expect(avvisiXmlPa({ tipo: "fattura_pa", cliente_snapshot: comune as ClienteSnapshot })).toEqual([]);
    expect(avvisiXmlPa({ tipo: "fattura", cliente_snapshot: { ...comune, tipo_cliente: "B2B", codice_sdi: "" } as ClienteSnapshot })).toEqual([]);
  });
});

describe("valori di partenza", () => {
  it("split proposto per la PA, tranne se l'azienda l'ha spento o l'ente non lo applica", () => {
    expect(splitPredefinito({ split_payment_pa: true }, {})).toBe(true);
    expect(splitPredefinito({}, undefined)).toBe(true);
    expect(splitPredefinito({ split_payment_pa: false }, { split_payment: true })).toBe(false);
    expect(splitPredefinito({ split_payment_pa: true }, { split_payment: false })).toBe(false);
  });

  it("«Crea fattura»: il profilo scelto decide il tipo cliente", () => {
    expect(tipoClienteDaProfilo("pa", "B2B")).toBe("PA");
    expect(tipoClienteDaProfilo("impresa", "PA")).toBe("B2B");
    expect(tipoClienteDaProfilo("privato", "PA")).toBe("B2C");
    expect(tipoClienteDaProfilo("impresa", "B2B")).toBe("B2B");
    expect(tipoClienteDaProfilo("privato", "B2B")).toBe("B2B");
    expect(tipoClienteDaProfilo("condominio", undefined)).toBe("B2C");
  });

  it("certificato computo in split: la bozza nasce già con l'importo da pagare senza IVA", () => {
    const b = bozzaFatturaCertificato({
      certificato: { numero: 1, data: "2026-11-10", imponibile: 1000, aliquota_iva: 10, split_payment: true },
      sal: { numero: 1, lavori_a_tutto: "2026-10-31" },
      computo: { stazione_appaltante: "Comune di Prova" },
      orderId: "o1",
    });
    expect(b.esigibilita_iva).toBe("S");
    expect(b.totale_documento).toBe(1100);
    expect(b.totale_da_pagare).toBe(1000);
  });
});

describe("cambio cliente in una bozza", () => {
  const stato = (s: Partial<EditorState>) => editorReducer({} as EditorState, { type: "INIT", payload: s as never });
  const conComuneA = () => stato({
    stato: "bozza", tipo: "fattura_pa", anagrafica_id: "a", cliente_snapshot: comune as ClienteSnapshot, righe: [riga],
    cig: "Z1A2B3C4D5", cup: "J12F34000000001", codice_commessa_convenzione: "CONV-1", esigibilita_iva: "S",
    causale: ["SAL n. 1", "Scissione dei pagamenti ai sensi dell'art. 17-ter del DPR 633/72"],
  });

  it("«Cambia»: tolti CIG, CUP, codice convenzione, split e la sua dicitura; l'avviso li elenca", () => {
    const prima = conComuneA();
    expect(prima.totale_da_pagare).toBe(1000);
    expect(riferimentiDelCliente(prima)).toEqual(["CIG", "CUP", "codice commessa/convenzione", "split payment"]);
    const vuoto = editorReducer(prima, { type: "CLEAR_CLIENTE" });
    const dopo = editorReducer(vuoto, {
      type: "SET_CLIENTE", anagrafica_id: "b",
      snapshot: { tipo_cliente: "B2B", ragione_sociale: "Edil Rossi S.r.l.", partita_iva: "01234567897" },
    });
    expect(dopo.cig).toBeNull();
    expect(dopo.cup).toBeNull();
    expect(dopo.codice_commessa_convenzione).toBeNull();
    expect(dopo.esigibilita_iva).toBeNull();
    expect(dopo.causale).toEqual(["SAL n. 1"]);
    expect(dopo.totale_da_pagare).toBe(1220);
    expect(riferimentiDelCliente(dopo)).toEqual([]);
  });

  it("da un cliente in anagrafica a un altro, anche senza «Cambia»", () => {
    const dopo = editorReducer(conComuneA(), { type: "SET_CLIENTE", anagrafica_id: "b", snapshot: { ...comune, ragione_sociale: "Comune B" } as ClienteSnapshot });
    expect(dopo.cig).toBeNull();
  });

  it("correggere un dato dello stesso cliente o passarlo «a mano» non tocca CIG e split", () => {
    const prima = conComuneA();
    const corretto = editorReducer(prima, { type: "SET_CLIENTE", anagrafica_id: "a", snapshot: { ...comune, pec: "x@pec.it" } as ClienteSnapshot });
    expect(corretto.cig).toBe("Z1A2B3C4D5");
    expect(corretto.esigibilita_iva).toBe("S");
    const aMano = editorReducer(prima, { type: "SET_CLIENTE", anagrafica_id: "", snapshot: comune as ClienteSnapshot });
    expect(aMano.cup).toBe("J12F34000000001");
  });

  it("split tolto a mano: via anche la sua dicitura in causale", () => {
    const dopo = editorReducer(conComuneA(), { type: "SET_FIELD", field: "esigibilita_iva", value: "I" });
    expect(dopo.causale).toEqual(["SAL n. 1"]);
    expect(dopo.totale_da_pagare).toBe(1220);
  });
});
