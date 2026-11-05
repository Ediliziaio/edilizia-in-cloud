import { describe, expect, it } from "vitest";
import { supabaseRequestTimeout } from "@/integrations/supabase/requestTimeout";

describe("scadenze delle richieste render", () => {
  it.each(["bathroom", "facade", "floor", "pergola", "pool", "roof", "shutter", "technical"])("lascia terminare il render %s Alta oltre i 60 secondi", (module) => {
    expect(supabaseRequestTimeout(`https://example.supabase.co/functions/v1/generate-${module}-render`)).toBeGreaterThan(140_000);
  });
  it("mantiene le scadenze brevi per job asincroni, altre funzioni e query", () => {
    expect(supabaseRequestTimeout(new URL("https://example.supabase.co/functions/v1/generate-room-render"))).toBe(60_000);
    expect(supabaseRequestTimeout("https://example.supabase.co/functions/v1/send-email")).toBe(60_000);
    expect(supabaseRequestTimeout("https://example.supabase.co/rest/v1/render_facciata_sessions")).toBe(25_000);
  });
  it("aspetta anche la lettura completa della planimetria, il cui budget server è 140 secondi", () => {
    expect(supabaseRequestTimeout("https://example.supabase.co/functions/v1/planimetria-genera")).toBe(155_000);
  });
  it("non confonde un valore della query con l'endpoint invocato", () => {
    expect(supabaseRequestTimeout("https://example.supabase.co/rest/v1/items?note=/functions/v1/generate-facade-render")).toBe(25_000);
    expect(supabaseRequestTimeout({ url: "https://example.supabase.co/functions/v1/generate-facade-render/?test=1" } as Request)).toBe(155_000);
  });
});
