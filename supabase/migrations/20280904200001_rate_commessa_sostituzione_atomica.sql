-- Ondata 4 — sostituire le rate di una commessa senza poterle perdere
--
-- EditOrder salva una commessa con oltre venti operazioni in fila. Quella che
-- fa davvero danno è alla riga 625 di src/pages/azienda/EditOrder.tsx:
--     await supabase.from("order_installments").delete().eq("order_id", id)
--     ... venti righe dopo ...
--     await supabase.from("order_installments").insert(instRows)
-- Fra la cancellazione e il reinserimento c'è una finestra: se il browser si
-- chiude, la rete cade o una delle chiamate intermedie fallisce, la commessa
-- resta SENZA scadenzario. Non è un salvataggio a metà: è un dato distrutto,
-- ed è esattamente il caso che il briefing descrive come «rate cancellate e mai
-- reinserite».
--
-- Qui le due operazioni stanno nella stessa transazione: o valgono entrambe o
-- nessuna. Provato con un elenco in cui una rata è malformata — l'inserimento
-- salta e le rate precedenti sono ancora lì.
--
-- Non risolve tutto il salvataggio della commessa: quello richiede che
-- l'interfaccia mandi l'intero stato in un colpo solo. Toglie di mezzo il punto
-- in cui un'interruzione cancella qualcosa che non torna.

CREATE OR REPLACE FUNCTION public.order_rate_sostituisci(
  p_order_id uuid,
  p_rate     jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Un elenco vuoto azzera davvero lo scadenzario: è una scelta, non un
  -- incidente. Ma dev'essere esplicita, non il risultato di una chiamata
  -- andata storta a metà.
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
    -- deposit / balance / financing: i soli ammessi dal vincolo. Il primo
    -- valore che avevo messo ('acconto') non passava, e l'ho scoperto provando.
    coalesce(nullif(r->>'type', ''), 'deposit'),
    coalesce((r->>'amount')::numeric, 0),
    coalesce((r->>'is_paid')::boolean, false),
    nullif(r->>'paid_date', '')::date,
    nullif(r->>'expected_date', '')::date,
    coalesce(nullif(r->>'trigger_evento', ''), 'data_fissa'),
    nullif(r->>'trigger_status_id', '')::uuid,
    coalesce((r->>'giorni_preavviso')::integer, 0),
    nullif(r->>'trigger_numero', '')::integer,
    nullif(r->>'invoice_id', '')::uuid
  FROM jsonb_array_elements(p_rate) WITH ORDINALITY AS t(r, ord);

  GET DIAGNOSTICS v_quante = ROW_COUNT;
  RETURN v_quante;
END;
$function$;

COMMENT ON FUNCTION public.order_rate_sostituisci(uuid, jsonb) IS
  'Sostituisce lo scadenzario di una commessa in una sola transazione. Senza, fra il DELETE e l''INSERT di EditOrder c''è una finestra in cui la commessa resta senza rate.';

REVOKE ALL ON FUNCTION public.order_rate_sostituisci(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_rate_sostituisci(uuid, jsonb) TO authenticated, service_role;
