// Reverse charge e acquisti esteri: dalla ricevuta all'integrazione (09/11/2026).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { datiIntegrazione, serveIntegrazione, tipoProposto, type RicevutaDaIntegrare } from "@/lib/fatturazione/integrazioneRicevuta";
import { importoDaTesto, problemiRicevutaPdf, righeRicevutaPdf } from "@/lib/fatturazione/ricevutaPdf";
import { generateXML } from "../../../supabase/functions/_shared/generateXML";

const base: RicevutaDaIntegrare = {
  id: "r1", cedente_ragione_sociale: "Subappalti Prova srl", cedente_piva: "09876543210", cedente_paese: "IT",
  cedente_indirizzo: "Via B 2", cedente_cap: "00100", cedente_comune: "Roma", cedente_provincia: "RM",
  tipo_documento: "TD01", numero_fattura: "12/A", data_fattura: "2026-10-20", imponibile_totale: 1000,
  riepilogo_iva: [{ natura: "N6.3", aliquota: "0.00", imponibile: 1000, imposta: 0 }],
};
const azienda = { ragione_sociale: "Azienda Prova", partita_iva: "01234567890", codice_fiscale: "01234567890", regime_fiscale: "RF01", indirizzo_via: "Via A 1", indirizzo_cap: "20100", indirizzo_comune: "Milano", indirizzo_provincia: "MI", indirizzo_nazione: "IT" };

describe("quali ricevute si integrano", () => {
  it("reverse charge: sì, TD16", () => {
    expect(serveIntegrazione(base)).toBe(true);
    expect(tipoProposto(base)).toBe("reverse_charge_interno");
  });
  it("fornitore estero: sì, proposta TD17", () => {
    const f = { ...base, cedente_paese: "DE", riepilogo_iva: [] as unknown[] };
    expect(serveIntegrazione(f)).toBe(true);
    expect(tipoProposto(f)).toBe("integrazione_servizi_estero");
  });
  it("fattura italiana con IVA e note di credito: no", () => {
    expect(serveIntegrazione({ ...base, riepilogo_iva: [{ aliquota: "22.00", imponibile: 1000, imposta: 220 }] })).toBe(false);
    expect(serveIntegrazione({ ...base, tipo_documento: "TD04" })).toBe(false);
  });
});

describe("la bozza d'integrazione", () => {
  const d = datiIntegrazione(base, 22);
  it("ha l'IVA che la fattura non ha, e il fornitore come controparte", () => {
    expect(d.righe![0].imposta).toBe(220);
    expect(d.righe![0].natura_iva).toBeUndefined();
    expect(d.iva_totale).toBe(220);
    expect(d.totale_documento).toBe(1220);
    expect(d.cliente_snapshot!.ragione_sociale).toBe("Subappalti Prova srl");
    expect(d.fattura_ricevuta_id).toBe("r1");
  });
  it("rispetta l'aliquota scelta", () => {
    expect(datiIntegrazione(base, 10).iva_totale).toBe(100);
  });
  it("una riga per ogni importo in reverse charge, non per quelli con IVA", () => {
    const f = { ...base, riepilogo_iva: [{ natura: "N6.3", imponibile: 700 }, { natura: "N6.7", imponibile: 300 }, { aliquota: "22.00", imponibile: 50 }] };
    expect(datiIntegrazione(f, 22).righe!.map((r) => r.imponibile)).toEqual([700, 300]);
  });
  it("XML TD16: fornitore cedente, noi cessionario, IVA 22 e fattura collegata", () => {
    const xml = generateXML({
      ...d, tipo: "reverse_charge_interno", numero: "FT-2026-0050", data_emissione: "2026-11-09", metodo_pagamento_codice: "MP05",
      fattura_collegata: { numero: "12/A", data: "2026-10-20" },
    }, azienda, "00001");
    expect(xml).toContain("<TipoDocumento>TD16</TipoDocumento>");
    expect(xml).toMatch(/<DatiFattureCollegate><IdDocumento>12\/A<\/IdDocumento><Data>2026-10-20<\/Data>/);
    expect(xml).toMatch(/<AliquotaIVA>22\.00<\/AliquotaIVA>/);
    const cedente = xml.slice(xml.indexOf("<CedentePrestatore>"), xml.indexOf("</CedentePrestatore>"));
    const cessionario = xml.slice(xml.indexOf("<CessionarioCommittente>"), xml.indexOf("</CessionarioCommittente>"));
    expect(cedente).toContain("09876543210");
    expect(cessionario).toContain("01234567890");
  });
});

describe("il percorso è completo", () => {
  const sorgente = (p: string) => readFileSync(p, "utf8");
  it("l'invio dichiara la ricevuta e rifiuta chi non va allo SDI", () => {
    const invio = sorgente("supabase/functions/invia-sdi/index.ts");
    expect(invio).toContain("doc.fattura_ricevuta_id");
    expect(invio).toContain("TIPI_SENZA_SDI.includes(doc.tipo)");
  });
  it("il database ammette i tipi e una ricevuta non si integra due volte", () => {
    const sql = sorgente("supabase/migrations/20290117120000_integrazioni_reverse_charge.sql");
    expect(sql).toContain("'reverse_charge_interno','integrazione_servizi_estero'");
    expect(sql).toContain("documenti_fiscali_una_integrazione_per_ricevuta");
  });
  it("le righe nuove di un TD16 non nascono a IVA zero", () => {
    expect(sorgente("src/pages/azienda/fatturazione/editor/EditorRigheSection.tsx")).not.toContain('riga.natura_iva = "N6_3"');
  });
});

describe("fattura ricevuta da PDF", () => {
  const form = { fornitore: "Fournisseur SA", partitaIva: "FR123", paese: "fr", numero: "9", data: "2026-11-01", totale: "1.234,50", indirizzo: "Rue A 1", cap: "75001", comune: "Paris" };
  it("legge l'importo scritto all'italiana", () => {
    expect(importoDaTesto("1.234,50")).toBe(1234.5);
    expect(importoDaTesto("1234.5")).toBe(1234.5);
    expect(importoDaTesto("abc")).toBeNaN();
  });
  it("nasce senza IVA e senza toccare il tipo SDI", () => {
    const r = righeRicevutaPdf(form);
    expect(r.iva_totale).toBe(0);
    expect(r.imponibile_totale).toBe(1234.5);
    expect(r.cedente_paese).toBe("FR");
    expect(r.riepilogo_iva).toEqual([]);
  });
  it("anche italiana si integra, senza finire in liquidazione: nessuna natura N6", () => {
    const r = righeRicevutaPdf({ ...form, paese: "IT" });
    expect(r.riepilogo_iva).toEqual([]);
    expect(serveIntegrazione({ ...base, ...r, id: "x", pdf_storage_path: "a/b.pdf" } as RicevutaDaIntegrare)).toBe(true);
    expect(r.cedente_indirizzo).toBe("Rue A 1");
  });
  it("dice cosa manca", () => {
    expect(problemiRicevutaPdf({ ...form, fornitore: "", totale: "0", comune: "" })).toEqual(["il fornitore", "il comune", "l'importo"]);
    expect(problemiRicevutaPdf(form)).toEqual([]);
  });
});
