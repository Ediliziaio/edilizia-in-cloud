-- Annulla costo (piano punti aperti 16/11/2026, §3; deciso dal titolare il 16/11).
--
-- Un costo si annulla, non si cancella:
--   * resta nella tabella con data, persona e motivo (annullato_il / _da / _motivo);
--   * esce da CdG, commesse, cassa prevista e scadenzario: l'importo diventa 0 e quello vero
--     resta in annullato_dati, così ogni somma che legge company_costs (sono più di ottanta tra
--     viste, funzioni e pagine) lo esclude senza doverle toccare una per una;
--   * le scadenze non pagate passano ad «annullata», le rate fornitore aperte a «stornata»;
--   * se qualcosa è già pagato (costo, scadenza, rata, prima nota, banca) l'annullamento si ferma
--     e dice perché: prima si annulla il pagamento («Storna pagamento», che scrive la riga di
--     storno in prima nota, o la Tesoreria se c'è un bonifico). La prima nota non si cancella mai;
--   * si ripristina con costo_ripristina, che rimette importo, scadenze e rate com'erano.
-- Mentre è annullato il costo non cambia importo e non si paga: lo impedisce un trigger.

ALTER TABLE public.company_costs
  ADD COLUMN IF NOT EXISTS annullato_il timestamptz,
  ADD COLUMN IF NOT EXISTS annullato_da uuid,
  ADD COLUMN IF NOT EXISTS annullato_motivo text,
  ADD COLUMN IF NOT EXISTS annullato_dati jsonb;

COMMENT ON COLUMN public.company_costs.annullato_il IS
  'Costo annullato (non cancellato): da quando. Importo a 0, valori veri in annullato_dati. costo_annulla / costo_ripristina.';
COMMENT ON COLUMN public.company_costs.annullato_dati IS
  'Valori prima dell''annullamento: amount, quota_magazzino, quota_magazzino_righe, recurrence_auto, scadenze annullate, rate stornate con lo stato di prima.';

CREATE INDEX IF NOT EXISTS company_costs_annullati_idx
  ON public.company_costs (company_id) WHERE annullato_il IS NOT NULL;

-- ── Cosa impedisce l'annullamento ────────────────────────────────────────────
-- Una riga per ostacolo: codice, testo leggibile e rimedio («storna_pagamento» quando il
-- pagamento è registrato solo in prima nota e «Storna pagamento» lo toglie con la riga di storno;
-- «tesoreria» quando c'è un bonifico collegato; «a_mano» negli altri casi).
CREATE OR REPLACE FUNCTION private.costo_ostacoli_annullo(p_costo uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  c public.company_costs; out jsonb := '[]'; v_pagato numeric; v_banca boolean; n int;
BEGIN
  SELECT * INTO c FROM public.company_costs WHERE id = p_costo;
  IF NOT FOUND THEN RETURN out; END IF;

  -- Pagato secondo la prima nota (stessa formula di spesa_pagamento_sincronizza).
  SELECT coalesce(sum(CASE WHEN p.direction = 'uscita' THEN p.amount ELSE -p.amount END), 0)
    INTO v_pagato
    FROM public.prima_nota_entries p
   WHERE p.company_id = c.company_id
     AND (p.cost_id = c.id OR EXISTS (SELECT 1 FROM public.scadenze d WHERE d.id = p.scadenza_id AND d.cost_id = c.id AND d.company_id = c.company_id));

  v_banca := EXISTS (SELECT 1 FROM public.prima_nota_entries p
                      WHERE p.company_id = c.company_id AND p.cost_id = c.id
                        AND (p.bank_transaction_id IS NOT NULL OR p.sal_sub_id IS NOT NULL)
                        AND NOT EXISTS (SELECT 1 FROM public.prima_nota_entries r WHERE r.reversal_of = p.id))
          OR EXISTS (SELECT 1 FROM public.bank_transactions t WHERE t.company_id = c.company_id AND t.linked_cost_id = c.id)
          OR EXISTS (SELECT 1 FROM public.bank_reconciliations r JOIN public.scadenze s ON s.id = r.scadenza_id
                      WHERE s.cost_id = c.id AND s.company_id = c.company_id AND r.unmatched_at IS NULL);

  IF v_banca THEN
    out := out || jsonb_build_array(jsonb_build_object('codice', 'banca', 'rimedio', 'tesoreria',
      'testo', 'Un movimento della banca è collegato a questo costo: scollegalo prima dalla Tesoreria.'));
  END IF;
  IF v_pagato > 0.005 AND NOT v_banca THEN
    out := out || jsonb_build_array(jsonb_build_object('codice', 'pagamento', 'rimedio', 'storna_pagamento', 'importo', round(v_pagato, 2),
      'testo', format('Ci sono pagamenti registrati per %s €: prima storna il pagamento (resta in prima nota con la riga di storno).',
                      to_char(round(v_pagato, 2), 'FM999G999G990D00'))));
  ELSIF coalesce(c.is_paid, false) AND v_pagato <= 0.005 AND NOT v_banca THEN
    out := out || jsonb_build_array(jsonb_build_object('codice', 'pagato_senza_prima_nota', 'rimedio', 'a_mano',
      'testo', 'Il costo è segnato come pagato ma non ha un pagamento in prima nota: va controllato a mano prima di annullarlo.'));
  END IF;

  SELECT count(*) INTO n FROM public.scadenze s
   WHERE s.cost_id = c.id AND s.company_id = c.company_id AND s.status IN ('pagata', 'parziale');
  IF n > 0 AND v_pagato <= 0.005 AND NOT v_banca THEN
    out := out || jsonb_build_array(jsonb_build_object('codice', 'scadenza_pagata', 'rimedio', 'a_mano',
      'testo', format('%s scadenze risultano pagate: annulla prima il pagamento dallo scadenzario.', n)));
  END IF;

  SELECT count(*) INTO n FROM public.rate_fornitori r WHERE r.company_cost_id = c.id AND r.stato = 'pagata';
  IF n > 0 AND v_pagato <= 0.005 AND NOT v_banca THEN
    out := out || jsonb_build_array(jsonb_build_object('codice', 'rata_pagata', 'rimedio', 'a_mano',
      'testo', format('%s rate fornitore risultano pagate: riporta prima la rata a «da pagare».', n)));
  END IF;
  SELECT count(*) INTO n FROM public.rate_fornitori r WHERE r.company_cost_id = c.id AND r.stato IN ('avvisata', 'richiamata', 'insoluta');
  IF n > 0 THEN
    out := out || jsonb_build_array(jsonb_build_object('codice', 'riba_in_corso', 'rimedio', 'a_mano',
      'testo', format('%s rate sono già in mano alla banca (RiBa avvisata, richiamata o insoluta): chiudile prima con la banca.', n)));
  END IF;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION private.costo_ostacoli_annullo(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.costo_annullo_autorizza(p_costo uuid, p_company uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF coalesce(auth.jwt()->>'role', '') = 'service_role' THEN RETURN; END IF;
  IF auth.uid() IS NULL OR public.utente_sola_lettura(p_company) OR NOT public.puo_modificare_costo(p_costo) THEN
    RAISE EXCEPTION 'Non hai il permesso di annullare o ripristinare questo costo.' USING errcode = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION private.costo_annullo_autorizza(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ── Anteprima: cosa succederebbe ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.costo_annullo_anteprima(p_costo uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE c public.company_costs;
BEGIN
  SELECT * INTO c FROM public.company_costs WHERE id = p_costo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Costo non trovato.' USING errcode = 'P0002'; END IF;
  PERFORM private.costo_annullo_autorizza(c.id, c.company_id);
  RETURN jsonb_build_object(
    'annullato', c.annullato_il IS NOT NULL,
    'annullato_il', c.annullato_il,
    'annullato_motivo', c.annullato_motivo,
    'importo', CASE WHEN c.annullato_il IS NOT NULL THEN (c.annullato_dati->>'amount')::numeric ELSE c.amount END,
    'ostacoli', CASE WHEN c.annullato_il IS NULL THEN private.costo_ostacoli_annullo(c.id) ELSE '[]'::jsonb END,
    'scadenze_da_annullare', (SELECT count(*) FROM public.scadenze s WHERE s.cost_id = c.id AND s.company_id = c.company_id
                               AND s.status = 'da_pagare' AND coalesce(s.paid_amount, 0) = 0),
    'rate_da_annullare', (SELECT count(*) FROM public.rate_fornitori r WHERE r.company_cost_id = c.id AND r.stato IN ('da_pagare', 'da_bloccare')));
END $$;
REVOKE ALL ON FUNCTION public.costo_annullo_anteprima(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.costo_annullo_anteprima(uuid) TO authenticated, service_role;

-- ── Annulla ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.costo_annulla(p_costo uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' SET lock_timeout TO '3s' AS $$
DECLARE
  c public.company_costs; v_ostacoli jsonb; v_scad uuid[]; v_rate jsonb;
BEGIN
  SELECT * INTO c FROM public.company_costs WHERE id = p_costo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Costo non trovato.' USING errcode = 'P0002'; END IF;
  PERFORM private.costo_annullo_autorizza(c.id, c.company_id);
  IF length(btrim(coalesce(p_motivo, ''))) < 3 THEN
    RAISE EXCEPTION 'Scrivi il motivo dell''annullamento.' USING errcode = '22023';
  END IF;

  -- Stesso lucchetto dei pagamenti dei costi: un pagamento e un annullamento in fila.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.company_id::text, 2810));
  SELECT * INTO c FROM public.company_costs WHERE id = p_costo FOR UPDATE;
  IF c.annullato_il IS NOT NULL THEN
    RAISE EXCEPTION 'Il costo è già annullato.' USING errcode = '23514';
  END IF;

  v_ostacoli := private.costo_ostacoli_annullo(c.id);
  IF jsonb_array_length(v_ostacoli) > 0 THEN
    RAISE EXCEPTION 'Il costo non si può annullare: %', (SELECT string_agg(x->>'testo', ' ') FROM jsonb_array_elements(v_ostacoli) x)
      USING errcode = '23514', hint = v_ostacoli::text;
  END IF;

  -- Scadenze non pagate: annullate (il trigger tes_reale_sparita rimette le previsioni che sostituivano).
  WITH u AS (
    UPDATE public.scadenze s SET status = 'annullata', updated_at = now()
     WHERE s.cost_id = c.id AND s.company_id = c.company_id AND s.status = 'da_pagare' AND coalesce(s.paid_amount, 0) = 0
     RETURNING s.id)
  SELECT coalesce(array_agg(id), '{}') INTO v_scad FROM u;

  -- Rate fornitore aperte: stornate, ricordando lo stato di prima.
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'stato', r.stato)), '[]') INTO v_rate
    FROM public.rate_fornitori r WHERE r.company_cost_id = c.id AND r.stato IN ('da_pagare', 'da_bloccare');
  IF jsonb_array_length(v_rate) > 0 THEN
    PERFORM set_config('rate_fornitori.da_storno', 'on', true);
    UPDATE public.rate_fornitori SET stato = 'stornata'
     WHERE id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(v_rate) x);
    PERFORM set_config('rate_fornitori.da_storno', 'off', true);
  END IF;

  -- Il trigger delle rate segna il costo «pagato» quando non resta una rata aperta: qui no.
  -- Con rate_fornitori.da_rata acceso il costo non rimanda lo stato alle rate.
  PERFORM set_config('rate_fornitori.da_rata', 'on', true);
  UPDATE public.company_costs
     SET annullato_dati = jsonb_build_object(
           'amount', c.amount,
           'quota_magazzino', c.quota_magazzino,
           'quota_magazzino_righe', c.quota_magazzino_righe,
           'recurrence_auto', c.recurrence_auto,
           'scadenze', to_jsonb(v_scad),
           'rate', v_rate),
         amount = 0,
         quota_magazzino = NULL,
         quota_magazzino_righe = NULL,
         recurrence_auto = false,
         is_paid = false,
         paid_date = NULL,
         annullato_il = now(),
         annullato_da = auth.uid(),
         annullato_motivo = btrim(p_motivo),
         updated_at = now()
   WHERE id = c.id;
  PERFORM set_config('rate_fornitori.da_rata', 'off', true);

  RETURN jsonb_build_object('costo', c.id, 'importo', c.amount,
    'scadenze_annullate', cardinality(v_scad), 'rate_annullate', jsonb_array_length(v_rate));
END $$;
REVOKE ALL ON FUNCTION public.costo_annulla(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.costo_annulla(uuid, text) TO authenticated, service_role;

-- ── Ripristina ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.costo_ripristina(p_costo uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' SET lock_timeout TO '3s' AS $$
DECLARE c public.company_costs; d jsonb; n_scad int := 0; n_rate int := 0;
BEGIN
  SELECT * INTO c FROM public.company_costs WHERE id = p_costo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Costo non trovato.' USING errcode = 'P0002'; END IF;
  PERFORM private.costo_annullo_autorizza(c.id, c.company_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.company_id::text, 2810));
  SELECT * INTO c FROM public.company_costs WHERE id = p_costo FOR UPDATE;
  IF c.annullato_il IS NULL THEN
    RAISE EXCEPTION 'Il costo non è annullato.' USING errcode = '23514';
  END IF;
  d := coalesce(c.annullato_dati, '{}');

  -- Prima il costo (così le rate, tornando aperte, lo trovano col suo importo).
  PERFORM set_config('rate_fornitori.da_rata', 'on', true);
  UPDATE public.company_costs
     SET amount = coalesce((d->>'amount')::numeric, amount),
         quota_magazzino = nullif(d->>'quota_magazzino', '')::numeric,
         quota_magazzino_righe = CASE WHEN jsonb_typeof(d->'quota_magazzino_righe') IN ('array', 'object') THEN d->'quota_magazzino_righe' END,
         recurrence_auto = coalesce((d->>'recurrence_auto')::boolean, recurrence_auto),
         annullato_il = NULL, annullato_da = NULL, annullato_motivo = NULL, annullato_dati = NULL,
         updated_at = now()
   WHERE id = c.id;
  PERFORM set_config('rate_fornitori.da_rata', 'off', true);

  -- Le scadenze annullate da qui e rimaste annullate tornano da pagare.
  WITH u AS (
    UPDATE public.scadenze s SET status = 'da_pagare', updated_at = now()
     WHERE s.company_id = c.company_id AND s.cost_id = c.id AND s.status = 'annullata'
       AND s.id IN (SELECT (x #>> '{}')::uuid FROM jsonb_array_elements(coalesce(d->'scadenze', '[]')) x)
     RETURNING 1)
  SELECT count(*) INTO n_scad FROM u;

  -- Le rate stornate da qui tornano allo stato di prima (il trigger ricalcola il pagato del costo).
  IF jsonb_array_length(coalesce(d->'rate', '[]')) > 0 THEN
    PERFORM set_config('rate_fornitori.da_storno', 'on', true);
    WITH u AS (
      UPDATE public.rate_fornitori r SET stato = x.stato
        FROM (SELECT (e->>'id')::uuid id, e->>'stato' stato FROM jsonb_array_elements(d->'rate') e) x
       WHERE r.id = x.id AND r.company_cost_id = c.id AND r.stato = 'stornata'
       RETURNING 1)
    SELECT count(*) INTO n_rate FROM u;
    PERFORM set_config('rate_fornitori.da_storno', 'off', true);
  END IF;

  RETURN jsonb_build_object('costo', c.id, 'importo', d->>'amount', 'scadenze_riaperte', n_scad, 'rate_riaperte', n_rate);
END $$;
REVOKE ALL ON FUNCTION public.costo_ripristina(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.costo_ripristina(uuid) TO authenticated, service_role;

-- ── Un costo annullato non cambia importo e non si paga ──────────────────────
CREATE OR REPLACE FUNCTION private.costo_annullato_fermo()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF old.annullato_il IS NOT NULL AND new.annullato_il IS NOT NULL
     AND (new.amount IS DISTINCT FROM old.amount
          OR (coalesce(new.is_paid, false) AND NOT coalesce(old.is_paid, false))
          OR new.quota_magazzino IS DISTINCT FROM old.quota_magazzino) THEN
    RAISE EXCEPTION 'Il costo è annullato: ripristinalo prima di cambiarne l''importo o di pagarlo.' USING errcode = '23514';
  END IF;
  -- I campi dell'annullamento si scrivono solo da costo_annulla / costo_ripristina (insieme alla data).
  IF new.annullato_il IS NOT DISTINCT FROM old.annullato_il
     AND (new.annullato_dati IS DISTINCT FROM old.annullato_dati OR new.annullato_motivo IS DISTINCT FROM old.annullato_motivo
          OR new.annullato_da IS DISTINCT FROM old.annullato_da) THEN
    RAISE EXCEPTION 'L''annullamento di un costo si cambia solo con «Annulla costo» o «Ripristina».' USING errcode = '23514';
  END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION private.costo_annullato_fermo() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS costo_annullato_fermo ON public.company_costs;
CREATE TRIGGER costo_annullato_fermo BEFORE UPDATE ON public.company_costs
  FOR EACH ROW EXECUTE FUNCTION private.costo_annullato_fermo();

-- Un costo non nasce annullato: i campi si scrivono solo con costo_annulla.
CREATE OR REPLACE FUNCTION private.costo_non_nasce_annullato()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  new.annullato_il := NULL; new.annullato_da := NULL; new.annullato_motivo := NULL; new.annullato_dati := NULL;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION private.costo_non_nasce_annullato() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS costo_non_nasce_annullato ON public.company_costs;
CREATE TRIGGER costo_non_nasce_annullato BEFORE INSERT ON public.company_costs
  FOR EACH ROW EXECUTE FUNCTION private.costo_non_nasce_annullato();
