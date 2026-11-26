import { describe, expect, it } from "vitest";
import { supabaseRequestTimeout } from "@/integrations/supabase/requestTimeout";

describe("tempo per caricare documenti dal cantiere", () => {
  const url = "https://progetto.supabase.co/storage/v1/object/hr-documenti/azienda/persona/attestato.pdf";
  it("concede quattro minuti all'upload SDK con metodo in RequestInit", () => {
    expect(supabaseRequestTimeout(url, "POST")).toBe(240_000);
    expect(supabaseRequestTimeout(url, "PUT")).toBe(240_000);
  });
  it("riconosce anche il metodo di una Request", () => {
    expect(supabaseRequestTimeout(new Request(url, { method: "POST" }))).toBe(240_000);
  });
  it("concede lo stesso tempo al download, anche quando passa dall'endpoint autenticato", () => {
    expect(supabaseRequestTimeout(url)).toBe(240_000);
    expect(supabaseRequestTimeout(url.replace('/object/', '/object/authenticated/'))).toBe(240_000);
  });
  it("mantiene un limite breve per cancellazioni, metadati, firma del link e normali richieste al database", () => {
    expect(supabaseRequestTimeout(url, "DELETE")).toBe(25_000);
    expect(supabaseRequestTimeout("https://progetto.supabase.co/storage/v1/object/info/hr-documenti/a.pdf")).toBe(25_000);
    expect(supabaseRequestTimeout("https://progetto.supabase.co/storage/v1/object/sign/hr-documenti/a.pdf", "POST")).toBe(25_000);
    expect(supabaseRequestTimeout("https://progetto.supabase.co/rest/v1/hr_documenti", "POST")).toBe(25_000);
  });
});
