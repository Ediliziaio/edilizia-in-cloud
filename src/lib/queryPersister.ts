/**
 * 2026-05-27 (PWA/offline audit): persister React Query su IndexedDB.
 *
 * Senza, dopo F5 senza rete l'utente vedeva spinner infinito su ogni pagina
 * (dashboard, clienti, calendario) → app "morta". Con persistQueryClient,
 * l'ultimo snapshot di dati critici è leggibile offline da quando li ha
 * caricati l'ultima volta (max 24h).
 *
 * Whitelist deliberata di queryKey persistite — NON tutto. Auth, search live,
 * AI completions: NO. Dati operativi che cambiano ogni minuto: NO (refresh
 * lo riconsegna velocissimo). Dati semi-stabili che l'utente in cantiere
 * vuole consultare: SÌ (cantieri attivi, clienti, appointments del giorno).
 *
 * Buster = APP_VERSION → invalidazione totale su deploy nuovo, evita di
 * leggere snapshot di una versione UI vecchia con schema diverso.
 */
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { get, set, del } from "idb-keyval";

const KEY = "rq-cache-v1";

let persistErrorLogged = false;

/**
 * Risolve a `undefined` se la promise non si settla entro `ms`. Difesa contro
 * IndexedDB "blocked"/pending su WKWebView iOS: senza, `restoreClient` non
 * tornerebbe mai → `isRestoring` resta true → tutte le query default in pausa
 * → spinner infinito sulle pagine post-login.
 */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve(undefined); }
    }, ms);
    p.then(
      (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } },
      () => { if (!settled) { settled = true; clearTimeout(timer); resolve(undefined); } },
    );
  });
}

export function createIdbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(KEY, client);
      } catch (err) {
        // Difesa: se lo snapshot contiene dati non clonabili (DataCloneError —
        // es. una Promise nei dati di una query), idb-keyval lancia. La persistenza
        // è best-effort: saltiamo senza rompere il flusso. Log UNA volta per non
        // spammare la console (l'errore si ripeteva ad ogni ciclo di persist).
        if (!persistErrorLogged) {
          persistErrorLogged = true;
          console.warn("[queryPersister] snapshot non serializzabile — persistenza saltata", err);
        }
      }
    },
    restoreClient: async () => {
      // Timeout 3s: se IndexedDB si blocca all'apertura (WKWebView iOS), riparti
      // senza cache invece di lasciare l'app in "isRestoring" per sempre.
      const restored = await withTimeout(get<PersistedClient>(KEY), 3000);
      return restored ?? undefined;
    },
    removeClient: async () => {
      await del(KEY);
    },
  };
}

/**
 * Whitelist di queryKey root da persistere. Match per startsWith del primo
 * elemento dell'array queryKey: `["cantieri", companyId]` matcha "cantieri".
 * Aggiungere voci con prudenza — più persistiamo, più rischio di mostrare
 * dati stale dopo eventi del DB tra una sessione e l'altra.
 */
const PERSIST_WHITELIST = new Set<string>([
  "cantieri",
  "orders",
  "clienti",
  "customers",
  "marketing-contacts",
  "marketing-appointments",
  "appointments",
  "dashboard-kpi",
  "company-dashboard",
  "calendars",
  "marketing-calendars",
  "giornale-lavori",
  "scadenze",
  // 2026-05-28 Velocity: aggiunte chiavi "stabili" usate al boot di ogni
  // sessione (branding, plan, notifiche). Persistere queste evita 3-5 query
  // pesanti al primo render dopo refresh / nuova tab. Refetch in background
  // mantiene comunque i dati freschi.
  "company-branding",           // useBranding (282ms, 37 calls — alta freq)
  "branding",                   // useBrandingByDomain
  "platform-changelog",         // changelog widget sidebar
  "platform-feature-flags",     // feature toggles globali
  "platform-announcements",     // banner annunci platform
  "subscription-plans",         // KPI piano corrente
  "integrations",               // hub /azienda/impostazioni/integrazioni
  // 2026-06-10 — area SUPERADMIN: le pagine Growth rifacevano da zero 3+ query
  // remote a ogni visita (skeleton 10s+). Dati piccoli e serializzabili; il
  // refetch in background li tiene freschi, la cache li mostra subito.
  "admin-produttori",            // ProduttoriDashboard (lista + analytics)
  "admin-commercialisti",        // CommercialistiDashboard (studi + analytics)
  "admin-activity",              // badge "ultima attività" (get-admin-activity)
  "admin-wholesale-mrr",         // card Wholesale/mese nel dashboard SA
  "admin-companies-reseller-info",   // badge Rivenditore in CompaniesList
  "admin-companies-accountant-info", // badge Studio in CompaniesList
  "admin-companies-producer-info",   // badge Produttore in CompaniesList
  // 2026-06-10 — pagina Automazioni: al primo load freddo le 4 query
  // (flussi, cartelle, struttura, iscritti) andavano in timeout a 12s.
  // Con lo snapshot persistito la lista appare subito dalla cache e il
  // refetch in background la aggiorna senza errori a schermo.
  "automation-flows",
  "automation-folders-all",
  "automation-node-summaries",
  "automation-enrollment-counts",
  "automation-overview-stats",
  "platform-admin-company-id",   // AdminTeamChat: id quasi statico, sblocca il mount immediato
  "admin-attivita-tasks",        // /admin/attivita: lista task subito dalla cache
]);

export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  const root = Array.isArray(queryKey) && typeof queryKey[0] === "string" ? queryKey[0] : null;
  if (!root) return false;
  return PERSIST_WHITELIST.has(root);
}

/**
 * Filtro per dehydrateOptions.shouldDehydrateQuery: persiste solo le query in
 * whitelist E con dati serializzabili. Alcune query whitelisted possono avere nei
 * dati valori NON clonabili (Promise/funzioni); senza questo controllo idb-keyval
 * lancia DataCloneError e ROMPE l'intero salvataggio (spam console + cache offline
 * mai scritta). Qui escludiamo SOLO la query problematica, lasciando persistere le
 * altre. structuredClone replica esattamente l'algoritmo usato da IndexedDB.
 */
export function shouldPersistQuerySafe(query: {
  queryKey: readonly unknown[];
  state: { data: unknown; status?: string };
}): boolean {
  if (!shouldPersistQuery(query.queryKey)) return false;
  // Solo query risolte: dehydratare una query "pending" non salva alcun dato
  // (utile solo per SSR streaming, non per IndexedDB) e al restore react-query
  // la ri-esegue PRIMA che la sessione Supabase sia pronta → reject + spam
  // console "A query that was dehydrated as pending ended up rejecting"
  // (visto ×15 su platform-feature-flags ad ogni load).
  if (query.state.status !== "success") return false;
  if (typeof structuredClone !== "function") return true; // ambiente legacy: comportamento precedente
  try {
    structuredClone(query.state.data);
    return true;
  } catch {
    return false;
  }
}
