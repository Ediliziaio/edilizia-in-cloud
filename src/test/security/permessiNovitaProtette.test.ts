/**
 * Niente di nuovo senza permesso (03/11/2026).
 *
 * L'analisi dei permessi ha trovato pagine e file aperti a chiunque fosse loggato, perché
 * nascevano senza che nessuno decidesse chi doveva vederli. Qui la decisione diventa
 * obbligatoria: una pagina o una tabella nuova senza permesso fa fallire i test.
 * Se è davvero per tutti, va scritto: nell'elenco qui sotto o con un commento in migrazione.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROTTE = readFileSync("src/routes/companyRoutes.tsx", "utf8");
const CARTELLA = "supabase/migrations";
/** Da qui in poi valgono le regole: il pregresso si sistema a gruppi, con il piano permessi. */
const PRIMA_MIGRAZIONE_CONTROLLATA = "20281118090000";

/** Pagine aperte a tutti gli utenti dell'azienda, di proposito. */
const VISTE_SENZA_PREZZI = /senza_prezzi|senza_costi/;
const ROTTE_PER_TUTTI = new Set([
  "/azienda/*", "onboarding/vertical", "upgrade", "preview-demo", "mio-profilo", "notifiche", "crediti",
  "abbonamento", "impostazioni", "silvio-ai", "chat", "attivita",
  // Si protegge da sola, scheda per scheda (src/lib/manodopera/schede.ts).
  "manodopera",
  // Solo rimandi: la pagina di arrivo ha il suo permesso.
  "commesse/:id", "commesse/:id/diario", "commesse/:id/modifica", "interventi/:id", "interventi/:id/chiudi",
  "fatturazione", "fatturazione/:id", "acquisti-da-fare",
  // Ritorni dai login esterni.
  "impostazioni/integrazioni/email-callback", "impostazioni/integrazioni/calendar-callback",
  "impostazioni/integrazioni/gbp-callback", "impostazioni/integrazioni/google-ads-callback",
  "impostazioni/integrazioni/fic-callback",
]);

/**
 * Tabelle controllate sul database il 10/11/2026, con la ragione per cui il test da solo non le
 * riconosce. Una riga nuova qui va scritta solo dopo averle provate con un utente vero.
 */
const TABELLE_VERIFICATE: Record<string, string> = {
  giornale_eventi: "lettura: staff dell'azienda, mai clienti esterni né utenti bloccati; scrittura: puo_modificare_giornale",
  giornale_invii_dl: "nessun GRANT ad authenticated: la scrivono e leggono solo le funzioni del server",
  voci_materiale_scelte: "nessun GRANT ad authenticated: la usa solo il server",
  order_item_misure_storico: "lettura: user_can_access_company + materiali_puo('can_view_orders')",
  cg_rimanenze_lavori: "lettura: staff d'ufficio dell'azienda, mai clienti esterni né squadre di campo",
  giornale_da_aggiornare: "nessun GRANT ad authenticated: coda interna del giornale",
  login_lock_resets: "nessun GRANT ad authenticated: la scrive solo la funzione di sblocco",
  contabilita_esercizi: "lettura: contabilita_puo_leggere(company_id)",
};

/**
 * Viste che girano col proprietario di proposito, perché filtrano dentro: verificate il
 * 10/11/2026 con un cliente esterno (0 righe) e un amministratore (solo la sua azienda).
 */
const VISTE_CHE_FILTRANO_DENTRO: Record<string, string> = {
  v_appalto_rapportini_da_rendicontare: "puo_vedere_commessa + has_permission_for_company('can_view_order_amounts')",
  // 20290314000002: security_barrier e diritti economici dentro (private.office_*_rights);
  // provate il 12/11/2026 con un cliente esterno: 0 righe in tutte.
  campo_rapportini_visibili: "private.office_order_rights(order_id)",
  orders_visibili: "private.office_order_rights(id)",
  employees_visibili: "private.office_company_rights(company_id)",
  order_installments_visibili: "private.office_order_rights(order_id)",
  order_employees_visibili: "private.office_order_rights(order_id)",
};

function rotteSenzaPermesso(sorgente: string): string[] {
  const trovate: string[] = [];
  for (const m of sorgente.matchAll(/<Route\b([\s\S]*?)(\/>|>\s*\n)/g)) {
    const corpo = m[1];
    const percorso = corpo.match(/path="([^"]+)"/)?.[1];
    if (!percorso || !corpo.includes("element=")) continue;
    if (/Navigate|withCompanyPermission|RequireCompanyPermission|ProtectedRoute/.test(corpo)) continue;
    trovate.push(percorso);
  }
  return trovate;
}

/** Toglie i commenti `-- …` (fino a fine riga), lasciando il resto com'è. */
const senzaCommenti = (sql: string) => sql.replace(/--[^\n]*/g, "");

