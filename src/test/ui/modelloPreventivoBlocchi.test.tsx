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
import { datiGenerici } from "@/components/preventivi/pdf/adattatoreGenerico";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  COLORE_ACCENTO_DI_FABBRICA,
  coloreCopertina,
  coloreDelBlocco,
  contattiImpresa,
  titoliMarkdown,
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
  const profilo = { email: "consulente@esempio.it", phone: "045 000000" };

  it("quelli scritti nel modello valgono più del profilo", () => {
    expect(contattiImpresa({ email_impresa: " info@ener.it ", telefono_impresa: "045 123456" }, profilo))
      .toEqual({ email: "info@ener.it", phone: "045 123456" });
  });

  it("vuoti o solo spazi: restano quelli del profilo", () => {
    expect(contattiImpresa({ email_impresa: "", telefono_impresa: "   " }, profilo))
      .toEqual({ email: "consulente@esempio.it", phone: "045 000000" });
    expect(contattiImpresa(undefined, profilo)).toEqual({ email: "consulente@esempio.it", phone: "045 000000" });
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
      companyName: "Ener Italia S.p.A.", clientName: "Mario Rossi", title: "Fotovoltaico", validityDays: 30,
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
    // «L'impresa» e il modulo di recesso leggono company (dal 27/10/2026 attraverso l'adattatore generico).
    expect(leggi("src/components/preventivi/pdf/adattatoreGenerico.ts")).toContain("email: str(c?.email), telefono: str(c?.phone)");
    expect(leggi("src/components/preventivi/pdf/DocumentoEdilePDF.tsx")).toContain('{dati.azienda.email ? ` — ${dati.azienda.email}` : ""}');
  });

  it("la copertina ha il colore della copertina collegata", () => {
    // Il fondo della copertina del documento edile (pdf_cover_bg_color), se il modello non ne ha uno suo.
    expect(pdf).toContain("const fondoCopertina = coloreDelBlocco(t.composed_cover?.primary_color);");
    expect(pdf).toContain("if (fondoCopertina && !t.pdf_cover_bg_color && !t.cover_bg_color) t.pdf_cover_bg_color = fondoCopertina;");
  });

  it("schede prodotto e sezioni collegate escono nel PDF, una per capitolo", () => {
    const dati = datiGenerici({
      quote: { quote_number: "P-1" }, items: [], company: null,
      template: {
        composed_products: [{ id: "p1", name: "Caldaia", product_category: "Riscaldamento", product_short_description: "<p>A condensazione</p>", product_specs: [{ label: "Potenza", value: "24 kW" }], product_indicative_price: 1500, product_unit: "pz" }],
        composed_sections: [{ id: "s1", name: "Garanzie", body_html: "<h2>Dieci anni</h2><p>Sui lavori eseguiti.</p>" }],
      },
    });
    const scheda = dati.sezioniTecniche?.find((x) => x.id === "scheda-p1");
    expect(scheda?.titolo).toBe("Caldaia");
    expect(scheda?.testo).toBe("A condensazione");
    expect(scheda?.righe).toEqual(expect.arrayContaining([{ etichetta: "Categoria", valore: "Riscaldamento" }, { etichetta: "Potenza", valore: "24 kW" }]));
    const sezione = dati.sezioniTecniche?.find((x) => x.id === "sezione-s1");
    expect(sezione?.titolo).toBe("Garanzie");
    expect(sezione?.testo).toContain("Dieci anni");
    expect(sezione?.testo).toContain("Sui lavori eseguiti.");
  });

  // ROSSI DI PROPOSITO (30/10/2026): il vecchio motore pdf-lib dava a condizioni, sezioni e schede
  // il colore scelto nel blocco collegato. Dal 27/10/2026 (2f5ea4316) il documento edile usa un
  // colore solo, quello del preventivo: i colori del singolo blocco non arrivano più al PDF.
  it("condizioni e sezioni: i titoli nel colore del blocco", () => {
    const adattatore = leggi("src/components/preventivi/pdf/adattatoreGenerico.ts");
    expect(adattatore).toMatch(/coloreDelBlocco\(sezione\.primary_color\)/);
    expect(adattatore).toMatch(/coloreDelBlocco\(t\.composed_terms\?\.primary_color\)/);
  });

  it("le schede prodotto nei colori della scheda", () => {
    const adattatore = leggi("src/components/preventivi/pdf/adattatoreGenerico.ts");
    expect(adattatore).toMatch(/coloreDelBlocco\(p\.primary_color\)/);
    expect(adattatore).toMatch(/coloreDelBlocco\(p\.accent_color, COLORE_ACCENTO_DI_FABBRICA\)/);
  });
});

describe("le condizioni scritte in HTML tengono i titoli", () => {
  it("i titoli <h1-4> diventano titoli markdown; il markdown resta com'è", () => {
    expect(titoliMarkdown("<h2>Garanzie</h2><p>Dieci anni.</p>")).toBe("\n## Garanzie</h2><p>Dieci anni.</p>");
    expect(titoliMarkdown('<h1 class="titolo">Condizioni</h1>')).toBe("\n# Condizioni</h1>");
    expect(titoliMarkdown("## Clausole da approvare specificamente (art. 1341 c.c.)")).toBe("## Clausole da approvare specificamente (art. 1341 c.c.)");
    expect(titoliMarkdown(null)).toBe("");
  });

  it("il PDF li converte prima di normalizzare, per condizioni e legali (serve anche alla seconda firma)", () => {
    // Dal 27/10/2026 le condizioni del generico le legge l'adattatore edile (leggiTestoRiccoContratto),
    // che tiene i titoli HTML: «Garanzie» resta un titolo e le clausole dell'art. 1341 si trovano.
    const dati = datiGenerici({
      quote: { quote_number: "P-1" }, items: [], company: null,
      template: {
        contractual_terms_text: "<h2>Garanzie</h2><p>Dieci anni.</p>",
        legal_terms_text: "<h2>Clausole da approvare specificamente (art. 1341 c.c.)</h2><ul><li>Art. 3 — Recesso</li></ul>",
      },
    });
    const righe = dati.modello.condizioniLegali;
    expect(righe.some((r) => (r.tipo === "h1" || r.tipo === "h2") && r.testo.includes("Garanzie"))).toBe(true);
    expect(righe.some((r) => r.testo.startsWith("<"))).toBe(false);
    expect(dati.modello.clausoleDaApprovare.join(" ")).toContain("Recesso");
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
