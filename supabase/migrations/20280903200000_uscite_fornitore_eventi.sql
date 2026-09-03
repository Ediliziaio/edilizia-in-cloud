-- Pagamenti a fornitore ancorati agli EVENTI, non a una data scritta a mano.
--
-- IL PROBLEMA (specchio di quello sulle rate cliente, 2026-09-03)
-- ---------------------------------------------------------------
-- I termini di pagamento verso i fornitori in Italia si dicono così: "30 giorni
-- data fattura", "60 giorni fine mese", "alla consegna". Oggi questa
-- informazione vive in `purchase_orders.payment_terms` come TESTO LIBERO (in
-- produzione c'è scritto "30 gg fine mese") e la scadenza vera è una data
-- digitata a mano su ogni costo. Conseguenze:
--   • la fattura del fornitore arriva con dieci giorni di ritardo e la scadenza
--     resta quella scritta prima: si paga in anticipo o in ritardo per sbaglio;
--   • il preavviso non esiste. In produzione ci sono 93 scadenze fornitore
--     aperte per 686.199 €, di cui 55 già scadute per 287.389 €, e
--     `scadenze.alert_sent_at` è nullo su tutte e 393 le righe: l'avviso non è
--     mai partito per nessuno.
--
-- Qui i termini diventano un dato: base di calcolo + giorni di dilazione. La
-- scadenza si ricalcola da sola quando arriva la fattura o la merce, e ogni
-- uscita sa dire se è in preavviso, scaduta o a posto.
-- Idempotente.

-- ── 1) I termini di pagamento come dato ──
ALTER TABLE public.company_costs
  ADD COLUMN IF NOT EXISTS trigger_evento text NOT NULL DEFAULT 'data_fissa',
  ADD COLUMN IF NOT EXISTS giorni_dilazione integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS giorni_preavviso integer NOT NULL DEFAULT 7;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_costs_trigger_evento_check') THEN
    ALTER TABLE public.company_costs
      ADD CONSTRAINT company_costs_trigger_evento_check
      CHECK (trigger_evento IN (
        'data_fissa', 'data_fattura', 'fine_mese_fattura',
        'ricezione_merce', 'data_ordine', 'fine_lavori'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'company_costs_dilazione_check') THEN
    ALTER TABLE public.company_costs
      ADD CONSTRAINT company_costs_dilazione_check
      CHECK (giorni_dilazione BETWEEN 0 AND 365 AND giorni_preavviso BETWEEN 0 AND 90);
  END IF;
END $$;

COMMENT ON COLUMN public.company_costs.trigger_evento IS
  'Da cosa si conta la scadenza: data_fissa | data_fattura | fine_mese_fattura | ricezione_merce | data_ordine | fine_lavori';
COMMENT ON COLUMN public.company_costs.giorni_dilazione IS
  'Giorni di dilazione dalla base scelta ("30 gg data fattura" = data_fattura + 30)';
COMMENT ON COLUMN public.company_costs.giorni_preavviso IS
  'Quanti giorni prima avvisare che sta per uscire il denaro';

-- Gli stessi termini sull'ordine d'acquisto, accanto al testo libero che resta
-- leggibile: da lì si ereditano sui costi che ne nascono.
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_terms_base text,
  ADD COLUMN IF NOT EXISTS payment_terms_giorni integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_terms_base_check') THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT purchase_orders_terms_base_check
      CHECK (payment_terms_base IS NULL OR payment_terms_base IN (
        'data_fissa', 'data_fattura', 'fine_mese_fattura',
        'ricezione_merce', 'data_ordine', 'fine_lavori'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_company_costs_evento
  ON public.company_costs(trigger_evento) WHERE is_paid = false;

-- ── 2) La data di pagamento calcolata dai termini ──
-- Una funzione sola: la stessa regola vale per vista, avvisi e interfaccia.
CREATE OR REPLACE FUNCTION public.data_pagamento_uscita(
  p_evento    text,
  p_due_date  date,
  p_giorni    integer,
  p_cost_id   uuid,
  p_oda_id    uuid,
  p_order_id  uuid
) RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_giorni integer := coalesce(p_giorni, 0);
  v_base   date;
BEGIN
  -- 9999-12-31 è la sentinella "senza scadenza" usata dai costi: non è una data.
  IF coalesce(p_evento, 'data_fissa') = 'data_fissa' THEN
    RETURN CASE WHEN p_due_date = DATE '9999-12-31' THEN NULL ELSE p_due_date END;
  END IF;

  v_base := CASE p_evento
    WHEN 'data_fattura' THEN (
      SELECT min(f.data_fattura) FROM public.fatture_ricevute f
      WHERE f.company_cost_id = p_cost_id
         OR (p_oda_id IS NOT NULL AND f.purchase_order_id = p_oda_id)
    )
    WHEN 'fine_mese_fattura' THEN (
      -- "60 gg d.f.f.m.": si parte dall'ultimo giorno del mese della fattura.
      SELECT (date_trunc('month', min(f.data_fattura)) + interval '1 month - 1 day')::date
      FROM public.fatture_ricevute f
      WHERE f.company_cost_id = p_cost_id
         OR (p_oda_id IS NOT NULL AND f.purchase_order_id = p_oda_id)
    )
    WHEN 'ricezione_merce' THEN (
      SELECT po.actual_delivery_date FROM public.purchase_orders po WHERE po.id = p_oda_id
    )
    WHEN 'data_ordine' THEN (
      SELECT po.issue_date FROM public.purchase_orders po WHERE po.id = p_oda_id
    )
    WHEN 'fine_lavori' THEN (
      SELECT o.work_end_date FROM public.orders o WHERE o.id = p_order_id
    )
    ELSE NULL
  END;

  IF v_base IS NULL THEN RETURN NULL; END IF;
  RETURN v_base + v_giorni;
END;
$$;

-- ── 3) Lo stato di ogni uscita, pronto da leggere ──
DROP VIEW IF EXISTS public.v_uscite_stato;
CREATE VIEW public.v_uscite_stato
WITH (security_invoker = on) AS
SELECT
  c.id,
  c.company_id,
  c.name,
  c.category,
  c.amount,
  c.vat_rate,
  c.is_paid,
  c.paid_date,
  c.due_date,
  c.supplier_id,
  c.order_id,
  c.purchase_order_id,
  c.trigger_evento,
  c.giorni_dilazione,
  c.giorni_preavviso,
  d.data_pagamento,
  (d.data_pagamento - CURRENT_DATE) AS giorni_al_pagamento,
  CASE
    WHEN c.is_paid                                            THEN 'pagata'
    WHEN d.data_pagamento IS NULL                             THEN 'senza_data'
    WHEN d.data_pagamento <= CURRENT_DATE                     THEN 'scaduta'
    WHEN d.data_pagamento <= CURRENT_DATE + c.giorni_preavviso THEN 'preavviso'
    ELSE 'ok'
  END AS stato_uscita
FROM public.company_costs c
CROSS JOIN LATERAL (
  SELECT public.data_pagamento_uscita(
    c.trigger_evento, c.due_date, c.giorni_dilazione,
    c.id, c.purchase_order_id, c.order_id
  ) AS data_pagamento
) d;

GRANT SELECT ON public.v_uscite_stato TO authenticated;

COMMENT ON VIEW public.v_uscite_stato IS
  'Costi con la data di pagamento calcolata dai termini (data fattura, fine mese, consegna…) e lo stato (pagata|ok|preavviso|scaduta|senza_data). security_invoker: valgono le RLS di company_costs.';

-- ── 4) L'avviso che oggi non parte per nessuno ──
-- `check-scadenze-alerts` esiste dal 2026 ma non ha mai avuto un cron, e legge
-- `scadenza_alert_prefs` che è VUOTA: anche girando non avrebbe fatto nulla.
-- Qui l'avviso in-app, che non richiede configurazione e non manda niente
-- fuori dall'applicativo.
CREATE OR REPLACE FUNCTION public.crea_notifiche_uscite_in_arrivo()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_n integer;
BEGIN
  -- Preavviso: i soldi stanno per uscire, c'è ancora tempo per organizzarsi.
  INSERT INTO notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  SELECT
    u.company_id,
    p.id,
    'uscita_preavviso',
    CASE
      WHEN u.giorni_al_pagamento <= 1 THEN 'Domani esce un pagamento'
      ELSE 'Tra ' || u.giorni_al_pagamento || ' giorni esce un pagamento'
    END,
    coalesce(nullif(u.name, ''), 'Costo') ||
      coalesce(' — ' || (SELECT s.name FROM public.suppliers s WHERE s.id = u.supplier_id), '') ||
      ' · ' || to_char(u.amount, 'FM999G999G990D00') || ' € il ' || to_char(u.data_pagamento, 'DD/MM/YYYY'),
    'cost',
    u.id,
    '/azienda/costi'
  FROM public.v_uscite_stato u
  JOIN public.profiles p ON p.company_id = u.company_id
  JOIN public.user_roles r ON r.user_id = p.id AND r.role IN ('company_admin', 'super_admin')
  WHERE u.stato_uscita = 'preavviso'
    AND u.amount > 0
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.type = 'uscita_preavviso' AND n.entity_id = u.id AND n.user_id = p.id
        AND n.body LIKE '%' || to_char(u.data_pagamento, 'DD/MM/YYYY') || '%'
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_count := v_count + v_n;

  -- Scaduta: si sta pagando in ritardo. Una volta sola, e solo il recente:
  -- gli arretrati vecchi si guardano in elenco, non a suon di notifiche.
  INSERT INTO notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  SELECT
    u.company_id,
    p.id,
    'uscita_scaduta',
    'Pagamento a fornitore scaduto',
    coalesce(nullif(u.name, ''), 'Costo') ||
      coalesce(' — ' || (SELECT s.name FROM public.suppliers s WHERE s.id = u.supplier_id), '') ||
      ' · ' || to_char(u.amount, 'FM999G999G990D00') || ' € era da pagare il ' || to_char(u.data_pagamento, 'DD/MM/YYYY'),
    'cost',
    u.id,
    '/azienda/costi'
  FROM public.v_uscite_stato u
  JOIN public.profiles p ON p.company_id = u.company_id
  JOIN public.user_roles r ON r.user_id = p.id AND r.role IN ('company_admin', 'super_admin')
  WHERE u.stato_uscita = 'scaduta'
    AND u.amount > 0
    AND u.data_pagamento >= CURRENT_DATE - 30
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.type = 'uscita_scaduta' AND n.entity_id = u.id AND n.user_id = p.id
        AND n.body LIKE '%' || to_char(u.data_pagamento, 'DD/MM/YYYY') || '%'
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_count := v_count + v_n;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.crea_notifiche_uscite_in_arrivo() FROM public, anon;

-- Ogni mattina alle 05:45 UTC, subito dopo le rate cliente.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'uscite-preavviso-daily';
SELECT cron.schedule('uscite-preavviso-daily', '45 5 * * *', 'SELECT public.crea_notifiche_uscite_in_arrivo();');
