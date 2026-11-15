-- Tesoreria: la quota confermata eredita regola e prove anche quando punta al movimento di cassa.
-- riconcilia_movimento_su_documenti scrive la quota di una fattura emessa con movimento_id (e la
-- scadenza [DOC:]), non con documento_id: il trigger del 15/11 cercava solo documento_id e
-- scriveva «manuale». Trovato sulla prima conferma automatica di Demo Azienda 2.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION private.tes_quota_eredita_prove() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.tesoreria_esiti; cd jsonb; targets text[];
BEGIN
 IF NEW.regola IS NOT NULL THEN RETURN NEW; END IF;
 SELECT * INTO e FROM public.tesoreria_esiti WHERE transaction_id=NEW.transaction_id AND company_id=NEW.company_id AND scartato_at IS NULL;
 IF NOT FOUND THEN NEW.regola:='manuale'; RETURN NEW; END IF;
 targets:=ARRAY(SELECT x::text FROM unnest(ARRAY[NEW.documento_id,NEW.scadenza_id,NEW.invoice_id,
   (SELECT m.documento_id FROM public.movimenti_cassa_native m WHERE m.id=NEW.movimento_id AND m.company_id=NEW.company_id),
   (SELECT s.invoice_id FROM public.scadenze s WHERE s.id=NEW.scadenza_id AND s.company_id=NEW.company_id)]) x WHERE x IS NOT NULL);
 SELECT x INTO cd FROM jsonb_array_elements(e.risultato->'candidati') x
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(x->'righe') r WHERE r->>'id'=ANY(targets)) LIMIT 1;
 IF cd IS NULL THEN NEW.regola:='manuale'; RETURN NEW; END IF;
 NEW.regola:=(e.regola||'/v'||e.versione);
 NEW.prove:=jsonb_build_object('esito',e.esito,'natura',e.natura,'forza',cd->>'forza','motivi',cd->'motivi','impronta',e.impronta,'calcolato_at',e.calcolato_at);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.tes_quota_eredita_prove() FROM PUBLIC,anon,authenticated;

NOTIFY pgrst,'reload schema';
