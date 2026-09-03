-- Rate della commessa ancorate agli EVENTI del cantiere, non solo a una data.
--
-- IL PROBLEMA (richiesta utente del 2026-09-03)
-- ---------------------------------------------
-- In edilizia le rate si incassano a eventi, non al calendario: l'acconto alla
-- firma, la seconda all'arrivo della merce, la terza prima di partire coi
-- lavori, il saldo a fine lavori. Fino a qui l'evento si poteva solo SCRIVERE
-- nell'etichetta, e infatti in produzione ci sono già "Acconto alla firma del
-- contratto", "Saldo alla posa", "Saldo al collaudo": parole che il sistema
-- mostra ma non capisce. Conseguenze:
--   • se sposti l'inizio lavori, la data della rata resta indietro e nessuno
--     se ne accorge;
--   • il calendario avvisa solo su acconto e saldo, mai sulla rata di mezzo,
--     quindi si parte col cantiere senza aver incassato e lo si scopre dopo.
--
-- Qui l'evento diventa un dato. La data attesa si CALCOLA dall'evento (e si
-- sposta da sola quando sposti il cantiere), e ogni rata sa dire se è in
-- preavviso, scaduta o a posto.
-- Idempotente.

-- ── 1) L'evento che fa scattare la rata ──
ALTER TABLE public.order_installments
  ADD COLUMN IF NOT EXISTS trigger_evento text NOT NULL DEFAULT 'data_fissa',
  ADD COLUMN IF NOT EXISTS trigger_status_id uuid REFERENCES public.order_statuses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS giorni_preavviso integer NOT NULL DEFAULT 7;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_installments_trigger_evento_check') THEN
    ALTER TABLE public.order_installments
      ADD CONSTRAINT order_installments_trigger_evento_check
      CHECK (trigger_evento IN ('data_fissa', 'firma_contratto', 'merce_magazzino', 'inizio_lavori', 'fine_lavori', 'stato_commessa'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_installments_preavviso_check') THEN
    ALTER TABLE public.order_installments
      ADD CONSTRAINT order_installments_preavviso_check
      CHECK (giorni_preavviso BETWEEN 0 AND 90);
  END IF;
END $$;

COMMENT ON COLUMN public.order_installments.trigger_evento IS
  'Evento del cantiere che rende esigibile la rata: data_fissa | firma_contratto | merce_magazzino | inizio_lavori | fine_lavori | stato_commessa';
COMMENT ON COLUMN public.order_installments.trigger_status_id IS
  'Solo per trigger_evento = stato_commessa: lo stato (order_statuses) al cui raggiungimento la rata scade';
COMMENT ON COLUMN public.order_installments.giorni_preavviso IS
  'Quanti giorni prima dell''evento far scattare l''avviso "non hai ancora incassato"';

CREATE INDEX IF NOT EXISTS idx_order_installments_evento
  ON public.order_installments(trigger_evento) WHERE is_paid = false;

-- ── 2) La data attesa calcolata dall'evento ──
-- Una funzione sola, così la stessa regola vale per vista, avvisi e frontend.
CREATE OR REPLACE FUNCTION public.data_attesa_rata(
  p_evento         text,
  p_expected_date  date,
  p_status_id      uuid,
  p_order_id       uuid,
  p_created_at     timestamptz,
  p_merce          date,
  p_inizio         date,
  p_fine           date
) RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE coalesce(p_evento, 'data_fissa')
    -- La firma del contratto non ha una colonna sua: l'apertura della commessa
    -- è il momento più vicino che il sistema conosce davvero.
    WHEN 'firma_contratto' THEN p_created_at::date
    WHEN 'merce_magazzino' THEN p_merce
    WHEN 'inizio_lavori'   THEN p_inizio
    WHEN 'fine_lavori'     THEN p_fine
    WHEN 'stato_commessa'  THEN (
      SELECT min(h.changed_at)::date
      FROM public.order_status_history h
      WHERE h.order_id = p_order_id AND h.status_id = p_status_id
    )
    ELSE p_expected_date
  END;
$$;

-- ── 3) Lo stato di incasso di ogni rata, pronto da leggere ──
DROP VIEW IF EXISTS public.v_rate_commessa_stato;
CREATE VIEW public.v_rate_commessa_stato
WITH (security_invoker = on) AS
SELECT
  i.id,
  i.order_id,
  o.company_id,
  o.order_code,
  o.description AS commessa,
  o.customer_id,
  i.position,
  i.label,
  i.type,
  i.amount,
  i.is_paid,
  i.paid_date,
  i.expected_date,
  i.trigger_evento,
  i.trigger_status_id,
  i.giorni_preavviso,
  d.data_attesa,
  (d.data_attesa - CURRENT_DATE) AS giorni_all_evento,
  CASE
    WHEN i.is_paid                                              THEN 'pagata'
    WHEN d.data_attesa IS NULL                                  THEN 'senza_data'
    WHEN d.data_attesa <= CURRENT_DATE                          THEN 'scaduta'
    WHEN d.data_attesa <= CURRENT_DATE + i.giorni_preavviso     THEN 'preavviso'
    ELSE 'ok'
  END AS stato_incasso
FROM public.order_installments i
JOIN public.orders o ON o.id = i.order_id
CROSS JOIN LATERAL (
  SELECT public.data_attesa_rata(
    i.trigger_evento, i.expected_date, i.trigger_status_id,
    o.id, o.created_at, o.warehouse_arrival_date, o.work_start_date, o.work_end_date
  ) AS data_attesa
) d;

