-- Subappalto: dal verbale del SAL alla fattura, al pagamento, alla commessa.
--
-- Il flusso: SAL verificato → verbale (col benestare alla fatturazione) → il
-- subappaltatore lo accetta → emette la fattura → la fattura si collega al
-- contratto E al SAL → il costo va sulla commessa del contratto → il
-- pagamento del SAL (registra_pagamento_sal_sub) paga il costo della fattura.
--
-- Mancavano due pezzi:
-- 1. subappalto_collega_fattura: prima la fattura si legava solo al contratto
--    (update diretto dal browser), sal_subappaltatore_id non lo scriveva
--    nessuno (0 fatture) e il costo restava fuori dalla commessa se non
--    passava da un ordine d'acquisto. Ora: contratto, SAL (verificato o
--    pagato, dello stesso contratto), contabilizzazione se manca il costo e
--    costo sulla commessa del contratto. Stessi permessi del pagamento SAL.
-- 2. L'accettazione del verbale da parte del subappaltatore: chi, quando, come
--    (firmato su carta, per email, dal portale). Si registra sul verbale
--    archiviato; l'originale PDF non cambia.

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.sal_sub_verbali
  ADD COLUMN IF NOT EXISTS accettato_il date,
  ADD COLUMN IF NOT EXISTS accettato_da text,
  ADD COLUMN IF NOT EXISTS accettazione_modo text,
  ADD COLUMN IF NOT EXISTS accettazione_registrata_da uuid,
  ADD COLUMN IF NOT EXISTS accettazione_registrata_il timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sal_sub_verbali_accettazione_modo_check') THEN
    ALTER TABLE public.sal_sub_verbali ADD CONSTRAINT sal_sub_verbali_accettazione_modo_check
      CHECK (accettazione_modo IS NULL OR accettazione_modo IN ('carta', 'email', 'pec', 'portale'));
  END IF;
END $$;

COMMENT ON COLUMN public.sal_sub_verbali.accettato_il IS
  'Giorno in cui il subappaltatore ha accettato il verbale (registrato dall''impresa).';

