// Difetti trovati dalla revisione del 09/11/2026.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { datiCopiaDocumento, siPuoDuplicare } from "@/lib/fatturazione/duplicaDocumento";
import { datiFatturaDaDdt } from "@/lib/fatturazione/fatturaDaDdt";
import { siPuoRipristinare } from "@/lib/fatturazione/cestino";
import { documentoDaConservare } from "@/lib/fatturazione/conservazione";
import { leggiEsitoOpenapi } from "../../../supabase/functions/_shared/sdiStatoOpenapi";
import type { DocumentoFiscale } from "@/types/fatturazione";

const sorgente = (p: string) => readFileSync(p, "utf8");
const migrazione = sorgente("supabase/migrations/20290117130000_fatture_revisione_iva_storni_permessi.sql");

describe("Duplica su note e integrazioni", () => {
  it("una nota copiata resta legata alla fattura che storna", () => {
    const c = datiCopiaDocumento({ tipo: "nota_credito", documento_correlato_id: "f1", righe: [] } as Partial<DocumentoFiscale>);
    expect(c.documento_correlato_id).toBe("f1");
  });
  it("le altre copie no", () => {
    expect(datiCopiaDocumento({ tipo: "fattura", documento_correlato_id: "p1", righe: [] } as Partial<DocumentoFiscale>)).not.toHaveProperty("documento_correlato_id");
  });
  it("un'integrazione non si duplica, da nessun punto", () => {
    expect(siPuoDuplicare("reverse_charge_interno")).toBe(false);
    expect(siPuoDuplicare("integrazione_beni_ue")).toBe(false);
    expect(siPuoDuplicare("fattura")).toBe(true);
    expect(sorgente("src/pages/azienda/fatturazione/DocumentiFiscaliList.tsx")).toContain("siPuoDuplicare(doc.tipo)");
    expect(sorgente("src/pages/azienda/fatturazione/DocumentoDetail.tsx")).toContain("siPuoDuplicare(doc.tipo)");
    expect(sorgente("src/pages/azienda/fatturazione/EditorDocumento.tsx")).toContain("siPuoDuplicare(state.tipo)");
  });
});

describe("fattura da DDT", () => {
  it("nasce coi totali: emessa dal dettaglio non esce a zero", () => {
    const f = datiFatturaDaDdt({
      numero: "DDT-1", data_emissione: "2026-11-01", cliente_snapshot: {},
      righe: [{ id: "a", numero_linea: 1, descrizione: "M", quantita: 2, unita_misura: "pz", prezzo_unitario: 50, imponibile: 0, aliquota_iva: "22", imposta: 0, totale_riga: 0 }],
    } as unknown as DocumentoFiscale);
    expect(f.imponibile_totale).toBe(100);
    expect(f.totale_documento).toBe(122);
    expect(f.totale_da_pagare).toBe(122);
  });
});

describe("tipi nuovi negli elenchi", () => {
  it("una TD16 annullata col numero non si ripristina, emessa si conserva", () => {
    expect(siPuoRipristinare({ tipo: "reverse_charge_interno", stato: "annullata", numero: "FT-2026-0001" })).toBe(false);
    expect(documentoDaConservare("integrazione_servizi_estero", "emessa")).toBe(true);
  });
});

describe("esiti SDI", () => {
  const rifiutata = { details: { sdi_status: "REJECTED" } };
  it("rifiutata dall'ente PA: esito del committente, non uno scarto", () => {
    expect(leggiEsitoOpenapi(rifiutata, true)?.sdi_stato).toBe("EC02");
  });
  it("tra privati resta scarto", () => {
    expect(leggiEsitoOpenapi(rifiutata)?.sdi_stato).toBe("NS");
  });
  it("il webhook riconosce NE", () => {
    expect(sorgente("supabase/functions/sdi-webhook/index.ts")).toContain('case "NE":');
  });
});

describe("email della fattura", () => {
  const email = sorgente("supabase/functions/send-documento-email/index.ts");
  it("non finge un errore dopo aver spedito", () => {
    expect(email).not.toMatch(/\.insert\(\{[\s\S]{0,700}\}\)\.catch\(/);
    expect(email).toContain("errRegistro");
  });
  it("non promette un allegato che non c'è, e saluta l'azienda per nome", () => {
    expect(email).not.toContain("in allegato trova");
    expect(email).toContain('String(cliente?.ragione_sociale ?? "").trim()');
  });
});

describe("permessi", () => {
  it("invio, spedizione e PDF controllano il permesso con il token di chi chiama", () => {
    expect(sorgente("supabase/functions/invia-sdi/index.ts")).toContain("puoGestireDocumento(token, doc.company_id, doc.tipo,");
    expect(sorgente("supabase/functions/send-documento-email/index.ts")).toContain("puoGestireDocumento(token, doc.company_id, doc.tipo,");
    expect(sorgente("supabase/functions/generate-native-pdf/index.ts")).toContain("puoLeggereDocumento(token, documento_id,");
  });
  it("fatture ricevute: dati fiscali solo con Fatturazione", () => {
    expect(migrazione).toContain("create trigger fatture_ricevute_solo_fatturazione");
    expect(migrazione).toContain("create trigger blocco_scrittura_sola_lettura");
  });
  it("note scartate fuori dagli storni, liquidazione senza doppio", () => {
    expect(migrazione).toContain("nc.stato not in ('bozza', 'annullata', 'rifiutata')");
    expect(migrazione).toContain("i.fattura_ricevuta_id = a.id");
  });
});
