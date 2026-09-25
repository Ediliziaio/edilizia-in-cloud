/**
 * Il backup salva tutto quello che la purga cancella (25/09/2026).
 *
 * Purgando la Demo 2 in una transazione annullata, la purga ha cancellato
 * 14.728 righe e 3.283 non erano nel backup: le tabelle figlie senza
 * company_id (righe di fattura, voci e rate delle commesse, campi e liste dei
 * contatti) e i dati veri buttati via da un filtro sul nome (crediti AI,
 * registro chiamate, firme elettroniche, chat interna). Dopo la migrazione
 * 20280925120000 manca solo ciò che è escluso di proposito, col motivo.
 *
 * Tiene fermo, sull'ultima definizione di ogni funzione nelle migrazioni:
 *   · le figlie entrano attraverso la madre, seguendo le chiavi a cascata;
 *   · nessun dato vero sta fra le esclusioni, e ognuna ha il suo motivo;
 *   · le esportazioni leggono il catalogo, non `company_id = $1`;
 *   · nessuna funzione del backup è aperta a chi non è super admin.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CARTELLA = join(__dirname, "../../../supabase/migrations");
const MIGRAZIONI = readdirSync(CARTELLA).filter((f) => f.endsWith(".sql")).sort();

/** Il corpo dell'ultima `CREATE OR REPLACE FUNCTION public.<nome>`, fino al suo `$function$;`. */
function ultimaDefinizione(nome: string): { file: string; corpo: string } {
  const inizio = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${nome}\\s*\\(`, "i");
  for (const file of [...MIGRAZIONI].reverse()) {
    const testo = readFileSync(join(CARTELLA, file), "utf8");
    const trovato = inizio.exec(testo);
    if (!trovato) continue;
    const fine = testo.indexOf("$function$;", trovato.index);
    return { file, corpo: testo.slice(trovato.index, fine === -1 ? undefined : fine) };
  }
  throw new Error(`nessuna migrazione definisce public.${nome}`);
}

const esclusioni = (): Array<{ tabella: string; motivo: string }> =>
  [...ultimaDefinizione("admin_backup_esclusioni").corpo.matchAll(/\('([a-z0-9_]+)',\s*'([^']*)'\)/g)]
    .map(([, tabella, motivo]) => ({ tabella, motivo }));

describe("il catalogo del backup", () => {
  it("le tabelle figlie entrano attraverso la madre, seguendo le chiavi che la purga segue", () => {
    const { corpo } = ultimaDefinizione("admin_catalogo_backup");
    expect(corpo).toMatch(/confdeltype\s*=\s*'c'/);
    expect(corpo).toContain("IN (SELECT t.%I FROM public.%I t WHERE %s)");
    expect(corpo).toContain("'t.company_id = $1'");
  });

  it("chi punta all'azienda con un'altra colonna (tenant_id, produttore_id…) entra anche lui", () => {
    const { corpo } = ultimaDefinizione("admin_catalogo_backup");
    expect(corpo).toContain("k.confrelid = 'public.companies'::regclass");
    expect(corpo).toContain("format('t.%I = $1', a.attname)");
  });

  it("i dati veri non stanno fra le esclusioni", () => {
    const escluse = new Set(esclusioni().map((e) => e.tabella));
    const datiVeri = [
      // le figlie che mancavano
      "invoice_lines", "order_items", "order_installments", "order_attachments", "order_status_history",
      "marketing_contact_field_values", "marketing_contact_list_members", "openwa_campagna_destinatari",
      // i dati buttati via dal filtro sul nome
      "ai_credits", "ai_credit_transactions", "ai_brain_documents", "call_logs", "sms_log",
      "fea_audit_log", "gdpr_audit_log", "internal_chat_channels", "internal_chat_messages",
      "lifecycle_email_sends", "email_credits_log", "subscription_logs",
    ];
    expect(datiVeri.filter((t) => escluse.has(t))).toEqual([]);
  });

  it("ogni esclusione è scritta una volta, col suo motivo", () => {
    const elenco = esclusioni();
    expect(elenco.length).toBeGreaterThan(50);
    expect(elenco.filter((e) => e.motivo.trim() === "")).toEqual([]);
    const nomi = elenco.map((e) => e.tabella);
    expect(nomi.filter((n, i) => nomi.indexOf(n) !== i)).toEqual([]);
  });

  it("le credenziali restano fuori dai file di backup", () => {
    expect(esclusioni().map((e) => e.tabella)).toContain("integration_credentials");
  });
});

describe("le esportazioni leggono il catalogo", () => {
  it.each(["admin_esporta_azienda", "admin_esporta_blocco", "admin_tabelle_con_dati", "admin_tabelle_da_esportare"])(
    "%s",
    (nome) => {
      const { corpo } = ultimaDefinizione(nome);
      expect(corpo).toContain("public.admin_catalogo_backup()");
      expect(corpo).not.toMatch(/where\s+(t\.)?company_id\s*=\s*\$1/i);
    },
  );
});

describe("il backup non è aperto a chi non è super admin", () => {
  it.each(["admin_backup_esclusioni", "admin_catalogo_backup", "admin_backup_tabelle_scoperte", "admin_tabelle_da_esportare"])(
    "%s: niente anon né utenti, solo service_role",
    (nome) => {
      const { file } = ultimaDefinizione(nome);
      const testo = readFileSync(join(CARTELLA, file), "utf8");
      expect(testo).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${nome}\\(\\) FROM PUBLIC, anon, authenticated;`));
      expect(testo).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${nome}\\(\\) TO service_role;`));
    },
  );
});
