/**
 * «Stampa» e «Salva PDF» della fattura uscivano bianchi (23/11/2026).
 *
 * La fattura passa dalla stessa stampa nativa del preventivo fotovoltaico
 * (`stampaPreventivoNativo`), che aggiunge al documento lo stile di stampa delle
 * pagine FV. Quello stile nascondeva ogni figlio del body che non fosse `.page`:
 * la fattura è un `.fd-foglio`, quindi in stampa spariva tutta e Chrome mostrava
 * una pagina vuota, mentre l'anteprima a schermo era a posto.
 *
 * Qui si rende la pagina vera della fattura, la si carica in un documento e si
 * controlla che nessuna regola «display: none» dello stile la colpisca; e che sul
 * preventivo FV, fatto di `.page`, i nodi di servizio restino nascosti.
 */
import { describe, expect, it } from "vitest";
import { documentoHtml } from "../../../supabase/functions/generate-native-pdf/documentoHtml";
import { STILE_STAMPA_PAGINE_FV } from "../../../supabase/functions/_shared/fvStampaPagina";
import { generateXML } from "../../../supabase/functions/_shared/generateXML";
import { fatturaXmlTabellareHtml } from "@/lib/fatturazione/fatturaXmlTabellare";

/** I selettori delle regole che nascondono, dentro lo stile di stampa. */
function selettoriCheNascondono(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/display\s*:\s*none/.test(m[2])) out.push(...m[1].split(",").map((s) => s.trim()).filter(Boolean));
  }
  return out;
}

function documento(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

const azienda = {
  ragione_sociale: "Impresa Esempio S.r.l.", partita_iva: "01234567897", codice_fiscale: "01234567897",
  indirizzo_via: "Via Roma", indirizzo_numero_civico: "1", indirizzo_cap: "20100", indirizzo_comune: "Milano", indirizzo_provincia: "MI",
  regime_fiscale: "RF01", colore_primario: "#0f766e",
};

const fattura = {
  tipo: "fattura", numero: "FT-2026-1", data_emissione: "2026-10-29", data_scadenza: "2026-11-28",
  cliente_snapshot: { tipo_cliente: "B2B", ragione_sociale: "Cliente Esempio S.r.l.", partita_iva: "09876543210", indirizzo_via: "Via Verdi 2", indirizzo_cap: "20100", indirizzo_comune: "Milano", indirizzo_provincia: "MI" },
  righe: [{ descrizione: "Lavori edili", quantita: 1, unita_misura: "a corpo", prezzo_unitario: 2546, aliquota_iva: "22", imponibile: 2546, totale: 3106.12, iva: 560.12 }],
  riepilogo_iva: [{ aliquota_iva: "22", imponibile: 2546, imposta: 560.12 }],
  imponibile_totale: 2546, iva_totale: 560.12, totale_documento: 3106.12, totale_da_pagare: 3106.12,
  metodo_pagamento_codice: "MP05",
};

describe("stampa della fattura: lo stile delle pagine FV non la nasconde", () => {
  const selettori = selettoriCheNascondono(STILE_STAMPA_PAGINE_FV);

  it("lo stile ha davvero una regola che nasconde (altrimenti il test non prova niente)", () => {
    expect(selettori.length).toBeGreaterThan(0);
  });

  it("la fattura vera resta tutta visibile in stampa", () => {
    const doc = documento(documentoHtml(fattura, azienda));
    const foglio = doc.querySelector(".fd-foglio");
    expect(foglio).not.toBeNull();
    expect(doc.body.textContent).toContain("FT-2026-1");
    for (const sel of selettori) {
      const nascosti = [...doc.querySelectorAll(sel)];
      expect(nascosti, `«${sel}» nasconderebbe la fattura`).toEqual([]);
    }
  });

  it("la stampa «da XML» (anche delle fatture ricevute) resta tutta visibile", () => {
    const xml = generateXML({ ...fattura, numero: "FT-2026-2", righe: [{ ...fattura.righe[0], numero_linea: 1 }], riepilogo_iva: [{ aliquota: "22", imponibile: 2546, imposta: 560.12, esigibilita: "I" }] }, azienda, "00001");
    const doc = documento(fatturaXmlTabellareHtml(xml).html);
    expect(doc.querySelector(".foglio")).not.toBeNull();
    for (const sel of selettori) expect([...doc.querySelectorAll(sel)], `«${sel}» nasconderebbe la stampa da XML`).toEqual([]);
  });

  it("un documento qualsiasi senza .page (fattura ricevuta, anteprima XML) non sparisce", () => {
    const doc = documento("<!DOCTYPE html><html><body><main><h1>Fattura ricevuta</h1></main></body></html>");
    for (const sel of selettori) expect([...doc.querySelectorAll(sel)]).toEqual([]);
  });

  it("nel preventivo FV i nodi di servizio dopo i fogli restano nascosti", () => {
    const doc = documento('<!DOCTYPE html><html><body><div class="page">1</div><div class="page">2</div><div id="servizio"></div></body></html>');
    const nascosti = new Set(selettori.flatMap((sel) => [...doc.querySelectorAll(sel)]));
    expect(nascosti.has(doc.getElementById("servizio")!)).toBe(true);
    for (const pagina of doc.querySelectorAll(".page")) expect(nascosti.has(pagina)).toBe(false);
  });
});
