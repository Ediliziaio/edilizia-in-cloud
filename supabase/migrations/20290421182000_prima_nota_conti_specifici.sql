-- Il conto scelto in prima nota ha un'identità stabile, anche senza Open Banking.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
ALTER TABLE public.prima_nota_entries
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS conto_liquidita_id uuid REFERENCES public.contabilita_conti(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS prima_nota_per_conto_bancario ON public.prima_nota_entries(company_id,bank_account_id,entry_date) WHERE bank_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS prima_nota_per_conto_liquidita ON public.prima_nota_entries(company_id,conto_liquidita_id,entry_date) WHERE conto_liquidita_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prima_nota_metodi_pagamento(p_company uuid)
RETURNS TABLE(metodo text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public' AS $function$
  SELECT DISTINCT btrim(payment_method) AS metodo FROM public.prima_nota_entries
   WHERE company_id=p_company AND nullif(btrim(payment_method),'') IS NOT NULL
   ORDER BY metodo LIMIT 200;
$function$;
REVOKE ALL ON FUNCTION public.prima_nota_metodi_pagamento(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prima_nota_metodi_pagamento(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.prima_nota_conto_stessa_azienda()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','private' AS $function$
DECLARE v_bank uuid; v_nome text; v_attivo boolean; v_liquido boolean;
BEGIN
  IF NEW.bank_transaction_id IS NOT NULL THEN
    SELECT account_id INTO v_bank FROM public.bank_transactions WHERE id=NEW.bank_transaction_id AND company_id=NEW.company_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Movimento bancario non appartenente a questa azienda' USING ERRCODE='23514'; END IF;
    IF v_bank IS NOT NULL THEN
      IF NEW.bank_account_id IS NOT NULL AND NEW.bank_account_id<>v_bank THEN
        RAISE EXCEPTION 'Il conto non corrisponde alla banca del movimento' USING ERRCODE='23514';
      END IF;
      NEW.bank_account_id:=v_bank;
    END IF;
  END IF;
  IF NEW.bank_account_id IS NOT NULL THEN
    SELECT coalesce(nullif(display_name,''),nullif(account_name,''),'Conto bancario'),is_active INTO v_nome,v_attivo
      FROM public.bank_accounts WHERE id=NEW.bank_account_id AND company_id=NEW.company_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conto bancario non appartenente a questa azienda' USING ERRCODE='23514'; END IF;
    IF NOT coalesce(v_attivo,false) AND (TG_OP='INSERT' OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id) THEN
      RAISE EXCEPTION 'Il conto bancario non è attivo' USING ERRCODE='23514';
    END IF;
    NEW.account_label:=v_nome;
  END IF;
  IF NEW.conto_liquidita_id IS NOT NULL THEN
    WITH RECURSIVE gerarchia AS (
      SELECT c.id,c.mastro_id,c.descrizione,c.codice,c.codice_standard,ARRAY[c.id] percorso
        FROM public.contabilita_conti c WHERE c.id=NEW.conto_liquidita_id AND c.company_id=NEW.company_id
          AND c.natura='attivo' AND c.movimentabile AND c.attivo
      UNION ALL
      SELECT c.id,c.mastro_id,c.descrizione,c.codice,c.codice_standard,g.percorso||c.id FROM public.contabilita_conti c
        JOIN gerarchia g ON c.id=g.mastro_id WHERE c.company_id=NEW.company_id AND NOT c.id=ANY(g.percorso)
    ) SELECT coalesce(bool_or(coalesce(codice_standard,codice) IN ('06.01','06.02') OR descrizione ~* '(banc|cassa|disponibilit.*liquid|conti correnti|depositi.*postal)'),false) INTO v_liquido FROM gerarchia;
    IF NOT v_liquido THEN RAISE EXCEPTION 'Scegli un conto di liquidità attivo del piano di questa azienda' USING ERRCODE='23514'; END IF;
    IF NEW.bank_account_id IS NULL THEN
      SELECT descrizione INTO NEW.account_label FROM public.contabilita_conti WHERE id=NEW.conto_liquidita_id;
    END IF;
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION private.prima_nota_conto_stessa_azienda() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS a_prima_nota_conto_stessa_azienda ON public.prima_nota_entries;
CREATE TRIGGER a_prima_nota_conto_stessa_azienda BEFORE INSERT OR UPDATE OF company_id,bank_account_id,conto_liquidita_id,bank_transaction_id,account_label ON public.prima_nota_entries
  FOR EACH ROW EXECUTE FUNCTION private.prima_nota_conto_stessa_azienda();

-- Il generatore già usa il nome esatto della banca. Il riferimento esplicito
-- prevale sul nome, così anche un conto rinominato conserva la destinazione.
DO $migration$
DECLARE v_def text; v_originale text; v_cerca text := '        -- Importo con segno dal punto di vista della contropartita:';
BEGIN
  SELECT pg_get_functiondef('public.contabilita_genera_da_documenti(uuid,integer,uuid)'::regprocedure) INTO v_originale;
  IF strpos(v_originale,'conto di liquidità scelto esplicitamente')=0 THEN
    IF strpos(v_originale,v_cerca)=0 THEN RAISE EXCEPTION 'Generatore contabile inatteso: aggiornamento del conto non applicato'; END IF;
    v_def:=replace(v_originale,v_cerca,$body$
        -- conto di liquidità scelto esplicitamente
        IF r.conto_liquidita_id IS NOT NULL THEN
          IF NOT EXISTS(SELECT 1 FROM public.contabilita_conti c WHERE c.id=r.conto_liquidita_id AND c.company_id=p_company AND c.movimentabile AND c.attivo) THEN
            RAISE EXCEPTION 'Il conto di liquidità del movimento non è più disponibile';
          END IF;
          k:=k||jsonb_build_object('liquidita scelta',r.conto_liquidita_id::text); v_banca:='liquidita scelta';
        END IF;
        -- Importo con segno dal punto di vista della contropartita:$body$);
    EXECUTE v_def;
  END IF;
END $migration$;

DO $migration$
DECLARE v_def text; v_prima text;
BEGIN
  SELECT pg_get_functiondef('public.contabilita_genera_da_documenti(uuid,integer,uuid)'::regprocedure) INTO v_prima;
  v_def:=replace(v_prima,'SELECT pn.amount, pn.direction, pn.documento_fiscale_id, pn.account_label, d.numero,',
    'SELECT pn.amount, pn.direction, pn.documento_fiscale_id, pn.account_label, pn.conto_liquidita_id, d.numero,');
  v_def:=replace(v_def,$old$v_conto := CASE WHEN r.account_label = 'cassa' AND k ? '06.02' THEN '06.02' ELSE '06.01' END;$old$,$new$
        v_conto := CASE WHEN lower(coalesce(r.account_label,'')) LIKE 'cassa%' AND k ? '06.02' THEN '06.02' ELSE '06.01' END;
        -- liquidità dell'incasso nativo: il conto esplicito prevale sul ruolo generico
        IF r.conto_liquidita_id IS NOT NULL THEN
          k:=k||jsonb_build_object('liquidita incasso',r.conto_liquidita_id::text);v_conto:='liquidita incasso';
        END IF;$new$);
  IF v_def<>v_prima THEN EXECUTE v_def; END IF;
END $migration$;

CREATE OR REPLACE FUNCTION public.prima_nota_modifica(p_id uuid, p_dati jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  p public.prima_nota_entries; v_motivo text; v_pag public.invoice_payments; v_inv record;
  v_fattura uuid := nullif(p_dati->>'invoice_id', '')::uuid;
  v_importo numeric := round((p_dati->>'amount')::numeric, 2);
  v_data date := (p_dati->>'entry_date')::date;
  v_verso text := coalesce(p_dati->>'direction', 'uscita');
  v_n int; v_esito text := 'modificata'; v_gia numeric := 0;
BEGIN
  SELECT * INTO p FROM public.prima_nota_entries WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registrazione non trovata o non visibile.' USING ERRCODE = 'P0002'; END IF;
  v_motivo := public.prima_nota_modificabile(p);
  IF v_motivo IS NOT NULL THEN RAISE EXCEPTION '%', v_motivo USING ERRCODE = 'P0001'; END IF;
  IF v_importo IS NULL OR v_importo <= 0 THEN RAISE EXCEPTION 'L''importo deve essere maggiore di zero.' USING ERRCODE = '22023'; END IF;
  IF v_data IS NULL THEN RAISE EXCEPTION 'Manca la data.' USING ERRCODE = '22023'; END IF;
  IF btrim(coalesce(p_dati->>'description', '')) = '' THEN RAISE EXCEPTION 'Manca la descrizione.' USING ERRCODE = '22023'; END IF;
  IF v_verso NOT IN ('entrata', 'uscita') THEN RAISE EXCEPTION 'Direzione non valida.' USING ERRCODE = '22023'; END IF;
  IF v_fattura IS NOT NULL AND v_verso <> 'entrata' THEN
    RAISE EXCEPTION 'L''incasso di una fattura è un''entrata.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pag FROM public.invoice_payments
   WHERE reference = 'prima_nota:' || p.id AND company_id = p.company_id ORDER BY created_at LIMIT 1 FOR UPDATE;

  IF v_fattura IS NOT NULL THEN
    SELECT id, total, paid_amount, document_type, deleted_at INTO v_inv
      FROM public.invoices WHERE id = v_fattura AND company_id = p.company_id;
    IF NOT FOUND OR v_inv.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Fattura non trovata.' USING ERRCODE = 'P0002'; END IF;
    -- Più del residuo non si incassa (contando quello che questa registrazione aveva già messo sulla stessa fattura).
    v_gia := CASE WHEN v_pag.invoice_id = v_fattura THEN v_pag.amount ELSE 0 END;
    IF v_importo > coalesce(v_inv.total, 0) - coalesce(v_inv.paid_amount, 0) + v_gia + 0.005 THEN
      RAISE EXCEPTION 'L''importo supera quanto resta da incassare sulla fattura.' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.prima_nota_entries SET
    direction = v_verso,
    category = coalesce(nullif(p_dati->>'category', ''), category),
    description = btrim(p_dati->>'description'),
    amount = v_importo,
    entry_date = v_data,
    payment_method = nullif(p_dati->>'payment_method', ''),
    reference_number = nullif(btrim(coalesce(p_dati->>'reference_number', '')), ''),
    account_label = coalesce(nullif(p_dati->>'account_label', ''), account_label),
    bank_account_id = CASE WHEN p_dati ? 'bank_account_id' THEN nullif(p_dati->>'bank_account_id','')::uuid ELSE bank_account_id END,
    conto_liquidita_id = CASE WHEN p_dati ? 'conto_liquidita_id' THEN nullif(p_dati->>'conto_liquidita_id','')::uuid ELSE conto_liquidita_id END,
    supplier_id = nullif(p_dati->>'supplier_id', '')::uuid,
    order_id = nullif(p_dati->>'order_id', '')::uuid,
    invoice_id = v_fattura,
    notes = CASE WHEN p_dati ? 'notes' THEN nullif(p_dati->>'notes', '') ELSE notes END,
    attachment_url = CASE WHEN p_dati ? 'attachment_url' THEN nullif(p_dati->>'attachment_url', '') ELSE attachment_url END,
    attachment_name = CASE WHEN p_dati ? 'attachment_name' THEN nullif(p_dati->>'attachment_name', '') ELSE attachment_name END,
    updated_at = now()
  WHERE id = p.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'Non hai il permesso di modificare questa registrazione.' USING ERRCODE = '42501'; END IF;

  -- Il pagamento della fattura segue la registrazione.
  IF v_pag.id IS NOT NULL AND (v_fattura IS NULL OR v_pag.invoice_id <> v_fattura) THEN
    DELETE FROM public.invoice_payments WHERE id = v_pag.id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n = 0 THEN RAISE EXCEPTION 'Non hai il permesso di cambiare l''incasso della fattura.' USING ERRCODE = '42501'; END IF;
    v_esito := CASE WHEN v_fattura IS NULL THEN 'fattura_tolta' ELSE 'fattura_cambiata' END;
    v_pag.id := NULL;
  END IF;
  IF v_fattura IS NOT NULL THEN
    IF v_pag.id IS NOT NULL THEN
      UPDATE public.invoice_payments
         SET amount = v_importo, payment_date = v_data, payment_method = nullif(p_dati->>'payment_method', '')
       WHERE id = v_pag.id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN RAISE EXCEPTION 'Non hai il permesso di cambiare l''incasso della fattura.' USING ERRCODE = '42501'; END IF;
    ELSE
      INSERT INTO public.invoice_payments (invoice_id, company_id, amount, payment_date, payment_method, reference, notes, created_by)
      VALUES (v_fattura, p.company_id, v_importo, v_data, nullif(p_dati->>'payment_method', ''), 'prima_nota:' || p.id,
              'Incasso registrato dalla Prima nota', auth.uid());
      IF v_esito = 'modificata' THEN v_esito := 'fattura_collegata'; END IF;
    END IF;
  END IF;
  RETURN jsonb_build_object('esito', v_esito, 'invoice_id', v_fattura, 'invoice_id_prima', v_pag.invoice_id);
END $$;
REVOKE ALL ON FUNCTION public.prima_nota_modifica(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prima_nota_modifica(uuid, jsonb) TO authenticated, service_role;
