/**
 * Aziende-vetrina interne (Demo Azienda 1 e 2).
 *
 * Trattamento speciale UI (sidebar full-feature, contenuti di esempio, no gate
 * carta) e gate dedicati su edge functions / pages.
 *
 * Storia: l'UUID della prima demo era duplicato in:
 *   - src/lib/ai/models.config.ts (per AI Test Lab gating)
 *   - src/components/layouts/CompanyLayout.tsx (per sidebar bypass)
 *   - supabase/migrations/.../ai_test_lab_kpi_security_hardening.sql
 * Centralizzato qui per evitare drift quando l'utenza/azienda cambia
 * (es. migrazione a un demo seed diverso o ambiente staging).
 *
 * 2026-07: aggiunta Demo Azienda 2 (clone-vetrina di Demo Azienda). Il confronto
 * `=== DEMO_COMPANY_ID` sparso nel codice è stato sostituito da isDemoCompanyId()
 * così una terza demo si aggiunge in un punto solo.
 */

/** Demo Azienda S.r.l. — baseline storica, unica autorizzata all'AI Test Lab. */
export const DEMO_COMPANY_ID = "778a2c76-1253-49f2-a5e8-283363ac3e29";

/** Demo Azienda 2 S.r.l. — clone-vetrina usato nelle dimostrazioni commerciali. */
export const DEMO_COMPANY_2_ID = "d2000000-0000-4000-a000-000000000002";

/** Tutte le aziende trattate come vetrina. */
export const DEMO_COMPANY_IDS: ReadonlySet<string> = new Set([
  DEMO_COMPANY_ID,
  DEMO_COMPANY_2_ID,
]);

/**
 * True se l'azienda è una vetrina interna.
 *
 * NB: NON usare per l'AI Test Lab — quello resta legato alla sola Demo Azienda
 * (la RPC `ai_test_lab_kpi` è blindata su quell'UUID lato database).
 */
export function isDemoCompanyId(id: string | null | undefined): boolean {
  return !!id && DEMO_COMPANY_IDS.has(id);
}
