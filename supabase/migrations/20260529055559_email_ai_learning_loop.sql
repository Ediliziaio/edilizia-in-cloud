-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- MP-EMAIL-AI-03 · Feedback Loop e Dashboard di Apprendimento

ALTER TABLE public.mittenti_noti
  ADD COLUMN IF NOT EXISTS confidenza   numeric(3,2) NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS is_blacklist boolean      NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mittenti_noti_blacklist
  ON public.mittenti_noti (company_id, email) WHERE is_blacklist = true;

CREATE TABLE IF NOT EXISTS public.email_correzioni (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id                uuid,
  email_id               uuid NOT NULL,
  mittente_email         text NOT NULL,
  evento                 text NOT NULL,
  categoria_prima        text,
  categoria_dopo         text,
  entita_tipo_dopo       text,
  entita_id_dopo         uuid,
  classificato_da_prima  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_correzioni_evento_check CHECK (evento IN ('sposta', 'associa', 'conferma', 'spam', 'annulla'))
);
CREATE INDEX IF NOT EXISTS idx_email_correzioni_company_created ON public.email_correzioni (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_correzioni_email ON public.email_correzioni (email_id);

CREATE TABLE IF NOT EXISTS public.email_metriche_giorno (
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  giorno              date NOT NULL,
  totale              int NOT NULL DEFAULT 0,
  da_regola           int NOT NULL DEFAULT 0,
  da_embedding        int NOT NULL DEFAULT 0,
  da_haiku            int NOT NULL DEFAULT 0,
  da_manuale          int NOT NULL DEFAULT 0,
  da_rivedere         int NOT NULL DEFAULT 0,
  haiku_token_input   bigint NOT NULL DEFAULT 0,
  haiku_token_output  bigint NOT NULL DEFAULT 0,
  aggiornato_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, giorno)
);
CREATE INDEX IF NOT EXISTS idx_email_metriche_giorno_company ON public.email_metriche_giorno (company_id, giorno DESC);

