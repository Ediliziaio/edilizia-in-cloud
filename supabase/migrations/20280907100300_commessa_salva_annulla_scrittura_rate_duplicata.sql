-- Applicata in produzione il 7 settembre 2026 via MCP.
--
-- Annulla la migrazione precedente e corregge il difetto vero trovato per
-- strada.
--
-- `commessa_salva` scriveva gia' le rate: delega a `order_rate_sostituisci`,
-- che cancella e reinserisce l'elenco completo con permessi, etichette, campi
-- trigger e perfino `invoice_id` — che il salvataggio dalla schermata invece
-- perde. Il blocco aggiunto poche ore prima faceva lo stesso lavoro qualche
-- istruzione piu' su, e veniva subito sovrascritto.
--
-- Qui si ripristina il blocco originale (calcolo delle colonne piatte in
-- `v_leg`) e si corregge l'unico difetto reale: una rata senza
-- `giorni_preavviso` nasceva con 0 giorni invece dei 7 che la colonna dichiara
-- come predefinito. Zero significa "avvisa il giorno stesso della scadenza",
-- cioe' troppo tardi per fare qualcosa. Il vincolo ammette 0..90, quindi uno
-- zero scritto apposta resta legittimo: cambia solo il caso in cui il campo
-- non venga passato.
--
-- Il ripristino di `commessa_salva` e' stato eseguito con una sostituzione
-- mirata dentro la definizione viva (vedi la cronologia della sessione): non
-- e' riproducibile qui senza incollare 17.000 caratteri, e la funzione in
-- produzione e' tornata esattamente alla lunghezza originale.
create or replace function public.order_rate_sostituisci(p_order_id uuid, p_rate jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_company uuid;
  v_quante  integer;
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
  RETURN v_quante;
END;
$function$;
