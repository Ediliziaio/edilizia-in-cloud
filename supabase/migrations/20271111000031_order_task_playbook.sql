-- Playbook commessa modificabile per azienda: set standard di attività ricorrenti
-- per mestiere. Quando si "applica" a una commessa, da questi template si creano
-- task reali (tabella `tasks`) con scadenze relative alla data commessa.
--
-- Additiva + idempotente. company-scoped via get_effective_company_id() (stesso
-- pattern di company_sales_profile). vertical NULL = vale per tutti i mestieri.

CREATE TABLE IF NOT EXISTS public.order_task_template (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vertical      text,                                   -- NULL = tutti i mestieri
  sort_order    int NOT NULL DEFAULT 0,
  titolo        text NOT NULL,
  descrizione   text,
  giorni_offset int NOT NULL DEFAULT 0,                 -- giorni dalla data commessa
  priorita      text NOT NULL DEFAULT 'normale' CHECK (priorita IN ('bassa','normale','alta','urgente')),
  assegna_a_ruolo text,                                 -- riservato (auto-assegna futura)
  attivo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_task_template_company
  ON public.order_task_template(company_id, vertical, attivo, sort_order);

COMMENT ON TABLE public.order_task_template IS
  'Playbook commessa per-azienda: attività standard del mestiere, applicabili a una commessa per generare task reali.';

ALTER TABLE public.order_task_template ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_task_template_company ON public.order_task_template;
CREATE POLICY order_task_template_company ON public.order_task_template
  FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS order_task_template_service ON public.order_task_template;
CREATE POLICY order_task_template_service ON public.order_task_template
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS order_task_template_super ON public.order_task_template;
CREATE POLICY order_task_template_super ON public.order_task_template
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));
