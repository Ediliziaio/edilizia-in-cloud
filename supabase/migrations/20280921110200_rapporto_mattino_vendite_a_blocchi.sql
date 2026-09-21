-- Rapporto del mattino: le vendite registrate tutte lo stesso giorno (21/09/2026).
--
-- Best Infissi a settembre ha 12 contratti vinti per 122.981 €, segnati tutti
-- nello stesso giorno: il rapporto ne ricavava un CAC di 52 € e un ROAS di 196,
-- numeri che dicono quando è stato cliccato «vinto», non cosa hanno prodotto le
-- campagne del mese. Con il numero di giorni distinti in cui sono state
-- registrate le vendite del mese, il rapporto può avvisare invece di mostrare
-- quei due numeri come buoni.
--
-- Modifica sul posto della definizione in produzione (vedi 20280921110100):
-- un campo in più per cliente, accanto a vendite_ieri.

SET lock_timeout = '3s';
SET statement_timeout = '30s';

DO $mig$
DECLARE
  v_def text;
  v_prima constant text := ') AS vendite_ieri,';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mkt_rapporto_mattino';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'mkt_rapporto_mattino non trovata';
  END IF;
  IF position('giorni_vendite_mese' in v_def) > 0 THEN
    RETURN;
  END IF;
  IF (length(v_def) - length(replace(v_def, v_prima, ''))) / length(v_prima) <> 1 THEN
    RAISE EXCEPTION 'mkt_rapporto_mattino: il campo vendite_ieri non c''è una volta sola';
  END IF;
  EXECUTE replace(v_def, v_prima, v_prima || E'\n'
    || E'           (SELECT count(DISTINCT (coalesce(o.won_at, o.updated_at) AT TIME ZONE \'Europe/Rome\')::date)\n'
    || E'              FROM public.marketing_opportunities o\n'
    || E'             WHERE o.company_id = m.company_id AND o.deleted_at IS NULL AND o.status = \'won\'\n'
    || E'               AND coalesce(o.won_at, o.updated_at) >= (date_trunc(\'month\', p_giorno)::timestamp AT TIME ZONE \'Europe/Rome\')\n'
    || E'               AND coalesce(o.won_at, o.updated_at) < (p_giorno::timestamp AT TIME ZONE \'Europe/Rome\')) AS giorni_vendite_mese,');
END
$mig$;
