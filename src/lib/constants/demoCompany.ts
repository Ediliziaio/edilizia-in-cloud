/**
 * Demo Azienda S.r.l. — company-vetrina interna.
 *
 * Trattamento speciale UI (sidebar full-feature, no badge DEMO) e gate
 * dedicati su edge functions / pages (AI Test Lab, esempi seed).
 *
 * Storia: l'UUID era duplicato in:
 *   - src/lib/ai/models.config.ts (per AI Test Lab gating)
 *   - src/components/layouts/CompanyLayout.tsx (per sidebar bypass)
 *   - supabase/migrations/.../ai_test_lab_kpi_security_hardening.sql
 * Centralizzato qui per evitare drift quando l'utenza/azienda cambia
 * (es. migrazione a un demo seed diverso o ambiente staging).
 */
export const DEMO_COMPANY_ID = "778a2c76-1253-49f2-a5e8-283363ac3e29";
