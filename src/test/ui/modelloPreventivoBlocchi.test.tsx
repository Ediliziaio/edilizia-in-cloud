/**
 * Preventivo generico: contatti dell'impresa e colori dei blocchi collegati
 * (Ener Italia, 25/09/2026).
 *
 * Sul PDF stampato Elena ha cerchiato due cose. Sotto «L'impresa» usciva la
 * mail del profilo aziendale, che era quella di un consulente: ora mail e
 * telefono si scrivono nel modello. E la copertina: l'aveva messa verde nel
 * modello «Copertina standard», ma il PDF la colorava col blu del modello
 * «Offerta standard» — i colori dei blocchi collegati (copertina, condizioni,
 * sezioni, schede prodotto) non valevano da nessuna parte.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  COLORE_ACCENTO_DI_FABBRICA,
  coloreCopertina,
  coloreDelBlocco,
  contattiImpresa,
} from "../../../supabase/functions/_shared/blocchiModelloPreventivo";
import { resolveQuoteTemplatePreview } from "@/lib/quoteTemplatePreview";
import { QuoteTemplatePreview } from "@/components/quotes/QuoteTemplatePreview";
import { QuoteLivePreviewPanel, type QuoteLivePreviewProps } from "@/components/quotes/QuoteLivePreviewPanel";
import { DEFAULT_TEMPLATE, type QuoteTemplate } from "@/types/quoteTemplate";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const VERDE_ENER = "#166534";

afterEach(cleanup);

describe("il colore di un blocco vale se è stato scelto", () => {
  it("un colore scelto passa, quello di fabbrica no (vale quello del modello)", () => {
    expect(coloreDelBlocco(VERDE_ENER)).toBe(VERDE_ENER);
    expect(coloreDelBlocco("#abc")).toBe("#AABBCC");
    expect(coloreDelBlocco("#1E40AF")).toBeNull();
    expect(coloreDelBlocco("1e40af")).toBeNull();
    expect(coloreDelBlocco("")).toBeNull();
    expect(coloreDelBlocco(null)).toBeNull();
    expect(coloreDelBlocco("verde")).toBeNull();
    expect(coloreDelBlocco(COLORE_ACCENTO_DI_FABBRICA, COLORE_ACCENTO_DI_FABBRICA)).toBeNull();
    expect(coloreDelBlocco("#FEF3C7", COLORE_ACCENTO_DI_FABBRICA)).toBe("#FEF3C7");
  });

  it("la copertina: il colore della copertina collegata, se scelto; se no quello del modello", () => {
    expect(coloreCopertina("#1E40AF", { primary_color: VERDE_ENER })).toBe(VERDE_ENER);
    expect(coloreCopertina("#7C2D12", { primary_color: "#1E40AF" })).toBe("#7C2D12");
    expect(coloreCopertina("#7C2D12", null)).toBe("#7C2D12");
    expect(coloreCopertina(null, undefined)).toBe("#1E40AF");
  });
});

describe("i contatti dell'impresa nel preventivo", () => {
  const profilo = { email: "giancarlo.turchetto@ener.it", phone: "045 000000" };

  it("quelli scritti nel modello valgono più del profilo", () => {
    expect(contattiImpresa({ email_impresa: " info@ener.it ", telefono_impresa: "045 123456" }, profilo))
      .toEqual({ email: "info@ener.it", phone: "045 123456" });
  });

  it("vuoti o solo spazi: restano quelli del profilo", () => {
    expect(contattiImpresa({ email_impresa: "", telefono_impresa: "   " }, profilo))
      .toEqual({ email: "giancarlo.turchetto@ener.it", phone: "045 000000" });
    expect(contattiImpresa(undefined, profilo)).toEqual({ email: "giancarlo.turchetto@ener.it", phone: "045 000000" });
    expect(contattiImpresa({}, {})).toEqual({ email: null, phone: null });
  });
});

// Il primo disegno delle anteprime, a macchina carica, supera i 5 secondi di serie.
describe("le anteprime seguono il PDF", { timeout: 30_000 }, () => {
  const offerta = { ...DEFAULT_TEMPLATE, linked_cover_id: "copertina" } as Partial<QuoteTemplate>;
  const copertina = (colore: string) => ({
    ...DEFAULT_TEMPLATE, id: "copertina", kind: "copertina", primary_color: colore,
    cover_title: "Offerta per {{cliente.nome_completo}}",
  }) as QuoteTemplate;

  it("la copertina collegata porta il suo colore nell'anteprima", () => {
    expect(resolveQuoteTemplatePreview(offerta, [copertina(VERDE_ENER)]).colore_copertina).toBe(VERDE_ENER);
    expect(resolveQuoteTemplatePreview(offerta, [copertina("#1E40AF")]).colore_copertina).toBe("#1E40AF");
    expect(resolveQuoteTemplatePreview({ ...DEFAULT_TEMPLATE }, []).colore_copertina).toBeUndefined();
  });

  it("la copertina dell'anteprima dei modelli è verde, non blu", () => {
    const { container } = render(
      <QuoteTemplatePreview template={resolveQuoteTemplatePreview(offerta, [copertina(VERDE_ENER)])} page="cover" />,
    );
    expect(container.innerHTML).toMatch(/background: rgb\(22, 101, 52\)/);
    expect(container.innerHTML).not.toMatch(/background: rgb\(30, 64, 175\)/);
  });

  it("senza copertina collegata resta il colore del modello, come prima", () => {
    const { container } = render(
      <QuoteTemplatePreview template={{ ...DEFAULT_TEMPLATE, primary_color: "#7C2D12" }} page="cover" />,
    );
    expect(container.innerHTML).toMatch(/background: rgb\(124, 45, 18\)/);
  });

  it("«Emessa da» mostra mail e telefono scritti nel modello", () => {
    render(
      <QuoteTemplatePreview
        template={{ ...DEFAULT_TEMPLATE, cover_title: "", cover_subtitle: "", email_impresa: "info@ener.it", telefono_impresa: "045 123456" }}
        page="cover"
      />,
    );
    expect(screen.getByText("info@ener.it")).toBeTruthy();
    expect(screen.getByText("Tel. 045 123456")).toBeTruthy();
    expect(screen.queryByText("info@azienda.it")).toBeNull();
  });

  it("anche l'anteprima dal vivo del preventivo colora la copertina come il PDF", () => {
    const props: QuoteLivePreviewProps = {
      template: resolveQuoteTemplatePreview(offerta, [copertina(VERDE_ENER)]),
      companyName: "Ener Italia S.p.A.", clientName: "Mauro Tartani", title: "Fotovoltaico", validityDays: 30,
      items: [], subtotal: 0, net: 0, total: 0, vatBreakdown: {}, discountPercent: 0, manualPrice: false,
      showPrices: true, onlyTotal: false, showDiscounts: true, showNotes: true, showConditions: true, showSignature: true,
      paymentMethod: "Bonifico", paymentPhases: [],
    };
    const { container } = render(<QuoteLivePreviewPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Copertina/ }));
    expect(container.innerHTML).toMatch(/background-color: rgb\(22, 101, 52\)/);
  });
});

describe("il PDF (generate-quote-pdf)", () => {
  const pdf = leggi("supabase/functions/generate-quote-pdf/index.ts");

  it("i contatti del modello sostituiscono quelli del profilo, in anteprima e nel preventivo vero, prima dei merge tag", () => {
    expect(pdf.split("contattiImpresa(t, company)").length - 1).toBe(2);
    expect(pdf).toContain("if (company) Object.assign(company, contattiImpresa(t, company));");
    expect(pdf.indexOf("if (company) Object.assign(company, contattiImpresa(t, company));"))
      .toBeLessThan(pdf.indexOf("const mergeCtx = buildMergeContext({ quote, company, contact: prefetchedContact, template: t });"));
    // «L'impresa» e il modulo di recesso leggono company: ora con i contatti giusti.
    expect(pdf).toContain("company?.email ? [String(company.email), false] : null,");
  });

  it("la copertina ha il colore della copertina collegata", () => {
    expect(pdf).toContain("const fondoHex = fondoPerTestoBianco(coloreCopertina(t.primary_color, t.composed_cover));");
  });

  it("condizioni e sezioni: i titoli nel colore del blocco", () => {
    expect(pdf).toContain("const titoliC = opts.colore ? rgbColor(opts.colore) : primaryC;");
    expect(pdf).toContain("color: isHeading ? titoliC : textC,");
    expect(pdf).toContain("colore: coloreDelBlocco(section.primary_color),");
    expect(pdf).toContain("colore: coloreDelBlocco(t.composed_terms?.primary_color) ?? coloreDelBlocco(t.composed_legal?.primary_color),");
  });

  it("le schede prodotto nei colori della scheda", () => {
    expect(pdf).toContain("const primarioScheda = coloreDelBlocco(product.primary_color);");
    expect(pdf).toContain("const accentoScheda = coloreDelBlocco(product.accent_color, COLORE_ACCENTO_DI_FABBRICA);");
    expect(pdf).toContain("color: fondoSchedaC,");
    expect(pdf).toContain("borderColor: schedaC,");
  });
});

describe("dove si scrivono mail e telefono", () => {
  it("l'editor del modello ha i due campi, sotto «Dati azienda emittente»", () => {
    const editor = leggi("src/pages/azienda/settings/SettingsQuoteTemplates.tsx");
    expect(editor).toContain("value={form.email_impresa ?? ''}");
    expect(editor).toContain("value={form.telefono_impresa ?? ''}");
    expect(editor.indexOf("Contatti dell'impresa nel preventivo")).toBeGreaterThan(editor.indexOf("label: 'Dati azienda emittente'"));
  });

  it("le colonne esistono nella migrazione", () => {
    const cartella = join(process.cwd(), "supabase/migrations");
    const file = readdirSync(cartella).find((f) => f.endsWith("_modelli_preventivo_contatti_impresa.sql"));
    expect(file).toBeTruthy();
    const sql = readFileSync(join(cartella, file!), "utf8");
    expect(sql).toContain("alter table public.quote_templates add column if not exists email_impresa text;");
    expect(sql).toContain("alter table public.quote_templates add column if not exists telefono_impresa text;");
  });
});
