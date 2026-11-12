SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
CREATE TABLE IF NOT EXISTS public.bank_sync_settings(
 company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
 account_limit integer NOT NULL DEFAULT 3 CHECK(account_limit BETWEEN 0 AND 100),
 automatic_sync boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.bank_account_choices(
 account_id uuid PRIMARY KEY REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 chosen_by uuid REFERENCES auth.users(id), chosen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_account_choices_company_idx ON public.bank_account_choices(company_id);
CREATE TABLE IF NOT EXISTS public.bank_sync_runs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL REFERENCES public.bank_connections(id) ON DELETE CASCADE,
 slot timestamptz NOT NULL, status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','completed','failed')),
 movements integer, error_message text, started_at timestamptz, finished_at timestamptz,
 UNIQUE(connection_id,slot)
);
ALTER TABLE public.bank_sync_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_account_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_sync_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_sync_settings,public.bank_account_choices,public.bank_sync_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.bank_sync_settings,public.bank_account_choices,public.bank_sync_runs TO authenticated;
GRANT ALL ON public.bank_sync_settings,public.bank_account_choices,public.bank_sync_runs TO service_role;
DROP POLICY IF EXISTS company_read ON public.bank_sync_settings;
CREATE POLICY company_read ON public.bank_sync_settings FOR SELECT TO authenticated USING(auth.uid() IS NOT NULL AND NOT public.utente_bloccato() AND public.has_permission_for_company(auth.uid(),'can_view_tesoreria',company_id));
DROP POLICY IF EXISTS company_read ON public.bank_account_choices;
CREATE POLICY company_read ON public.bank_account_choices FOR SELECT TO authenticated USING(auth.uid() IS NOT NULL AND NOT public.utente_bloccato() AND public.has_permission_for_company(auth.uid(),'can_view_tesoreria',company_id));
DROP POLICY IF EXISTS company_read ON public.bank_sync_runs;
CREATE POLICY company_read ON public.bank_sync_runs FOR SELECT TO authenticated USING(auth.uid() IS NOT NULL AND NOT public.utente_bloccato() AND public.has_permission_for_company(auth.uid(),'can_view_tesoreria',company_id));

-- Metadata refreshes must never reactivate an account the owner did not choose.
CREATE OR REPLACE FUNCTION public.bank_account_selection_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.bank_sync_settings WHERE company_id=NEW.company_id)
 AND EXISTS(SELECT 1 FROM public.bank_connections WHERE id=NEW.connection_id AND company_id=NEW.company_id AND provider_slug='distyra')
 AND NOT EXISTS(SELECT 1 FROM public.bank_account_choices ch JOIN public.bank_accounts a ON a.id=ch.account_id
 WHERE ch.company_id=NEW.company_id AND (ch.account_id=NEW.id OR (TG_OP='INSERT' AND a.company_id=NEW.company_id AND a.external_account_id=NEW.external_account_id))) THEN
  NEW.is_active:=false;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bank_account_selection_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS bank_account_selection_guard ON public.bank_accounts;
CREATE TRIGGER bank_account_selection_guard BEFORE INSERT OR UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.bank_account_selection_guard();

CREATE OR REPLACE FUNCTION public.bank_select_accounts(p_company uuid,p_accounts uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lim integer; n integer;
BEGIN
 IF auth.uid() IS NULL OR public.utente_bloccato() OR NOT public.has_permission_for_company(auth.uid(),'can_edit_settings_integrations',p_company)
 OR NOT public.has_permission_for_company(auth.uid(),'can_view_bank_balances',p_company) THEN RAISE EXCEPTION 'Accesso negato ai collegamenti bancari' USING ERRCODE='42501'; END IF;
 SELECT account_limit INTO lim FROM public.bank_sync_settings WHERE company_id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Il superadmin deve impostare il limite dei conti'; END IF;
 IF p_accounts IS NULL OR array_position(p_accounts,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Selezione non valida'; END IF;
 SELECT count(DISTINCT a) INTO n FROM unnest(p_accounts) a;
 IF n<>cardinality(p_accounts) OR n>lim THEN RAISE EXCEPTION 'Puoi selezionare al massimo % conti. Per aumentarli contatta il superadmin.',lim; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_accounts) x WHERE NOT EXISTS(SELECT 1 FROM public.bank_accounts a JOIN public.bank_connections c ON c.id=a.connection_id AND c.company_id=a.company_id
 WHERE a.id=x AND a.company_id=p_company AND c.provider_slug='distyra' AND c.status='linked')) THEN RAISE EXCEPTION 'Conto non disponibile per questa azienda' USING ERRCODE='42501'; END IF;
 DELETE FROM public.bank_account_choices WHERE company_id=p_company;
 INSERT INTO public.bank_account_choices(account_id,company_id,chosen_by) SELECT x,p_company,auth.uid() FROM unnest(p_accounts) x;
 UPDATE public.bank_accounts a SET is_active=(a.id=ANY(p_accounts)) FROM public.bank_connections c WHERE a.company_id=p_company AND c.company_id=p_company AND c.id=a.connection_id AND c.provider_slug='distyra';
