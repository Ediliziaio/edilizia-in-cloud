/**
 * Timbro e firma dell'impresa nel preventivo, e il logo grande quanto dice il
 * modello (25/09/2026).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { logoDelModello, percorsoDellAzienda } from "../../../supabase/functions/_shared/impaginaPreventivo";
import { datiGenerici } from "../../components/preventivi/pdf/adattatoreGenerico";

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
    // Tab e a capo fra i due punti: la richiesta li toglie e resta «..».
    expect(percorsoDellAzienda(`${azienda}/.\t./99999999-2222-3333-4444-555555555555/timbro.png`, azienda)).toBeNull();
    expect(percorsoDellAzienda(`${azienda}/.\n./99999999-2222-3333-4444-555555555555/timbro.png`, azienda)).toBeNull();
    expect(percorsoDellAzienda(`${azienda}/.\r./x.png`, azienda)).toBeNull();
    // Un nome di file con gli spazi resta buono.
    expect(percorsoDellAzienda(`${azienda}/template timbro 1.png`, azienda)).toBe(`${azienda}/template timbro 1.png`);
    expect(percorsoDellAzienda("", azienda)).toBeNull();
    expect(percorsoDellAzienda(`${azienda}/timbro.png`, null)).toBeNull();
  });
});

describe("logo e copertina del modello, come il timbro", () => {
  const azienda = "11111111-2222-3333-4444-555555555555";

  it("il logo: un indirizzo passa, un percorso solo dalla cartella dell'azienda", () => {
    const pubblico = "https://progetto.supabase.co/storage/v1/object/public/company-logos/x/logo.png?t=1";
    expect(logoDelModello(pubblico, azienda)).toBe(pubblico);
    expect(logoDelModello(`${azienda}/template-logo-1.png`, azienda)).toBe(`${azienda}/template-logo-1.png`);
    expect(logoDelModello("99999999-2222-3333-4444-555555555555/template-logo-1.png", azienda)).toBeNull();
    expect(logoDelModello(`${azienda}/%2e%2e/altra/logo.png`, azienda)).toBeNull();
    expect(logoDelModello("", azienda)).toBeNull();
  });

  it("nel PDF logo, copertina e timbro si leggono con la stessa azienda, in anteprima e nel preventivo vero", () => {
    const pdf = leggi("supabase/functions/generate-quote-pdf/index.ts");
    expect(pdf).toContain("const aziendaDeiFile = isPreview ? aziendaAnteprima : quote?.company_id ?? null;");
    expect(pdf).toContain("const logoPath = logoDiRiserva(logoDelModello(t.logo_url, aziendaDeiFile), logoDelModello(company?.logo_url, aziendaDeiFile));");
    expect(pdf).toContain("const percorsoCopertina = percorsoDellAzienda(t.cover_image_url, aziendaDeiFile);");
    expect(pdf).toContain("t.show_cover_image === false ? Promise.resolve(null) : immagineRiservata(percorsoCopertina),");
    // Copertina (immagine o PDF di una pagina) e timbro: solo dal contenitore riservato, col percorso verificato.
    expect(pdf).toContain('const { data: file } = await supabaseAdmin.storage.from("quote-template-assets").download(percorso);');
    expect(pdf).toContain('const { data, error } = await supabaseAdmin.storage.from("quote-template-assets").download(percorsoCopertina);');
    expect(pdf).toContain("const percorsoTimbro = percorsoDellAzienda(t.timbro_firma_url, aziendaDeiFile);");
    // Nessuna lettura del contenitore dei modelli con un percorso non controllato.
    expect(pdf).not.toContain("const path = String(t.cover_image_url);");
    expect(pdf).not.toContain("immagineModello(t.cover_image_url)");
  });
});

// Dal 27/10/2026 il PDF lo disegna il motore unico (DocumentoEdilePDF, dal bundle
// _shared/preventivoRenderer.mjs): generate-quote-pdf legge i file, l'adattatore
// generico li passa al documento.
describe("il PDF del preventivo", () => {
  const pdf = leggi("supabase/functions/generate-quote-pdf/index.ts");
  const adattatore = leggi("src/components/preventivi/pdf/adattatoreGenerico.ts");
  const documento = leggi("src/components/preventivi/pdf/DocumentoEdilePDF.tsx");

  it("stampa timbro e chi firma nel riquadro dell'impresa", () => {
    expect(pdf).toContain("const percorsoTimbro = percorsoDellAzienda(t.timbro_firma_url, aziendaDeiFile);");
    expect(pdf).toContain("immagineRiservata(percorsoTimbro),");
    expect(pdf).toContain("timbro_firma_url: timbro,");
    expect(adattatore).toContain("dati.azienda.timbroUrl = str(t.timbro_firma_url) || null;");
    expect(adattatore).toContain("dati.azienda.firmatario = str(t.firmatario_impresa).trim() || null;");
    expect(documento).toContain(
      "etichetta=\"PER L'IMPRESA\" chi={[dati.azienda.nome, dati.azienda.firmatario].map((v) => String(v ?? \"\").trim()).filter(Boolean).join(\" — \")} timbro={dati.azienda.timbroUrl}",
    );
    // Il timbro poggia sulla riga della firma, nello spazio sopra.
    expect(documento).toContain("{timbro ? <Image src={timbro} style={{ position: \"absolute\", left: 0, bottom: 2,");
  });

  it("dall'adattatore escono timbro, chi firma, misura del logo e il nome leggibile", () => {
    const timbro = "data:image/png;base64,iVBORw0KGgo=";
    const dati = datiGenerici({
      quote: { quote_number: "P-1", client_name: "ROSSI MARIO", total: 122, subtotal: 100 },
      items: [],
      company: { name: "Impresa Srl" },
      template: { cover_title: "Per *ROSSI MARIO*", timbro_firma_url: timbro, firmatario_impresa: " Luca Bianchi ", logo_size: "large" },
    });
    expect(dati.azienda.timbroUrl).toBe(timbro);
    expect(dati.azienda.firmatario).toBe("Luca Bianchi");
    expect(dati.modello.copertina.scalaLogo).toBe(1.4);
    expect(dati.modello.copertina.titolo).toBe("Per *Rossi Mario*");
    expect(dati.cliente).toBe("ROSSI MARIO");
  });

  it("in anteprima l'azienda del modello vale solo se chi chiama ci può entrare", () => {
    expect(pdf).toContain("await requireCompanyAccess(supabaseAdmin, userId, aziendaDelModello, corsH);");
  });

  it("il logo segue Piccola/Media/Grande sulla copertina", () => {
    // Prima il logo valeva su copertina, prima pagina e pagine interne; nel documento edile
    // il logo sta solo in copertina, e lì vale la misura del modello.
    expect(adattatore).toContain('pdf_cover_logo_size: t.pdf_cover_logo_size ?? (t.logo_size === "small" ? 80 : t.logo_size === "large" ? 140 : null),');
    expect(documento).toContain("<Image src={logo} style={{ height: 50 * c.scalaLogo, maxWidth: 190 * c.scalaLogo, objectFit: \"contain\" }} />");
  });

  it("la copertina dice chi emette il preventivo e scrive leggibile il nome tutto maiuscolo", () => {
    // Col logo, sotto, l'indirizzo dell'impresa; senza logo il suo nome.
    expect(documento).toMatch(/<Image src=\{logo\}[^\n]*\n\s+\{dati\.azienda\.indirizzo \?/);
    expect(documento).toContain("{dati.azienda.nome.toUpperCase()}");
    expect(adattatore).toContain("pdf_cover_hero: conNomeLeggibile(t.cover_title), pdf_cover_subhero: conNomeLeggibile(t.cover_subtitle),");
    expect(adattatore).toContain("testo.split(nomeCliente).join(nomeLeggibile(nomeCliente))");
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
