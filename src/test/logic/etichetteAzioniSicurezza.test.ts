/**
 * Le azioni di sicurezza (user_audit_log) hanno un nome italiano ovunque si leggano (09/10/2026).
 *
 * La scheda utente ne conosceva 13 (sei delle quali nessuno le scrive), il
 * Security dashboard 7. Nel database ce ne sono 14: utente eliminato, ruolo
 * cambiato, accesso bloccato… comparivano col codice inglese. Un elenco solo
 * (lib/users/etichetteAzioniSicurezza), e questo test lo confronta con quello
 * che il codice scrive DAVVERO: una azione nuova senza nome fa fallire il test.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ETICHETTE_AZIONI_SICUREZZA,
  descriviDettagliSicurezza,
  etichettaAzioneSicurezza,
} from "@/lib/users/etichetteAzioniSicurezza";

const ROOT = join(__dirname, "../../..");
const leggi = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Le azioni che il codice scrive in user_audit_log, trovate nei sorgenti
 * (client, edge function, SQL). Si guardano solo i punti che scrivono nel
 * registro: `action:` è anche il verbo di altre funzioni («change_email» per
 * company-access-manage), e quelle non sono azioni del registro.
 */
function azioniScritteDalCodice(): Set<string> {
  const trovate = new Set<string>();
  const dallaEspressione = (espressione: string) => {
    for (const m of espressione.matchAll(/["']([a-z]+(?:_[a-z]+)+)["']/g)) trovate.add(m[1]);
  };
  const dalSorgente = (testo: string) => {
    // writeAuditLog("user_unlocked", …)
    for (const m of testo.matchAll(/writeAuditLog\(\s*["']([a-z_]+)["']/g)) trovate.add(m[1]);
    // .from("user_audit_log").insert({ … action: <stringa o scelta fra due stringhe> … }) e writeUserAuditLog({ … })
    for (const m of testo.matchAll(/(?:from\(["']user_audit_log["']\)\s*\.insert\(|writeUserAuditLog\()\s*\[?\{/g)) {
      const dopo = testo.slice(m.index!, m.index! + 700);
      const azione = /\baction:\s*([^,\n]+)/.exec(dopo);
      if (azione) dallaEspressione(azione[1]);
    }
  };
  const file = [
    "src/components/settings/UsersConfig.tsx",
    "src/components/users/BloccoAccessoCard.tsx",
    "src/pages/azienda/settings/SettingsUserDetail.tsx",
    "supabase/functions/delete-company-user/index.ts",
    "supabase/functions/check-login-security/index.ts",
    "supabase/functions/manage-permission-template/index.ts",
    "supabase/functions/_shared/revocaSessioni.ts",
    "supabase/functions/gdpr-compliance/index.ts",
  ];
  for (const f of file) dalSorgente(leggi(f));
  // Scritte dal database: cambia_ruolo_utente, imposta_ruolo_aggiuntivo, registra_esportazione_crm.
  const migrazioni = join(ROOT, "supabase/migrations");
  for (const nome of readdirSync(migrazioni).filter((n) => n.endsWith(".sql"))) {
    const sql = readFileSync(join(migrazioni, nome), "utf8");
    if (!/insert into public\.user_audit_log/i.test(sql)) continue;
    for (const m of sql.matchAll(/insert into public\.user_audit_log[^;]*?values\s*\([^;]*?'([a-z]+(?:_[a-z]+)+)'/gis)) trovate.add(m[1]);
  }
  return trovate;
}

describe("ogni azione che il codice scrive ha un nome italiano", () => {
  const scritte = [...azioniScritteDalCodice()].sort();

  it("il test legge davvero le azioni (non gira a vuoto)", () => {
    for (const attesa of ["user_created", "user_deleted", "bulk_users_deleted", "users_exported", "user_locked", "user_unlocked", "role_changed", "additional_role_changed", "permissions_updated", "account_locked", "session_revoked", "all_sessions_revoked", "crm_exported", "company_access_revoked"]) {
      expect(scritte, attesa).toContain(attesa);
    }
  });

  it.each(scritte)("%s", (azione) => {
    expect(ETICHETTE_AZIONI_SICUREZZA[azione], `«${azione}» è scritta nel registro ma non ha un nome`).toBeTruthy();
    expect(etichettaAzioneSicurezza(azione)).not.toMatch(/[_.]/);
  });
});

describe("etichettaAzioneSicurezza", () => {
  it("le azioni di oggi", () => {
    expect(etichettaAzioneSicurezza("user_deleted")).toBe("Utente eliminato");
    expect(etichettaAzioneSicurezza("role_changed")).toBe("Ruolo cambiato");
    expect(etichettaAzioneSicurezza("user_locked")).toBe("Accesso bloccato");
    expect(etichettaAzioneSicurezza("users_exported")).toBe("Elenco utenti esportato");
    expect(etichettaAzioneSicurezza("personal_data_exported")).toBe("Copia dei propri dati scaricata");
  });

  it("una azione che non conosce diventa una frase, non un codice", () => {
    expect(etichettaAzioneSicurezza("p1_test")).toBe("P1 test");
    expect(etichettaAzioneSicurezza("some_new_action")).toBe("Some new action");
    expect(etichettaAzioneSicurezza("")).toBe("Azione");
    expect(etichettaAzioneSicurezza(undefined)).toBe("Azione");
  });
});

describe("descriviDettagliSicurezza: le righe vere del registro, in una frase", () => {
  it("utente creato / eliminato / accesso da un'altra azienda revocato", () => {
    expect(descriviDettagliSicurezza("user_created", { role: "salesperson", email: "anna@esempio.it", commission_percentage: 5 }))
      .toBe("Venditore · anna@esempio.it");
    expect(descriviDettagliSicurezza("user_deleted", { target_email: "luca@esempio.it", roles: ["company_staff"], secondary_access_only: false, reassign_to_user_id: null }))
      .toBe("luca@esempio.it · Operatore");
    expect(descriviDettagliSicurezza("company_access_revoked", { target_email: "c@x.it", roles: ["employee", "worker"] }))
      .toBe("c@x.it · Operaio / Tecnico, Operaio / Tecnico");
  });

  it("eliminazione di più utenti", () => {
    expect(descriviDettagliSicurezza("bulk_users_deleted", { requested: 4, deleted: 3, failed: 1, blocked: 0, user_ids: ["a"] }))
      .toBe("Eliminati 3 su 4 (1 non riusciti)");
    expect(descriviDettagliSicurezza("bulk_users_deleted", { requested: 2, deleted: 2, failed: 0 })).toBe("Eliminati 2 su 2");
  });

  it("ruolo cambiato e ruolo aggiuntivo: con i nomi dei ruoli, non i codici", () => {
    expect(descriviDettagliSicurezza("role_changed", { from: "call_center", to: "company_admin", multiCompanyAccess: false }))
      .toBe("Da Call Center a Amministratore");
    expect(descriviDettagliSicurezza("role_changed", { da: "company_staff", a: "salesperson" })).toBe("Da Operatore a Venditore");
    expect(descriviDettagliSicurezza("additional_role_changed", { role: "salesperson", active: true })).toBe("Aggiunto Venditore");
    expect(descriviDettagliSicurezza("additional_role_changed", { role: "employee", active: false })).toBe("Tolto Operaio / Tecnico");
  });

  it("blocchi e sessioni", () => {
    expect(descriviDettagliSicurezza("user_locked", { source: "people_list", blocked: true })).toBe("Dall'elenco utenti");
    expect(descriviDettagliSicurezza("user_locked", { source: "scheda_utente", blocked: true })).toBe("Dalla scheda utente");
    expect(descriviDettagliSicurezza("user_unlocked", { source: "people_list", blocked: false, motivo: "rientrato" })).toBe("Dall'elenco utenti · rientrato");
    expect(descriviDettagliSicurezza("account_locked", { reason: "max_failed_attempts", failed_count: 5 })).toBe("Dopo 5 password sbagliate di fila");
    expect(descriviDettagliSicurezza("all_sessions_revoked", { reason: "x", revoked_count: 3 })).toBe("3 sessioni chiuse");
    expect(descriviDettagliSicurezza("all_sessions_revoked", { revoked_count: 1 })).toBe("1 sessione chiusa");
    expect(descriviDettagliSicurezza("session_revoked", { tutti_i_dispositivi: true })).toBe("Disconnesso da tutti i dispositivi");
    expect(descriviDettagliSicurezza("session_revoked", { session_id: "x" })).toBeNull();
  });

  it("esportazioni: elenco utenti, dati dei clienti, copia dei propri dati", () => {
    expect(descriviDettagliSicurezza("users_exported", { rows: 12, filters: {} })).toBe("12 utenti");
    expect(descriviDettagliSicurezza("users_exported", { rows: 1 })).toBe("1 utente");
    expect(descriviDettagliSicurezza("crm_exported", { oggetto: "contatti", formato: "xlsx", righe: 12345, filtri: { ricerca: "rossi" } }))
      .toBe("Contatti · 12.345 righe · XLSX · ricerca: rossi");
    expect(descriviDettagliSicurezza("personal_data_exported", { origine: "Scarica i miei dati", dati_azienda_inclusi: false }))
      .toBe("Solo i suoi dati personali, senza i dati dell'azienda");
  });

  it("senza nulla di utile non dice niente, e non mostra mai un identificativo", () => {
    expect(descriviDettagliSicurezza("permissions_updated", {})).toBeNull();
    expect(descriviDettagliSicurezza("p1_test", null)).toBeNull();
    expect(descriviDettagliSicurezza("user_deleted", { reassign_to_user_id: "39e05a1b-f998-48d8-aab7-9aafb25a4a2a" })).toBeNull();
    expect(descriviDettagliSicurezza(undefined, undefined)).toBeNull();
  });
});
