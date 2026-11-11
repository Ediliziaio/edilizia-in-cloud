-- Transactional replay: existing production indexes are not rebuilt.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
-- ─────────────────────────────────────────────────────────────────────────────
-- Performance indexes audit — pattern di query più chiamati nel codice
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Generato analizzando i pattern `.eq() / .in() / .order()` nei top 15 hook
-- React Query del codebase. Postgres NON crea index automatici sulle FK
-- (a differenza di MySQL), quindi `order_items(order_id)` etc. potrebbero
-- causare seq scan su tabelle che crescono.
--
-- Tutti CREATE INDEX IF NOT EXISTS → idempotenti, nessun rischio di errore
-- se l'index esiste già. CONCURRENTLY evita lock su tabelle in produzione.
--
-- Stima impatto: query "list page" multi-tenant scendono da seq scan O(n)
-- a index scan O(log n). Su tabelle con >10k righe risparmio percepito
-- in centinaia di ms.
--
-- Nel file versionato si usano indici transazionali per il replay da zero.
-- Le costruzioni concorrenti manuali sono già registrate in produzione.

-- ── Multi-tenant filtering: company_id su tabelle list-heavy ───────────────
-- Pattern: SELECT ... FROM <tbl> WHERE company_id = $1 ORDER BY created_at DESC

CREATE INDEX IF NOT EXISTS orders_company_created_idx
  ON public.orders (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS marketing_contacts_company_idx
  ON public.marketing_contacts (company_id);

CREATE INDEX IF NOT EXISTS marketing_opportunities_company_status_idx
  ON public.marketing_opportunities (company_id, status);

CREATE INDEX IF NOT EXISTS appointments_company_idx
  ON public.appointments (company_id);

CREATE INDEX IF NOT EXISTS tasks_company_idx
  ON public.tasks (company_id);

CREATE INDEX IF NOT EXISTS employees_company_idx
  ON public.employees (company_id);

CREATE INDEX IF NOT EXISTS tickets_company_created_idx
  ON public.tickets (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS purchase_orders_company_idx
  ON public.purchase_orders (company_id);

CREATE INDEX IF NOT EXISTS warehouse_stock_company_idx
  ON public.warehouse_stock (company_id);

CREATE INDEX IF NOT EXISTS company_costs_company_idx
  ON public.company_costs (company_id);

-- ── Foreign-key lookups (NON auto-indicizzati da Postgres) ─────────────────
-- Pattern: SELECT ... WHERE <fk_column> = $1 (join lookup)

CREATE INDEX IF NOT EXISTS order_items_order_idx
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS order_items_supplier_idx
  ON public.order_items (supplier_id);

CREATE INDEX IF NOT EXISTS appointments_order_idx
  ON public.appointments (order_id);

CREATE INDEX IF NOT EXISTS tasks_order_idx
  ON public.tasks (order_id);

CREATE INDEX IF NOT EXISTS company_costs_order_idx
  ON public.company_costs (order_id);

CREATE INDEX IF NOT EXISTS company_costs_supplier_idx
  ON public.company_costs (supplier_id);

CREATE INDEX IF NOT EXISTS marketing_opportunities_contact_idx
  ON public.marketing_opportunities (contact_id);

CREATE INDEX IF NOT EXISTS purchase_orders_supplier_idx
  ON public.purchase_orders (supplier_id);

CREATE INDEX IF NOT EXISTS warehouse_stock_supplier_idx
  ON public.warehouse_stock (supplier_id);

-- ── Lookup specifici per UX (search/filter) ────────────────────────────────
-- marketing_contacts: search per phone/email è frequente

CREATE INDEX IF NOT EXISTS marketing_contacts_phone_idx
  ON public.marketing_contacts (phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketing_contacts_email_idx
  ON public.marketing_contacts (email)
  WHERE email IS NOT NULL;

-- admin_audit_log: spesso ordinato per data + filter per target

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx
  ON public.admin_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
  ON public.admin_audit_log (target_id)
  WHERE target_id IS NOT NULL;
