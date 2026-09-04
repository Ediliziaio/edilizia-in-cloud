-- ════════════════════════════════════════════════════════════════════════════
-- Margine di commessa in tempo reale
-- ════════════════════════════════════════════════════════════════════════════
--
-- Il calcolo esiste già ed è buono: `v_ordine_marginalita` mette insieme sei
-- fonti di costo — acquisti, errori, manodopera, provvigioni, costi diretti,
-- variazioni approvate. E la soglia esiste già anche lei:
-- `company_governance_settings.marginalita_soglia_perc` e
-- `marginalita_alert_enabled`.
--
-- Quello che manca è che succeda qualcosa. Oggi la soglia serve solo a
-- colorare un semaforo nell'interfaccia (`src/lib/governance/thresholds.ts`,
-- funzione `valutaMarginalita`): una regola che vive nel browser e non avvisa
-- nessuno. Nell'azienda demo ci sono già commesse a −11,8%, −11,0%, −10,0% e
-- nessuno lo sa.
--
-- Qui la regola scende sul server e agisce: a ogni costo registrato il margine
-- si ricalcola, e quando peggiora di livello il responsabile della commessa
-- riceve un avviso che nomina la voce che l'ha eroso.
--
-- Il criterio contro il rumore: si avvisa al PEGGIORAMENTO di livello (verde →
-- giallo, giallo → rosso), non a ogni costo. Una commessa già rossa che
-- peggiora ancora non produce una notifica per ogni riga.
--
-- Costo misurato: leggere la vista per una sola commessa impiega 5,1 ms, col
-- filtro spinto dentro tutti e sei gli aggregati. Regge dentro un trigger.

CREATE TABLE IF NOT EXISTS public.ordine_margine_stato (
  order_id     uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  margine      numeric(14,2),
  margine_perc numeric(6,2),
  semaforo     text NOT NULL CHECK (semaforo IN ('verde','giallo','rosso')),
  soglia_perc  numeric(6,2),
  ultima_causa text,
  valutato_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_margine_stato_company_semaforo
  ON public.ordine_margine_stato (company_id, semaforo)
  WHERE semaforo <> 'verde';

ALTER TABLE public.ordine_margine_stato ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.ordine_margine_stato'::regclass
                   AND polname='margine_stato_azienda') THEN
    CREATE POLICY margine_stato_azienda ON public.ordine_margine_stato
      FOR SELECT TO authenticated
      USING (company_id = public.get_my_company_id()
             AND NOT public.utente_e_cliente_esterno());
  END IF;
END $$;

COMMENT ON TABLE public.ordine_margine_stato IS
  'Ultimo margine noto per commessa. Serve a distinguere un peggioramento da uno stato già noto: senza, l''avviso partirebbe a ogni costo registrato.';

-- Gli aggregati per commessa senza indice erano tre; con il volume crescono.
CREATE INDEX IF NOT EXISTS idx_order_employees_order      ON public.order_employees (order_id);
CREATE INDEX IF NOT EXISTS idx_order_external_teams_order ON public.order_external_teams (order_id);
CREATE INDEX IF NOT EXISTS idx_order_errors_order         ON public.order_errors (order_id);

