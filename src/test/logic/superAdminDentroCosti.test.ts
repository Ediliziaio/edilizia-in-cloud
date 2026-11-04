/**
 * Il super admin ENTRATO in un'azienda registra i costi di quell'azienda, e di
 * nessun'altra (04/11/2026). Percorso nel repository:
 * src/test/logic/superAdminDentroCosti.test.ts
 *
 * Provato in una transazione annullata, con sette utenti veri: il super admin
 * entrato (per impersonazione e con l'header della scheda azienda) passa sulle
 * fatture dell'azienda in cui è entrato e viene rifiutato con 42501 su quelle di
 * un'altra; il super admin NON entrato è rifiutato sempre; l'amministratore
 * dell'azienda e lo staff con `can_view_costs` continuano a passare; lo staff in
 * sola lettura e lo staff di un'altra azienda restano fuori.
 *
 * Qui si tengono fermi i punti che contano, perché si rompono in silenzio:
 * 1. `e_super_admin_dentro` non deve mai restituire NULL. Con NULL, un
 *    `if not (e_super_admin_dentro(x) or …) then raise` NON scatta: prima di
 *    questa migrazione il super admin senza alcuna azienda effettiva scriveva
 *    su qualunque azienda passando per `fattura_segna_verifica`.
 * 2. Il permesso sta in un punto solo (`puo_registrare_costi`) e non dentro
 *    `aziende_con_permesso`, che è usata da 195 policy su 90 tabelle e
 *    risponderebbe «sì» a qualunque permesso chiesto, compresi i sentinella
 *    come `__solo_amministratori__` che `utente_sola_lettura` legge al negativo.
 * 3. La sola lettura e il confine fra aziende restano nel controllo.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRAZIONE = "supabase/migrations/20281201100000_super_admin_dentro_registra_i_costi.sql";
const codice = readFileSync(resolve(process.cwd(), MIGRAZIONE), "utf8")
  .replace(/^--.*$/gm, "")
  .toLowerCase();

const funzione = (nome: string) => {
  const m = codice.match(new RegExp(`create or replace function public\\.${nome}\\(([\\s\\S]*?)\\n\\$(?:function)?\\$;`));
  expect(m, `manca la funzione ${nome}`).not.toBeNull();
  return m![1];
};

const senzaSpazi = (s: string) => s.replace(/\s+/g, "");

describe("il super admin entrato in un'azienda registra i costi", () => {
  it("e_super_admin_dentro non restituisce mai NULL", () => {
    const corpo = senzaSpazi(funzione("e_super_admin_dentro"));
    // il coalesce è il punto: `p_azienda = get_my_company_id()` è NULL quando il
    // super admin non è entrato da nessuna parte, e NULL non ferma un `if not`.
    expect(corpo).toContain("selectcoalesce(");
    expect(corpo).toContain(",false)");
    expect(corpo).toContain("has_role(auth.uid(),'super_admin'::public.app_role)");
    expect(corpo).toContain("p_azienda=public.get_my_company_id()");
  });

  it("il permesso dei costi sta in puo_registrare_costi, chiusa ad anon", () => {
    const corpo = senzaSpazi(funzione("puo_registrare_costi"));
    expect(corpo).toContain("selectcoalesce(");
    expect(corpo).toContain(",false)");
    expect(corpo).toContain("public.e_super_admin_dentro(p_azienda)");
    expect(corpo).toContain("p_azienda=any(public.aziende_con_permesso('can_view_costs'))");
    // la sola lettura deve restare: un lettore non scrive i costi
    expect(corpo).toContain("andnotpublic.utente_sola_lettura(p_azienda)");

    const g = senzaSpazi(codice);
    expect(g).toContain("revokeallonfunctionpublic.puo_registrare_costi(uuid)frompublic,anon");
    expect(g).toMatch(/grantexecuteonfunctionpublic\.puo_registrare_costi\(uuid\)to[a-z_,]*authenticated/);
  });

  it.each([
    ["nota_credito_collega", "n"],
    ["nota_credito_scollega", "n"],
    ["commessa_collega_fattura_ricevuta", "f"],
    ["fattura_collega_commesse", "f"],
  ])("%s chiede il permesso in un punto solo e rifiuta con 42501", (nome, pre) => {
    const corpo = funzione(nome);
    const piatto = senzaSpazi(corpo);
    expect(piatto).toContain(`ifnotpublic.puo_registrare_costi(${pre}.company_id)then`);
    // il controllo vecchio non deve restare da nessuna parte: due controlli
    // diversi sulla stessa cosa divergono alla prima modifica
    expect(piatto).not.toContain("aziende_con_permesso('can_view_costs')");
    expect(piatto).toMatch(/errcode='42501'/);
  });

  it("non tocca aziende_con_permesso", () => {
    expect(codice).not.toMatch(/create or replace function public\.aziende_con_permesso/);
    expect(codice).not.toMatch(/create or replace function public\.utente_sola_lettura/);
  });

  it("è idempotente e non blocca la produzione", () => {
    expect(codice).toContain("set local lock_timeout = '3s'");
    const creazioni: string[] = codice.match(/create (or replace )?function/g) ?? [];
    expect(creazioni.every((c) => c.includes("or replace"))).toBe(true);
  });
});
