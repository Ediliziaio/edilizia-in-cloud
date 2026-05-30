-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-SA-INTEL-01 · SuperAdmin Conversation Intelligence & Radar Upsell
-- ────────────────────────────────────────────────────────────────────────────
-- Cross-tenant, READ-ONLY, solo super_admin. Aggrega le conversazioni Silvio di
-- TUTTE le aziende in SEGNALI strutturati (mai il testo grezzo con PII) e mappa il
-- dolore al servizio AEDIX da upsellare. Niente nuovi orchestratori: tabelle +
-- compute deterministico + 3 RPC interrogabili da silvio-admin-chat.
-- ════════════════════════════════════════════════════════════════════════════

-- ── L1: segnali estratti dalle conversazioni (solo aggregato anonimo) ────────
CREATE TABLE IF NOT EXISTS public.sa_conversation_signals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  giorno        date NOT NULL,
  area          text NOT NULL,   -- margini|cashflow|vendita|marketing|preventivi|cantiere|fatturazione|hr|magazzino|compliance|altro
  intento       text NOT NULL,   -- difficolta | domanda | richiesta_funzione | lamentela
  peso          int  NOT NULL DEFAULT 1,
  esempio_anonimo text,          -- 1 frase RIASSUNTA, senza nomi/importi/indirizzi
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, giorno, area, intento)
);
CREATE INDEX IF NOT EXISTS idx_sa_conv_signals_company ON public.sa_conversation_signals (company_id, giorno DESC);
CREATE INDEX IF NOT EXISTS idx_sa_conv_signals_area ON public.sa_conversation_signals (area, giorno DESC);

