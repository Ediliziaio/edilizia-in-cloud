-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.silvio_task (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  titolo         text,
  origine        text NOT NULL DEFAULT 'richiesta' CHECK (origine IN ('richiesta','trigger','playbook')),
  origine_id     uuid,
  contesto       jsonb NOT NULL DEFAULT '{}'::jsonb,
  stato          text NOT NULL DEFAULT 'aperto'
                   CHECK (stato IN ('aperto','in_corso','in_attesa_conferma','bloccato','completato','fallito','annullato')),
  passo_corrente int NOT NULL DEFAULT 0,
  esecuzione_id  uuid REFERENCES public.silvio_esecuzioni(id) ON DELETE SET NULL,
  playbook_chiave text,
  archiviato     boolean NOT NULL DEFAULT false,
  creato_da      uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_silvio_task_attivi ON public.silvio_task (company_id, stato) WHERE archiviato = false;

CREATE TABLE IF NOT EXISTS public.silvio_task_passi (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid NOT NULL REFERENCES public.silvio_task(id) ON DELETE CASCADE,
  ordine        int NOT NULL,
  azione_chiave text NOT NULL,
  parametri     jsonb NOT NULL DEFAULT '{}'::jsonb,
  stato         text NOT NULL DEFAULT 'da_fare' CHECK (stato IN ('da_fare','fatto','saltato','fallito','attende_conferma')),
  esito         jsonb,
  eseguito_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_silvio_task_passi ON public.silvio_task_passi (task_id, ordine);

DROP TRIGGER IF EXISTS trg_silvio_task_touch ON public.silvio_task;
CREATE TRIGGER trg_silvio_task_touch BEFORE UPDATE ON public.silvio_task
  FOR EACH ROW EXECUTE FUNCTION public.sequenze_touch_updated();

ALTER TABLE public.silvio_task        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_task_passi  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS silvio_task_staff ON public.silvio_task;
CREATE POLICY silvio_task_staff ON public.silvio_task FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno())
  WITH CHECK (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS silvio_task_service ON public.silvio_task;
CREATE POLICY silvio_task_service ON public.silvio_task FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS silvio_task_super ON public.silvio_task;
CREATE POLICY silvio_task_super ON public.silvio_task FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS silvio_task_passi_staff ON public.silvio_task_passi;
CREATE POLICY silvio_task_passi_staff ON public.silvio_task_passi FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.silvio_task t WHERE t.id = task_id
                 AND t.company_id = public.get_effective_company_id() AND public.is_email_staff_interno()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.silvio_task t WHERE t.id = task_id
                 AND t.company_id = public.get_effective_company_id() AND public.is_email_staff_interno()));
DROP POLICY IF EXISTS silvio_task_passi_service ON public.silvio_task_passi;
CREATE POLICY silvio_task_passi_service ON public.silvio_task_passi FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS silvio_task_passi_super ON public.silvio_task_passi;
CREATE POLICY silvio_task_passi_super ON public.silvio_task_passi FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

COMMENT ON TABLE public.silvio_task IS 'MP-SILVIO-04: memoria operativa task multi-step (per-azienda). Contesto = riferimenti, non prosa. I chiusi si archiviano.';
COMMENT ON TABLE public.silvio_task_passi IS 'MP-SILVIO-04: passi di un task (macchina a stati). Stop al primo attende_conferma.';
