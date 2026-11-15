-- Tesoreria, lotto 4 (15/11/2026): IBAN verificati dei clienti e rapporti col pagante terzo.
-- * Un IBAN di un cliente diventa «verificato» solo quando una persona lo conferma su un incasso
--   GIÀ collegato a una fattura di quel cliente (tesoreria_ricorda_iban_cliente). Un pagamento da
--   solo non crea mai l'associazione. Il cliente si riconosce dalla chiave fiscale (P.IVA o CF,
--   public.partner_tax_key): quasi tutte le fatture la hanno, pochissime hanno l'anagrafica.
-- * Il motore usa l'IBAN verificato come prova che identifica; un IBAN verificato per un ALTRO
--   cliente (e non per questo) è conflitto, come per i fornitori (fornitori_iban_storico).
-- * I rapporti pagante ↔ intestatario (tesoreria_paganti_autorizzati) si registrano e si revocano
--   con funzioni, sempre con la prova scritta.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

CREATE TABLE IF NOT EXISTS public.tesoreria_iban_verificati(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 chiave_fiscale text NOT NULL CHECK (length(chiave_fiscale)>=8),
 soggetto_nome text,
 iban text NOT NULL CHECK (length(iban)>=15),
 fonte_transaction_id uuid,
 fonte_documento_id uuid,
 confermato_da uuid NOT NULL,
 confermato_at timestamptz NOT NULL DEFAULT now(),
 revocato_at timestamptz,
 revocato_da uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS tesoreria_iban_verificati_attivo ON public.tesoreria_iban_verificati(company_id,chiave_fiscale,iban) WHERE revocato_at IS NULL;
CREATE INDEX IF NOT EXISTS tesoreria_iban_verificati_iban ON public.tesoreria_iban_verificati(company_id,iban) WHERE revocato_at IS NULL;
ALTER TABLE public.tesoreria_iban_verificati ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tesoreria_iban_verificati FROM PUBLIC,anon,authenticated;

-- Conferma dell'IBAN dell'ordinante per il cliente della fattura a cui l'incasso è già collegato.
CREATE OR REPLACE FUNCTION public.tesoreria_ricorda_iban_cliente(p_company uuid,p_tx uuid,p_documento uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.bank_transactions; v_iban text; v_chiave text; v_nome text; sid uuid;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND OR t.transaction_type<>'credit' THEN RAISE EXCEPTION 'Serve un incasso di questa azienda' USING ERRCODE='22023'; END IF;
 v_iban:=private.tes_iban(coalesce(t.debtor_iban,to_jsonb(t)->>'counterparty_iban'));
 IF v_iban IS NULL THEN RAISE EXCEPTION 'La banca non ha comunicato l''IBAN dell''ordinante' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bank_reconciliations r LEFT JOIN public.movimenti_cassa_native m ON m.id=r.movimento_id AND m.company_id=r.company_id
     WHERE r.company_id=p_company AND r.transaction_id=p_tx AND r.unmatched_at IS NULL AND p_documento IN(r.documento_id,m.documento_id)) THEN
  RAISE EXCEPTION 'Prima collega l''incasso alla fattura: l''IBAN si conferma su un collegamento già fatto' USING ERRCODE='22023';
 END IF;
 SELECT public.partner_tax_key(coalesce(nullif(d.cliente_snapshot->>'partita_iva',''),nullif(d.cliente_snapshot->>'codice_fiscale',''))),
        coalesce(nullif(d.cliente_snapshot->>'ragione_sociale',''),nullif(concat_ws(' ',d.cliente_snapshot->>'nome',d.cliente_snapshot->>'cognome'),''))
   INTO v_chiave,v_nome FROM public.documenti_fiscali_elenco_operativo d WHERE d.id=p_documento AND d.company_id=p_company;
 IF length(coalesce(v_chiave,''))<8 THEN RAISE EXCEPTION 'La fattura non ha la partita IVA o il codice fiscale del cliente' USING ERRCODE='22023'; END IF;
 INSERT INTO public.tesoreria_iban_verificati(company_id,chiave_fiscale,soggetto_nome,iban,fonte_transaction_id,fonte_documento_id,confermato_da)
 VALUES(p_company,v_chiave,v_nome,v_iban,p_tx,p_documento,auth.uid())
 ON CONFLICT(company_id,chiave_fiscale,iban) WHERE revocato_at IS NULL DO NOTHING RETURNING id INTO sid;
 IF sid IS NULL THEN SELECT id INTO sid FROM public.tesoreria_iban_verificati WHERE company_id=p_company AND chiave_fiscale=v_chiave AND iban=v_iban AND revocato_at IS NULL; END IF;
 RETURN jsonb_build_object('id',sid,'cliente',v_nome,'iban',v_iban);
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_ricorda_iban_cliente(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_ricorda_iban_cliente(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tesoreria_revoca_iban_cliente(p_company uuid,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 UPDATE public.tesoreria_iban_verificati SET revocato_at=now(),revocato_da=auth.uid() WHERE id=p_id AND company_id=p_company AND revocato_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'IBAN non trovato o già revocato' USING ERRCODE='P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_revoca_iban_cliente(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_revoca_iban_cliente(uuid,uuid) TO authenticated;

-- Rapporti col pagante terzo: con la prova, revocabili.
CREATE OR REPLACE FUNCTION public.tesoreria_registra_pagante(p_company uuid,p_soggetto_nome text,p_pagante_nome text,p_pagante_iban text,p_prova text,p_soggetto_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sid uuid;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 IF length(btrim(coalesce(p_soggetto_nome,'')))<2 THEN RAISE EXCEPTION 'Indica l''intestatario dei documenti' USING ERRCODE='22023'; END IF;
 IF nullif(btrim(coalesce(p_pagante_nome,'')),'') IS NULL AND private.tes_iban(p_pagante_iban) IS NULL THEN RAISE EXCEPTION 'Indica il nome o l''IBAN di chi paga' USING ERRCODE='22023'; END IF;
 IF length(btrim(coalesce(p_prova,'')))<3 THEN RAISE EXCEPTION 'Scrivi la prova del rapporto (delega, contratto, mail del cliente…)' USING ERRCODE='22023'; END IF;
 INSERT INTO public.tesoreria_paganti_autorizzati(company_id,soggetto_nome,soggetto_id,pagante_nome,pagante_iban,prova,created_by)
 VALUES(p_company,btrim(p_soggetto_nome),p_soggetto_id,nullif(btrim(coalesce(p_pagante_nome,'')),''),private.tes_iban(p_pagante_iban),left(btrim(p_prova),1000),auth.uid())
 RETURNING id INTO sid;
 RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_registra_pagante(uuid,text,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_registra_pagante(uuid,text,text,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tesoreria_revoca_pagante(p_company uuid,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 UPDATE public.tesoreria_paganti_autorizzati SET revocato_at=now() WHERE id=p_id AND company_id=p_company AND revocato_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rapporto non trovato o già revocato' USING ERRCODE='P0002'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_revoca_pagante(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_revoca_pagante(uuid,uuid) TO authenticated;

-- Elenco per le schermate: IBAN verificati dei clienti e rapporti col pagante terzo, attivi.
CREATE OR REPLACE FUNCTION public.tesoreria_riferimenti_verificati(p_company uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.bank_operativa_access(p_company,false);
 RETURN jsonb_build_object(
  'iban_clienti',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'cliente',soggetto_nome,'chiave_fiscale',chiave_fiscale,'iban',iban,'confermato_at',confermato_at) ORDER BY soggetto_nome,iban),'[]')
                  FROM public.tesoreria_iban_verificati WHERE company_id=p_company AND revocato_at IS NULL),
  'paganti',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'intestatario',soggetto_nome,'pagante',pagante_nome,'iban',pagante_iban,'prova',prova,'created_at',created_at) ORDER BY soggetto_nome),'[]')
             FROM public.tesoreria_paganti_autorizzati WHERE company_id=p_company AND revocato_at IS NULL));
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_riferimenti_verificati(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_riferimenti_verificati(uuid) TO authenticated;

-- Il motore: IBAN verificato del cliente come prova che identifica; di un altro cliente = conflitto.
DO $do$
DECLARE src text; pairs text[][]; a text; b text;
BEGIN
 SELECT prosrc INTO src FROM pg_proc WHERE oid='private.tes_classifica(uuid,uuid)'::regprocedure;
 pairs:=ARRAY[
  ARRAY[$a$intermediario boolean:=false; n_soggetto int;$a$,$b$intermediario boolean:=false; n_soggetto int; chiave_cli text;$b$],
  ARRAY[$a$  verified:=false;
  IF tx_iban IS NOT NULL AND rec.supplier_id IS NOT NULL THEN$a$,$b$  verified:=false;
  IF tx_iban IS NOT NULL AND rec.tipo='documento' THEN
   SELECT public.partner_tax_key(coalesce(nullif(d.cliente_snapshot->>'partita_iva',''),nullif(d.cliente_snapshot->>'codice_fiscale','')))
     INTO chiave_cli FROM public.documenti_fiscali_elenco_operativo d WHERE d.id=rec.id AND d.company_id=p_company;
   IF length(coalesce(chiave_cli,''))>=8 THEN
    verified:=EXISTS(SELECT 1 FROM public.tesoreria_iban_verificati v WHERE v.company_id=p_company AND v.chiave_fiscale=chiave_cli AND v.iban=tx_iban AND v.revocato_at IS NULL);
    IF NOT verified AND EXISTS(SELECT 1 FROM public.tesoreria_iban_verificati v WHERE v.company_id=p_company AND v.chiave_fiscale<>chiave_cli AND v.iban=tx_iban AND v.revocato_at IS NULL) THEN
     conf:=conf||to_jsonb('IBAN verificato di un altro cliente'::text);
    END IF;
   END IF;
  END IF;
  IF tx_iban IS NOT NULL AND rec.supplier_id IS NOT NULL THEN$b$]
 ];
 FOR i IN 1..array_length(pairs,1) LOOP
  a:=pairs[i][1]; b:=pairs[i][2];
  IF (length(src)-length(replace(src,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'sostituzione % non trovata una sola volta',i; END IF;
  src:=replace(src,a,b);
 END LOOP;
 EXECUTE 'CREATE OR REPLACE FUNCTION private.tes_classifica(p_company uuid,p_tx uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='''' AS '||quote_literal(src);
END $do$;
REVOKE ALL ON FUNCTION private.tes_classifica(uuid,uuid) FROM PUBLIC,anon,authenticated;

NOTIFY pgrst,'reload schema';
