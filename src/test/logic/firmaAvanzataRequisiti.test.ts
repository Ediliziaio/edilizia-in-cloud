import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DICHIARAZIONE_VERSIONE, MAX_CODICI_INVIATI, MAX_ERRORI_TOTALI, controllaSessioneFirma, impronta,
  mascheraNumeroDocumento, nuovaSessioneFirma, testoDichiarazione,
} from "../../../supabase/functions/_shared/firmaAvanzata";

const leggi = (p: string) => readFileSync(p, "utf8");

describe("Firma elettronica avanzata: requisiti DPCM 22/02/2013", () => {
  it("la chiave di sessione vale solo se è quella data, e non oltre la scadenza", async () => {
    const s = nuovaSessioneFirma();
    expect(s).toMatch(/^[0-9a-f]{64}$/);
    const r = { sessione_firma_hash: await impronta(s), sessione_firma_scadenza: new Date(Date.now() + 60_000).toISOString() };
    expect(await controllaSessioneFirma(r, s)).toBe(true);
    expect(await controllaSessioneFirma(r, nuovaSessioneFirma())).toBe(false);
    expect(await controllaSessioneFirma(r, undefined)).toBe(false);
    expect(await controllaSessioneFirma({ ...r, sessione_firma_scadenza: "2020-01-01T00:00:00Z" }, s)).toBe(false);
    expect(await controllaSessioneFirma({ sessione_firma_hash: null, sessione_firma_scadenza: null }, s)).toBe(false);
  });

  it("la dichiarazione dice limiti d'uso, conservazione, copia gratuita e revoca", () => {
    const t = testoDichiarazione("Rossi Serramenti", "https://app.example.it");
    expect(t).toContain("Rossi Serramenti");
    expect(t).toContain("art. 60");
    expect(t).toContain("20 anni");
    expect(t).toContain("gratuitamente copia");
    expect(t).toContain("revocare");
    expect(t).toContain("https://app.example.it/firma-elettronica-avanzata");
    expect(DICHIARAZIONE_VERSIONE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("il numero del documento d'identità nel certificato è mascherato", () => {
    expect(mascheraNumeroDocumento("CA12345AB")).toBe("******5AB");
    expect(mascheraNumeroDocumento("12")).toBe("***");
  });

  it("i tetti per richiesta esistono e li applicano invio e verifica del codice", () => {
    expect(MAX_CODICI_INVIATI).toBe(10);
    expect(MAX_ERRORI_TOTALI).toBe(15);
    expect(leggi("supabase/functions/fea-genera-otp/index.ts")).toContain("MAX_CODICI_INVIATI");
    expect(leggi("supabase/functions/fea-verifica-otp/index.ts")).toContain("otp_errori_totali: (sigReq.otp_errori_totali ?? 0) + 1");
  });

  it("la firma richiede la chiave di sessione, il documento integro e, se avanzata, l'identificazione", () => {
    const completa = leggi("supabase/functions/fea-completa-firma/index.ts");
    expect(completa).toContain("controllaSessioneFirma(sigReq, sessione_firma)");
    expect(completa).toContain("rileggiDocumentoCongelato(");
    expect(completa).toContain('code: "identificazione_richiesta"');
    expect(completa).toContain("conservaProveFirma(");
    // Il dispositivo lo dice la richiesta, non il corpo scritto dal browser.
    expect(completa).toContain('req.headers.get("user-agent")');
    expect(completa).not.toMatch(/const \{[^}]*\buser_agent\b[^}]*\} = body/);
  });

  it("ogni invio congela il documento, anche i preventivi", () => {
    expect(leggi("supabase/functions/fea-richiedi-firma/index.ts")).toContain("congelaDocumento(");
    expect(leggi("supabase/functions/send-quote-signature/index.ts")).toContain("congelaDocumento(");
    expect(leggi("supabase/functions/fea-documento-pubblico/index.ts")).toContain("sigReq.documento_path");
  });

  it("la pagina di presentazione non promette marca temporale né SPID", () => {
    const pagina = leggi("src/pages/funzionalita/FirmaElettronica.tsx");
    expect(pagina).not.toMatch(/marca temporale qualificata/i);
    expect(pagina).not.toMatch(/supportiamo SPID/i);
    expect(pagina).not.toMatch(/PDF\/A/);
  });
});
