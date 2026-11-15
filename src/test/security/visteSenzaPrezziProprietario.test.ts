/**
 * Le viste «senza prezzi» girano coi diritti del proprietario (15/11/2026).
 *
 * Servono a chi non vede i costi: a quell'utente la regola restrittiva `costi_solo_con_permesso`
 * nasconde le righe della tabella, e la vista le restituisce coi costi vuoti, con le regole di
 * visibilità copiate nella WHERE. Se la vista gira coi diritti di chi legge (`security_invoker`),
 * la regola sulla tabella la svuota proprio per lui: dal 14/03 (20290314000002) l'ufficio senza
 * «Costi» vedeva le commesse senza nessuna voce. Ripristinate con 20290331090000.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(__dirname, "../../..", "supabase/migrations");
const files = readdirSync(DIR).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
const RIPRISTINO = "20290331090000_viste_senza_prezzi_coi_diritti_del_proprietario.sql";

const VISTE = [
  "order_items_senza_prezzi",
  "order_employees_senza_prezzi",
  "order_external_teams_senza_prezzi",
  "purchase_orders_senza_prezzi",
  "purchase_order_items_senza_prezzi",
  "supplier_rfq_quotes_senza_prezzi",
  "supplier_rfq_suppliers_senza_prezzi",
];

const senzaCommenti = (f: string) => readFileSync(join(DIR, f), "utf8").replace(/--[^\n]*/g, "");

describe("Viste senza prezzi", () => {
  it("il ripristino le riporta tutte ai diritti del proprietario", () => {
    const sql = senzaCommenti(RIPRISTINO);
    for (const v of VISTE) {
      expect(sql).toMatch(new RegExp(`alter\\s+view\\s+if\\s+exists\\s+public\\.${v}\\s+set\\s*\\(\\s*security_invoker\\s*=\\s*false\\s*\\)`, "i"));
    }
  });

  it("nessuna migrazione successiva le rimette coi diritti di chi legge", () => {
    const dopo = files.slice(files.indexOf(RIPRISTINO) + 1);
    const colpevoli = dopo.filter((f) => {
      const sql = senzaCommenti(f);
      // Una vista nominata, oppure un ciclo che le prende tutte (`like '%_senza_prezzi'`), con l'impostazione accesa.
      return /senza_prezzi/i.test(sql) && /security_invoker\s*=\s*(true|on)/i.test(sql);
    });
    expect(colpevoli).toEqual([]);
  });
});
