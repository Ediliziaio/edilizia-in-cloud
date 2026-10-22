import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 21-22/10/2026: ogni riconnessione Meta cancellava e reinseriva le pagine, e
// con loro (ON DELETE CASCADE su meta_lead_forms.page_asset_id) i moduli
// attivati: da lì i lead finivano scartati come «modulo non attivato».
const sorgente = readFileSync(resolve(process.cwd(), "supabase/functions/meta-oauth-callback/index.ts"), "utf8");

describe("riconnessione Meta", () => {
  it("aggiorna le pagine invece di cancellarle tutte", () => {
    expect(sorgente).toContain('.upsert(pageAssets, { onConflict: "integration_id,asset_type,asset_id" })');
    expect(sorgente).not.toContain('await adminClient.from("meta_assets").insert(pageAssets)');
  });

  it("cancella solo le pagine che l'account non vede più", () => {
    const blocco = sorgente.slice(sorgente.indexOf("const pagineViste"), sorgente.indexOf("const pageAssets"));
    expect(blocco).toContain('.eq("asset_type", "page")');
    expect(blocco).toContain('.not("asset_id", "in"');
  });
});
