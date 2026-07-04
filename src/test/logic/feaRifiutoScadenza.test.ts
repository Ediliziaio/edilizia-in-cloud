import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * P1 correttezza FEA — guardia scadenza server-side + flusso di rifiuto firma.
 *
 * Verifiche statiche (readFileSync) sui file toccati:
 *  1. fea-documento-pubblico impone una guardia su `expires_at` (410 su scaduto).
 *  2. Esiste la nuova edge fea-rifiuta-firma con status 'refused' e audit
 *     'firma_rifiutata'.
 *  3. La pagina pubblica FirmaDocumento espone un'azione "Rifiuta".
 *  4. companyRoutes consolida la route doppia con un Navigate verso la
 *     pagina canonica /azienda/firma-elettronica.
 */

const r = (p: string) => resolve(process.cwd(), p);

const DOCUMENTO_PUBBLICO = r("supabase/functions/fea-documento-pubblico/index.ts");
const RIFIUTA_FIRMA = r("supabase/functions/fea-rifiuta-firma/index.ts");
const FIRMA_DOCUMENTO = r("src/pages/public/FirmaDocumento.tsx");
const COMPANY_ROUTES = r("src/routes/companyRoutes.tsx");

describe("fea-documento-pubblico: guardia scadenza server-side", () => {
  it("il file esiste", () => {
    expect(existsSync(DOCUMENTO_PUBBLICO)).toBe(true);
  });

  it("contiene un controllo sulla data expires_at", () => {
    const src = readFileSync(DOCUMENTO_PUBBLICO, "utf8");
    expect(src).toContain("expires_at");
    // Confronto data corrente vs scadenza
    expect(src).toMatch(/new Date\(sigReq\.expires_at\)\s*<\s*new Date\(\)/);
  });

  it("restituisce 410 quando il link è scaduto", () => {
    const src = readFileSync(DOCUMENTO_PUBBLICO, "utf8");
    expect(src).toContain("410");
    expect(src).toContain("Link di firma scaduto");
  });

  it("blocca anche gli stati non riutilizzabili (refused/expired/cancelled)", () => {
    const src = readFileSync(DOCUMENTO_PUBBLICO, "utf8");
    expect(src).toContain('"expired"');
    expect(src).toContain('"cancelled"');
    expect(src).toContain('"refused"');
  });
});

describe("fea-rifiuta-firma: nuova edge di rifiuto", () => {
  it("il file esiste", () => {
    expect(existsSync(RIFIUTA_FIRMA)).toBe(true);
  });

  it("legge token dal body (pattern pubblico token-based)", () => {
    const src = readFileSync(RIFIUTA_FIRMA, "utf8");
    expect(src).toContain("token");
    expect(src).toContain("motivo");
  });

  it("imposta status 'refused' con refused_at e rifiuto_motivo", () => {
    const src = readFileSync(RIFIUTA_FIRMA, "utf8");
    expect(src).toMatch(/status:\s*["']refused["']/);
    expect(src).toContain("refused_at");
    expect(src).toContain("rifiuto_motivo");
  });

  it("registra l'evento di audit 'firma_rifiutata'", () => {
    const src = readFileSync(RIFIUTA_FIRMA, "utf8");
    expect(src).toContain("firma_rifiutata");
    expect(src).toContain("fea_audit_log");
  });

  it("gestisce idempotenza e stati bloccanti (già firmato / scaduto)", () => {
    const src = readFileSync(RIFIUTA_FIRMA, "utf8");
    expect(src).toContain("Documento già firmato");
    expect(src).toContain("409");
    expect(src).toContain("410");
  });

  it("sincronizza il preventivo collegato allo stato 'rifiutata'", () => {
    const src = readFileSync(RIFIUTA_FIRMA, "utf8");
    expect(src).toContain("quote_id");
    expect(src).toMatch(/status:\s*["']rifiutata["']/);
  });

  it("usa getCorsHeaders e il pattern service-role", () => {
    const src = readFileSync(RIFIUTA_FIRMA, "utf8");
    expect(src).toContain("getCorsHeaders(req)");
    expect(src).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("FirmaDocumento: azione di rifiuto in pagina pubblica", () => {
  it("il file esiste", () => {
    expect(existsSync(FIRMA_DOCUMENTO)).toBe(true);
  });

  it("espone un bottone 'Rifiuta' e chiama l'edge fea-rifiuta-firma", () => {
    const src = readFileSync(FIRMA_DOCUMENTO, "utf8");
    expect(src).toContain("Rifiuta");
    expect(src).toContain("fea-rifiuta-firma");
  });

  it("ha uno step finale dedicato al documento rifiutato", () => {
    const src = readFileSync(FIRMA_DOCUMENTO, "utf8");
    expect(src).toContain("'rifiutato'");
    expect(src).toContain("Documento rifiutato");
  });
});

describe("companyRoutes: consolidamento route doppia", () => {
  it("il file esiste", () => {
    expect(existsSync(COMPANY_ROUTES)).toBe(true);
  });

  it("redirige la route legacy verso /azienda/firma-elettronica", () => {
    const src = readFileSync(COMPANY_ROUTES, "utf8");
    expect(src).toContain("Navigate");
    expect(src).toMatch(/Navigate\s+to="\/azienda\/firma-elettronica"\s+replace/);
  });
});
