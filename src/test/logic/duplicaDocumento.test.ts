// «Duplica» copiava solo le note (09/11/2026): dall'8/11 l'elenco legge una vista
// ridotta, senza righe né pagamento, e la copia nasceva da quella riga.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { datiCopiaDocumento } from "@/lib/fatturazione/duplicaDocumento";
import type { DocumentoFiscale } from "@/types/fatturazione";

const sorgente = (p: string) => readFileSync(`src/pages/azienda/fatturazione/${p}`, "utf8");

const riga = {
  id: "riga-vecchia", numero_linea: 7, descrizione: "Posa infissi", quantita: 2, unita_misura: "pz",
  prezzo_unitario: 100, imponibile: 200, aliquota_iva: "22", imposta: 44, totale_riga: 244,
};

const originale = {
  id: "doc-1", company_id: "az-1", tipo: "fattura", numero: "FPR 73/26", numero_progressivo: 73, anno: 2026,
  serie: "A", stato: "pagata", data_emissione: "2026-10-01", data_scadenza: "2026-10-31", anagrafica_id: "cli-1",
  cliente_snapshot: { ragione_sociale: "Cliente di prova", tipo_cliente: "B2B" },
  righe: [riga, { ...riga, id: "riga-2", numero_linea: 8 }],
  riepilogo_iva: [{ aliquota: "22", imponibile: 400, imposta: 88, esigibilita: "I" }],
  subtotale: 400, imponibile_totale: 400, iva_totale: 88, totale_documento: 488, totale_da_pagare: 488,
  sconto_globale_percentuale: 5, ritenuta_acconto: true, ritenuta_aliquota: 20,
  metodo_pagamento_codice: "MP05", iban_pagamento: "IT60X0542811101000000123456", nome_banca: "Banca", intestatario_conto: "Azienda",
  scadenze_pagamento: [{ numero_rata: 1, data_scadenza: "2026-10-31", importo: 488, metodo_pagamento: "MP05", pagato: true, pagato_at: "2026-10-20", pagato_importo: 488 }],
  note_documento: "Note del documento", note_interne: "Note interne", causale: ["Lavori"], cig: "CIG1", cup: "CUP1",
  // Tutto quello che NON deve passare alla copia.
  sdi_id_trasmissione: "IT123", sdi_identificativo: "999", sdi_stato: "MC", sdi_errori: ["x"], sdi_data_consegna: "2026-10-02",
  sdi_notifica_tipo: "MC", sdi_file_xml_url: "xml", sdi_ricevuta_url: "ric", trasmissione: "sdi",
  metodo_pagamento_nome: "Bonifico Bancario", importo_pagato: 488, pagato_at: "2026-10-20", pdf_url: "pdf", allegati: ["a"], documento_correlato_id: "doc-0",
  ordine_id: "ord-1", ddt_fattura_id: "ft-1", ddt_fatturato: true, riferimenti_ordine: ["o"], riferimenti_ddt: ["d"],
  created_at: "2026-10-01", updated_at: "2026-10-02", deleted_at: "2026-10-03",
} as unknown as DocumentoFiscale;

const OGGI = "2026-11-09";

describe("Duplica: la copia arriva completa", () => {
  const copia = datiCopiaDocumento(originale, OGGI) as Record<string, unknown>;

  it("porta righe, cliente, pagamento, riepilogo, sconti, ritenute e note", () => {
    expect((copia.righe as unknown[]).length).toBe(2);
    expect(copia.cliente_snapshot).toEqual(originale.cliente_snapshot);
    expect(copia.anagrafica_id).toBe("cli-1");
    expect(copia.metodo_pagamento_codice).toBe("MP05");
    expect(copia.iban_pagamento).toBe(originale.iban_pagamento);
    expect(copia.riepilogo_iva).toEqual(originale.riepilogo_iva);
    expect(copia.totale_documento).toBe(488);
    expect(copia.totale_da_pagare).toBe(488);
    expect(copia.sconto_globale_percentuale).toBe(5);
    expect(copia.ritenuta_acconto).toBe(true);
    expect(copia.note_documento).toBe("Note del documento");
    expect(copia.note_interne).toBe("Note interne");
    expect(copia.causale).toEqual(["Lavori"]);
  });

  it("le righe sono nuove: id diversi (gli id agganciano SAL e fasi già fatturati) e numerate da 1", () => {
    const righe = copia.righe as typeof riga[];
    expect(righe.map((r) => r.numero_linea)).toEqual([1, 2]);
    expect(righe.map((r) => r.id)).not.toContain("riga-vecchia");
    expect(new Set(righe.map((r) => r.id)).size).toBe(2);
    expect(righe[0].descrizione).toBe("Posa infissi");
  });

  it("numero, stato, dati SDI, incassi e collegamenti restano sull'originale", () => {
    for (const campo of [
      "id", "company_id", "numero", "numero_progressivo", "anno", "stato", "data_emissione",
      "sdi_id_trasmissione", "sdi_identificativo", "sdi_stato", "sdi_errori", "sdi_data_consegna", "sdi_notifica_tipo",
      "metodo_pagamento_nome", "sdi_file_xml_url", "sdi_ricevuta_url", "trasmissione", "importo_pagato", "pagato_at", "pdf_url", "allegati",
      "documento_correlato_id", "ordine_id", "ddt_fattura_id", "ddt_fatturato", "riferimenti_ordine", "riferimenti_ddt",
      "created_at", "updated_at", "deleted_at",
    ]) {
      expect(copia, campo).not.toHaveProperty(campo);
    }
  });

  it("le scadenze ripartono da oggi e non risultano pagate", () => {
    expect(copia.data_scadenza).toBe("2026-12-09"); // 30 giorni dalla nuova data, come l'originale
    const [rata] = copia.scadenze_pagamento as Record<string, unknown>[];
    expect(rata.data_scadenza).toBe("2026-12-09");
    expect(rata.pagato).toBe(false);
    expect(rata).not.toHaveProperty("pagato_at");
    expect(rata).not.toHaveProperty("pagato_importo");
  });

  it("senza date di partenza non si inventa una scadenza", () => {
    const c = datiCopiaDocumento({ ...originale, data_scadenza: undefined, scadenze_pagamento: [] }, OGGI) as Record<string, unknown>;
    expect(c.data_scadenza).toBeUndefined();
  });
});

describe("Duplica: da dove nasce la copia", () => {
  it("dall'elenco si rilegge il documento intero: la riga dell'elenco non ha righe né pagamento", () => {
    const lista = sorgente("DocumentiFiscaliList.tsx");
    expect(lista).not.toMatch(/state:\s*\{\s*prefilled:\s*doc\s*\}/);
    expect(lista).toMatch(/rileggiDocumentoFiscale\(doc\.id\)/);
    expect(lista).toContain("datiCopiaDocumento(");
  });

  it("dal dettaglio e dall'editor passa dalla stessa regola", () => {
    expect(sorgente("DocumentoDetail.tsx")).not.toMatch(/state:\s*\{\s*prefilled:\s*doc\s*\}/);
    expect(sorgente("DocumentoDetail.tsx")).toContain("datiCopiaDocumento(");
    expect(sorgente("EditorDocumento.tsx")).toContain("datiCopiaDocumento(");
  });

  it("l'editor si rimonta per documento: dopo Duplica mostra la copia, non resta sull'originale", () => {
    expect(sorgente("EditorDocumento.tsx")).toMatch(/key=\{id \?\? "nuovo"\}/);
  });
});
