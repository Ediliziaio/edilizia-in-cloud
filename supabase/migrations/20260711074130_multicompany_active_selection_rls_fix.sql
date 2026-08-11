-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.


-- ============================================================================
-- Fix radice multi-azienda: il cambio tenant nel frontend deve raggiungere la RLS.
-- ----------------------------------------------------------------------------
-- Problema: switchMultiCompany cambiava azienda SOLO client-side (sessionStorage),
-- mentre get_effective_company_id() (usata in ~54 policy RLS) tornava sempre la
-- company PRIMARIA -> utenti multi-azienda vedevano i dati dell'azienda sbagliata
-- o schermate vuote (root cause del bug FV di Suntech, generalizzato).
--
-- Soluzione retro-compatibile: una tabella active_company_selection tiene la
-- company attiva scelta dall'utente; get_effective_company_id la consulta SOLO se
-- l'utente vi ha ancora accesso (primaria o multi_company_access). Chi non cambia
-- mai azienda non ha alcuna riga -> comportamento IDENTICO a prima (primaria).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.active_company_selection (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.active_company_selection ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS acs_self ON public.active_company_selection;
CREATE POLICY acs_self ON public.active_company_selection
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- RPC: imposta (o azzera con NULL) la company attiva dell'utente corrente.
-- Rifiuta company non accessibili. SECURITY DEFINER per validare + upsert.
CREATE OR REPLACE FUNCTION public.set_active_company(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non autenticato' USING ERRCODE = '42501';
  END IF;

  IF p_company_id IS NULL THEN
    DELETE FROM public.active_company_selection WHERE user_id = auth.uid();
    RETURN;
  END IF;

  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso non autorizzato a questa azienda'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.active_company_selection (user_id, company_id, updated_at)
  VALUES (auth.uid(), p_company_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET company_id = EXCLUDED.company_id, updated_at = now();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_active_company(uuid) TO authenticated;

-- get_effective_company_id: impersonation > selezione attiva (se ancora
-- accessibile) > company primaria. Retro-compatibile (nessuna selezione = primaria).
CREATE OR REPLACE FUNCTION public.get_effective_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT COALESCE(
    -- 1. Impersonation attiva (super_admin impersona un'azienda)
    (SELECT ai.target_company_id
       FROM public.active_impersonations ai
      WHERE ai.admin_user_id = auth.uid()
        AND ai.expires_at > now()
      ORDER BY ai.created_at DESC
      LIMIT 1),
    -- 2. Selezione multi-azienda del frontend, SOLO se ancora accessibile
    (SELECT acs.company_id
       FROM public.active_company_selection acs
      WHERE acs.user_id = auth.uid()
        AND (
          acs.company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.multi_company_access mca
            WHERE mca.user_id = auth.uid() AND mca.company_id = acs.company_id
          )
        )
      LIMIT 1),
    -- 3. Fallback: company primaria del profilo
    (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );
$function$;
