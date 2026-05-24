import { describe, expect, it } from "vitest";
import {
  buildLeadFormAutoResizeEmbedSnippet,
  buildLeadFormIframeSnippet,
  buildLeadFormPublicUrl,
  normalizeLeadFormFields,
  normalizeEmbedDimension,
  sanitizeLeadFormFieldName,
  sanitizeLeadFormSlug,
  validateLeadFormDraft,
} from "@/lib/formBuilder";

describe("formBuilder utilities", () => {
  it("normalizes form slugs and field names", () => {
    expect(sanitizeLeadFormSlug(" Richiesta Preventivo Serramenti! ")).toBe("richiesta-preventivo-serramenti");
    expect(sanitizeLeadFormSlug("Èlite & Bonus 50%")).toBe("elite-bonus-50");
    expect(sanitizeLeadFormFieldName("Nome cliente!")).toBe("nome_cliente");
  });

  it("deduplicates generated field names", () => {
    const fields = normalizeLeadFormFields([
      { label: "Nome", name: "nome", type: "text", required: true },
      { label: "Nome", name: "nome", type: "text", required: false },
    ]);

    expect(fields.map((field) => field.name)).toEqual(["nome", "nome_2"]);
  });

  it("blocks publishing forms without contact capture fields", () => {
    const result = validateLeadFormDraft(
      {
        name: "Form generico",
        slug: "form-generico",
        fields: [{ id: "f1", label: "Note", name: "note", type: "textarea", required: true }],
      },
      { publishing: true },
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("email o telefono");
  });

  it("builds encoded public URLs", () => {
    expect(buildLeadFormPublicUrl("https://example.supabase.co/", "richiesta-preventivo", "company-1")).toBe(
      "https://example.supabase.co/functions/v1/form-render?slug=richiesta-preventivo&company_id=company-1",
    );
  });

  it("builds robust iframe and auto-resize embed snippets", () => {
    const publicUrl = "https://example.supabase.co/functions/v1/form-render?slug=richiesta&company_id=company-1";
    const options = { slug: "richiesta", title: "Richiesta preventivo", minHeight: 580, maxWidth: 720 };

    expect(buildLeadFormIframeSnippet(publicUrl, options)).toContain('loading="lazy"');
    expect(buildLeadFormIframeSnippet(publicUrl, options)).toContain("max-width:720px");

    const autoResizeSnippet = buildLeadFormAutoResizeEmbedSnippet(publicUrl, options);
    expect(autoResizeSnippet).toContain("eic-lead-form-height");
    expect(autoResizeSnippet).toContain("event.origin!=='https://example.supabase.co'");
    expect(autoResizeSnippet).toContain("iframe.style.height");
  });

  it("keeps embed dimensions on useful defaults before clamping", () => {
    expect(normalizeEmbedDimension(undefined, 620, 360, 1600)).toBe(620);
    expect(normalizeEmbedDimension("", 640, 320, 1200)).toBe(640);
    expect(normalizeEmbedDimension("100", 620, 360, 1600)).toBe(360);
    expect(normalizeEmbedDimension("2400", 620, 360, 1600)).toBe(1600);
  });
});