function migrazioniNuove(): { nome: string; testo: string; codice: string }[] {
  return readdirSync(CARTELLA)
    .filter((f) => f.endsWith(".sql") && f.slice(0, 14) >= PRIMA_MIGRAZIONE_CONTROLLATA)
    .map((nome) => {
      const testo = readFileSync(join(CARTELLA, nome), "utf8");
      // `testo` com'è (le tabelle dichiarano chi le vede in un commento «permesso tabella:»);
      // `codice` senza commenti, per le viste: «un CREATE OR REPLACE VIEW lo azzera» non è una vista.
      return { nome, testo, codice: senzaCommenti(testo) };
    });
}

describe("le novità nascono con un permesso", () => {
  it("ogni pagina dell'azienda ha un permesso o è scritta tra quelle per tutti", () => {
    const scoperte = rotteSenzaPermesso(ROTTE).filter((r) => !ROTTE_PER_TUTTI.has(r));
    expect(scoperte).toEqual([]);
  });

  it("riconosce una pagina nuova senza permesso", () => {
    expect(rotteSenzaPermesso(`<Route path="nuova" element={<Pagina />} />\n`)).toEqual(["nuova"]);
    expect(rotteSenzaPermesso(`<Route path="ok" element={withCompanyPermission("canViewOrders", <Pagina />)} />\n`)).toEqual([]);
  });

  it("nessun archivio di file aperto a chiunque sia loggato", () => {
    for (const { nome, testo } of migrazioniNuove()) {
      for (const m of testo.matchAll(/create policy[\s\S]*?on storage\.objects[\s\S]*?;/gi)) {
        expect(m[0], `${nome}: regola sui file senza controllo dell'azienda`).not.toMatch(/auth\.uid\(\)\s+is\s+not\s+null\s*\)?\s*\)?\s*;/i);
      }
    }
  });

  it("ogni tabella aziendale nuova dichiara chi la vede", () => {
    for (const { nome, testo } of migrazioniNuove()) {
      for (const m of testo.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
        if (!/\bcompany_id\b/.test(m[2])) continue;
        const dichiarata = new RegExp(`permesso\\s+${m[1]}:`, "i").test(testo);
        // `puo_vedere_commessa` / `puo_modificare_commessa` sono il cancello
        // delle tabelle agganciate a una commessa: `sal_certificati` (20/11)
        // ci costruisce sopra insert, update e delete, e risultava «non dice
        // chi può vederla» solo perché il cancello non era in questo elenco.
        const controllata = /has_permission|puo_vedere_finanza|puo_vedere_commessa|puo_modificare_commessa|e_amministratore_di|aziende_con_permesso/.test(testo);
        const verificata = m[1] in TABELLE_VERIFICATE;
        expect(dichiarata || controllata || verificata, `${nome}: la tabella ${m[1]} non dice chi può vederla`).toBe(true);
      }
    }
  });

  it("nessuna vista nuova salta le regole di chi la legge", () => {
    const migrazioni = migrazioniNuove().sort((a, b) => a.nome.localeCompare(b.nome));
    // `alter view … set (security_invoker = on)` la rimette dopo un CREATE OR REPLACE, che la toglie:
    // vale nello stesso file o in uno successivo, perché conta come la vista è alla fine.
    const rimessaFinoA = (vista: string, da: number) =>
      migrazioni.slice(da).some(({ codice: testo }) =>
        new RegExp(
          `alter\\s+view\\s+(if\\s+exists\\s+)?(public\\.)?${vista}\\s+set\\s*\\([^)]*security_invoker\\s*=\\s*(on|true)`, "i",
        ).test(testo));
    migrazioni.forEach(({ nome, codice }, i) => {
      // Viste «senza prezzi» (blocco costi, 08/11/2026): devono leggere ciò che la regola nega alle
      // GET dirette, quindi girano col proprietario e filtrano l'azienda dentro, con security_barrier.
      if (VISTE_SENZA_PREZZI.test(nome)) return;
      // `create or replace view public.%I with(security_barrier=true)` dentro un format(): il nome è
      // un segnaposto e la vista filtra dentro come le «senza prezzi». Non è una vista da riconoscere qui.
      // Solo le viste di public: quelle di `private` il browser non le può leggere.
      for (const m of codice.matchAll(/create (?:or replace )?view\s+(?!public\.%)(?!(?!public\.)\w+\.)(?:public\.)?(\w+)([\s\S]*?)\bas\b/gi)) {
        const filtraDentro = m[1] in VISTE_CHE_FILTRANO_DENTRO;
        expect(/security_invoker/i.test(m[2]) || rimessaFinoA(m[1], i) || filtraDentro, `${nome}: la vista ${m[1]} deve avere security_invoker`).toBe(true);
      }
    });
  });

  it("riconosce una vista riscritta che perde security_invoker", () => {
    const testo = "create or replace view public.v_prova as select 1;";
    expect(/create (?:or replace )?view\s+(?:public\.)?(\w+)([\s\S]*?)\bas\b/i.exec(testo)?.[2]).not.toMatch(/security_invoker/i);
  });
});
