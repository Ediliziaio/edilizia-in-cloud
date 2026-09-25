import { describe, expect, it } from "vitest";
import { quoteTemplateSampleData, resolveQuoteTemplatePreview } from "@/lib/quoteTemplatePreview";
import { DEFAULT_TEMPLATE, type QuoteTemplate } from "@/types/quoteTemplate";

describe("copertina nell'anteprima delle offerte", () => {
  it("compone condizioni e legali anche senza copertina, escludendo blocchi disattivati", () => {
    const offer = { ...DEFAULT_TEMPLATE, linked_terms_id: "terms", linked_legal_id: "legal" };
    const terms = { ...DEFAULT_TEMPLATE, id: "terms", body_html: "Condizioni collegate" } as QuoteTemplate;
    const legal = { ...DEFAULT_TEMPLATE, id: "legal", body_html: "Legali disattivati", is_active: false } as QuoteTemplate;
    const preview = resolveQuoteTemplatePreview(offer, [terms, legal]);
    expect(preview.contractual_terms_text).toBe("Condizioni collegate");
    expect(preview.show_contractual_terms).toBe(true);
    expect(preview.legal_terms_text).toBe(offer.legal_terms_text);
    expect(offer.contractual_terms_text).toBeNull();
  });
  it("rispetta la precedenza della copertina collegata senza perdere i fallback inline", () => {
    const offer = { ...DEFAULT_TEMPLATE, linked_cover_id: "cover", cover_subtitle: "Sottotitolo inline" };
    const cover = { ...DEFAULT_TEMPLATE, id: "cover", kind: "copertina", cover_title: "Offerta per {{cliente.nome_completo}}", cover_subtitle: null, cover_image_url: "azienda/foto.jpg" } as QuoteTemplate;
    const preview = resolveQuoteTemplatePreview(offer, [cover]);
    expect(preview.cover_title).toBe(cover.cover_title);
    expect(preview.cover_subtitle).toBe("Sottotitolo inline");
    expect(preview.cover_image_url).toBe("azienda/foto.jpg");
    expect(preview.show_cover_image).toBe(true);
    expect(offer.cover_title).toBe(DEFAULT_TEMPLATE.cover_title);
  });
  it("sostituisce i tag con dati dimostrativi senza alterare il modello", () => {
    const template = { cover_title: "Offerta per {{cliente.nome_completo}}", cover_subtitle: "{{azienda.ragione_sociale}} · {{cantiere.indirizzo}}" };
    const preview = quoteTemplateSampleData(template, "Azienda Demo");
    expect(preview.cover_title).toBe("Offerta per Mario Rossi");
    expect(preview.cover_subtitle).toBe("Azienda Demo · Via Garibaldi 10, Roma");
    expect(template.cover_title).toContain("{{cliente.nome_completo}}");
  });
});
