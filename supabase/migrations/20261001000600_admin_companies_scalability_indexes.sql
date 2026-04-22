-- Scalabilita pannello Super Admin / Aziende.
-- Questi indici coprono filtri, ordinamenti e join usati da /admin/aziende
-- e dal dettaglio team aziendale. Sono idempotenti per poter essere applicati
-- anche su database gia popolati.

CREATE INDEX IF NOT EXISTS idx_companies_admin_status_created
  ON public.companies (is_platform_admin_company, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_companies_admin_sector_created
  ON public.companies (is_platform_admin_company, sector, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_companies_admin_plan_created
  ON public.companies (is_platform_admin_company, subscription_plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_companies_admin_trial
  ON public.companies (is_platform_admin_company, trial_ends_at)
  WHERE trial_ends_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_company_created
  ON public.profiles (company_id, created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_company_email
  ON public.profiles (company_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_user_roles_user_role
  ON public.user_roles (user_id, role);

CREATE INDEX IF NOT EXISTS idx_staff_permissions_company_user
  ON public.staff_permissions (company_id, user_id);

CREATE INDEX IF NOT EXISTS idx_salespeople_company_user
  ON public.salespeople (company_id, user_id);

CREATE INDEX IF NOT EXISTS idx_employees_company_user
  ON public.employees (company_id, user_id);

CREATE INDEX IF NOT EXISTS idx_orders_company_created
  ON public.orders (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_tags_company_created
  ON public.company_tags (company_id, created_at);

CREATE INDEX IF NOT EXISTS idx_company_notes_company_created
  ON public.company_notes (company_id, created_at DESC);
