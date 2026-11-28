-- ════════════════════════════════════════════════════════════════════════════
-- Tesoreria: un movimento chiuso senza documento ha l'esito «chiuso», non
-- «da gestire» (lotto B, 28/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Il 28/11 i movimenti «aperti» sembravano 508: 287 erano chiusi senza documento
-- (chiudi_movimento_senza_fattura, 'spesa' o 'nessun_costo') e il loro esito diceva
-- ancora «da gestire». Due motivi:
--   • private.tes_classifica guardava solo bank_reconciliations: chi è chiuso senza
--     documento non ne ha, quindi non arrivava mai a R-CHIUSO;
--   • private.tes_classifica_movimenti_selezionati salta i movimenti chiusi senza
--     documento, quindi l'esito calcolato prima della chiusura restava lì.
-- Coda, conteggi e badge leggevano quell'esito.
--
-- 1. private.tes_esito_chiuso(tipo): l'esito di un movimento chiuso senza documento
--    (R-CHIUSO, natura gia_riconciliato, come un movimento interamente collegato).
-- 2. tes_classifica lo restituisce per primo se chiuso_senza_documento è valorizzato
--    (patch a un punto; rifiuta se il punto non c'è o non è unico; idempotente).
-- 3. Trigger su bank_transactions, AFTER UPDATE OF chiuso_senza_documento: alla
--    chiusura scrive subito l'esito «chiuso» (e la riga di storia) e azzera lo scarto
--    (scartato_*); alla riapertura toglie la riga dell'esito, così coda e badge tornano
--    subito veri e il ricalcolo lo riprende per primo (senza esito = NULLS FIRST).
--
-- Gli esiti vecchi NON si correggono qui: lo fa lo script
-- scripts/sql/tesoreria-esiti-chiusi-riallinea.sql (a lotti, con lock_timeout), da
-- lanciare dopo questa migrazione. Idempotente: CREATE OR REPLACE, DROP TRIGGER IF EXISTS.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.tes_esito_chiuso(p_tipo text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('esito','automatico','natura','gia_riconciliato','regola','R-CHIUSO','versione',1,
  'motivi',jsonb_build_array(CASE p_tipo WHEN 'spesa' THEN 'Chiuso senza documento: costo registrato e già pagato da questo movimento'
                                         ELSE 'Chiuso senza documento: nessun costo da registrare' END),
  'conflitti','[]'::jsonb,'mancanti','[]'::jsonb,'candidati','[]'::jsonb,'commesse','[]'::jsonb,
  'differenza',0,'ripartizione_da_completare',false,'chiuso_senza_documento',p_tipo)
$function$;
REVOKE ALL ON FUNCTION private.tes_esito_chiuso(text) FROM PUBLIC, anon, authenticated;

DO $patch$
DECLARE
  d text := pg_get_functiondef('private.tes_classifica(uuid,uuid)'::regprocedure);
  vecchio text := $v$ SELECT coalesce(sum(abs(matched_amount)),0) INTO impegnato FROM public.bank_reconciliations WHERE company_id=p_company AND transaction_id=p_tx AND unmatched_at IS NULL;$v$;
  nuovo text := $n$ -- 28/11/2026 (lotto B): chiuso senza documento = chiuso, anche senza righe in bank_reconciliations.
 IF t.chiuso_senza_documento IS NOT NULL THEN RETURN private.tes_esito_chiuso(t.chiuso_senza_documento); END IF;
 SELECT coalesce(sum(abs(matched_amount)),0) INTO impegnato FROM public.bank_reconciliations WHERE company_id=p_company AND transaction_id=p_tx AND unmatched_at IS NULL;$n$;
BEGIN
  IF position('private.tes_esito_chiuso(' in d) > 0 THEN RETURN; END IF;
  IF (length(d) - length(replace(d, vecchio, ''))) / length(vecchio) <> 1 THEN
    RAISE EXCEPTION 'tes_classifica: il punto da cambiare non c''è più (o non è unico), la patch va rifatta a mano';
  END IF;
  EXECUTE replace(d, vecchio, nuovo);
END
$patch$;

CREATE OR REPLACE FUNCTION private.tes_esito_segue_chiusura()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r jsonb; imp text;
BEGIN
 IF NEW.chiuso_senza_documento IS NOT NULL THEN
  r:=private.tes_esito_chiuso(NEW.chiuso_senza_documento); imp:=md5(r::text);
  INSERT INTO public.tesoreria_esiti(transaction_id,company_id,esito,natura,regola,versione,risultato,impronta,calcolato_at)
  VALUES(NEW.id,NEW.company_id,r->>'esito',r->>'natura',r->>'regola',(r->>'versione')::int,r,imp,now())
  ON CONFLICT(transaction_id) DO UPDATE SET esito=EXCLUDED.esito,natura=EXCLUDED.natura,regola=EXCLUDED.regola,versione=EXCLUDED.versione,
    risultato=EXCLUDED.risultato,impronta=EXCLUDED.impronta,calcolato_at=now(),
    scartato_at=NULL,scartato_da=NULL,scartato_motivo=NULL,scartato_chiavi=NULL;
  INSERT INTO public.tesoreria_esiti_storia(company_id,transaction_id,esito,natura,regola,versione,impronta,risultato,da)
  VALUES(NEW.company_id,NEW.id,r->>'esito',r->>'natura',r->>'regola',(r->>'versione')::int,imp,r,auth.uid())
  ON CONFLICT(transaction_id,impronta,evento) DO NOTHING;
 ELSE
  -- Riaperto: l'esito «chiuso» non vale più. Si toglie, così coda e badge non lo contano come
  -- chiuso; il ricalcolo prende per primi i movimenti senza esito (calcolato_at NULLS FIRST).
  -- La storia resta.
  DELETE FROM public.tesoreria_esiti WHERE transaction_id=NEW.id;
 END IF;
 RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION private.tes_esito_segue_chiusura() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tes_esito_segue_chiusura ON public.bank_transactions;
CREATE TRIGGER tes_esito_segue_chiusura
 AFTER UPDATE OF chiuso_senza_documento ON public.bank_transactions
 FOR EACH ROW WHEN (OLD.chiuso_senza_documento IS DISTINCT FROM NEW.chiuso_senza_documento)
 EXECUTE FUNCTION private.tes_esito_segue_chiusura();