-- ── 1. Fattura del subappaltatore → contratto, SAL e commessa ─────────────
CREATE OR REPLACE FUNCTION public.subappalto_collega_fattura(p_fattura uuid, p_contratto uuid, p_sal uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET lock_timeout TO '3s'
AS $function$
DECLARE
  f record;
  ctr record;
  s record;
  v_costo uuid;
  v_esito text := 'collegata';
BEGIN
  SELECT id, company_id, cedente_piva, tipo_documento, stato, company_cost_id, purchase_order_id
    INTO f FROM public.fatture_ricevute WHERE id = p_fattura FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fattura non trovata.' USING errcode = 'P0002'; END IF;

  IF NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', f.company_id), false)
     OR NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_view_subappaltatori_amministrazione', f.company_id), false) THEN
    RAISE EXCEPTION 'Il tuo ruolo non permette di gestire le fatture dei subappalti.' USING errcode = '42501';
  END IF;

  -- Scollega: contratto e SAL via, il costo resta dov'è.
  IF p_contratto IS NULL THEN
    UPDATE public.fatture_ricevute SET contratto_subappalto_id = NULL, sal_subappaltatore_id = NULL, updated_at = now() WHERE id = f.id;
    RETURN jsonb_build_object('esito', 'scollegata', 'fattura_id', f.id);
  END IF;

  SELECT cs.id, cs.company_id, cs.order_id, cs.numero_contratto, ss.piva
    INTO ctr
    FROM public.contratti_subappalto cs
    LEFT JOIN public.subappaltatori_sicurezza ss ON ss.id = cs.subappaltatore_id
   WHERE cs.id = p_contratto;
  IF NOT FOUND OR ctr.company_id <> f.company_id THEN
    RAISE EXCEPTION 'Il contratto non è della stessa azienda della fattura.' USING errcode = '42501';
  END IF;
  IF public.partner_tax_key(f.cedente_piva) <> '' AND public.partner_tax_key(ctr.piva) <> ''
     AND public.partner_tax_key(f.cedente_piva) <> public.partner_tax_key(ctr.piva) THEN
    RAISE EXCEPTION 'La partita IVA della fattura non è quella del subappaltatore del contratto.' USING errcode = 'P0001';
  END IF;
  IF f.stato = 'rifiutata' THEN
    RAISE EXCEPTION 'La fattura è rifiutata: non si collega.' USING errcode = 'P0001';
  END IF;

  IF p_sal IS NOT NULL THEN
    SELECT id, contratto_id, stato, numero_sal INTO s FROM public.sal_subappaltatori WHERE id = p_sal;
    IF NOT FOUND OR s.contratto_id <> ctr.id THEN
      RAISE EXCEPTION 'Il SAL non è di questo contratto.' USING errcode = 'P0001';
    END IF;
    IF s.stato NOT IN ('verificato', 'pagato') THEN
      RAISE EXCEPTION 'Il SAL n. % non è ancora verificato: la fattura si emette dopo il benestare.', s.numero_sal USING errcode = 'P0001';
    END IF;
  END IF;

  UPDATE public.fatture_ricevute
     SET contratto_subappalto_id = ctr.id,
         sal_subappaltatore_id = p_sal,
         order_id_suggerito = coalesce(order_id_suggerito, ctr.order_id),
         updated_at = now()
   WHERE id = f.id;

  -- Il costo: la contabilizzazione se manca (le note di credito no: riducono un costo esistente).
  v_costo := f.company_cost_id;
  IF v_costo IS NULL AND coalesce(f.tipo_documento, '') NOT IN ('TD04', 'passive_credit_note') THEN
    v_costo := (public.contabilizza_fattura_ricevuta(f.id) ->> 'company_cost_id')::uuid;
    v_esito := 'contabilizzata_e_collegata';
  END IF;

  -- Il costo sulla commessa del contratto, se non è già su un'altra o ripartito.
  IF v_costo IS NOT NULL AND ctr.order_id IS NOT NULL THEN
    UPDATE public.company_costs
       SET order_id = ctr.order_id, updated_at = now()
     WHERE id = v_costo AND company_id = f.company_id
       AND order_id IS NULL AND purchase_order_id IS NULL
       AND (allocations IS NULL OR jsonb_typeof(allocations) <> 'array' OR jsonb_array_length(allocations) = 0);
  END IF;

  RETURN jsonb_build_object('esito', v_esito, 'fattura_id', f.id, 'contratto_id', ctr.id, 'sal_id', p_sal,
                            'company_cost_id', v_costo, 'order_id', ctr.order_id);
END
$function$;

REVOKE ALL ON FUNCTION public.subappalto_collega_fattura(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subappalto_collega_fattura(uuid, uuid, uuid) TO authenticated, service_role;

-- ── 2. Accettazione del verbale da parte del subappaltatore ────────────────
CREATE OR REPLACE FUNCTION public.sal_sub_verbale_accettazione(p_verbale uuid, p_data date, p_nome text, p_modo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v record;
BEGIN
  SELECT id, company_id INTO v FROM public.sal_sub_verbali WHERE id = p_verbale FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verbale non trovato.' USING errcode = 'P0002'; END IF;
  IF NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', v.company_id), false)
     OR NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_view_subappaltatori_amministrazione', v.company_id), false) THEN
    RAISE EXCEPTION 'Il tuo ruolo non permette di registrare l''accettazione.' USING errcode = '42501';
  END IF;
  -- p_data NULL: toglie l'accettazione registrata per sbaglio.
  IF p_data IS NULL THEN
    UPDATE public.sal_sub_verbali
       SET accettato_il = NULL, accettato_da = NULL, accettazione_modo = NULL,
           accettazione_registrata_da = auth.uid(), accettazione_registrata_il = now()
     WHERE id = v.id;
    RETURN jsonb_build_object('esito', 'tolta');
  END IF;
  IF p_data > (now() AT TIME ZONE 'Europe/Rome')::date THEN
    RAISE EXCEPTION 'La data di accettazione non può essere nel futuro.' USING errcode = '22023';
  END IF;
  IF length(btrim(coalesce(p_nome, ''))) < 2 THEN
    RAISE EXCEPTION 'Scrivi chi ha accettato il verbale per il subappaltatore.' USING errcode = '22023';
  END IF;
  IF p_modo NOT IN ('carta', 'email', 'pec', 'portale') THEN
    RAISE EXCEPTION 'Indica come è arrivata l''accettazione.' USING errcode = '22023';
  END IF;
  UPDATE public.sal_sub_verbali
     SET accettato_il = p_data, accettato_da = btrim(p_nome), accettazione_modo = p_modo,
         accettazione_registrata_da = auth.uid(), accettazione_registrata_il = now()
   WHERE id = v.id;
  RETURN jsonb_build_object('esito', 'accettato', 'accettato_il', p_data);
END
$function$;

REVOKE ALL ON FUNCTION public.sal_sub_verbale_accettazione(uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sal_sub_verbale_accettazione(uuid, date, text, text) TO authenticated, service_role;

-- ── 3. Quadro pagamenti della commessa: il SAL del subappalto e il costo della
--       sua fattura sono la stessa uscita. Il costo di una fattura collegata a un
--       contratto di subappalto della commessa non si mostra a parte: lo dice la
--       riga del contratto (maturato, pagato, residuo).
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.commessa_quadro_pagamenti(uuid)'::regprocedure);
  IF position('fattura del subappalto: la dice la riga del contratto' in d) = 0 THEN
    d := replace(d, '   WHERE c.quota > 0
),', '   WHERE c.quota > 0
     -- fattura del subappalto: la dice la riga del contratto
     AND NOT EXISTS (SELECT 1 FROM public.fatture_ricevute frs
                      JOIN public.contratti_subappalto ks ON ks.id = frs.contratto_subappalto_id
                     WHERE frs.company_cost_id = c.id AND ks.order_id = p_order_id)
),');
    EXECUTE d;
  END IF;
END
$do$;
