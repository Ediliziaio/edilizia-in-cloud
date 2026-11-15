-- Revisione del 15/11/2026 sul lotto 1 della tesoreria.
-- 1. La guardia sul costo doppio blocca «Chiudi senza fattura» solo quando il debito aperto è
--    VERIFICATO come quello pagato: stesso fornitore e importo, più il numero del documento in
--    causale oppure l'IBAN verificato del fornitore. Un caso solo plausibile (stesso fornitore e
--    importo) passa, perché l'interfaccia non ha ancora un modo di scartare la proposta, e lo
--    segnala cdg_controllo_doppi («spesa_da_banca_su_debito_aperto»).
-- 2. Intermediari: solo nomi di banche e circuiti interi, non parole comuni («Intesa Costruzioni»).
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION private.tes_spesa_da_banca_non_doppia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE txid uuid; t public.bank_transactions; s record; tx_iban text; causale text;
BEGIN
 IF NOT coalesce(NEW.senza_fattura,false) OR coalesce(NEW.notes,'')!~'^\[BANCA:[0-9a-fA-F-]{36}\]' THEN RETURN NEW; END IF;
 txid:=substring(NEW.notes FROM '^\[BANCA:([0-9a-fA-F-]{36})\]')::uuid;
 SELECT * INTO t FROM public.bank_transactions WHERE id=txid AND company_id=NEW.company_id;
 IF NOT FOUND OR to_jsonb(t)->>'proposta_rifiutata_at' IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.tesoreria_esiti e WHERE e.transaction_id=txid AND e.scartato_at IS NOT NULL) THEN RETURN NEW; END IF;
 tx_iban:=private.tes_iban(t.creditor_iban);
 causale:=concat_ws(' ',t.description,t.reference);
 SELECT sc.id,sc.description,round(sc.amount-coalesce(sc.paid_amount,0),2) residuo INTO s
 FROM public.scadenze sc LEFT JOIN public.company_costs cc ON cc.id=sc.cost_id AND cc.company_id=sc.company_id
 WHERE sc.company_id=NEW.company_id AND sc.direction='uscita' AND sc.status IN('da_pagare','parziale') AND coalesce(sc.is_previsionale,false)=false
  AND abs(sc.amount-coalesce(sc.paid_amount,0)-abs(t.amount))<0.005
  AND sc.supplier_id IS NOT NULL AND (NEW.supplier_id IS NULL OR sc.supplier_id=NEW.supplier_id)
  AND (
   (tx_iban IS NOT NULL AND EXISTS(SELECT 1 FROM public.fornitori_iban_storico v WHERE v.company_id=NEW.company_id AND v.fornitore_id=sc.supplier_id AND v.confermato AND private.tes_iban(v.iban)=tx_iban))
   OR (NEW.supplier_id IS NOT NULL AND private.tes_numero_in_causale(causale,
        private.tes_numero_nucleo(coalesce(nullif(to_jsonb(cc)->>'documento_riferimento',''),sc.description)),
        extract(year FROM nullif(to_jsonb(cc)->>'documento_data','')::date)::int) IN('si','anno')
       AND length(coalesce(private.tes_numero_nucleo(coalesce(nullif(to_jsonb(cc)->>'documento_riferimento',''),sc.description)),''))>=2))
 ORDER BY sc.due_date NULLS LAST,sc.id LIMIT 1;
 IF FOUND THEN
  RAISE EXCEPTION 'Questa uscita salda un debito già registrato («%», % €): collegala alla scadenza invece di registrare una spesa nuova, così il costo non si conta due volte.',s.description,s.residuo
   USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.tes_spesa_da_banca_non_doppia() FROM PUBLIC,anon,authenticated;

DO $do$
DECLARE src text; a text:=$a$'\m(banca|bank|banco|bancaria|poste|qonto|unicredit|intesa|bnl|bper|credem|fineco|mediolanum|paypal|stripe|satispay|nexi|sumup|revolut|n26)\M'$a$;
 b text:=$b$'^(banca|banco) |\m(bank|bancaria|poste italiane|bancoposta|qonto|unicredit|intesa sanpaolo|bnl|bper|credem|fineco|mediolanum|paypal|stripe|satispay|nexi|sumup|revolut|n26)\M'$b$;
BEGIN
 SELECT prosrc INTO src FROM pg_proc WHERE oid='private.tes_classifica(uuid,uuid)'::regprocedure;
 -- Rilanciata a mano non deve applicare due volte le sostituzioni: se c'è già il testo nuovo, non fa niente.
 IF position('intesa sanpaolo' IN src)>0 THEN RETURN; END IF;
 IF (length(src)-length(replace(src,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'elenco intermediari non trovato'; END IF;
 src:=replace(src,a,b);
 EXECUTE 'CREATE OR REPLACE FUNCTION private.tes_classifica(p_company uuid,p_tx uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='''' AS '||quote_literal(src);
END $do$;
REVOKE ALL ON FUNCTION private.tes_classifica(uuid,uuid) FROM PUBLIC,anon,authenticated;

NOTIFY pgrst,'reload schema';
