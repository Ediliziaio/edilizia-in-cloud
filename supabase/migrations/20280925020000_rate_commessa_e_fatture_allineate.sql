-- Rate della commessa e fatture della fatturazione interna: un incasso solo,
-- visto da tutte e due le parti (25/09/2026).
--
-- Richiesta di Flo: «se segno pagata la fattura, in automatico viene pagato
-- l'incasso nella commessa; e viceversa». Fino a oggi:
--   · nessuna fattura interna (documenti_fiscali) era legata a una rata:
--     «Fattura» dalla commessa sceglieva la rata, costruiva la fattura e poi
--     ne buttava il riferimento (il legame esisteva solo per le fatture dei
--     provider esterni, order_installments.invoice_id);
--   · salvare la commessa cancellava e reinseriva tutte le rate
--     (order_rate_sostituisci): ogni legame di una rata — fattura, movimento
--     di banca, prima nota — spariva a ogni salvataggio.
--
-- La regola: per una rata legata a una fattura interna i soldi si registrano
-- sulla fattura (registra_incasso_atomico: movimento di cassa, prima nota,
-- scadenza, stato), e la rata la segue.
--   · rata segnata incassata → incasso sulla fattura per il residuo, alla
--     data della rata; se la fattura è ancora una bozza, all'emissione;
--   · fattura pagata (Segna pagata, registro incassi, banca) → rata incassata;
--     tolto l'incasso → rata di nuovo da incassare;
--   · rata tolta da incassata → si tolgono gli incassi che aveva registrato
--     lei; se la fattura è pagata con altri incassi, si rifiuta e si dice dove;
--   · una rata legata non riceve un secondo incasso in prima nota.
-- Una fattura emessa per la commessa si lega da sola alla rata con lo stesso
-- importo, solo se ce n'è una.
--
-- Al 25/09/2026 in produzione: 0 prime note su rate, 0 movimenti di banca su
-- rate, 0 incassi di fatture interne. Nessun dato da spostare.
--
-- Trovato provando: togliere un incasso di una fattura interna
-- (storna_incasso_atomico) lasciava la scadenza della fattura «pagata», e la
-- scadenza continuava a puntare alla riga di prima nota che se ne andava col
-- movimento. Ora lo storno riapre la scadenza per l'importo tolto.

SET LOCAL lock_timeout = '3s';