GRANT SELECT ON public.v_rate_commessa_stato TO authenticated;

COMMENT ON VIEW public.v_rate_commessa_stato IS
  'Rate con la data attesa calcolata dall''evento del cantiere e lo stato di incasso (pagata|ok|preavviso|scaduta|senza_data). security_invoker: le RLS di order_installments e orders valgono.';

-- ── 4) L'avviso che arriva PRIMA, non dopo ──
-- L'utente pianifica inizio e fine lavori con settimane di anticipo: chiedere
-- conferma nel momento in cui scrive la data sarebbe rumore (a quel punto è
-- normale che il cliente non abbia ancora versato). L'avviso serve avvicinandosi
-- all'evento. Una notifica per rata e per stato, mai ripetuta.
CREATE OR REPLACE FUNCTION public.crea_notifiche_rate_in_arrivo()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_n integer;
BEGIN
  -- Preavviso: l'evento è vicino e i soldi non sono arrivati.
  INSERT INTO notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  SELECT
    r.company_id,
    coalesce(o.assigned_to, o.created_by),
    'rata_preavviso',
    CASE
      WHEN r.giorni_all_evento <= 1 THEN 'Domani parte e non hai incassato'
      ELSE 'Tra ' || r.giorni_all_evento || ' giorni e non hai incassato'
    END,
    coalesce(r.order_code, 'Commessa') || ' — ' || coalesce(nullif(r.label, ''), 'rata') ||
      ' di ' || to_char(r.amount, 'FM999G999G990D00') || ' € attesa il ' || to_char(r.data_attesa, 'DD/MM/YYYY'),
    'order',
    r.order_id,
    '/azienda/ordini/' || r.order_id
  FROM public.v_rate_commessa_stato r
  JOIN public.orders o ON o.id = r.order_id
  WHERE r.stato_incasso = 'preavviso'
    AND r.amount > 0
    AND coalesce(o.assigned_to, o.created_by) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = coalesce(o.assigned_to, o.created_by))
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.type = 'rata_preavviso' AND n.entity_id = r.order_id
        AND n.body LIKE '%' || to_char(r.data_attesa, 'DD/MM/YYYY') || '%'
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_count := v_count + v_n;

  -- Scaduta: l'evento è passato. Una volta sola, poi ci pensa l'alert in commessa.
  INSERT INTO notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  SELECT
    r.company_id,
    coalesce(o.assigned_to, o.created_by),
    'rata_scaduta',
    'Rata non incassata: il cantiere lo stai finanziando tu',
    coalesce(r.order_code, 'Commessa') || ' — ' || coalesce(nullif(r.label, ''), 'rata') ||
      ' di ' || to_char(r.amount, 'FM999G999G990D00') || ' € era attesa il ' || to_char(r.data_attesa, 'DD/MM/YYYY'),
    'order',
    r.order_id,
    '/azienda/ordini/' || r.order_id
  FROM public.v_rate_commessa_stato r
  JOIN public.orders o ON o.id = r.order_id
  WHERE r.stato_incasso = 'scaduta'
    AND r.amount > 0
    AND r.data_attesa >= CURRENT_DATE - 30   -- non si rivangano i vecchi arretrati
    AND coalesce(o.assigned_to, o.created_by) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = coalesce(o.assigned_to, o.created_by))
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.type = 'rata_scaduta' AND n.entity_id = r.order_id
        AND n.body LIKE '%' || to_char(r.data_attesa, 'DD/MM/YYYY') || '%'
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_count := v_count + v_n;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.crea_notifiche_rate_in_arrivo() FROM public, anon;

-- Ogni mattina alle 05:40 UTC, subito dopo i promemoria delle attività.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'rate-preavviso-daily';
SELECT cron.schedule('rate-preavviso-daily', '40 5 * * *', 'SELECT public.crea_notifiche_rate_in_arrivo();');

-- ── 5) La creazione commessa deve saper salvare l'evento ──
-- create_order_atomic inseriva le rate con 8 colonne fisse: senza questo, la
-- rata creata dalla nuova commessa perdeva l'evento appena scelto.
DO $$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_order_atomic'
  ORDER BY p.oid DESC LIMIT 1;

  IF v_src IS NULL OR position('trigger_evento' IN v_src) > 0 THEN
    RAISE NOTICE 'create_order_atomic: gia aggiornata o assente, nessuna modifica';
    RETURN;
  END IF;

  v_new := replace(
    v_src,
    'order_id, position, label, type, amount, is_paid, paid_date, expected_date',
    'order_id, position, label, type, amount, is_paid, paid_date, expected_date, trigger_evento, trigger_status_id, giorni_preavviso'
  );
  v_new := replace(
    v_new,
    'NULLIF(v_inst->>''expected_date'', '''')::date' || chr(10) || '      );',
    'NULLIF(v_inst->>''expected_date'', '''')::date,' || chr(10) ||
    '        COALESCE(NULLIF(v_inst->>''trigger_evento'', ''''), ''data_fissa''),' || chr(10) ||
    '        NULLIF(v_inst->>''trigger_status_id'', '''')::uuid,' || chr(10) ||
    '        COALESCE((v_inst->>''giorni_preavviso'')::integer, 7)' || chr(10) ||
    '      );'
  );

  IF v_new = v_src THEN
    RAISE WARNING 'create_order_atomic: schema INSERT rate non riconosciuto, aggiornare a mano';
    RETURN;
  END IF;
  EXECUTE v_new;
  RAISE NOTICE 'create_order_atomic: rate con evento';
END $$;
