-- Dalla commessa si caricano e si collegano le fatture dei fornitori.
-- (Richiesta Dimora Torino: «in commessa si devono poter caricare le fatture».)
--
-- Una fattura ricevuta diventa costo di una commessa in due modi: attraverso
-- l'ordine d'acquisto (purchase_order_id → contabilizza_fattura_ricevuta), oppure
-- col costo che la contabilizzazione crea, portato sulla commessa. Il secondo
-- c'era solo per WhatsApp (fattura_assegna_commessa, service role). Questa è la
-- stessa cosa per il browser, con le regole delle policy sui costi:
--   · permesso sui costi nell'azienda della fattura e utente non in sola lettura;
--   · commessa della stessa azienda, non cancellata;
--   · fattura sull'ordine d'acquisto (o divisa tra più ordini): si gestisce
--     dall'ordine, qui no — il margine la prende già da lì;
--   · fattura ripartita su più commesse: si cambia da Economia → Costi;
--   · fattura rifiutata: non è un costo.
-- Se la fattura non ha ancora un costo, la contabilizza (contabilizza_fattura_ricevuta).

CREATE OR REPLACE FUNCTION public.commessa_collega_fattura_ricevuta(p_fattura_id uuid, p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET lock_timeout TO '3s'
AS $function$
DECLARE
  f        record;
  v_costo  record;
  v_cost_id uuid;
  v_esito  text := 'collegata';
BEGIN
  SELECT id, company_id, stato, purchase_order_id, company_cost_id, numero_fattura
    INTO f
    FROM public.fatture_ricevute
   WHERE id = p_fattura_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fattura non trovata.' USING errcode = 'P0002';
  END IF;

  IF NOT (f.company_id = ANY (public.aziende_con_permesso('can_view_costs')))
     OR public.utente_sola_lettura(f.company_id) THEN
    RAISE EXCEPTION 'Il tuo ruolo non permette di registrare i costi delle commesse.' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orders o
                  WHERE o.id = p_order_id AND o.company_id = f.company_id AND o.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Questa commessa non è della stessa azienda della fattura.' USING errcode = '42501';
  END IF;

  IF f.stato = 'rifiutata' THEN
    RAISE EXCEPTION 'La fattura % è rifiutata: non è un costo.', coalesce(f.numero_fattura, '') USING errcode = 'P0001';
  END IF;

  IF f.purchase_order_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.fattura_ricevuta_ordini q WHERE q.fattura_id = f.id) THEN
    RAISE EXCEPTION 'La fattura è collegata a un ordine d''acquisto: la commessa la prende già da lì.' USING errcode = 'P0001';
  END IF;

  v_cost_id := f.company_cost_id;
  IF v_cost_id IS NULL THEN
    v_cost_id := (public.contabilizza_fattura_ricevuta(f.id) ->> 'company_cost_id')::uuid;
    v_esito := 'contabilizzata_e_collegata';
  END IF;

  SELECT id, order_id, allocations INTO v_costo
    FROM public.company_costs
   WHERE id = v_cost_id AND company_id = f.company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Il costo di questa fattura non si trova: aprila dalle fatture ricevute.' USING errcode = 'P0002';
  END IF;

  IF jsonb_typeof(v_costo.allocations) = 'array' AND (jsonb_array_length(v_costo.allocations) > 1
     OR (jsonb_array_length(v_costo.allocations) = 1
         AND (v_costo.allocations -> 0 ->> 'pct')::numeric IS DISTINCT FROM 100)) THEN
    RAISE EXCEPTION 'Questa fattura è ripartita su più commesse: cambiala da Economia → Costi.' USING errcode = 'P0001';
  END IF;

  UPDATE public.company_costs
     SET order_id = p_order_id,
         -- Una sola voce al 100%: la sposta con il costo, altrimenti il margine
         -- la conterebbe sulla commessa di prima.
         allocations = CASE WHEN jsonb_typeof(allocations) = 'array' AND jsonb_array_length(allocations) = 1
                            THEN '[]'::jsonb ELSE allocations END,
         updated_at = now()
   WHERE id = v_cost_id;

  UPDATE public.fatture_ricevute
     SET order_id_suggerito = p_order_id, updated_at = now()
   WHERE id = f.id AND order_id_suggerito IS DISTINCT FROM p_order_id;

  RETURN jsonb_build_object(
    'esito', v_esito,
    'fattura_id', f.id,
    'company_cost_id', v_cost_id,
    'order_id', p_order_id,
    'era_su', v_costo.order_id
  );
END
$function$;

REVOKE ALL ON FUNCTION public.commessa_collega_fattura_ricevuta(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commessa_collega_fattura_ricevuta(uuid, uuid) TO authenticated, service_role;
