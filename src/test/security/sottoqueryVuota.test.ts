import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Undici policy la cui sottoquery non filtrava niente.
 *
 * Misurato su produzione con quattro utenti — due amministratori di aziende
 * diverse, uno staff, un cliente — prima e dopo:
 *   company_governance_settings ... 18 righe / 18 aziende → 1 (2 per chi ha un
 *                                   accesso multi-azienda attivo, verificate
 *                                   una per una: nessuna estranea)
 *   company_email_preferences ..... 18 / 18 → 1
 *   company_email_domains ......... 1 / 1 → 0 (quella riga non è di nessuno
 *                                   dei quattro)
 *   cliente ....................... 0 ovunque
 * Le aziende nel sistema sono 18.
 *
 * E la rassegna che le ha fatte emergere: cliente da 36 tabelle a 12, staff
 * fermo a 248.
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const leggi = (frammento: string) => {
  const nome = readdirSync(dir).find((f) => f.includes(frammento));
  if (!nome) throw new Error(`migrazione ${frammento} non trovata`);
  return readFileSync(resolve(dir, nome), "utf8");
};

const sq = leggi("sottoquery_che_non_filtrava_niente");
const terzo = leggi("cliente_fuori_dalle_ultime_interne");

describe("il difetto è spiegato con precisione", () => {
  it("dice perché la sottoquery non filtrava", () => {
    const testo = sq.replace(/\s*\n\s*--\s*/g, " ");
    expect(testo).toMatch(/pesca `company_id` dalla TABELLA ESTERNA/);
    expect(testo).toMatch(/la condizione dice soltanto: «l'utente ha almeno un ruolo»/);
  });

  it("porta i numeri misurati, non un'impressione", () => {
    expect(sq).toMatch(/18 righe \/ 18 aziende, per tutti e quattro/);
    expect(sq).toMatch(/Le aziende nel sistema sono 18/);
  });

  it("segnala che discount_rules era scrivibile", () => {
    expect(sq.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /chiunque potrebbe leggere \*\*e scrivere\*\* il tetto sconto di un'altra impresa/);
  });
});

describe("la correzione", () => {
  it("tutte e undici passano da user_can_access_company", () => {
    const usi = sq.match(/public\.user_can_access_company\(company_id\)/g) ?? [];
    // 11 policy, ma quelle di scrittura ripetono la condizione in WITH CHECK
    expect(usi.length).toBeGreaterThanOrEqual(11);
  });

  it("nessuna conserva la vecchia sottoquery", () => {
    expect(sq).not.toMatch(/FROM user_roles\s*\n\s*WHERE \(user_roles\.user_id/);
  });

  it("i vincoli di ruolo delle policy di scrittura sono conservati", () => {
    const admin = sq.match(/has_role\(\(SELECT auth\.uid\(\)\), 'company_admin'::public\.app_role\)/g) ?? [];
    expect(admin.length).toBeGreaterThanOrEqual(8);
  });

  it("la lista globale delle soppressioni resta leggibile a tutti", () => {
    expect(sq).toMatch(/company_id IS NULL\s*\n\s*OR public\.user_can_access_company/);
    expect(sq.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /sono indirizzi da non contattare mai/);
  });
});

describe("il terzo giro sui clienti, e l'errore che lo ha reso necessario", () => {
  it("il filtro cerca i due pezzi separatamente", () => {
    expect(terzo).toMatch(/LIKE '%FROM profiles%'\s*\n\s*AND pg_get_expr\(pol\.polqual, pol\.polrelid\) LIKE '%company_id%'/);
  });

  it("e l'errore di prima è scritto", () => {
    const testo = terzo.replace(/\s*\n\s*--\s*/g, " ");
    expect(testo).toMatch(/pretende `profiles` PRIMA di `company_id`/);
    expect(testo).toMatch(/il pattern non l'ha mai riconosciuta/);
  });

  it("le tabelle legittime restano fuori dall'elenco", () => {
    for (const t of ["'orders'", "'ai_brain_documents'", "'company_branding'", "'gdpr_consents'"]) {
      expect(terzo).not.toContain(t);
    }
  });

  it("«la mia riga» resta una condizione valida anche per un cliente", () => {
    expect(terzo).toMatch(/NOT LIKE '%user_id = \( SELECT auth\.uid%'/);
  });
});
