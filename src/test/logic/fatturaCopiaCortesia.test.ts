/**
 * La copia di cortesia della fattura (12/10/2026): la pagina che il browser
 * stampa in PDF e l'anteprima nell'app usano lo stesso aspetto e le stesse voci.
 * Qui si rende la pagina vera con documenti di prova e si controlla quello che
 * legge il cliente.
 */
import { describe, expect, it } from "vitest";
import { documentoHtml } from "../../../supabase/functions/generate-native-pdf/documentoHtml";
import {
  MODALITA_PAGAMENTO,
  euro,
  euroConSegno,
  formaGiuridicaDaMostrare,
  ibanLeggibile,
  importoInEvidenza,
  importoRiga,
  temaFattura,
  vociTotali,
} from "../../../supabase/functions/_shared/documentoFiscaleVista";
import { contrasto } from "../../../supabase/functions/_shared/temaColori";
import { METODI_PAGAMENTO_SDI } from "@/types/fatturazione";

const azienda = {
  ragione_sociale: "Serramenti Esempio S.R.L.", forma_giuridica: "SRL", partita_iva: "01234567897", codice_fiscale: "01234567897",
  indirizzo_via: "Via Roma", indirizzo_numero_civico: "1", indirizzo_cap: "33170", indirizzo_comune: "Pordenone", indirizzo_provincia: "PN",
  codice_rea: "PN-123456", capitale_sociale: 10000, regime_fiscale: "RF01", colore_primario: "#10b981",
  logo_url: "https://esempio.it/logo.png",
};

// IVA mista (10% e 22%), con le chiavi dei documenti più vecchi (totale, iva, aliquota_iva).
const fattura = {
  tipo: "fattura", numero: "FPR 73/26", data_emissione: "2026-10-02", data_scadenza: "2026-10-31",
  cliente_snapshot: { tipo_cliente: "B2C", ragione_sociale: "Mario Rossi", codice_fiscale: "RSSMRA70A01G888X", indirizzo_via: "Via Verdi 2", indirizzo_cap: "33080", indirizzo_comune: "Porcia", indirizzo_provincia: "PN" },
  righe: [
    { descrizione: "Serramenti in PVC", quantita: 1, unita_misura: "pz", prezzo_unitario: 9800, aliquota_iva: "10", imponibile: 9800, totale: 10780, iva: 980 },
    { descrizione: "Zanzariere", quantita: 13, unita_misura: "pz", prezzo_unitario: 185, aliquota_iva: "10", imponibile: 2405, totale: 2645.5, iva: 240.5 },
    { descrizione: "Porta blindata", quantita: 1.5, unita_misura: "pz", prezzo_unitario: 1000, aliquota_iva: "22", imponibile: 1500, totale: 1830, iva: 330 },
  ],
  riepilogo_iva: [
    { aliquota_iva: "10", imponibile: 12205, imposta: 1220.5 },
    { aliquota_iva: "22", imponibile: 1500, imposta: 330 },
  ],
  imponibile_totale: 13705, iva_totale: 1550.5, totale_documento: 15255.5, totale_da_pagare: 15255.5,
  metodo_pagamento_codice: "MP05", iban_pagamento: "IT60X0542811101000000123456",
  note_documento: "Garanzia 10 anni.",
};

describe("copia di cortesia: la pagina stampata", () => {
  const html = documentoHtml(fattura, azienda, { brandFooter: "Documento generato da Edilizia in Cloud" });

  it("ha margine di pagina zero: il browser non aggiunge data, titolo, indirizzo e numero di pagina", () => {
    expect(html).toContain("@page { size: A4; margin: 0; }");
    expect(html).toContain("box-decoration-break: clone");
    expect(html).toContain("<title>Fattura FPR 73/26</title>");
  });

  it("mostra l'IVA mista riga per riga e nel riepilogo, una riga per aliquota", () => {
    expect(html).toContain('<td class="fd-c">10%</td>');
    expect(html).toContain('<td class="fd-c">22%</td>');
    expect(html).toContain("<td>10%</td><td class=\"fd-d\">12.205,00 €</td><td class=\"fd-d\">1.220,50 €</td>");
    expect(html).toContain("<td>22%</td><td class=\"fd-d\">1.500,00 €</td><td class=\"fd-d\">330,00 €</td>");
  });

  it("l'importo di riga è l'imponibile, come nella FatturaPA", () => {
    expect(html).toContain('<td class="fd-d fd-importo">9.800,00 €</td>');
    expect(html).not.toContain("10.780,00 €");
  });

  it("scrive importi e quantità all'italiana, con il separatore delle migliaia sempre", () => {
    expect(html).toContain("2.405,00 €");
    expect(html).toContain('<td class="fd-d">1,5</td>');
    expect(euro(1250)).toBe("1.250,00 €");
  });

  it("porta logo, dati societari, cliente, pagamento leggibile e diciture", () => {
    expect(html).toContain('<img class="fd-logo" src="https://esempio.it/logo.png"');
    expect(html).toContain("REA PN-123456 · Capitale sociale versato 10.000,00 €");
    expect(html).toContain("Mario Rossi");
    expect(html).toContain("C.F. RSSMRA70A01G888X");
    expect(html).toContain('<div class="fd-metodo">Bonifico</div>');
    expect(html).toContain("IT60 X054 2811 1010 0000 0123 456");
    expect(html).toContain("Copia di cortesia.");
    expect(html).toContain("Documento generato da Edilizia in Cloud");
  });

  it("mette in evidenza quanto e entro quando", () => {
    expect(html).toContain('<div class="fd-voce fd-evidenza">Totale da pagare</div><div class="fd-valore fd-evidenza">15.255,50 €</div>');
    expect(html).toContain('<div class="fd-voce">Scadenza</div><div class="fd-valore">31/10/2026</div>');
  });

  it("i testi del documento arrivano come testo, mai come codice", () => {
    const conTag = documentoHtml({ ...fattura, note_documento: '<script>alert("x")</script>' }, azienda);
    expect(conTag).not.toContain("<script>");
    expect(conTag).toContain("&lt;script&gt;");
  });
});