ALTER TABLE public.sa_conversation_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sa_conv_signals_super ON public.sa_conversation_signals;
CREATE POLICY sa_conv_signals_super ON public.sa_conversation_signals FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS sa_conv_signals_service ON public.sa_conversation_signals;
CREATE POLICY sa_conv_signals_service ON public.sa_conversation_signals FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── L2: profilo intelligence per azienda (radar upsell) ──────────────────────
CREATE TABLE IF NOT EXISTS public.sa_company_intel (
  company_id        uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  aggiornato_al     timestamptz NOT NULL DEFAULT now(),
  top_aree          jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{area, peso, trend}]
  dolore_principale text,
  intensita         int NOT NULL DEFAULT 0,               -- 0-100
  servizio_consigliato text,                              -- controllo_gestione|marketing_edile|vendita
  motivazione       text,
  health_score      int,
  priorita_contatto int NOT NULL DEFAULT 0                -- 0-100
);
ALTER TABLE public.sa_company_intel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sa_company_intel_super ON public.sa_company_intel;
CREATE POLICY sa_company_intel_super ON public.sa_company_intel FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS sa_company_intel_service ON public.sa_company_intel;
CREATE POLICY sa_company_intel_service ON public.sa_company_intel FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── mapping area dolore → servizio AEDIX (deterministico) ────────────────────
CREATE OR REPLACE FUNCTION public.sa_intel_area_to_servizio(p_area text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_area
    WHEN 'margini'      THEN 'controllo_gestione'
    WHEN 'cashflow'     THEN 'controllo_gestione'
    WHEN 'fatturazione' THEN 'controllo_gestione'
    WHEN 'marketing'    THEN 'marketing_edile'
    WHEN 'vendita'      THEN 'vendita'
    WHEN 'preventivi'   THEN 'vendita'
    ELSE 'controllo_gestione'  -- cantiere/hr/magazzino/compliance → efficienza operativa
  END;
$$;

-- ── compute: aggrega segnali 90gg → profilo azienda (upsert) ─────────────────
CREATE OR REPLACE FUNCTION public.sa_compute_company_intel(p_company_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_top jsonb; v_dolore text; v_dolore_peso int; v_intensita int;
  v_servizio text; v_motiv text; v_health int; v_prio int;
BEGIN
  IF p_company_id IS NULL THEN RETURN NULL; END IF;

  -- top aree per peso (ultimi 90gg)
  SELECT coalesce(jsonb_agg(jsonb_build_object('area', area, 'peso', peso_tot) ORDER BY peso_tot DESC), '[]'::jsonb)
    INTO v_top
  FROM (
    SELECT area, sum(peso)::int AS peso_tot
    FROM public.sa_conversation_signals
    WHERE company_id = p_company_id AND giorno > CURRENT_DATE - 90
    GROUP BY area ORDER BY peso_tot DESC LIMIT 5
  ) t;

  -- dolore principale = area con piu' segnali di difficolta'/lamentela
  SELECT area, sum(peso)::int INTO v_dolore, v_dolore_peso
  FROM public.sa_conversation_signals
  WHERE company_id = p_company_id AND giorno > CURRENT_DATE - 90
    AND intento IN ('difficolta','lamentela')
  GROUP BY area ORDER BY 2 DESC LIMIT 1;

  v_intensita := LEAST(100, coalesce(v_dolore_peso,0) * 8);
  v_servizio  := CASE WHEN v_dolore IS NULL THEN NULL ELSE public.sa_intel_area_to_servizio(v_dolore) END;
  v_health    := NULL;  -- incrocio health: arricchito in seguito (no coupling a schema non verificato)
  v_prio      := v_intensita;

  v_motiv := CASE
    WHEN v_dolore IS NULL THEN 'Nessun dolore dominante nelle ultime 90 giornate.'
    ELSE format('Segnale forte su "%s" (%s richieste/difficolta in 90gg). Candidato %s.',
                v_dolore, coalesce(v_dolore_peso,0), v_servizio)
  END;

  INSERT INTO public.sa_company_intel
    (company_id, aggiornato_al, top_aree, dolore_principale, intensita, servizio_consigliato, motivazione, health_score, priorita_contatto)
  VALUES (p_company_id, now(), v_top, v_dolore, v_intensita, v_servizio, v_motiv, v_health, v_prio)
  ON CONFLICT (company_id) DO UPDATE SET
    aggiornato_al = now(), top_aree = EXCLUDED.top_aree, dolore_principale = EXCLUDED.dolore_principale,
    intensita = EXCLUDED.intensita, servizio_consigliato = EXCLUDED.servizio_consigliato,
    motivazione = EXCLUDED.motivazione, health_score = EXCLUDED.health_score, priorita_contatto = EXCLUDED.priorita_contatto;

  RETURN p_company_id;
END $$;

-- ── RPC readonly per silvio-admin-chat (solo super_admin) ────────────────────
CREATE OR REPLACE FUNCTION public.sa_get_upsell_radar(p_servizio text DEFAULT 'tutti', p_limite int DEFAULT 15)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(r ORDER BY (r->>'priorita_contatto')::int DESC), '[]'::jsonb) INTO v
  FROM (
    SELECT jsonb_build_object(
      'company_id', i.company_id, 'azienda', co.name,
      'dolore_principale', i.dolore_principale, 'servizio_consigliato', i.servizio_consigliato,
      'intensita', i.intensita, 'priorita_contatto', i.priorita_contatto,
      'motivazione', i.motivazione, 'aggiornato_al', i.aggiornato_al) AS r
    FROM public.sa_company_intel i
    JOIN public.companies co ON co.id = i.company_id
    WHERE (coalesce(p_servizio,'tutti') = 'tutti' OR i.servizio_consigliato = p_servizio)
      AND i.intensita > 0
    ORDER BY i.priorita_contatto DESC
    LIMIT GREATEST(coalesce(p_limite,15), 1)
  ) q;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.sa_get_company_intel(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'company_id', i.company_id, 'azienda', co.name, 'aggiornato_al', i.aggiornato_al,
    'top_aree', i.top_aree, 'dolore_principale', i.dolore_principale, 'intensita', i.intensita,
    'servizio_consigliato', i.servizio_consigliato, 'motivazione', i.motivazione,
    'health_score', i.health_score, 'priorita_contatto', i.priorita_contatto)
  INTO v
  FROM public.sa_company_intel i JOIN public.companies co ON co.id = i.company_id
  WHERE i.company_id = p_company_id;
  RETURN coalesce(v, jsonb_build_object('error','nessun profilo intel per questa azienda'));
END $$;

CREATE OR REPLACE FUNCTION public.sa_get_trend_aggregato(p_giorni int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('area', area, 'peso_totale', peso_tot, 'aziende', aziende) ORDER BY peso_tot DESC), '[]'::jsonb)
    INTO v
  FROM (
    SELECT area, sum(peso)::int AS peso_tot, count(DISTINCT company_id)::int AS aziende
    FROM public.sa_conversation_signals
    WHERE giorno > CURRENT_DATE - GREATEST(coalesce(p_giorni,30), 1)
    GROUP BY area
  ) t;
  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.sa_get_upsell_radar(text,int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sa_get_company_intel(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sa_get_trend_aggregato(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sa_get_upsell_radar(text,int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sa_get_company_intel(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sa_get_trend_aggregato(int) TO authenticated, service_role;

COMMENT ON TABLE public.sa_conversation_signals IS 'MP-SA-INTEL-01: segnali conversazione cross-tenant (solo aggregato anonimo, RLS super_admin).';
COMMENT ON TABLE public.sa_company_intel IS 'MP-SA-INTEL-01: profilo intel per azienda + radar upsell (RLS super_admin).';
