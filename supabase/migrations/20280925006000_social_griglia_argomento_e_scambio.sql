-- Griglia Instagram: l'argomento vero del post, e lo scambio delle date (25/09/2026).
--
-- - social_posts.argomento: l'argomento scelto nel composer (cantiere, squadra,
--   clienti, consigli, offerte, lavori finiti). Prima non si salvava e la
--   griglia lo indovinava dal testo: bastava «prima» per diventare «Lavori
--   finiti», «gratis» per diventare «Offerte».
-- - scambia_orari_post_social(a, b): due post non ancora usciti si scambiano
--   giorno e ora, in una sola transazione (trascinandone uno sull'altro nella
--   griglia). Gira con i permessi di chi la chiama: le policy di social_posts
--   decidono quali post può toccare. Solo date ad almeno 5 minuti da adesso:
--   un post che il cron sta per prendere non si sposta.

ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS argomento text;

ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_argomento_check;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_argomento_check
  CHECK (argomento IS NULL OR argomento IN ('cantiere', 'team', 'testimonianza', 'educational', 'promo', 'portfolio'));

COMMENT ON COLUMN public.social_posts.argomento IS
  'Argomento scelto nel composer (id di CONTENT_PILLARS). Null = non scelto: la griglia non lo indovina.';

CREATE OR REPLACE FUNCTION public.scambia_orari_post_social(p_primo uuid, p_secondo uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_primo record;
  v_secondo record;
BEGIN
  IF p_primo IS NULL OR p_secondo IS NULL OR p_primo = p_secondo THEN
    RAISE EXCEPTION 'Servono due post diversi.' USING ERRCODE = '22023';
  END IF;

  SELECT id, company_id, status, scheduled_at INTO v_primo
    FROM public.social_posts WHERE id = p_primo FOR UPDATE;
  SELECT id, company_id, status, scheduled_at INTO v_secondo
    FROM public.social_posts WHERE id = p_secondo FOR UPDATE;

  IF v_primo.id IS NULL OR v_secondo.id IS NULL THEN
    RAISE EXCEPTION 'Post non trovato.' USING ERRCODE = 'P0002';
  END IF;
  IF v_primo.company_id <> v_secondo.company_id THEN
    RAISE EXCEPTION 'I due post sono di aziende diverse.' USING ERRCODE = '42501';
  END IF;
  IF v_primo.status NOT IN ('scheduled', 'review', 'draft') OR v_secondo.status NOT IN ('scheduled', 'review', 'draft') THEN
    RAISE EXCEPTION 'Si scambiano solo post non ancora usciti.' USING ERRCODE = '22023';
  END IF;
  IF v_primo.scheduled_at IS NULL OR v_secondo.scheduled_at IS NULL
     OR v_primo.scheduled_at < now() + interval '5 minutes'
     OR v_secondo.scheduled_at < now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Si scambiano solo post con giorno e ora nel futuro.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.social_posts SET scheduled_at = v_secondo.scheduled_at, updated_at = now() WHERE id = v_primo.id;
  UPDATE public.social_posts SET scheduled_at = v_primo.scheduled_at, updated_at = now() WHERE id = v_secondo.id;
END;
$$;

COMMENT ON FUNCTION public.scambia_orari_post_social(uuid, uuid) IS
  'Scambia giorno e ora di due post social non ancora usciti, in una transazione. Rispetta le policy di social_posts.';

REVOKE ALL ON FUNCTION public.scambia_orari_post_social(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scambia_orari_post_social(uuid, uuid) TO authenticated, service_role;
