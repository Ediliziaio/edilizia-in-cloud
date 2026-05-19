-- ─────────────────────────────────────────────────────────────────────────────
-- Performance indexes follow-up
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Dopo aver applicato 20270519240000 (22 indexes core), la diagnostica
-- pg_stat_user_tables ha rivelato 3 tabelle con efficienza index < 30%:
--   - marketing_contact_activities: 0.0% (6815 seq_scan, 1 idx_scan)
--   - notifications:                 22.7% (16757 seq_scan, 4908 idx_scan)
--   - plan_feature_defaults:         10.1% (2736 seq_scan, 308 idx_scan)
--
-- Idempotente (IF NOT EXISTS). Eseguibile in unico blocco senza CONCURRENTLY
-- — tabelle piccole/medie, lock brevissimo.

BEGIN;

-- marketing_contact_activities: pattern .eq("contact_id") per la timeline
-- contatti (CRM).
CREATE INDEX IF NOT EXISTS marketing_contact_activities_contact_idx
  ON public.marketing_contact_activities (contact_id);

-- notifications: query principale del badge campanella + lista notifiche:
--   WHERE user_id=? AND company_id=? AND is_dismissed=false
--   ORDER BY created_at DESC LIMIT 50
-- Partial index su is_dismissed=false: 90%+ delle righe sono attive,
-- ma escludendo quelle dismissed l'index è più compatto e veloce.
CREATE INDEX IF NOT EXISTS notifications_user_company_active_idx
  ON public.notifications (user_id, company_id, created_at DESC)
  WHERE is_dismissed = false;

-- plan_feature_defaults: pattern .eq("plan_id") da useFeatureFlags +
-- PlanFeatureDefaultsCard. Anche se Postgres avrebbe creato auto-index
-- sulla PK, NON crea un index esplicito sulla FK plan_id → seq scan.
CREATE INDEX IF NOT EXISTS plan_feature_defaults_plan_idx
  ON public.plan_feature_defaults (plan_id);

COMMIT;
