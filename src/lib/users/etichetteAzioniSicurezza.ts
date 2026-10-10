/**
 * Le azioni di sicurezza e di gestione delle persone (tabella user_audit_log),
 * come le legge un titolare.
 *
 * Prima ogni schermata aveva il suo elenco: la scheda utente ne conosceva 13
 * (sei delle quali nessuno le scrive più), il Security dashboard 7. Nel database
 * ce ne sono 14 diverse e le più utili a un titolare (utente eliminato, ruolo
 * cambiato, accesso bloccato) comparivano col codice inglese, per esempio
 * «user_deleted». Un elenco solo, usato da scheda utente, Accessi e sessioni e
 * Controllo accessi.
 *
 * Modulo puro: nessun React, nessun Supabase.
 */
import { descriviEsportazioneCrm } from "@/lib/export/esportazioniCrm";
import { nomeRuolo } from "@/lib/permessi/ruoliUtente";

export const ETICHETTE_AZIONI_SICUREZZA: Record<string, string> = {
  user_created: "Utente creato",
  user_deleted: "Utente eliminato",
  bulk_users_deleted: "Utenti eliminati",
  role_changed: "Ruolo cambiato",
  additional_role_changed: "Ruolo aggiuntivo cambiato",
  permissions_updated: "Permessi cambiati",
  user_locked: "Accesso bloccato",
  user_unlocked: "Accesso ripristinato",
  account_locked: "Bloccato per password sbagliate",
  company_access_revoked: "Accesso da un'altra azienda revocato",
  session_revoked: "Sessione chiusa",
  all_sessions_revoked: "Tutte le sessioni chiuse",
  crm_exported: "Esportazione dati clienti",
  users_exported: "Elenco utenti esportato",
  personal_data_exported: "Copia dei propri dati scaricata",
  permission_template_created: "Modello di permessi creato",
  permission_template_applied: "Modello di permessi applicato",
  // Scritte in passato o previste dal codice vecchio: se ne trovano righe, si leggono lo stesso.
  login: "Accesso",
  logout: "Uscita",
  password_changed: "Password cambiata",
  account_unlocked: "Sbloccato",
  access_blocked: "Accesso bloccato",
  access_unblocked: "Accesso ripristinato",
};

/**
 * Il nome per chi legge. Un'azione che non conosce non si mostra col codice
 * grezzo («p1_test», «some_new_action»): diventa una frase leggibile, con la
 * prima lettera maiuscola e gli underscore tolti.
 */
export function etichettaAzioneSicurezza(azione: string | null | undefined): string {
  const a = (azione ?? "").trim();
  if (!a) return "Azione";
  const nota = ETICHETTE_AZIONI_SICUREZZA[a];
  if (nota) return nota;
  const leggibile = a.replace(/[_.-]+/g, " ").trim();
  return leggibile.charAt(0).toUpperCase() + leggibile.slice(1);
}

type Dettagli = Record<string, unknown>;

const comeOggetto = (d: unknown): Dettagli => (d && typeof d === "object" && !Array.isArray(d) ? (d as Dettagli) : {});
const testo = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Dove è stata fatta l'azione (campo `source` scritto dall'app). */
const DOVE: Record<string, string> = {
  people_list: "dall'elenco utenti",
  scheda_utente: "dalla scheda utente",
};

const sessioniChiuse = (n: number) => (n === 1 ? "1 sessione chiusa" : `${n} sessioni chiuse`);

/**
 * Una frase sui dettagli di una riga del registro, o null se non c'è niente di
 * utile da dire. Mai il JSON grezzo, mai un identificativo.
 */
export function descriviDettagliSicurezza(azione: string | null | undefined, dettagli: unknown): string | null {
  const d = comeOggetto(dettagli);
  switch (azione) {
    case "user_created": {
      const parti = [testo(d.role) ? nomeRuolo(testo(d.role)) : null, testo(d.email)].filter(Boolean);
      return parti.length ? parti.join(" · ") : null;
    }
    case "user_deleted":
    case "company_access_revoked": {
      const ruoli = Array.isArray(d.roles) ? (d.roles as unknown[]).map((r) => nomeRuolo(String(r))).filter(Boolean) : [];
      const parti = [testo(d.target_email), ruoli.length ? ruoli.join(", ") : null].filter(Boolean);
      return parti.length ? parti.join(" · ") : null;
    }
    case "bulk_users_deleted": {
      const chiesti = numero(d.requested);
      const eliminati = numero(d.deleted);
      const falliti = numero(d.failed);
      if (eliminati === null) return null;
      const base = chiesti !== null ? `Eliminati ${eliminati} su ${chiesti}` : `Eliminati ${eliminati}`;
      return falliti ? `${base} (${falliti} non riusciti)` : base;
    }
    case "role_changed": {
      const da = testo(d.from) ?? testo(d.da);
      const a = testo(d.to) ?? testo(d.a);
      if (!da && !a) return null;
      return da && a ? `Da ${nomeRuolo(da)} a ${nomeRuolo(a)}` : `Ora ${nomeRuolo(a ?? da)}`;
    }
    case "additional_role_changed": {
      const ruolo = testo(d.role);
      if (!ruolo) return null;
      return d.active === false ? `Tolto ${nomeRuolo(ruolo)}` : `Aggiunto ${nomeRuolo(ruolo)}`;
    }
    case "user_locked":
    case "user_unlocked": {
      const dove = DOVE[testo(d.source) ?? ""];
      const motivo = testo(d.motivo);
      const parti = [dove ? dove.charAt(0).toUpperCase() + dove.slice(1) : null, motivo].filter(Boolean);
      return parti.length ? parti.join(" · ") : null;
    }
    case "account_locked": {
      const n = numero(d.failed_count);
      return n ? `Dopo ${n} password sbagliate di fila` : "Dopo troppe password sbagliate";
    }
    case "session_revoked":
      return d.tutti_i_dispositivi === true ? "Disconnesso da tutti i dispositivi" : null;
    case "all_sessions_revoked": {
      const n = numero(d.revoked_count);
      return n !== null ? sessioniChiuse(n) : null;
    }
    case "crm_exported":
      return descriviEsportazioneCrm(dettagli);
    case "users_exported": {
      const n = numero(d.rows);
      return n !== null ? (n === 1 ? "1 utente" : `${n} utenti`) : null;
    }
    case "personal_data_exported":
      return "Solo i suoi dati personali, senza i dati dell'azienda";
    default:
      return null;
  }
}
