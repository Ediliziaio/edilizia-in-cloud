-- Riepilogo di periodo per chi guida la piattaforma.
--
-- Diverso dallo "Stato piattaforma" (che dice cosa si e' ROTTO): questo dice
-- come sta andando. Stesso principio, pero': arriva sempre, anche quando non
-- e' successo niente — un rapporto che compare solo nei mesi buoni non e' un
-- rapporto, e' una pacca sulla spalla.
--
-- Una funzione sola con la finestra come parametro: settimana e mese sono lo
-- stesso conto su periodi diversi, e tenerli in un posto solo evita che fra
-- sei mesi dicano numeri diversi sulla stessa cosa.
CREATE OR REPLACE FUNCTION public.riepilogo_piattaforma(
  p_da timestamptz,
  p_a  timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH
-- Le aziende vere: fuori la company di piattaforma, che non e' un cliente.
clienti AS (
  SELECT * FROM public.companies WHERE NOT COALESCE(is_platform_admin_company, false)
),
incassi AS (
  SELECT count(*) AS n, COALESCE(sum(amount_paid), 0) / 100.0 AS eur
  FROM public.subscription_invoices
  WHERE status = 'paid' AND created_at >= p_da AND created_at < p_a
),
-- Periodo precedente della STESSA lunghezza: senza confronto un numero da
-- solo non dice se e' un buon periodo o un brutto periodo.
incassi_prec AS (
  SELECT count(*) AS n, COALESCE(sum(amount_paid), 0) / 100.0 AS eur
  FROM public.subscription_invoices
  WHERE status = 'paid'
    AND created_at >= p_da - (p_a - p_da) AND created_at < p_da
),
-- MRR = solo quello che si incassa davvero. Gli accessi regalati hanno un
-- piano a listino ma nessuno li fattura: sommarli fa un numero che descrive
-- un'azienda che non esiste. Restano accanto, come cifra separata, perche'
-- sapere quanto si sta regalando e' un'informazione, non un errore.
mrr AS (
  SELECT mrr_interno_cents / 100.0 AS ora,
         mrr_regalato_cents / 100.0 AS regalato,
         aziende_regalate,
         aziende_attive_interno AS paganti,
         calcolo_affidabile,
         data AS il_giorno,
         (SELECT m2.mrr_interno_cents / 100.0 FROM public.mrr_snapshots m2
          WHERE m2.data < (SELECT max(data) FROM public.mrr_snapshots)
            AND m2.calcolo_affidabile
          ORDER BY m2.data DESC LIMIT 1) AS prima
  FROM public.mrr_snapshots
  ORDER BY data DESC LIMIT 1
)
SELECT jsonb_build_object(
  'da', p_da, 'a', p_a,

  'nuove_aziende', (SELECT count(*) FROM clienti WHERE created_at >= p_da AND created_at < p_a),
  'aziende_attive', (SELECT count(*) FROM clienti WHERE status = 'active'),
  'trial_attivi',   (SELECT count(*) FROM clienti WHERE status = 'trial'),

  'incassi_n',      (SELECT n FROM incassi),
  'incassi_eur',    (SELECT eur FROM incassi),
  'incassi_n_prec', (SELECT n FROM incassi_prec),
  'incassi_eur_prec',(SELECT eur FROM incassi_prec),

  'mrr_eur',            (SELECT ora FROM mrr),
  'mrr_eur_prec',       (SELECT prima FROM mrr),
  'mrr_regalato_eur',   (SELECT regalato FROM mrr),
  'aziende_regalate',   (SELECT aziende_regalate FROM mrr),
  'aziende_paganti',    (SELECT paganti FROM mrr),
  'mrr_affidabile',     (SELECT calcolo_affidabile FROM mrr),
  'mrr_del_giorno',     (SELECT il_giorno FROM mrr),

  -- Chi rischia di andarsene: e' la parte azionabile del rapporto.
  'in_difficolta', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'azienda', c.name,
      'da_giorni', (CURRENT_DATE - c.dunning_started_at::date)))
    FROM clienti c
    WHERE c.stripe_subscription_status = 'past_due'
  ), '[]'::jsonb),

  -- Trial che scadono nei prossimi 7 giorni: opportunita' con una scadenza.
  'trial_in_scadenza', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'azienda', c.name,
      'fra_giorni', (c.trial_ends_at::date - CURRENT_DATE)))
    FROM clienti c
    WHERE c.status = 'trial' AND c.trial_ends_at IS NOT NULL
      AND c.trial_ends_at BETWEEN now() AND now() + interval '7 days'
  ), '[]'::jsonb),

  -- Segni di vita: se le aziende non creano niente, il fatturato di oggi non
  -- racconta quello che succedera' fra tre mesi.
  'commesse_create',   (SELECT count(*) FROM public.orders WHERE created_at >= p_da AND created_at < p_a),
  'preventivi_creati', (SELECT count(*) FROM public.quotes WHERE created_at >= p_da AND created_at < p_a),

  -- Quanto e' costata l'AI e quanto e' stata fatturata: il margine del
  -- servizio piu' facile da regalare per sbaglio.
  'ai_costo_eur',    (SELECT round(COALESCE(sum(cost_real_eur), 0)::numeric, 2)
                      FROM public.ai_model_usage_log WHERE ts >= p_da AND ts < p_a),
  'ai_fatturato_eur',(SELECT round(COALESCE(sum(cost_billed_eur), 0)::numeric, 2)
                      FROM public.ai_model_usage_log WHERE ts >= p_da AND ts < p_a),

  -- Cold outreach, se e' in corso.
  'wa_inviati',  (SELECT count(*) FROM public.openwa_messages
                  WHERE direction = 'outbound' AND created_at >= p_da AND created_at < p_a),
  'wa_risposte', (SELECT count(*) FROM public.openwa_messages
                  WHERE direction = 'inbound' AND created_at >= p_da AND created_at < p_a)
);
$function$;

REVOKE ALL ON FUNCTION public.riepilogo_piattaforma(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.riepilogo_piattaforma(timestamptz, timestamptz) IS
  'Come sta andando la piattaforma nella finestra indicata, col confronto sul periodo precedente di pari lunghezza. Usata da ops-riepilogo per il settimanale e il mensile.';

NOTIFY pgrst, 'reload schema';
