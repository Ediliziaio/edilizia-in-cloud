/**
 * useSilvioPageContext — deriva il "contesto pagina" che l'utente sta guardando
 * quando apre Silvio. Permette all'AI di rispondere a domande vaghe ("come va?",
 * "che ne pensi?") usando come default l'entità visibile, MA senza bloccare le
 * domande esplicite su altre entità.
 *
 * Pattern: il context è un HINT al system prompt, non un filtro. Silvio decide.
 *
 * Esempi:
 *   /azienda/commesse/abc-123  → { entity_type: "order",    entity_id: "abc-123", route_label: "Commessa" }
 *   /azienda/clienti/xyz-789   → { entity_type: "customer", entity_id: "xyz-789", route_label: "Cliente" }
 *   /azienda/magazzino         → { entity_type: "warehouse_overview", entity_id: null, route_label: "Magazzino" }
 *   /azienda/dashboard         → null (nessun context utile)
 *
 * Volutamente NON estraiamo dati qui (lo fa l'edge function lato server per
 * sicurezza RLS): il client invia solo (entity_type, entity_id) come stringhe
 * opache. Il server valida l'accesso prima di iniettare nel prompt.
 */
import { useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

export interface SilvioPageContext {
  /** Tipo entità interpretabile dall'edge function */
  entity_type:
    | "order"
    | "customer"
    | "invoice"
    | "quote"
    | "employee"
    | "supplier"
    | "warehouse_overview"
    | "bank_overview"
    | "cantiere_overview"
    | "marketing_overview"
    | "personale_overview"
    | "talent_candidate"
    | "selezioni_overview";
  /** ID UUID dell'entità — null per overview pagine senza ID */
  entity_id: string | null;
  /** Etichetta human-readable per UI ("Commessa", "Cliente", ecc.) */
  route_label: string;
  /** Path corrente (per debug e logging) */
  route_path: string;
}

/**
 * Pattern di matching: ogni regola tenta di estrarre un context dalla pathname.
 * L'ordine conta — i pattern PIÙ SPECIFICI vanno PRIMA dei più generici.
 */
interface ContextRule {
  /** Regex sulla pathname. Cattura `(group 1)` = entity_id se presente. */
  pattern: RegExp;
  entity_type: SilvioPageContext["entity_type"];
  route_label: string;
  /** Se true, richiede un UUID nel match per essere valido. */
  requiresId: boolean;
}

const UUID_RE = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";

const RULES: ContextRule[] = [
  // ── Specifici (con UUID) ─────────────────────────────────────────
  { pattern: new RegExp(`^/azienda/commesse/${UUID_RE}`),       entity_type: "order",    route_label: "Commessa",   requiresId: true },
  { pattern: new RegExp(`^/azienda/clienti/${UUID_RE}`),        entity_type: "customer", route_label: "Cliente",    requiresId: true },
  { pattern: new RegExp(`^/azienda/fatturazione/editor/${UUID_RE}`), entity_type: "invoice", route_label: "Documento fiscale", requiresId: true },
  // 2026-05-27 (UX audit): path preventivi è sotto /marketing, non top-level.
  { pattern: new RegExp(`^/azienda/marketing/preventivi/${UUID_RE}`),     entity_type: "quote",    route_label: "Preventivo", requiresId: true },
  { pattern: new RegExp(`^/azienda/personale/${UUID_RE}`),      entity_type: "employee", route_label: "Dipendente", requiresId: true },
  { pattern: new RegExp(`^/azienda/subappaltatori/${UUID_RE}`), entity_type: "supplier", route_label: "Subappaltatore", requiresId: true },

  // ── Overview (senza ID) ──────────────────────────────────────────
  { pattern: /^\/azienda\/magazzino/,         entity_type: "warehouse_overview", route_label: "Magazzino",  requiresId: false },
  { pattern: /^\/azienda\/cassa/,             entity_type: "bank_overview",      route_label: "Cassa",      requiresId: false },
  { pattern: /^\/azienda\/commesse(?!\/)/,    entity_type: "cantiere_overview",  route_label: "Cantieri",   requiresId: false },
  { pattern: /^\/azienda\/marketing/,         entity_type: "marketing_overview", route_label: "Marketing",  requiresId: false },
  { pattern: /^\/azienda\/personale(?!\/)/,   entity_type: "personale_overview", route_label: "Personale",  requiresId: false },
];

/**
 * Estrae il context dalla pathname corrente. Ritorna null per route non
 * mappate (Silvio si comporterà come prima, senza context aggiuntivo).
 */
export function useSilvioPageContext(): SilvioPageContext | null {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab");
  return useMemo(() => {
    // Sotto-tab "selezioni" del personale → context dedicato Talent Assessment
    if (pathname === "/azienda/personale" && tab === "selezioni") {
      return {
        entity_type: "selezioni_overview",
        entity_id: null,
        route_label: "Selezioni HR",
        route_path: pathname,
      };
    }
    for (const rule of RULES) {
      const match = pathname.match(rule.pattern);
      if (!match) continue;
      const id = match[1] ?? null;
      // Se la regola richiede ID e non l'abbiamo trovato → skip
      if (rule.requiresId && !id) continue;
      return {
        entity_type: rule.entity_type,
        entity_id: id,
        route_label: rule.route_label,
        route_path: pathname,
      };
    }
    return null;
  }, [pathname, tab]);
}
