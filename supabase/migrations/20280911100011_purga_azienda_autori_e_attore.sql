-- Due ostacoli residui alla purga (vedi …008), di natura diversa dagli altri.
--
-- ── L'autore del rapportino puo' essere di un'ALTRA azienda ─────────────────
-- `campo_rapportini.user_id` e `campo_timbrature.user_id` erano NOT NULL e
-- senza azione di cancellazione: quando la purga rimuove i `profiles`
-- dell'azienda, quelle righe li trattenevano e il cascade si fermava.
--
-- Verrebbe da mettere CASCADE, ma sarebbe sbagliato: il prodotto permette il
-- lavoro multi-azienda (`multi_company_access`, 11 righe attive), e infatti 2
-- rapportini su 19 e 5 timbrature su 13 hanno per autore il profilo di
-- un'altra azienda. Con CASCADE, purgare l'azienda B cancellerebbe i
-- rapportini dell'azienda A. Il documento resta a chi appartiene e perde
-- l'autore — la colonna diventa nullable per poterlo fare.
--
-- CONSEGUENZA APPLICATIVA: chi legge rapportini e timbrature deve reggere un
-- autore assente, e `src/integrations/supabase/types.ts` va rigenerato.
--
-- ── Un'azienda cancellata senza attore bloccava tutte le altre ──────────────
-- `companies.deleted_by` e' nullable, `admin_audit_log.user_id` e' NOT NULL:
-- bastava una cancellazione fatta senza passare da `soft_delete_company` — o
-- con attore nullo — perche' la prima riga scritta dal job violasse il vincolo
-- e l'intero ciclo si fermasse. E siccome il ciclo non e' tollerante per
-- azienda, quella riga bloccava la purga di TUTTE. `admin_audit_log` non ha
-- chiavi esterne, quindi lo zero UUID e' leggibile come "purga automatica,
-- nessuna persona".

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.campo_rapportini ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.campo_rapportini DROP CONSTRAINT IF EXISTS campo_rapportini_user_id_fkey;
ALTER TABLE public.campo_rapportini ADD  CONSTRAINT campo_rapportini_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.campo_timbrature ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.campo_timbrature DROP CONSTRAINT IF EXISTS campo_timbrature_user_id_fkey;
ALTER TABLE public.campo_timbrature ADD  CONSTRAINT campo_timbrature_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.purge_deleted_companies()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT id, name, deleted_by, deletion_export_path
      FROM public.companies
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - interval '30 days'
  LOOP
    INSERT INTO public.admin_audit_log (user_id, action, target_type, target_id, details)
    VALUES (COALESCE(v_row.deleted_by, '00000000-0000-0000-0000-000000000000'::uuid),
            'company_purged', 'company', v_row.id::text,
            jsonb_build_object('company_name', v_row.name,
                               'export_path', v_row.deletion_export_path,
                               'purged_at', now()));

    DELETE FROM public.companies WHERE id = v_row.id;
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 THEN
    RAISE LOG 'purge aziende: rimosse definitivamente % aziende', v_count;
  END IF;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_deleted_companies() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_deleted_companies() TO service_role;