END $$;
REVOKE ALL ON FUNCTION public.bank_select_accounts(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_select_accounts(uuid,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.bank_set_account_limit(p_company uuid,p_limit integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR public.utente_bloccato() OR NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Solo il superadmin può cambiare il limite' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit<0 OR p_limit>100 THEN RAISE EXCEPTION 'Limite non valido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_company::text,981));
 PERFORM 1 FROM public.bank_sync_settings WHERE company_id=p_company FOR UPDATE;
 IF (SELECT count(*) FROM public.bank_account_choices WHERE company_id=p_company)>p_limit THEN RAISE EXCEPTION 'Riduci prima i conti selezionati'; END IF;
 INSERT INTO public.bank_sync_settings(company_id,account_limit) VALUES(p_company,p_limit) ON CONFLICT(company_id) DO UPDATE SET account_limit=p_limit,updated_at=now();
 -- A new policy requires explicit choice, never choose accounts for the owner.
 UPDATE public.bank_accounts a SET is_active=false FROM public.bank_connections c WHERE a.connection_id=c.id AND a.company_id=p_company AND c.provider_slug='distyra' AND NOT EXISTS(SELECT 1 FROM public.bank_account_choices s WHERE s.account_id=a.id AND s.company_id=p_company);
END $$;
REVOKE ALL ON FUNCTION public.bank_set_account_limit(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bank_set_account_limit(uuid,integer) TO authenticated;

-- Requested only for Impresa Vulcano. No automatic choice, no change to other companies.
INSERT INTO public.bank_sync_settings(company_id,account_limit,automatic_sync)
SELECT id,3,true FROM public.companies WHERE id='7c87c209-7868-42d0-ad98-6c95ac6de196' ON CONFLICT(company_id) DO NOTHING;
UPDATE public.bank_accounts a SET is_active=false FROM public.bank_connections c
WHERE a.company_id='7c87c209-7868-42d0-ad98-6c95ac6de196' AND c.id=a.connection_id AND c.provider_slug='distyra'
AND NOT EXISTS(SELECT 1 FROM public.bank_account_choices s WHERE s.account_id=a.id AND s.company_id=a.company_id);

CREATE OR REPLACE FUNCTION public.bank_sync_enqueue(p_now timestamptz DEFAULT now()) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; n integer:=0; v_slot timestamptz; v_secret text;
BEGIN
 IF extract(hour FROM p_now AT TIME ZONE 'Europe/Rome') NOT IN(7,18) THEN RETURN 0; END IF;
 v_slot:=date_trunc('hour',p_now);
 SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name='cron_secret';
 IF v_secret IS NULL THEN RAISE EXCEPTION 'Segreto del servizio non configurato'; END IF;
 FOR r IN
  INSERT INTO public.bank_sync_runs(company_id,connection_id,slot)
  SELECT c.company_id,c.id,v_slot FROM public.bank_connections c JOIN public.bank_sync_settings s ON s.company_id=c.company_id AND s.automatic_sync
  WHERE c.provider_slug='distyra' AND c.status='linked' AND c.provider_connection_id IS NOT NULL
  AND EXISTS(SELECT 1 FROM public.bank_accounts a JOIN public.bank_account_choices ch ON ch.account_id=a.id AND ch.company_id=a.company_id WHERE a.connection_id=c.id AND a.is_active)
  ON CONFLICT(connection_id,slot) DO NOTHING RETURNING id,company_id,connection_id
 LOOP
  PERFORM net.http_post(url:='https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/bank-distyra',
   headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',v_secret),
   body:=jsonb_build_object('action','sync-scheduled','company_id',r.company_id,'connection_id',r.connection_id,'run_id',r.id),timeout_milliseconds:=15000);
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.bank_sync_enqueue(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bank_sync_enqueue(timestamptz) TO service_role;
