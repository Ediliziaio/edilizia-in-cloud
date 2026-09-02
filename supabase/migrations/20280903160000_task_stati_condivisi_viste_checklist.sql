-- Attività: tre buchi rimasti dopo il gap check del 2026-09-02.
--
-- 1) Gli stati personalizzati vivevano SOLO nel localStorage del browser
--    (edilizia.task-statuses.<companyId>): chi li creava era l'unico a vederli,
--    sparivano cambiando computer e il backend non li conosceva.
-- 2) Filtri e viste non si potevano salvare: ogni mattina si rifaceva la stessa
--    selezione a mano.
-- 3) La checklist era piatta: nessun responsabile, nessuna scadenza per voce,
--    quindi "chi fa cosa entro quando" restava fuori dall'attività.
-- Idempotente.

-- ── 1) Stati attività condivisi per azienda ──
CREATE TABLE IF NOT EXISTS public.company_task_statuses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  value       text NOT NULL,
  label       text NOT NULL,
  stage       text NOT NULL DEFAULT 'active' CHECK (stage IN ('todo', 'active', 'review', 'blocked', 'done')),
  tone        text,
  order_index integer NOT NULL DEFAULT 100,
  locked      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, value)
);
CREATE INDEX IF NOT EXISTS idx_company_task_statuses_company ON public.company_task_statuses(company_id, order_index);

ALTER TABLE public.company_task_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members read task statuses" ON public.company_task_statuses;
CREATE POLICY "Company members read task statuses"
  ON public.company_task_statuses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.company_id = company_task_statuses.company_id));

-- Scrivono solo admin dell'azienda e super admin: gli stati sono un vocabolario
-- condiviso, non una preferenza personale.
DROP POLICY IF EXISTS "Company admins manage task statuses" ON public.company_task_statuses;
CREATE POLICY "Company admins manage task statuses"
  ON public.company_task_statuses FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.company_id = company_task_statuses.company_id)
    AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.company_id = company_task_statuses.company_id)
    AND (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_task_statuses TO authenticated;

-- ── 2) Viste salvate (filtri con un nome) ──
CREATE TABLE IF NOT EXISTS public.task_saved_views (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       text NOT NULL,
  filters    jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_shared  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_saved_views_company ON public.task_saved_views(company_id, user_id);

ALTER TABLE public.task_saved_views ENABLE ROW LEVEL SECURITY;

-- Vedo le mie viste e quelle che un collega ha condiviso con l'azienda.
DROP POLICY IF EXISTS "Own and shared task views are readable" ON public.task_saved_views;
CREATE POLICY "Own and shared task views are readable"
  ON public.task_saved_views FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.company_id = task_saved_views.company_id)
    AND (user_id = auth.uid() OR is_shared = true)
  );

-- Modifico e cancello solo le mie.
DROP POLICY IF EXISTS "Own task views are writable" ON public.task_saved_views;
CREATE POLICY "Own task views are writable"
  ON public.task_saved_views FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.company_id = task_saved_views.company_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_saved_views TO authenticated;

-- ── 3) Checklist con responsabile e scadenza ──
-- Sottoattività vere senza toccare le query di `tasks`: la voce di checklist
-- diventa un impegno di qualcuno entro una data.
ALTER TABLE public.task_checklist_items
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS due_date date;

COMMENT ON COLUMN public.task_checklist_items.assigned_to IS 'Chi svolge questa voce (sottoattività)';
COMMENT ON COLUMN public.task_checklist_items.due_date IS 'Entro quando va svolta questa voce';