CREATE OR REPLACE FUNCTION public.ordine_margine_valuta(
  p_order_id uuid,
  p_causa    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m           record;
  v_soglia    numeric := 15;   -- lo stesso valore predefinito di thresholds.ts
  v_attivo    boolean := true;
  v_semaforo  text;
  v_prima     text;
  v_resp      uuid;
  v_voce      text;
  v_importo   numeric;
  f           record;
BEGIN
  SELECT o.id, o.company_id, o.order_code, o.assigned_to, o.created_at,
         v.margine, v.margine_perc, v.preventivo_totale, v.consuntivo,
         v.costo_acquisti, v.costo_errori, v.costo_manodopera,
         v.costo_provvigioni, v.costo_diretto
    INTO m
    FROM public.orders o
    JOIN public.v_ordine_marginalita v ON v.id = o.id
   WHERE o.id = p_order_id;

  IF m.id IS NULL THEN
    RETURN jsonb_build_object('valutato', false, 'motivo', 'commessa non trovata');
  END IF;

  SELECT coalesce(g.marginalita_soglia_perc, 15), coalesce(g.marginalita_alert_enabled, true)
    INTO v_soglia, v_attivo
    FROM public.company_governance_settings g
   WHERE g.company_id = m.company_id;
  IF NOT FOUND THEN v_soglia := 15; v_attivo := true; END IF;

  -- Una commessa senza importo non ha un margine: non si inventa uno zero.
  IF coalesce(m.preventivo_totale, 0) <= 0 THEN
    RETURN jsonb_build_object('valutato', false,
      'motivo', 'la commessa non ha un importo: il margine non è definito',
      'order_id', p_order_id);
  END IF;

  v_semaforo := CASE
    WHEN m.margine_perc < 0                       THEN 'rosso'
    WHEN v_attivo AND m.margine_perc < v_soglia   THEN 'giallo'
    ELSE 'verde'
  END;

  SELECT s.semaforo INTO v_prima FROM public.ordine_margine_stato s WHERE s.order_id = p_order_id;

  INSERT INTO public.ordine_margine_stato AS s
    (order_id, company_id, margine, margine_perc, semaforo, soglia_perc, ultima_causa, valutato_at)
  VALUES (p_order_id, m.company_id, round(m.margine, 2), round(m.margine_perc, 2),
          v_semaforo, v_soglia, p_causa, now())
  ON CONFLICT (order_id) DO UPDATE SET
    margine = EXCLUDED.margine, margine_perc = EXCLUDED.margine_perc,
    semaforo = EXCLUDED.semaforo, soglia_perc = EXCLUDED.soglia_perc,
    ultima_causa = EXCLUDED.ultima_causa, valutato_at = EXCLUDED.valutato_at;

  -- Si avvisa solo quando il livello PEGGIORA.
  IF v_prima IS NOT DISTINCT FROM v_semaforo
     OR v_semaforo = 'verde'
     OR (v_prima = 'rosso') THEN
    RETURN jsonb_build_object('valutato', true, 'semaforo', v_semaforo,
      'margine_perc', round(m.margine_perc, 2), 'avvisato', false);
  END IF;

  -- La voce che lo sta erodendo: la più grossa fra le cinque.
  SELECT x.voce, x.importo INTO v_voce, v_importo
    FROM (VALUES
      ('acquisti da fornitori', coalesce(m.costo_acquisti, 0)),
      ('errori e rilavorazioni', coalesce(m.costo_errori, 0)),
      ('manodopera',             coalesce(m.costo_manodopera, 0)),
      ('provvigioni',            coalesce(m.costo_provvigioni, 0)),
      ('costi diretti',          coalesce(m.costo_diretto, 0))
    ) AS x(voce, importo)
   ORDER BY x.importo DESC LIMIT 1;

  v_resp := m.assigned_to;

  FOR f IN
    SELECT coalesce(v_resp, p.id) AS user_id
      FROM public.profiles p
     WHERE (v_resp IS NOT NULL AND p.id = v_resp)
        OR (v_resp IS NULL AND p.company_id = m.company_id
            AND public.has_role(p.id, 'company_admin'::public.app_role))
  LOOP
    INSERT INTO public.notifications (company_id, user_id, type, title, body, action_url,
                                      entity_type, entity_id)
    VALUES (
      m.company_id, f.user_id, 'margine_commessa',
      format('%s: margine sceso a %s%%', coalesce(m.order_code, 'commessa'),
             round(m.margine_perc, 1)),
      format('Il margine è passato da %s a %s (soglia %s%%). La voce più pesante è %s: %s €.%s',
             coalesce(v_prima, 'non valutato'), v_semaforo, round(v_soglia, 1),
             v_voce, round(v_importo, 2),
             CASE WHEN p_causa IS NOT NULL THEN ' Ultimo movimento: ' || p_causa || '.' ELSE '' END),
      '/azienda/commesse/' || p_order_id::text,
      'order', p_order_id);
  END LOOP;

  RETURN jsonb_build_object('valutato', true, 'semaforo', v_semaforo,
    'semaforo_prima', v_prima, 'margine_perc', round(m.margine_perc, 2),
    'soglia_perc', v_soglia, 'voce_piu_pesante', v_voce, 'avvisato', true);
END $function$;

REVOKE ALL ON FUNCTION public.ordine_margine_valuta(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ordine_margine_valuta(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ordine_margine_valuta(uuid, text) TO service_role;

-- ── Il ricalcolo a ogni costo ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_ordine_margine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_ord uuid; v_causa text;
BEGIN
  v_ord := coalesce(
    CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'order_id')
         ELSE (to_jsonb(NEW) ->> 'order_id') END,
    CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'id')
         ELSE (to_jsonb(NEW) ->> 'id') END)::uuid;

  IF v_ord IS NULL THEN RETURN NULL; END IF;

  v_causa := CASE TG_TABLE_NAME
    WHEN 'purchase_orders'      THEN 'un ordine a fornitore'
    WHEN 'order_errors'         THEN 'un errore o una rilavorazione'
    WHEN 'order_employees'      THEN 'una assegnazione di manodopera'
    WHEN 'order_external_teams' THEN 'una squadra esterna'
    WHEN 'order_salespeople'    THEN 'una provvigione'
    WHEN 'company_costs'        THEN 'un costo diretto'
    WHEN 'ordini_variazione'    THEN 'una variazione'
    WHEN 'orders'               THEN 'l''importo della commessa'
    ELSE TG_TABLE_NAME END;

  PERFORM public.ordine_margine_valuta(v_ord, v_causa);
  RETURN NULL;
END $function$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_orders','order_errors','order_employees',
                           'order_external_teams','order_salespeople','company_costs',
                           'ordini_variazione']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_margine_commessa ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_margine_commessa AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tg_ordine_margine()', t);
  END LOOP;

  -- Sulla commessa basta il cambio di importo.
  DROP TRIGGER IF EXISTS trg_margine_commessa ON public.orders;
  CREATE TRIGGER trg_margine_commessa
    AFTER UPDATE OF total_amount ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.tg_ordine_margine();
END $$;
