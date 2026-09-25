/**
 * Referral e passi del flusso di lavoro: solo a chi li deve toccare (26/09/2026).
 *
 * Provato in una transazione annullata: prima uno staff qualsiasi entrava in
 * ensure_referral_link (riscrive il link di un segnalatore con un indirizzo a
 * scelta), record_referral_conversion (conversioni e provvigioni),
 * chiudi_passi_su_evento e recompute_order_progress di qualsiasi azienda;
 * dopo 42501, e il servizio passa come prima.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const codice = leggi("supabase/migrations/20280926074500_referral_e_passi_solo_a_chi_serve.sql").replace(/--.*$/gm, "");

describe("migrazione referral_e_passi_solo_a_chi_serve", () => {
  it("non aspetta i lock", () => {
    expect(codice).toMatch(/set local lock_timeout = '3s';/);
  });

  it.each([
    ["public.ensure_referral_link(uuid,text)", "  v_link text;\\nBEGIN\\n"],
    ["public.record_referral_conversion(text,uuid,uuid,uuid,numeric,text)", "  v_fraud_status text := ''clear'';\\nBEGIN\\n"],
  ])("%s chiede is_platform_staff() in testa al corpo", (firma, ancora) => {
    const inizio = codice.indexOf(`'${firma}'`);
    expect(inizio).toBeGreaterThan(0);
    const chiamata = codice.slice(inizio, codice.indexOf(");", inizio));
    expect(chiamata).toContain(ancora);
    expect(chiamata).toContain("IF NOT public.is_platform_staff() THEN");
    expect(chiamata).toContain("USING ERRCODE = ''42501''");
  });

  it("passi e avanzamento restano ai trigger: niente esecuzione per gli utenti", () => {
    expect(codice).toContain("revoke all on function public.chiudi_passi_su_evento(text, uuid, uuid) from public, anon, authenticated;");
    expect(codice).toContain("revoke all on function public.recompute_order_progress(uuid) from public, anon, authenticated;");
    expect(codice).toContain("grant execute on function public.chiudi_passi_su_evento(text, uuid, uuid) to service_role;");
    expect(codice).toContain("grant execute on function public.recompute_order_progress(uuid) to service_role;");
  });

  it("nessuna pagina chiama passi e avanzamento (le citano solo i commenti)", () => {
    for (const p of ["src/lib/flussoLavoro.ts", "src/pages/campo/CampoRapportino.tsx"]) {
      expect(leggi(p), p).not.toMatch(/rpc\(\s*["'`](chiudi_passi_su_evento|recompute_order_progress)["'`]/);
    }
  });
});
