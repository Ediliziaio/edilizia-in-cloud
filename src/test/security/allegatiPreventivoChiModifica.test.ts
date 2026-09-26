/**
 * Allegati del preventivo: li aggiunge e li toglie chi può modificare il
 * preventivo (26/09/2026).
 *
 * Le schede tecniche allegate finiscono nel PDF che il cliente firma. Prima
 * bastava che il preventivo fosse dell'azienda: uno staff che vede i
 * preventivi col solo permesso delle Commesse aggiungeva e toglieva le schede
 * di qualsiasi preventivo. Ora vale la regola delle righe (quote_items):
 * quella di q_upd_preventivi. La lettura resta a chi vede il preventivo.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const codice = (() => {
  const cartella = join(process.cwd(), "supabase/migrations");
  const file = readdirSync(cartella).find((f) => f.endsWith("_allegati_preventivo_chi_modifica.sql"));
  expect(file, "migrazione allegati_preventivo_chi_modifica").toBeTruthy();
  return readFileSync(join(cartella, file!), "utf8").replace(/--.*$/gm, "");
})();

const policy = (nome: string) => {
  const m = codice.match(
    new RegExp(`create policy ${nome} on public\\.quote_pdf_attachments\\s+for (\\w+) to authenticated([\\s\\S]*?\\);)\\n`),
  );
  expect(m, nome).not.toBeNull();
  return { comando: m![1], testo: m![2] };
};

const AZIENDA = "q.company_id = (select public.get_my_company_id())";
const SUPER = "(select public.has_role((select auth.uid()), 'super_admin'::public.app_role))";
const PERMESSO = "q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi')))";
const VISIBILITA = "public.check_staff_visibility((select auth.uid()), q.assigned_to)";
const NO_CLIENTE = "not (select public.utente_e_cliente_esterno())";

describe("allegati del preventivo: chi li cambia", () => {
  it("non aspetta i lock e riscrive le due policy senza doppioni", () => {
    expect(codice).toContain("set local lock_timeout = '3s';");
    expect(codice).toContain("drop policy if exists qpa_ins on public.quote_pdf_attachments;");
    expect(codice).toContain("drop policy if exists qpa_del on public.quote_pdf_attachments;");
  });

  it("aggiunge e toglie solo chi può modificare il preventivo, lo vede e non è un cliente esterno", () => {
    for (const [nome, comando, clausola] of [["qpa_ins", "insert", "with check"], ["qpa_del", "delete", "using"]] as const) {
      const p = policy(nome);
      expect(p.comando).toBe(comando);
      expect(p.testo.trimStart().startsWith(`${clausola} (${NO_CLIENTE}`)).toBe(true);
      for (const pezzo of [AZIENDA, SUPER, PERMESSO, VISIBILITA]) expect(p.testo, `${nome}: ${pezzo}`).toContain(pezzo);
      // Il permesso di modificare, non quelli per vedere (Preventivi o Commesse).
      expect(p.testo).not.toContain("can_view_preventivi");
      expect(p.testo).not.toContain("can_view_orders");
    }
  });

  it("non tocca la lettura, la RESTRICTIVE del blocco e il trigger del 26/09", () => {
    expect(codice).not.toContain("qpa_sel");
    expect(codice).not.toContain("blocco_utente_bloccato");
    expect(codice).not.toContain("trigger");
    expect(codice).not.toMatch(/for (update|all)/);
  });
});