-- ── 1. Il legame ────────────────────────────────────────────────────────
ALTER TABLE public.order_installments
  ADD COLUMN IF NOT EXISTS documento_fiscale_id uuid
    REFERENCES public.documenti_fiscali(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_installments_documento_fiscale
  ON public.order_installments (documento_fiscale_id)
  WHERE documento_fiscale_id IS NOT NULL;

COMMENT ON COLUMN public.order_installments.documento_fiscale_id IS
  'Fattura della fatturazione interna che incassa questa rata: pagata l''una, pagata l''altra (trigger allinea_*).';

-- ── 2. Il metodo di incasso dal codice di pagamento ──────────────────────
-- Stessa regola di src/lib/fatturazione/incassi.ts (metodoIncassoDaCodice).
CREATE OR REPLACE FUNCTION public.metodo_incasso_da_codice(p_codice text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE upper(btrim(coalesce(p_codice, '')))
    WHEN 'MP01' THEN 'contanti'
    WHEN 'MP02' THEN 'assegno'
    WHEN 'MP03' THEN 'assegno'
    WHEN 'MP08' THEN 'carta'
    WHEN 'MP12' THEN 'riba'
    WHEN 'MP19' THEN 'sdd'
    WHEN 'MP20' THEN 'sdd'
    WHEN 'MP21' THEN 'sdd'
    ELSE 'bonifico'
  END;
$function$;
REVOKE ALL ON FUNCTION public.metodo_incasso_da_codice(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metodo_incasso_da_codice(text) TO authenticated, service_role;

-- ── 3. La rata incassata → l'incasso sulla fattura ───────────────────────
-- Anche per la bozza appena emessa (dal trigger della fattura). Interna.
CREATE OR REPLACE FUNCTION public.incassa_fattura_da_rata(p_rata_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  d record;
  v_residuo numeric;
BEGIN
  SELECT id, label, paid_date, documento_fiscale_id INTO r
    FROM public.order_installments WHERE id = p_rata_id;
  IF NOT FOUND OR r.documento_fiscale_id IS NULL THEN RETURN; END IF;

  SELECT id, company_id, numero, stato, totale_da_pagare, importo_pagato, metodo_pagamento_codice
    INTO d FROM public.documenti_fiscali
   WHERE id = r.documento_fiscale_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;

  -- Una bozza non si incassa (lo farà l'emissione); annullate e stornate mai.
  IF d.stato IN ('bozza', 'annullata', 'stornata') THEN RETURN; END IF;
  IF d.stato = 'in_invio' THEN
    RAISE EXCEPTION 'La fattura n. % sta partendo verso lo SDI: riprova tra qualche secondo.', d.numero
      USING ERRCODE = '55006';
  END IF;

  v_residuo := round(coalesce(d.totale_da_pagare, 0) - coalesce(d.importo_pagato, 0), 2);
  IF v_residuo <= 0 THEN RETURN; END IF;

  -- Lo stesso incasso non si conta due volte in prima nota.
  IF EXISTS (SELECT 1 FROM public.prima_nota_entries WHERE installment_id = r.id) THEN
    RAISE EXCEPTION 'La rata «%» ha già un incasso in prima nota: toglilo, e l''incasso lo registra la fattura n. %.',
      coalesce(r.label, 'rata'), d.numero
      USING ERRCODE = '23514';
  END IF;

  PERFORM public.registra_incasso_atomico(
    d.company_id, d.id, v_residuo,
    public.metodo_incasso_da_codice(d.metodo_pagamento_codice),
    coalesce(r.paid_date, (now() AT TIME ZONE 'Europe/Rome')::date),
    'Rata «' || coalesce(r.label, 'rata') || '» della commessa',
    '[RATA:' || r.id::text || ']'
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.incassa_fattura_da_rata(uuid) FROM PUBLIC, anon, authenticated;

-- ── 4. Trigger sulla rata ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.allinea_fattura_da_rata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d record;
  v_saldata boolean;
  v_legame_nuovo boolean := NEW.documento_fiscale_id IS DISTINCT FROM OLD.documento_fiscale_id;
  v_tag text := '[RATA:' || NEW.id::text || ']';
  v_mov uuid;
BEGIN
  IF NEW.documento_fiscale_id IS NULL THEN RETURN NEW; END IF;
  IF NOT v_legame_nuovo AND NEW.is_paid IS NOT DISTINCT FROM OLD.is_paid THEN RETURN NEW; END IF;

  SELECT id, company_id, numero, stato, totale_da_pagare, importo_pagato
    INTO d FROM public.documenti_fiscali
   WHERE id = NEW.documento_fiscale_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_saldata := d.stato = 'pagata'
    OR (coalesce(d.totale_da_pagare, 0) > 0 AND coalesce(d.importo_pagato, 0) >= d.totale_da_pagare - 0.01);

  IF NEW.is_paid AND NOT v_saldata THEN
    -- Rata incassata (o legata già incassata): l'incasso va sulla fattura.
    PERFORM public.incassa_fattura_da_rata(NEW.id);

  ELSIF NOT NEW.is_paid AND v_saldata THEN
    IF v_legame_nuovo THEN
      -- Legata ora a una fattura già pagata: la rata risulta incassata.
      UPDATE public.order_installments
         SET is_paid = true,
             paid_date = coalesce(
               (SELECT max(m.data_movimento) FROM public.movimenti_cassa_native m
                 WHERE m.documento_id = d.id AND m.tipo = 'incasso'),
               (now() AT TIME ZONE 'Europe/Rome')::date)
       WHERE id = NEW.id;
    ELSIF OLD.is_paid THEN
      -- Tolta da incassata: via gli incassi che aveva registrato lei. Se la
      -- fattura è pagata con altri incassi, qui non si decide niente.
      IF NOT EXISTS (SELECT 1 FROM public.movimenti_cassa_native m
                      WHERE m.documento_id = d.id AND m.tipo = 'incasso' AND m.note LIKE '%' || v_tag || '%') THEN
        RAISE EXCEPTION 'La rata «%» è incassata con la fattura n. %: per segnarla da incassare togli l''incasso dal registro incassi della fattura.',
          coalesce(NEW.label, 'rata'), d.numero
          USING ERRCODE = '23514';
      END IF;
      FOR v_mov IN SELECT m.id FROM public.movimenti_cassa_native m
                    WHERE m.documento_id = d.id AND m.tipo = 'incasso' AND m.note LIKE '%' || v_tag || '%' LOOP
        PERFORM public.storna_incasso_atomico(d.company_id, v_mov);
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.allinea_fattura_da_rata() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_allinea_fattura_da_rata ON public.order_installments;
CREATE TRIGGER trg_allinea_fattura_da_rata
  AFTER UPDATE OF is_paid, documento_fiscale_id ON public.order_installments
  FOR EACH ROW EXECUTE FUNCTION public.allinea_fattura_da_rata();

-- ── 5. Trigger sulla fattura ─────────────────────────────────────────────
-- Il nome viene dopo trg_scadenza_da_documento_fiscale: all'emissione la
-- scadenza della fattura deve esistere prima che un incasso la chiuda.
CREATE OR REPLACE FUNCTION public.allinea_rata_da_fattura()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_saldata boolean;
  v_era_saldata boolean;
  v_emessa_ora boolean := OLD.stato = 'bozza' AND NEW.stato NOT IN ('bozza', 'annullata');
  v_quante integer;
  v_candidata uuid;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  v_saldata := NEW.stato = 'pagata'
    OR (coalesce(NEW.totale_da_pagare, 0) > 0 AND coalesce(NEW.importo_pagato, 0) >= NEW.totale_da_pagare - 0.01);
  v_era_saldata := OLD.stato = 'pagata'
    OR (coalesce(OLD.totale_da_pagare, 0) > 0 AND coalesce(OLD.importo_pagato, 0) >= OLD.totale_da_pagare - 0.01);

  -- Emessa per una commessa ma senza rata: si lega alla rata con lo stesso
  -- importo, se è una sola (a pari merito non si indovina).
  IF v_emessa_ora AND NEW.ordine_id IS NOT NULL
     AND NEW.tipo IN ('fattura', 'fattura_pa', 'parcella', 'fattura_accompagnatoria',
                      'acconto_fattura', 'acconto_parcella', 'fattura_differita_b', 'fattura_riepilogativa')
     AND NOT EXISTS (SELECT 1 FROM public.order_installments WHERE documento_fiscale_id = NEW.id) THEN
    SELECT count(*), (array_agg(oi.id))[1] INTO v_quante, v_candidata
      FROM public.order_installments oi
     WHERE oi.order_id = NEW.ordine_id
       AND oi.documento_fiscale_id IS NULL
       AND oi.invoice_id IS NULL
       AND oi.type <> 'financing'
       AND (abs(oi.amount - coalesce(NEW.totale_documento, 0)) <= 0.01
            OR abs(oi.amount - coalesce(NEW.totale_da_pagare, 0)) <= 0.01);
    IF v_quante = 1 THEN
      -- Il trigger della rata allinea i due stati.
      UPDATE public.order_installments SET documento_fiscale_id = NEW.id WHERE id = v_candidata;
      RETURN NEW;
    END IF;
  END IF;

  SELECT id, is_paid INTO r FROM public.order_installments WHERE documento_fiscale_id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_saldata AND NOT r.is_paid THEN
    UPDATE public.order_installments
       SET is_paid = true,
           paid_date = coalesce(
             (SELECT max(m.data_movimento) FROM public.movimenti_cassa_native m
               WHERE m.documento_id = NEW.id AND m.tipo = 'incasso'),
             (now() AT TIME ZONE 'Europe/Rome')::date)
     WHERE id = r.id AND is_paid = false;
  ELSIF NOT v_saldata AND v_era_saldata AND r.is_paid THEN
    UPDATE public.order_installments SET is_paid = false, paid_date = NULL
     WHERE id = r.id AND is_paid = true;
  ELSIF v_emessa_ora AND r.is_paid AND NOT v_saldata THEN
    -- Incassata prima che la fattura esistesse: l'incasso va sulla fattura ora.
    PERFORM public.incassa_fattura_da_rata(r.id);
  END IF;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.allinea_rata_da_fattura() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_rata_da_fattura ON public.documenti_fiscali;
CREATE TRIGGER trg_sync_rata_da_fattura
  AFTER UPDATE OF stato, importo_pagato ON public.documenti_fiscali
  FOR EACH ROW EXECUTE FUNCTION public.allinea_rata_da_fattura();

-- ── 6. Nessun secondo incasso in prima nota per una rata legata ──────────
CREATE OR REPLACE FUNCTION public.prima_nota_rata_con_fattura()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_numero text;
BEGIN
  IF NEW.installment_id IS NULL THEN RETURN NEW; END IF;
  SELECT d.numero INTO v_numero
    FROM public.order_installments oi
    JOIN public.documenti_fiscali d ON d.id = oi.documento_fiscale_id
   WHERE oi.id = NEW.installment_id;
  IF FOUND THEN
    RAISE EXCEPTION 'Questa rata si incassa con la fattura n. %: la prima nota la scrive l''incasso della fattura.', v_numero
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.prima_nota_rata_con_fattura() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prima_nota_rata_con_fattura ON public.prima_nota_entries;
CREATE TRIGGER trg_prima_nota_rata_con_fattura
  BEFORE INSERT OR UPDATE OF installment_id ON public.prima_nota_entries
  FOR EACH ROW EXECUTE FUNCTION public.prima_nota_rata_con_fattura();

-- ── 7. Legare e slegare a mano ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.collega_rata_fattura(p_rata_id uuid, p_documento_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  d record;
BEGIN
  SELECT oi.id, oi.order_id, oi.label, oi.documento_fiscale_id, o.company_id INTO r
    FROM public.order_installments oi JOIN public.orders o ON o.id = oi.order_id
   WHERE oi.id = p_rata_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rata non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF public.user_can_access_company(r.company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT id, company_id, ordine_id, numero, tipo INTO d
    FROM public.documenti_fiscali
   WHERE id = p_documento_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fattura non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF d.company_id <> r.company_id THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF d.tipo NOT IN ('fattura', 'fattura_pa', 'parcella', 'fattura_accompagnatoria',
                    'acconto_fattura', 'acconto_parcella', 'fattura_differita_b', 'fattura_riepilogativa') THEN
    RAISE EXCEPTION 'A una rata si collega una fattura, non questo documento.' USING ERRCODE = '22023';
  END IF;
  IF d.ordine_id IS NOT NULL AND d.ordine_id <> r.order_id THEN
    RAISE EXCEPTION 'La fattura n. % è di un''altra commessa.', d.numero USING ERRCODE = '22023';
  END IF;

  IF r.documento_fiscale_id = p_documento_id THEN RETURN; END IF;
  IF r.documento_fiscale_id IS NOT NULL THEN
    RAISE EXCEPTION 'La rata «%» è già collegata a un''altra fattura: scollegala prima.', coalesce(r.label, 'rata')
      USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.order_installments WHERE documento_fiscale_id = p_documento_id) THEN
    RAISE EXCEPTION 'La fattura n. % è già collegata a un''altra rata.', d.numero USING ERRCODE = '23505';
  END IF;

  IF d.ordine_id IS NULL THEN
    UPDATE public.documenti_fiscali SET ordine_id = r.order_id WHERE id = d.id;
  END IF;
  -- Il trigger della rata allinea incassi e stati.
  UPDATE public.order_installments SET documento_fiscale_id = d.id WHERE id = r.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.collega_rata_fattura(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collega_rata_fattura(uuid, uuid) TO authenticated, service_role;

-- Slegare non tocca gli incassi: restano sulla fattura, e la rata com'è.
CREATE OR REPLACE FUNCTION public.scollega_rata_fattura(p_rata_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
BEGIN
  SELECT o.company_id INTO v_company
    FROM public.order_installments oi JOIN public.orders o ON o.id = oi.order_id
   WHERE oi.id = p_rata_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Rata non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF public.user_can_access_company(v_company) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  UPDATE public.order_installments SET documento_fiscale_id = NULL WHERE id = p_rata_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.scollega_rata_fattura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scollega_rata_fattura(uuid) TO authenticated, service_role;

-- ── 8. Togliere un incasso riapre la scadenza ─────────────────────────────
-- Come in 20280924235959 (lo stato torna quello dell'invio allo SDI), più la
-- scadenza della fattura: registra_incasso_atomico la chiude, lo storno la
-- riapre per lo stesso importo, e la stacca dalla riga di prima nota che se ne
-- va col movimento.
CREATE OR REPLACE FUNCTION public.storna_incasso_atomico(p_company_id uuid, p_movimento_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_importo numeric; v_documento_id uuid; v_totale numeric; v_pagato numeric;
  v_nuovo_pagato numeric; v_nuovo_stato text; v_sdi_stato text; v_sdi_id text;
BEGIN
  IF public.get_my_company_id() IS DISTINCT FROM p_company_id THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Accesso negato: non autorizzato per questa azienda';
    END IF;
  END IF;

  SELECT importo, documento_id INTO v_importo, v_documento_id
    FROM movimenti_cassa_native
   WHERE id = p_movimento_id AND company_id = p_company_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non trovato o accesso negato'; END IF;

  IF v_documento_id IS NOT NULL THEN
    UPDATE scadenze
       SET paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_importo),
           status = CASE WHEN COALESCE(paid_amount, 0) - v_importo > 0.01 THEN 'parziale' ELSE 'da_pagare' END,
           paid_date = CASE WHEN COALESCE(paid_amount, 0) - v_importo > 0.01 THEN paid_date ELSE NULL END,
           prima_nota_entry_id = CASE
             WHEN prima_nota_entry_id IN (SELECT pn.id FROM prima_nota_entries pn WHERE pn.movimento_id = p_movimento_id)
             THEN NULL ELSE prima_nota_entry_id END,
           updated_at = now()
     WHERE company_id = p_company_id
       AND notes LIKE '%[DOC:' || v_documento_id::text || ']%'
       AND status <> 'annullata';
  END IF;

  DELETE FROM movimenti_cassa_native WHERE id = p_movimento_id AND company_id = p_company_id;

  IF v_documento_id IS NOT NULL THEN
    SELECT totale_da_pagare, importo_pagato, sdi_stato, sdi_id_trasmissione
      INTO v_totale, v_pagato, v_sdi_stato, v_sdi_id
      FROM documenti_fiscali WHERE id = v_documento_id AND company_id = p_company_id FOR UPDATE;
    IF FOUND THEN
      v_nuovo_pagato := GREATEST(0, v_pagato - v_importo);
      v_nuovo_stato := CASE
        WHEN v_nuovo_pagato >= v_totale THEN 'pagata'
        WHEN v_nuovo_pagato > 0 THEN 'parzialmente_pagata'
        ELSE public.stato_documento_da_sdi(v_sdi_stato, v_sdi_id) END;
      UPDATE documenti_fiscali SET importo_pagato = v_nuovo_pagato, stato = v_nuovo_stato,
        pagato_at = CASE WHEN v_nuovo_stato = 'pagata' THEN pagato_at ELSE NULL END, updated_at = now()
      WHERE id = v_documento_id;
    END IF;
  END IF;
END; $function$;

-- ── 9. Salvare la commessa non cancella più le rate ──────────────────────
-- Le rate che arrivano col loro id si aggiornano al loro posto: i legami
-- (fattura, movimento di banca, prima nota) restano. Chi manda le rate senza
-- id (app vecchia in cache) fa come prima, ma i legami alle fatture tornano
-- sulla rata con la stessa posizione e lo stesso importo.
CREATE OR REPLACE FUNCTION public.order_rate_sostituisci(p_order_id uuid, p_rate jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company  uuid;
  v_quante   integer;
  v_vecchie  jsonb;
  v_con_id   boolean;
BEGIN
  SELECT o.company_id INTO v_company FROM public.orders o WHERE o.id = p_order_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'commessa non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF public.user_can_access_company(v_company) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  PERFORM public.assert_permesso('can_edit_orders', 'modificare lo scadenzario di una commessa');

  IF p_rate IS NULL OR jsonb_typeof(p_rate) <> 'array' THEN
    RAISE EXCEPTION 'le rate devono essere un elenco' USING ERRCODE = '22023';
  END IF;

  v_con_id := EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rate) r
     WHERE nullif(r->>'id', '') IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.order_installments oi
                    WHERE oi.id = (r->>'id')::uuid AND oi.order_id = p_order_id)
  );

  IF v_con_id THEN
    -- Via le rate che non ci sono più.
    DELETE FROM public.order_installments oi
     WHERE oi.order_id = p_order_id
       AND oi.id NOT IN (
         SELECT (r->>'id')::uuid FROM jsonb_array_elements(p_rate) r
          WHERE nullif(r->>'id', '') IS NOT NULL);

    -- Quelle che restano, al loro posto: legami compresi. Una rata legata a
    -- una fattura già pagata resta incassata anche se il modulo (aperto
    -- prima dell'incasso) la manda «da incassare»: la segue la fattura, e
    -- l'incasso si toglie dal registro incassi, non salvando la commessa.
    UPDATE public.order_installments oi SET
      position          = coalesce((t.r->>'position')::integer, t.ord::integer),
      label             = coalesce(nullif(btrim(t.r->>'label'), ''), 'Rata ' || t.ord),
      type              = coalesce(nullif(t.r->>'type', ''), 'deposit'),
      amount            = coalesce((t.r->>'amount')::numeric, 0),
      is_paid           = CASE WHEN t.fattura_pagata THEN true
                               ELSE coalesce((t.r->>'is_paid')::boolean, false) END,
      paid_date         = CASE WHEN t.fattura_pagata THEN oi.paid_date
                               ELSE nullif(t.r->>'paid_date', '')::date END,
      expected_date     = nullif(t.r->>'expected_date', '')::date,
      trigger_evento    = coalesce(nullif(t.r->>'trigger_evento', ''), 'data_fissa'),
      trigger_status_id = nullif(t.r->>'trigger_status_id', '')::uuid,
      giorni_preavviso  = least(greatest(coalesce((t.r->>'giorni_preavviso')::integer, 7), 0), 90),
      trigger_numero    = nullif(t.r->>'trigger_numero', '')::integer,
      invoice_id        = CASE WHEN t.r ? 'invoice_id' THEN nullif(t.r->>'invoice_id', '')::uuid ELSE oi.invoice_id END
    FROM (
      SELECT e.r, e.ord,
             EXISTS (SELECT 1 FROM public.order_installments x
                       JOIN public.documenti_fiscali d ON d.id = x.documento_fiscale_id
                      WHERE x.id = nullif(e.r->>'id', '')::uuid
                        AND x.is_paid
                        AND (d.stato = 'pagata'
                             OR (coalesce(d.totale_da_pagare, 0) > 0
                                 AND coalesce(d.importo_pagato, 0) >= d.totale_da_pagare - 0.01))) AS fattura_pagata
        FROM jsonb_array_elements(p_rate) WITH ORDINALITY AS e(r, ord)
       WHERE nullif(e.r->>'id', '') IS NOT NULL
    ) AS t
    WHERE oi.id = (t.r->>'id')::uuid
      AND oi.order_id = p_order_id;

    -- E le nuove.
    INSERT INTO public.order_installments (
      order_id, position, label, type, amount, is_paid, paid_date,
      expected_date, trigger_evento, trigger_status_id, giorni_preavviso,
      trigger_numero, invoice_id
    )
    SELECT
      p_order_id,
      coalesce((r->>'position')::integer, ord::integer),
      coalesce(nullif(btrim(r->>'label'), ''), 'Rata ' || ord),
      coalesce(nullif(r->>'type', ''), 'deposit'),
      coalesce((r->>'amount')::numeric, 0),
      coalesce((r->>'is_paid')::boolean, false),
      nullif(r->>'paid_date', '')::date,
      nullif(r->>'expected_date', '')::date,
      coalesce(nullif(r->>'trigger_evento', ''), 'data_fissa'),
      nullif(r->>'trigger_status_id', '')::uuid,
      least(greatest(coalesce((r->>'giorni_preavviso')::integer, 7), 0), 90),
      nullif(r->>'trigger_numero', '')::integer,
      nullif(r->>'invoice_id', '')::uuid
    FROM jsonb_array_elements(p_rate) WITH ORDINALITY AS t(r, ord)
    WHERE nullif(r->>'id', '') IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.order_installments oi
                       WHERE oi.id = (r->>'id')::uuid AND oi.order_id = p_order_id);

    SELECT count(*) INTO v_quante FROM public.order_installments WHERE order_id = p_order_id;
    RETURN v_quante;
  END IF;

  -- Senza id: come prima, ma i legami alle fatture si ricordano.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'position', oi.position, 'amount', oi.amount,
           'documento_fiscale_id', oi.documento_fiscale_id, 'invoice_id', oi.invoice_id)), '[]'::jsonb)
    INTO v_vecchie
    FROM public.order_installments oi
   WHERE oi.order_id = p_order_id
     AND (oi.documento_fiscale_id IS NOT NULL OR oi.invoice_id IS NOT NULL);

  DELETE FROM public.order_installments WHERE order_id = p_order_id;

  INSERT INTO public.order_installments (
    order_id, position, label, type, amount, is_paid, paid_date,
    expected_date, trigger_evento, trigger_status_id, giorni_preavviso,
    trigger_numero, invoice_id
  )
  SELECT
    p_order_id,
    coalesce((r->>'position')::integer, ord::integer),
    coalesce(nullif(btrim(r->>'label'), ''), 'Rata ' || ord),
    -- deposit / balance / financing: i soli ammessi dal vincolo.
    coalesce(nullif(r->>'type', ''), 'deposit'),
    coalesce((r->>'amount')::numeric, 0),
    coalesce((r->>'is_paid')::boolean, false),
    nullif(r->>'paid_date', '')::date,
    nullif(r->>'expected_date', '')::date,
    coalesce(nullif(r->>'trigger_evento', ''), 'data_fissa'),
    nullif(r->>'trigger_status_id', '')::uuid,
    -- 7 giorni, come dichiara la colonna: prima era 0, cioe' nessun preavviso.
    least(greatest(coalesce((r->>'giorni_preavviso')::integer, 7), 0), 90),
    nullif(r->>'trigger_numero', '')::integer,
    nullif(r->>'invoice_id', '')::uuid
  FROM jsonb_array_elements(p_rate) WITH ORDINALITY AS t(r, ord);

  GET DIAGNOSTICS v_quante = ROW_COUNT;

  -- I legami tornano sulla rata con la stessa posizione e lo stesso importo.
  UPDATE public.order_installments oi SET
    documento_fiscale_id = nullif(v->>'documento_fiscale_id', '')::uuid,
    invoice_id = coalesce(oi.invoice_id, nullif(v->>'invoice_id', '')::uuid)
  FROM jsonb_array_elements(v_vecchie) v
  WHERE oi.order_id = p_order_id
    AND oi.position = (v->>'position')::integer
    AND abs(oi.amount - (v->>'amount')::numeric) <= 0.01;

  RETURN v_quante;
END;
$function$;
