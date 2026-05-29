-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-06 · Audit append-only + coda conferme + undo (per-azienda)
-- Il livello di fiducia: ogni azione tracciata col PERCHÉ, niente effetto prima
-- dell'approvazione, undo sul reversibile. (Distinto da silvio_pending_approvals
-- admin.) L'esecuzione vera la cabla MP-SILVIO-02-exec; qui stato + tracciamento.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.silvio_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  azione_chiave text NOT NULL,
  oggetto_tipo  text,
  oggetto_id    uuid,
  parametri     jsonb NOT NULL DEFAULT '{}'::jsonb,
  esito         text NOT NULL DEFAULT 'eseguita' CHECK (esito IN ('eseguita','rifiutata','annullata','errore')),
  autonomia     text NOT NULL DEFAULT 'autonoma' CHECK (autonomia IN ('autonoma','confermata')),
  motivo        text,
  origine       text,
  origine_id    uuid,
  per_conto_di  uuid REFERENCES auth.users(id),
  approvata_da  uuid REFERENCES auth.users(id),
  reversibile   boolean NOT NULL DEFAULT false,
  ref_audit_id  uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_silvio_audit_company ON public.silvio_audit (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_silvio_audit_oggetto ON public.silvio_audit (oggetto_tipo, oggetto_id);

CREATE OR REPLACE FUNCTION public.silvio_audit_no_mutate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'silvio_audit è append-only: nessun update/delete'; END $$;
DROP TRIGGER IF EXISTS trg_silvio_audit_immutable ON public.silvio_audit;
CREATE TRIGGER trg_silvio_audit_immutable BEFORE UPDATE OR DELETE ON public.silvio_audit
  FOR EACH ROW EXECUTE FUNCTION public.silvio_audit_no_mutate();

CREATE TABLE IF NOT EXISTS public.silvio_coda_conferme (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  esecuzione_id   uuid REFERENCES public.silvio_esecuzioni(id) ON DELETE CASCADE,
  task_id         uuid,
  azione_chiave   text NOT NULL,
  parametri       jsonb NOT NULL DEFAULT '{}'::jsonb,
  anteprima       text,
  stato           text NOT NULL DEFAULT 'in_attesa' CHECK (stato IN ('in_attesa','approvata','rifiutata','modificata','scaduta')),
  scadenza_at     timestamptz,
  risolto_da      uuid REFERENCES auth.users(id),
  risolto_at      timestamptz,
  note            text,
  parametri_modificati jsonb,
  origine         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_silvio_coda_attesa ON public.silvio_coda_conferme (company_id, stato) WHERE stato = 'in_attesa';

CREATE OR REPLACE FUNCTION public.silvio_coda_risolvi(
  p_id uuid, p_azione text, p_note text DEFAULT NULL, p_parametri_modificati jsonb DEFAULT NULL
) RETURNS public.silvio_coda_conferme LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.silvio_coda_conferme;
BEGIN
  IF p_azione NOT IN ('approvata','rifiutata','modificata') THEN RAISE EXCEPTION 'azione_non_valida'; END IF;
  SELECT * INTO c FROM public.silvio_coda_conferme WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'voce_inesistente'; END IF;
  IF c.company_id <> public.get_effective_company_id() OR NOT public.is_email_staff_interno() THEN
    RAISE EXCEPTION 'non_autorizzato';
  END IF;
  IF c.stato <> 'in_attesa' THEN RAISE EXCEPTION 'voce_gia_gestita'; END IF;
  UPDATE public.silvio_coda_conferme
     SET stato = p_azione, note = p_note,
         parametri_modificati = CASE WHEN p_azione='modificata' THEN p_parametri_modificati ELSE parametri_modificati END,
         risolto_da = auth.uid(), risolto_at = now()
   WHERE id = p_id RETURNING * INTO c;
  RETURN c;
END $$;

ALTER TABLE public.silvio_audit          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silvio_coda_conferme  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS silvio_audit_read ON public.silvio_audit;
CREATE POLICY silvio_audit_read ON public.silvio_audit FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS silvio_audit_service ON public.silvio_audit;
CREATE POLICY silvio_audit_service ON public.silvio_audit FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS silvio_audit_super ON public.silvio_audit;
CREATE POLICY silvio_audit_super ON public.silvio_audit FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS silvio_coda_staff ON public.silvio_coda_conferme;
CREATE POLICY silvio_coda_staff ON public.silvio_coda_conferme FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS silvio_coda_service ON public.silvio_coda_conferme;
CREATE POLICY silvio_coda_service ON public.silvio_coda_conferme FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS silvio_coda_super ON public.silvio_coda_conferme;
CREATE POLICY silvio_coda_super ON public.silvio_coda_conferme FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.silvio_coda_risolvi(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_coda_risolvi(uuid, text, text, jsonb) TO authenticated, service_role;

COMMENT ON TABLE public.silvio_audit IS 'MP-SILVIO-06: audit append-only delle azioni di Silvio (col perché). Undo = nuova voce annullata. Trigger blocca update/delete.';
COMMENT ON TABLE public.silvio_coda_conferme IS 'MP-SILVIO-06: coda azioni conferma — nessun effetto prima dell''approvazione.';
