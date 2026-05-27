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

export function createIdbPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(KEY, client);
    },
    restoreClient: async () => {
      return (await get<PersistedClient>(KEY)) ?? undefined;
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
]);

export function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  const root = Array.isArray(queryKey) && typeof queryKey[0] === "string" ? queryKey[0] : null;
  if (!root) return false;
  return PERSIST_WHITELIST.has(root);
}