describe("copia di cortesia: le voci dei totali", () => {
  it("senza ritenute il totale è la cifra finale", () => {
    expect(vociTotali(fattura)).toEqual([
      { voce: "Imponibile", importo: 13705 },
      { voce: "IVA", importo: 1550.5 },
      { voce: "Totale", importo: 15255.5, tipo: "finale" },
    ]);
  });

  it("sconto, cassa, bollo e ritenuta: i conti tornano fino al netto a pagare", () => {
    const voci = vociTotali({
      subtotale: 4000, sconto_globale_valore: 160, sconto_globale_percentuale: 4, imponibile_totale: 3840,
      cassa_importo: 117.6, iva_totale: 659.47, bollo_virtuale: true, bollo_importo: 2,
      totale_documento: 4619.07, ritenuta_importo: 768, totale_da_pagare: 3851.07,
    });
    expect(voci.map((v) => v.voce)).toEqual([
      "Totale righe", "Sconto 4%", "Imponibile", "Cassa previdenziale", "IVA", "Imposta di bollo",
      "Totale documento", "Ritenuta d'acconto", "Netto a pagare",
    ]);
    expect(voci.at(-1)).toEqual({ voce: "Netto a pagare", importo: 3851.07, tipo: "finale" });
  });

  it("scissione dei pagamenti: l'IVA versata dall'ente spiega la differenza", () => {
    const voci = vociTotali({
      esigibilita_iva: "S", imponibile_totale: 18500, iva_totale: 4070, totale_documento: 22570, totale_da_pagare: 18500,
    });
    expect(voci).toContainEqual({ voce: "IVA in scissione pagamenti", importo: -4070 });
    expect(voci.at(-1)).toEqual({ voce: "Netto a pagare", importo: 18500, tipo: "finale" });
  });

  it("nota di credito e preventivo dicono cosa sono, non «da pagare»", () => {
    expect(importoInEvidenza({ tipo: "nota_credito", totale_documento: 100 }).etichetta).toBe("Totale nota di credito");
    expect(importoInEvidenza({ tipo: "preventivo", totale_documento: 100 }).etichetta).toBe("Totale preventivo");
  });
});

describe("copia di cortesia: i dettagli", () => {
  it("le modalità di pagamento sono quelle della FatturaPA, con lo stesso nome dell'app", () => {
    expect(MODALITA_PAGAMENTO).toEqual(METODI_PAGAMENTO_SDI);
  });

  it("l'importo di riga legge anche le righe senza imponibile salvato", () => {
    expect(importoRiga({ totale_riga: 122, imposta: 22 })).toBe(100);
    expect(importoRiga({ imponibile: 0, totale_riga: 122 })).toBe(0);
  });

  it("il colore dell'azienda resta leggibile anche quando è chiaro", () => {
    for (const colore of ["#10b981", "#f59e0b", "#c8e600", "#0ea5e9"]) {
      expect(contrasto(temaFattura(colore).accentoTesto, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    }
    expect(temaFattura(undefined).accento).toBe("#0EA5E9");
  });

  it("la forma giuridica non si ripete quando la ragione sociale la dice già", () => {
    expect(formaGiuridicaDaMostrare("RENOVA SOLUTION S.R.L.", "SRL")).toBe("");
    expect(formaGiuridicaDaMostrare("Edil Bianchi", "Ditta Individuale")).toBe("Ditta Individuale");
    expect(formaGiuridicaDaMostrare("Edil Bianchi", "Altro")).toBe("");
  });

  it("IBAN a gruppi di quattro e segno meno tipografico", () => {
    expect(ibanLeggibile("it60x0542811101000000123456")).toBe("IT60 X054 2811 1010 0000 0123 456");
    expect(euroConSegno(-160)).toBe("−160,00 €");
  });
});
