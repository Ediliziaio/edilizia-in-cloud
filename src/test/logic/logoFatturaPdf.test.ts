import { expect, it } from "vitest";
import { leggiLogoDocumentoFiscale, cssLogoDocumentoFiscale } from "../../../supabase/functions/_shared/logoDocumentoFiscale";
import { documentoHtml } from "../../../supabase/functions/generate-native-pdf/documentoHtml";
const azienda = { ragione_sociale: "Impresa Demo", partita_iva: "01234567897", logo_url: "https://esempio.test/logo.png" };
const documento = { tipo: "fattura", numero: "FT1", data_emissione: "2026-11-19", righe: [], riepilogo_iva: [], cliente_snapshot: {} };
it("mantiene i valori precedenti in assenza di impostazioni e scarta CSS non valido", () => {
  expect(leggiLogoDocumentoFiscale(null)).toEqual({ posizione: "sinistra", dimensione: 100, spazioSopra: 0 });
  expect(leggiLogoDocumentoFiscale({ posizione: "right;display:none", dimensione: 9000, spazioSopra: -10 })).toEqual({ posizione: "sinistra", dimensione: 200, spazioSopra: 0 });
  expect(cssLogoDocumentoFiscale({ dimensione: "100;display:none" })).not.toContain("display:none");
});
it.each(["centro", "destra"])("la stampa usa un solo logo in alto a %s con dimensione e distanza salvate", posizione => {
  const html = documentoHtml(documento, { ...azienda, pdf_logo: { posizione, dimensione: 150, spazioSopra: 8 } });
  expect(html.match(/<img class="fd-logo"/g)).toHaveLength(1);
  expect(html).toContain('<div class="fd-logo-riga"><img');
  expect(html).toContain("height: 33mm"); expect(html).toContain("margin: 8mm");
  expect(html.indexOf('<div class="fd-logo-riga">')).toBeLessThan(html.indexOf('<div class="fd-testata">'));
});
it("il logo di serie resta nella testata dell'emittente", () => {
  const html = documentoHtml(documento, azienda);
  expect(html).not.toContain('<div class="fd-logo-riga">');
  expect(html).toContain("height: 22mm");
});
