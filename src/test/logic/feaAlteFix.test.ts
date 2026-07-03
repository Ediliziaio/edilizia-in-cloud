import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Test di regressione sui fix ALTI dell'audit v2 firma elettronica (lato codice).
// Non montano componenti/edge: verificano che le patch chiave siano presenti nei
// sorgenti, così una rimozione accidentale rompe la build dei test.

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const firmaDocumento = read("src/pages/public/FirmaDocumento.tsx");
const quoteSign = read("supabase/functions/quote-sign/index.ts");
const completaFirma = read("supabase/functions/fea-completa-firma/index.ts");
const rifiutaFirma = read("supabase/functions/fea-rifiuta-firma/index.ts");

describe("Bug #1 — B2C recesso raggiungibile con fallback", () => {
  it("definisce un testo di recesso di fallback locale", () => {
    expect(firmaDocumento).toContain("RECESSO_FALLBACK");
    expect(firmaDocumento).toMatch(/14 giorni/);
  });

  it("mostra sempre lo step recesso ai firmatari B2C (no salto)", () => {
    // Il routing post-OTP per B2C va allo step recesso senza il vecchio gate
    // "&& sessione?.b2c_testo_recesso" che lo faceva saltare.
    expect(firmaDocumento).toMatch(/if\s*\(isB2c\)\s*\{\s*setStep\('b2c_recesso'\)/);
    expect(firmaDocumento).not.toContain("isB2c && sessione?.b2c_testo_recesso");
  });

  it("usa il fallback nel render quando b2c_testo_recesso è assente", () => {
    expect(firmaDocumento).toContain("sessione.b2c_testo_recesso ?? RECESSO_FALLBACK");
  });
});

describe("Bug #7 — messaggi errore edge in italiano", () => {
  it("legge il corpo reale dell'errore via error.context", () => {
    expect(firmaDocumento).toContain("messaggioErroreEdge");
    // La helper estrae il body dell'errore da error.context e ne legge il JSON.
    expect(firmaDocumento).toMatch(/\.context\b/);
    expect(firmaDocumento).toMatch(/\.json\(\)/);
  });

  it("applica la helper a tutte le invoke FEA della pagina", () => {
    // Una occorrenza per: documento-pubblico, genera-otp, verifica-otp,
    // completa-firma, rifiuta-firma → almeno 5 usi della helper.
    const usi = firmaDocumento.match(/messaggioErroreEdge\(error,/g) ?? [];
    expect(usi.length).toBeGreaterThanOrEqual(5);
  });
});

describe("Bug #4 — quote-sign blocca il bypass OTP", () => {
  it("controlla una richiesta FEA attiva prima di firmare col nome", () => {
    expect(quoteSign).toContain("signature_requests");
    expect(quoteSign).toContain("otp_verified");
    expect(quoteSign).toMatch(/tipo_documento[^\n]*quote/);
    expect(quoteSign).toContain("usa il link di firma elettronica ricevuto via email");
  });
});

describe("Mancanza #1 — notifica al titolare", () => {
  it("fea-completa-firma invia create_notification al proprietario", () => {
    expect(completaFirma).toContain("create_notification");
    expect(completaFirma).toContain("documento_firmato");
    expect(completaFirma).toContain("/azienda/firma-elettronica");
    expect(completaFirma).toContain("risolviOwner");
  });

  it("fea-rifiuta-firma invia create_notification al proprietario", () => {
    expect(rifiutaFirma).toContain("create_notification");
    expect(rifiutaFirma).toContain("documento_rifiutato");
    expect(rifiutaFirma).toContain("/azienda/firma-elettronica");
    expect(rifiutaFirma).toContain("risolviOwner");
  });

  it("la notifica è non bloccante (try/catch + console.warn)", () => {
    expect(completaFirma).toContain("notify owner error");
    expect(rifiutaFirma).toContain("notify owner error");
  });
});