ALTER TABLE public.email_correzioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_metriche_giorno ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_correzioni_company_read ON public.email_correzioni;
CREATE POLICY email_correzioni_company_read ON public.email_correzioni FOR SELECT TO authenticated USING (company_id = public.get_effective_company_id());
DROP POLICY IF EXISTS email_correzioni_service_all ON public.email_correzioni;
CREATE POLICY email_correzioni_service_all ON public.email_correzioni FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS email_correzioni_super_admin ON public.email_correzioni;
CREATE POLICY email_correzioni_super_admin ON public.email_correzioni FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS email_metriche_company_read ON public.email_metriche_giorno;
CREATE POLICY email_metriche_company_read ON public.email_metriche_giorno FOR SELECT TO authenticated USING (company_id = public.get_effective_company_id());
DROP POLICY IF EXISTS email_metriche_service_all ON public.email_metriche_giorno;
CREATE POLICY email_metriche_service_all ON public.email_metriche_giorno FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS email_metriche_super_admin ON public.email_metriche_giorno;
CREATE POLICY email_metriche_super_admin ON public.email_metriche_giorno FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.registra_correzione_email(
  p_email_id uuid, p_evento text,
  p_categoria public.email_categoria_v2 DEFAULT NULL,
  p_entita_tipo text DEFAULT NULL, p_entita_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_id uuid; v_from_email text; v_cat_prima text; v_class_prima text;
  v_email_lower text; v_dominio text;
BEGIN
  v_company_id := public.get_effective_company_id();
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Nessuna azienda attiva'; END IF;
  IF p_evento NOT IN ('sposta','associa','conferma','spam','annulla') THEN RAISE EXCEPTION 'Evento non valido: %', p_evento; END IF;

  SELECT from_email, categoria::text, classificato_da INTO v_from_email, v_cat_prima, v_class_prima
  FROM public.email_inbox WHERE id = p_email_id AND company_id = v_company_id;
  IF v_from_email IS NULL THEN RAISE EXCEPTION 'Email non trovata o fuori scope'; END IF;

  v_email_lower := lower(trim(v_from_email));
  v_dominio := NULLIF(lower(split_part(v_email_lower, '@', 2)), '');

  INSERT INTO public.email_correzioni (company_id, user_id, email_id, mittente_email, evento, categoria_prima, categoria_dopo, entita_tipo_dopo, entita_id_dopo, classificato_da_prima)
  VALUES (v_company_id, auth.uid(), p_email_id, v_email_lower, p_evento, v_cat_prima, p_categoria::text, p_entita_tipo, p_entita_id, v_class_prima);

  IF p_evento = 'annulla' THEN
    UPDATE public.email_inbox SET categoria=NULL, entita_tipo=NULL, entita_id=NULL, confidenza=NULL, classificato_da=NULL, da_rivedere=true, classificato_at=now() WHERE id = p_email_id;
    DELETE FROM public.mittenti_noti WHERE company_id = v_company_id AND email = v_email_lower;
    RETURN jsonb_build_object('ok', true, 'evento', p_evento, 'mittente', v_email_lower);
  END IF;

  IF p_evento = 'spam' THEN
    UPDATE public.email_inbox SET categoria='spam', entita_tipo=NULL, entita_id=NULL, confidenza=1.0, classificato_da='manuale', da_rivedere=false, classificato_at=now() WHERE id = p_email_id;
    INSERT INTO public.mittenti_noti (company_id, email, dominio, categoria, entita_tipo, entita_id, fonte, confidenza, is_blacklist)
    VALUES (v_company_id, v_email_lower, v_dominio, 'spam', NULL, NULL, 'manuale', 1.0, true)
    ON CONFLICT (company_id, email) DO UPDATE SET categoria='spam', is_blacklist=true, confidenza=1.0, fonte='manuale', hit_count=public.mittenti_noti.hit_count+1, last_seen_at=now();
    RETURN jsonb_build_object('ok', true, 'evento', 'spam', 'mittente', v_email_lower);
  END IF;

  IF p_categoria IS NULL AND p_evento = 'sposta' THEN RAISE EXCEPTION 'Categoria obbligatoria per evento sposta'; END IF;

  UPDATE public.email_inbox SET categoria=COALESCE(p_categoria, categoria), entita_tipo=COALESCE(p_entita_tipo, entita_tipo), entita_id=COALESCE(p_entita_id, entita_id), confidenza=1.0, classificato_da='manuale', da_rivedere=false, classificato_at=now() WHERE id = p_email_id;

  INSERT INTO public.mittenti_noti (company_id, email, dominio, categoria, entita_tipo, entita_id, fonte, confidenza)
  VALUES (v_company_id, v_email_lower, v_dominio, COALESCE(p_categoria, v_cat_prima::public.email_categoria_v2, 'altro'), p_entita_tipo, p_entita_id, 'manuale', 1.0)
  ON CONFLICT (company_id, email) DO UPDATE SET
    categoria=COALESCE(EXCLUDED.categoria, public.mittenti_noti.categoria),
    entita_tipo=COALESCE(EXCLUDED.entita_tipo, public.mittenti_noti.entita_tipo),
    entita_id=COALESCE(EXCLUDED.entita_id, public.mittenti_noti.entita_id),
    fonte='manuale', is_blacklist=false, hit_count=public.mittenti_noti.hit_count+1, last_seen_at=now();

  RETURN jsonb_build_object('ok', true, 'evento', p_evento, 'mittente', v_email_lower);
END $$;
GRANT EXECUTE ON FUNCTION public.registra_correzione_email(uuid, text, public.email_categoria_v2, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.aggrega_metriche_email_giorno(p_giorno date DEFAULT (current_date - 1))
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows int := 0;
BEGIN
  INSERT INTO public.email_metriche_giorno (company_id, giorno, totale, da_regola, da_embedding, da_haiku, da_manuale, da_rivedere, aggiornato_at)
  SELECT e.company_id, p_giorno, count(*),
    count(*) FILTER (WHERE e.classificato_da='regola'),
    count(*) FILTER (WHERE e.classificato_da='embedding'),
    count(*) FILTER (WHERE e.classificato_da='haiku'),
    count(*) FILTER (WHERE e.classificato_da='manuale'),
    count(*) FILTER (WHERE e.da_rivedere=true), now()
  FROM public.email_inbox e
  WHERE e.received_at >= p_giorno AND e.received_at < (p_giorno + 1)
  GROUP BY e.company_id
  ON CONFLICT (company_id, giorno) DO UPDATE SET
    totale=EXCLUDED.totale, da_regola=EXCLUDED.da_regola, da_embedding=EXCLUDED.da_embedding,
    da_haiku=EXCLUDED.da_haiku, da_manuale=EXCLUDED.da_manuale, da_rivedere=EXCLUDED.da_rivedere, aggiornato_at=now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END $$;
GRANT EXECUTE ON FUNCTION public.aggrega_metriche_email_giorno(date) TO service_role;

CREATE OR REPLACE FUNCTION public.email_learning_dashboard(p_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company_id uuid; v_result jsonb;
BEGIN
  v_company_id := public.get_effective_company_id();
  IF v_company_id IS NULL THEN RETURN '{}'::jsonb; END IF;
  SELECT jsonb_build_object(
    'north_star_l1_perc', CASE WHEN sum(totale) > 0 THEN round(100.0 * sum(da_regola) / sum(totale), 1) ELSE 0 END,
    'totale', COALESCE(sum(totale), 0), 'da_regola', COALESCE(sum(da_regola), 0),
    'da_haiku', COALESCE(sum(da_haiku), 0), 'da_manuale', COALESCE(sum(da_manuale), 0),
    'da_rivedere', COALESCE(sum(da_rivedere), 0),
    'serie', COALESCE((SELECT jsonb_agg(jsonb_build_object('giorno', giorno, 'totale', totale, 'da_regola', da_regola, 'da_haiku', da_haiku, 'da_manuale', da_manuale) ORDER BY giorno) FROM public.email_metriche_giorno WHERE company_id = v_company_id AND giorno > current_date - p_days), '[]'::jsonb),
    'mittenti_appresi', (SELECT count(*) FROM public.mittenti_noti WHERE company_id = v_company_id),
    'blacklist_count', (SELECT count(*) FROM public.mittenti_noti WHERE company_id = v_company_id AND is_blacklist)
  ) INTO v_result FROM public.email_metriche_giorno WHERE company_id = v_company_id AND giorno > current_date - p_days;
  RETURN COALESCE(v_result, '{}'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.email_learning_dashboard(int) TO authenticated;
