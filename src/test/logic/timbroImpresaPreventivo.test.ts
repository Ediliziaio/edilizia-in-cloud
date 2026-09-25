/**
 * Timbro e firma dell'impresa nel preventivo, e il logo grande quanto dice il
 * modello (25/09/2026).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { percorsoDellAzienda } from "../../../supabase/functions/_shared/impaginaPreventivo";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("il timbro si legge solo dalla cartella dell'azienda", () => {
  const azienda = "11111111-2222-3333-4444-555555555555";

  it("il file nella propria cartella passa", () => {
    expect(percorsoDellAzienda(`${azienda}/template-timbro-1.png`, azienda)).toBe(`${azienda}/template-timbro-1.png`);
    expect(percorsoDellAzienda(`/${azienda}/template-timbro-1.png`, azienda)).toBe(`${azienda}/template-timbro-1.png`);
  });

  it("il file di un'altra azienda, i percorsi furbi e i vuoti no", () => {
    expect(percorsoDellAzienda("99999999-2222-3333-4444-555555555555/template-timbro-1.png", azienda)).toBeNull();
    expect(percorsoDellAzienda(`${azienda}/../altra/timbro.png`, azienda)).toBeNull();
    expect(percorsoDellAzienda(`${azienda}//timbro.png`, azienda)).toBeNull();
    expect(percorsoDellAzienda(`${azienda}-falsa/timbro.png`, azienda)).toBeNull();
    // I «..» codificati o con la barra rovesciata: lo storage li decodifica e si esce dalla cartella.
    expect(percorsoDellAzienda(`${azienda}/%2e%2e/99999999-2222-3333-4444-555555555555/timbro.png`, azienda)).toBeNull();
    expect(percorsoDellAzienda(`${azienda}/..\\99999999/timbro.png`, azienda)).toBeNull();
    expect(percorsoDellAzienda(`${azienda}\\timbro.png`, azienda)).toBeNull();
    expect(percorsoDellAzienda("", azienda)).toBeNull();
    expect(percorsoDellAzienda(`${azienda}/timbro.png`, null)).toBeNull();
  });
});

describe("il PDF del preventivo", () => {
  const pdf = leggi("supabase/functions/generate-quote-pdf/index.ts");

  it("stampa timbro e chi firma nel riquadro dell'impresa", () => {
    expect(pdf).toContain("const percorsoTimbro = percorsoDellAzienda(t.timbro_firma_url, isPreview ? aziendaAnteprima : quote?.company_id);");
    expect(pdf).toContain('supabaseAdmin.storage.from("quote-template-assets").download(percorsoTimbro)');
    expect(pdf).toContain("[company?.name, t.firmatario_impresa].map((v) => String(v ?? \"\").trim()).filter(Boolean).join(\" — \")");
    expect(pdf).toContain("const sigH = timbroEmbed ? 86 : 66;");
  });

  it("in anteprima l'azienda del modello vale solo se chi chiama ci può entrare", () => {
    expect(pdf).toContain("await requireCompanyAccess(supabaseAdmin, userId, aziendaDelModello, corsH);");
  });

  it("il logo segue Piccola/Media/Grande su copertina, prima pagina e pagine interne", () => {
    expect(pdf).toContain('const scalaLogo = t.logo_size === "small" ? 0.8 : t.logo_size === "large" ? 1.4 : 1;');
    expect(pdf).toContain("Math.min((58 * scalaLogo) / logoEmbed.height, (210 * scalaLogo) / logoEmbed.width)");
    expect(pdf).toContain("Math.min((40 * scalaLogo) / logoEmbed.height, (180 * scalaLogo) / logoEmbed.width)");
    expect(pdf).toContain("Math.min((22 * scalaLogo) / logoEmbed.height, (120 * scalaLogo) / logoEmbed.width)");
  });

  it("la copertina dice chi emette il preventivo e scrive leggibile il nome tutto maiuscolo", () => {
    expect(pdf).toContain('const contattiC = [company?.email, company?.phone ? `Tel. ${company.phone}` : null].filter(Boolean).join("  ·  ");');
    expect(pdf).toContain("const titoloGrezzo = conNomeLeggibile(String(t.cover_title ?? \"\").trim())");
  });
});

describe("l'editor del modello e il database", () => {
  it("il timbro si carica nella cartella dell'azienda del contenitore riservato, e si vede con un link a scadenza", () => {
    const editor = leggi("src/pages/azienda/settings/SettingsQuoteTemplates.tsx");
    expect(editor).toContain("const path = `${effectiveCompany.id}/template-timbro-${Date.now()}.${ext}`;");
    expect(editor).toContain('supabase.storage.from("quote-template-assets").createSignedUrl(percorso, 60 * 60)');
    expect(editor).toContain("Chi firma per l'impresa");
  });

  it("le due colonne nascono nella migrazione, idempotente e col lock_timeout", () => {
    const cartella = join(process.cwd(), "supabase/migrations");
    const file = readdirSync(cartella).find((f) => f.endsWith("_modelli_preventivo_timbro_impresa.sql"));
    expect(file).toBeTruthy();
    const sql = readFileSync(join(cartella, file!), "utf8");
    expect(sql).toContain("set local lock_timeout = '3s';");
    expect(sql).toContain("alter table public.quote_templates add column if not exists timbro_firma_url text;");
    expect(sql).toContain("alter table public.quote_templates add column if not exists firmatario_impresa text;");
  });
});
