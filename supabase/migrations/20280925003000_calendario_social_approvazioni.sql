-- Calendario social: approva solo il titolare o un amministratore, e chi deve
-- sapere lo sa (24/09/2026).
--
-- Prima chiunque in azienda poteva approvare un post «da approvare», anche il
-- proprio: bastava un aggiornamento dello stato, che la policy su social_posts
-- permette a ogni membro. Nessuno veniva avvisato che c'era un post da
-- approvare, e la nota di «Rimanda» non arrivava a chi l'aveva scritto.
--
-- - puo_approvare_post_social(azienda): super admin, titolare, amministratore
--   dell'azienda (ruolo company_admin sul profilo di quell'azienda) o con un
--   accesso multi-azienda attivo da amministratore. La usa anche la pagina,
--   per mostrare o no «Approva» e «Rimanda».
-- - Un trigger blocca l'uscita dallo stato «da approvare» (review) a chi non
--   può approvare; dal server (cron, funzioni con service role) non c'è
--   identità e il contesto è già fidato. Scrive chi ha approvato e quando.
-- - Un trigger avvisa gli amministratori quando un post va in approvazione, e
--   chi l'ha scritto quando viene approvato o rimandato (con la nota).

ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS approvato_da uuid;
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS approvato_il timestamptz;

CREATE OR REPLACE FUNCTION public.puo_approvare_post_social(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    p_company_id IS NOT NULL
    AND (SELECT auth.uid()) IS NOT NULL
    AND (
      public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.companies c
         WHERE c.id = p_company_id AND c.titolare_user_id = (SELECT auth.uid())
      )
      OR (
        public.has_role((SELECT auth.uid()), 'company_admin'::public.app_role)
        AND EXISTS (
          SELECT 1 FROM public.profiles p
           WHERE p.id = (SELECT auth.uid()) AND p.company_id = p_company_id
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.multi_company_access m
         WHERE m.user_id = (SELECT auth.uid())
           AND m.company_id = p_company_id
           AND m.status = 'active'
           AND (m.expires_at IS NULL OR m.expires_at > now())
           AND m.access_role = 'company_admin'
      )
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.puo_approvare_post_social(uuid) IS
  'Può approvare o rimandare i post social di questa azienda: super admin, titolare o amministratore.';

REVOKE ALL ON FUNCTION public.puo_approvare_post_social(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puo_approvare_post_social(uuid) TO authenticated, service_role;

-- ── Chi può far uscire un post dall'approvazione ─────────────────────────────
CREATE OR REPLACE FUNCTION public.social_post_approvazione()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'review' OR NEW.status = 'review' THEN
    RETURN NEW;
  END IF;

  -- Dal server (cron, funzioni edge con service role) non c'è identità: fidato.
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.puo_approvare_post_social(NEW.company_id) THEN
    RAISE EXCEPTION 'Solo il titolare o un amministratore può approvare o rimandare un post.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'scheduled' THEN
    NEW.approvato_da := (SELECT auth.uid());
    NEW.approvato_il := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.social_post_approvazione() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_social_post_approvazione ON public.social_posts;
CREATE TRIGGER trg_social_post_approvazione
  BEFORE UPDATE OF status ON public.social_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.social_post_approvazione();

-- ── Avvisi ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.social_post_avvisi_approvazione()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attore uuid := (SELECT auth.uid());
  v_testo text := left(coalesce(nullif(trim(NEW.text), ''), 'Post senza testo'), 140);
  v_link text := '/azienda/marketing/social?tab=calendario';
  v_admin record;
BEGIN
  -- Un post va in approvazione: lo sanno il titolare e gli amministratori.
  IF NEW.status = 'review' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'review') THEN
    FOR v_admin IN
      SELECT DISTINCT u.user_id
        FROM (
          SELECT c.titolare_user_id AS user_id
            FROM public.companies c
           WHERE c.id = NEW.company_id AND c.titolare_user_id IS NOT NULL
          UNION
          SELECT p.id
            FROM public.profiles p
            JOIN public.user_roles r ON r.user_id = p.id AND r.role = 'company_admin'::public.app_role
           WHERE p.company_id = NEW.company_id
          UNION
          SELECT m.user_id
            FROM public.multi_company_access m
           WHERE m.company_id = NEW.company_id
             AND m.status = 'active'
             AND (m.expires_at IS NULL OR m.expires_at > now())
             AND m.access_role = 'company_admin'
        ) u
       WHERE u.user_id IS DISTINCT FROM coalesce(NEW.created_by, v_attore)
    LOOP
      -- Un avviso che non parte non deve fermare il salvataggio del post.
      BEGIN
        PERFORM public.create_notification(
          NEW.company_id, v_admin.user_id, 'social_post_da_approvare',
          'Post social da approvare', v_testo, 'social_post', NEW.id, v_link
        );
      EXCEPTION WHEN others THEN
        RAISE WARNING 'social_post_avvisi_approvazione: avviso non creato (%)', SQLERRM;
      END;
    END LOOP;
    RETURN NEW;
  END IF;

  -- Approvato o rimandato: lo sa chi l'ha scritto (se non è stato lui a decidere).
  IF TG_OP = 'UPDATE' AND OLD.status = 'review' AND NEW.status IN ('scheduled', 'draft')
     AND NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM v_attore THEN
    BEGIN
      IF NEW.status = 'scheduled' THEN
        PERFORM public.create_notification(
          NEW.company_id, NEW.created_by, 'social_post_approvato',
          'Il tuo post social è stato approvato',
          CASE WHEN NEW.scheduled_at IS NULL THEN v_testo
               ELSE 'Esce il ' || to_char(NEW.scheduled_at AT TIME ZONE 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI') || '. ' || v_testo END,
          'social_post', NEW.id, v_link
        );
      ELSE
        PERFORM public.create_notification(
          NEW.company_id, NEW.created_by, 'social_post_rimandato',
          'Il tuo post social è stato rimandato',
          coalesce(nullif(trim(NEW.review_note), ''), 'Rimandato in bozza.') || ' — ' || v_testo,
          'social_post', NEW.id, v_link
        );
      END IF;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'social_post_avvisi_approvazione: avviso non creato (%)', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.social_post_avvisi_approvazione() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_social_post_avvisi_approvazione ON public.social_posts;
CREATE TRIGGER trg_social_post_avvisi_approvazione
  AFTER INSERT OR UPDATE OF status ON public.social_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.social_post_avvisi_approvazione();
