-- Costi orari alla data del lavoro: le due righe rimaste (area D, 15/11/2026).
--
-- 1. Il costo che arriva dopo (rapportino_costo_recupera): quando a un rapportino approvato
--    mancava il costo dell'operaio e il costo arriva più tardi, si usava il costo di adesso.
--    Ora, se lo storico ha un costo valido alla data del lavoro, vale quello; altrimenti il
--    costo di adesso, come prima. Si cambiano due righe sul testo del database (blocco DO,
--    idempotente), come in 20290415100000.
-- 2. Il costo CALCOLATO dei mezzi (spese degli ultimi 12 mesi diviso le ore) cambia col tempo e
--    non lasciava storia. Ora una fotografia al mese (cron il 1° alle 03:15 UTC) lo scrive nello
--    storico per i mezzi propri senza costo manuale: un rapportino di marzo approvato a giugno
--    prende il costo di marzo. La prima fotografia vale anche per il passato (è il solo costo
--    che si conosce). Nessuna edge function: è una funzione SQL chiamata dal cron.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ── 1. Il costo recuperato alla data del lavoro ───────────────────────────────
DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.rapportino_costo_recupera(uuid)'::regprocedure);
  IF position('costo_orario_dipendente_al(e.id, r.data_lavoro)' IN v_def) = 0 THEN
    IF position('select x.id, x.order_id, x.presenze_registrate' IN v_def) = 0
       OR position('v_costo := round(v_ore * v_tariffa, 2);' IN v_def) = 0 THEN
      RAISE EXCEPTION 'rapportino_costo_recupera: non trovo le righe da sostituire';
    END IF;
    v_def := replace(v_def, 'select x.id, x.order_id, x.presenze_registrate', 'select x.id, x.order_id, x.data_lavoro, x.presenze_registrate');
    v_def := replace(v_def, 'v_costo := round(v_ore * v_tariffa, 2);',
      'v_costo := round(v_ore * coalesce(nullif(private.costo_orario_dipendente_al(e.id, r.data_lavoro), 0), v_tariffa), 2);');
    EXECUTE v_def;
  END IF;
END $$;

-- ── 2. La fotografia mensile del costo calcolato dei mezzi ────────────────────
CREATE OR REPLACE FUNCTION private.mezzi_costo_calcolato_fotografa()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET statement_timeout TO '120s'
AS $function$
DECLARE m record; v_ora numeric; v_prima numeric; n integer := 0;
BEGIN
  FOR m IN
    SELECT x.id, x.company_id, c.ore_annue_previste
      FROM public.mezzi x
      LEFT JOIN public.mezzi_costo_orario c ON c.mezzo_id = x.id
     WHERE x.deleted_at IS NULL AND coalesce(x.possesso, '') NOT LIKE 'noleggio%'
       AND c.costo_orario_manuale IS NULL
  LOOP
    v_ora := private.mezzo_costo_calcolato(m.id, m.ore_annue_previste);
    CONTINUE WHEN v_ora IS NULL;
    -- Il costo che valeva fino a ieri: la fotografia precedente, o (la prima volta) questo stesso.
    SELECT s.costo_orario INTO v_prima FROM public.costi_orari_storico s
     WHERE s.tipo = 'mezzo' AND s.risorsa_id = m.id ORDER BY s.valido_dal DESC LIMIT 1;
    PERFORM private.costo_orario_registra(m.company_id, 'mezzo', m.id, coalesce(v_prima, v_ora), v_ora, 'calcolo mensile');
    n := n + 1;
  END LOOP;
  RETURN n;
END $function$;

REVOKE ALL ON FUNCTION private.mezzi_costo_calcolato_fotografa() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mezzi-costo-calcolato-mensile') THEN
    PERFORM cron.unschedule('mezzi-costo-calcolato-mensile');
  END IF;
  PERFORM cron.schedule('mezzi-costo-calcolato-mensile', '15 3 1 * *', $job$SELECT private.mezzi_costo_calcolato_fotografa();$job$);
END $$;
