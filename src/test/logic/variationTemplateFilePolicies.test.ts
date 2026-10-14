import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const initial = readFileSync("supabase/migrations/20281014102730_order_variation_template_files.sql", "utf8");
const finalPolicies = readFileSync("supabase/migrations/20281014103134_order_variation_template_files_scope_fix.sql", "utf8");
describe("Confini privati degli allegati", () => {
  it("bucket privato, solo PDF e dimensione massima; percorso vincolato con FK aziendale", () => {
    expect(initial).toContain("false,10485760,ARRAY['application/pdf']");
    expect(initial).toContain("FOREIGN KEY (template_id,company_id)");
    expect(initial).toContain("storage_path = company_id::text");
    expect(initial).toContain("GRANT UPDATE (is_active)");
    expect(initial).not.toContain("GRANT DELETE");
  });
  it("il nome Storage è qualificato: non può legarsi al nome del modello", () => {
    expect(finalPolicies).toContain("storage.foldername(objects.name)");
    expect(finalPolicies).not.toContain("storage.foldername(name)");
    expect(finalPolicies).toContain("[.]pdf$");
  });
  it("nega anonimi, sovrascrittura e cancellazione dei file collegati senza cambiare altri bucket", () => {
    expect(finalPolicies).toContain("AS RESTRICTIVE FOR ALL TO anon USING (bucket_id <> 'variation-template-files')");
    expect(finalPolicies).toContain("AS RESTRICTIVE FOR UPDATE TO authenticated");
    expect(finalPolicies).toContain("NOT EXISTS (SELECT 1 FROM public.order_variation_template_files");
    expect(finalPolicies).toContain("NOT (SELECT public.utente_bloccato())");
    expect(finalPolicies).toContain("NOT (SELECT public.utente_e_cliente_esterno())");
    expect(finalPolicies).toContain("can_edit_settings_pricing");
    expect(finalPolicies).not.toContain("SECURITY DEFINER");
  });
});
