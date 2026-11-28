-- ════════════════════════════════════════════════════════════════════════════
-- Tesoreria: «Chiudi le spese bancarie» — tutte le commissioni aperte con una
-- conferma, come se si chiudessero una a una (lotto B, 28/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Il motore sa che «COMM. RICHIESTA INCASSO SEPA» o «COMMISSIONI Commissione PagoPA»
-- sono spese bancarie, ma ognuna andava aperta e chiusa a mano con «Senza fattura →
-- Commissioni bancarie». Qui tre funzioni:
--
-- 1. tesoreria_spese_bancarie_aperte(azienda, conto, dal, al) — sola lettura.
--    Le uscite aperte (nessun collegamento, nessuna quota, nessuna prima nota) che
--    private.tes_natura_causale, letta adesso sulla causale, chiama «spesa bancaria»,
--    escluse quelle per cui l'ultimo esito salvato ha trovato qualcosa da collegare
--    (una fattura, un F24, un giroconto…; non R-NESSUNO, R-CHIUSO, R-ESCLUSO). La regola nuova
--    vale subito, senza aspettare il ricalcolo degli esiti. Non si rifà
--    private.tes_classifica: costa mezzo secondo a movimento e la chiamata dal browser
--    ne ha otto in tutto (statement_timeout di authenticated). Per ognuna: importo, conto, regola, categoria del costo, e se va controllata
--    (sopra 50 € o con «bonifico» in causale: «Bonifico tramite Internet Banking …
--    INSTANT» da 2.800 € è passato per spesa bancaria). Quelle da controllare non
--    partono selezionate nell'interfaccia.
--
-- 2. tesoreria_chiudi_spese_bancarie(azienda, movimenti[]) — fino a 200, tutto o niente.
--    Per ogni movimento ricontrolla le stesse condizioni sotto lock del movimento e
--    chiama public.chiudi_movimento_senza_fattura, la stessa funzione del pulsante
--    «Senza fattura»: costo «senza fattura» già pagato da quel movimento (categoria
--    «spese bancarie», «interessi» o «tasse» come il giro notturno
--    private.tes_chiudi_senza_fattura) e prima nota collegata alla banca. Se la stessa
--    uscita è già nella prima nota senza banca (stesso importo, ±3 giorni) il movimento
--    resta aperto e torna in «lasciati_prima_nota»: va collegato a mano alla sua riga.
--    Idempotente: un movimento già chiuso senza documento si conta e si salta, quindi
--    ripetere la stessa richiesta non crea un secondo costo. Un movimento che nel
--    frattempo è cambiato (collegato, non più spesa bancaria) annulla tutto il lotto.
--
-- 3. tesoreria_riapri_spese_bancarie(azienda, movimenti[]) — annulla il lotto:
--    public.riapri_movimento_senza_fattura su ognuno (toglie costo e prima nota creati,
--    rifiuta se al costo è stata collegata una fattura). Tutto o niente. Riapre solo spese
--    della banca chiuse con un costo: il resto si riapre dal dettaglio del movimento.
--
-- 4. Nel giro notturno (tesoreria_conferma_automatica), solo dove l'azienda ha acceso il suo
--    interruttore company_governance_settings.chiusura_spese_bancarie_automatica (nuovo,
--    spento per tutti): private.tes_chiudi_spese_bancarie_auto chiude fino a 50 spese NON da
--    controllare, non già nella prima nota, con un esito R-NESSUNO versione ≥ 2 calcolato
--    nelle ultime 36 ore (una fattura arrivata dopo l'esito vecchio non diventa un doppio costo).
--    Un errore resta scritto nel risultato e non annulla il resto del giro.
--
-- Revisione del 28/11: per la chiusura (in blocco e notturna) non basta la natura
-- «spesa bancaria» della classificazione. private.tes_spesa_bancaria_certa chiede una parola
-- che usa solo la banca (commissione, comm., bollo, competenze, interessi, canone/tenuta conto,
-- fx_card), nessun segno di un altro ente (SDD, pagoPA, CBILL, MAV/RAV, F24) e nessuna
-- controparte diversa dalla banca del conto: «SDD CANONE …» del telefono resta fuori.
--
-- Permessi: come la riconciliazione manuale (private.bank_operativa_access in scrittura),
-- più quelli che chiudi_/riapri_movimento_senza_fattura chiedono già da sole.
-- Idempotente: CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS. Non scrive righe.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.tes_spesa_bancaria_categoria(p_ncaus text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE WHEN coalesce(p_ncaus,'')~'\minteress' THEN 'interessi'
             WHEN coalesce(p_ncaus,'')~'\m(bollo|bolli|imposta)\M' THEN 'tasse'
             ELSE 'spese bancarie' END
$function$;
REVOKE ALL ON FUNCTION private.tes_spesa_bancaria_categoria(text) FROM PUBLIC, anon, authenticated;

-- Revisione del 28/11: «spesa bancaria» per la classificazione non basta per chiudere da sola.
-- N-SPESE riconosce anche «canone», «spese», «imposta»: un SDD «CANONE …» del telefono è un costo
-- di un fornitore. Per la chiusura in blocco serve una parola che usa solo la banca, nessun segno
-- di un altro ente (SDD, pagoPA, CBILL, MAV/RAV, F24) e nessuna controparte diversa dalla banca.
-- Argomenti già passati da private.tes_norm.
CREATE OR REPLACE FUNCTION private.tes_spesa_bancaria_certa(p_ncaus text, p_controparte text, p_iban text, p_banca text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT coalesce(p_ncaus,'')~'(\m(commissione|commissioni|bollo|bolli|competenze|interessi)\M|^comm\M|\mcanone( mensile| trimestrale| annuo| annuale)?( di| del)? conto\M|\mtenuta( del)? conto\M|^fx card( fx card)?$)'
    AND coalesce(p_ncaus,'')!~'\m(sdd|pagopa|pago pa|cbill|mav|rav|f24|stipendi|emolumenti)\M'
    AND nullif(btrim(coalesce(p_iban,'')),'') IS NULL
    AND (nullif(btrim(coalesce(p_controparte,'')),'') IS NULL
         -- la controparte è la banca del conto (per Qonto la banca scrive se stessa)
         OR (nullif(btrim(coalesce(p_banca,'')),'') IS NOT NULL
             AND (position(btrim(p_controparte) in btrim(p_banca))>0 OR position(btrim(p_banca) in btrim(p_controparte))>0))
         -- «fx_card» è il tipo di movimento di Qonto per il cambio sulla carta: la controparte è il negozio
         OR coalesce(p_ncaus,'')~'^fx card( fx card)?$')
$function$;
REVOKE ALL ON FUNCTION private.tes_spesa_bancaria_certa(text,text,text,text) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS private.tes_spesa_bancaria_aperta(uuid,uuid);
CREATE OR REPLACE FUNCTION private.tes_spesa_bancaria_aperta(p_company uuid, p_tx uuid, p_automatico boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- NULL se il movimento non è (più) una spesa bancaria aperta da chiudere; altrimenti i dati per chiuderla.
-- p_automatico (giro notturno): serve anche un esito R-NESSUNO della regola nuova (versione ≥ 2)
-- calcolato nelle ultime 36 ore. Senza esito, o con un esito vecchio, la notte non chiude:
-- nel frattempo può essere arrivata la fattura, e il costo raddoppierebbe.
DECLARE t public.bank_transactions; ncaus text; nat jsonb; controparte text; banca text;
BEGIN
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND OR t.transaction_type<>'debit' OR t.amount>=0
    OR coalesce(t.status,'booked')<>'booked' OR coalesce(t.currency,'EUR')<>'EUR'
    OR coalesce(t.reconciliation_status,'pending') NOT IN('pending','suggestion') OR t.chiuso_senza_documento IS NOT NULL
    OR t.cassa_ripartizione IS NOT NULL
    OR t.linked_invoice_id IS NOT NULL OR t.linked_cost_id IS NOT NULL OR t.linked_scadenza_id IS NOT NULL OR t.linked_installment_id IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.bank_reconciliations x WHERE x.transaction_id=t.id AND x.unmatched_at IS NULL)
    OR EXISTS(SELECT 1 FROM public.prima_nota_entries p WHERE p.bank_transaction_id=t.id)
    -- L'ultimo esito ha trovato qualcosa da collegare (fattura, F24, giroconto, distinta…): non è una spesa da chiudere.
    -- R-CHIUSO su un movimento aperto è l'esito di prima di una riapertura: non conta.
    OR EXISTS(SELECT 1 FROM public.tesoreria_esiti e WHERE e.transaction_id=t.id AND e.regola NOT IN('R-NESSUNO','R-CHIUSO','R-ESCLUSO'))
    OR (p_automatico AND NOT EXISTS(SELECT 1 FROM public.tesoreria_esiti e WHERE e.transaction_id=t.id
          AND e.regola='R-NESSUNO' AND e.versione>=2 AND e.natura='spesa_bancaria' AND e.calcolato_at>now()-interval '36 hours')) THEN
  RETURN NULL;
 END IF;
 controparte:=nullif(coalesce(t.creditor_name,t.counterparty_name,t.merchant_name),'');
 ncaus:=private.tes_norm(concat_ws(' ',t.description,t.reference,controparte));
 nat:=private.tes_natura_causale(ncaus,false,NULL,NULL,t.description);
 IF nat->>'natura' IS DISTINCT FROM 'spesa_bancaria' THEN RETURN NULL; END IF;
 SELECT c.institution_name INTO banca FROM public.bank_accounts a JOIN public.bank_connections c ON c.id=a.connection_id WHERE a.id=t.account_id;
 IF NOT private.tes_spesa_bancaria_certa(private.tes_norm(concat_ws(' ',t.description,t.reference)),private.tes_norm(controparte),
                                         coalesce(t.counterparty_iban,t.creditor_iban),private.tes_norm(banca)) THEN
  RETURN NULL;
 END IF;
 RETURN jsonb_build_object('id',t.id,'data',t.booking_date,'importo',abs(t.amount),'conto_id',t.account_id,
  'descrizione',left(regexp_replace(btrim(coalesce(t.description,'')),'\s+',' ','g'),200),
  'regola_natura',concat(nat->>'regola','/v',nat->>'versione'),
  'categoria_costo',private.tes_spesa_bancaria_categoria(ncaus),
  'da_controllare',abs(t.amount)>50 OR ncaus~'\mbonific',
  'motivo_controllo',CASE WHEN abs(t.amount)>50 THEN 'importo' WHEN ncaus~'\mbonific' THEN 'bonifico' END,
  -- La stessa uscita è già nella prima nota senza banca (stesso importo, ±3 giorni): si lascia aperta,
  -- come fa private.tes_chiudi_senza_fattura. Chiuderla «senza costo» senza collegare la riga farebbe
  -- valere la stessa riga per due commissioni uguali, e una non sarebbe mai registrata.
  'gia_in_prima_nota',EXISTS(SELECT 1 FROM public.prima_nota_entries p
     WHERE p.company_id=p_company AND p.bank_transaction_id IS NULL AND p.direction='uscita'
       AND abs(p.amount-abs(t.amount))<0.005 AND abs(p.entry_date-t.booking_date)<=3));
END $function$;
REVOKE ALL ON FUNCTION private.tes_spesa_bancaria_aperta(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tesoreria_spese_bancarie_aperte(
  p_company uuid, p_conto uuid DEFAULT NULL, p_dal date DEFAULT NULL, p_al date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE righe jsonb; massimo constant int:=200;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN PERFORM private.bank_operativa_access(p_company,true); END IF;
 SELECT coalesce(jsonb_agg(s.x ORDER BY s.x->>'data', s.x->>'id'),'[]')
   INTO righe
   FROM (SELECT private.tes_spesa_bancaria_aperta(p_company,t.id) x
           FROM public.bank_transactions t
          WHERE t.company_id=p_company AND t.transaction_type='debit' AND t.amount<0
            AND coalesce(t.reconciliation_status,'pending') IN('pending','suggestion') AND t.chiuso_senza_documento IS NULL
            -- prefiltro economico: senza una di queste parole non può essere una spesa della banca
            AND concat_ws(' ',t.description,t.reference) ~* '(comm|boll|compet|interess|canone|tenuta|fx)'
            AND (p_conto IS NULL OR t.account_id=p_conto)
            AND (p_dal IS NULL OR t.booking_date>=p_dal) AND (p_al IS NULL OR t.booking_date<=p_al)) s
  WHERE s.x IS NOT NULL;
 RETURN jsonb_build_object(
  'movimenti',(SELECT coalesce(jsonb_agg(x ORDER BY o),'[]') FROM jsonb_array_elements(righe) WITH ORDINALITY q(x,o) WHERE o<=massimo),
  'numero',least(jsonb_array_length(righe),massimo),
  'totale',(SELECT coalesce(round(sum((x->>'importo')::numeric),2),0) FROM jsonb_array_elements(righe) WITH ORDINALITY q(x,o) WHERE o<=massimo),
  'da_controllare',(SELECT count(*) FROM jsonb_array_elements(righe) WITH ORDINALITY q(x,o) WHERE o<=massimo AND (x->>'da_controllare')::boolean),
  'soglia',50,
  'troppi',jsonb_array_length(righe)>massimo);
END $function$;

REVOKE ALL ON FUNCTION public.tesoreria_spese_bancarie_aperte(uuid,uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_spese_bancarie_aperte(uuid,uuid,date,date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tesoreria_chiudi_spese_bancarie(p_company uuid, p_movimenti uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_id uuid; t public.bank_transactions; sb jsonb; v_voce text;
 chiusi uuid[]:='{}'; lasciati uuid[]:='{}'; n_gia int:=0; totale numeric:=0;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 IF p_movimenti IS NULL OR cardinality(p_movimenti)=0 THEN
  RAISE EXCEPTION 'Scegli almeno una spesa da chiudere.' USING ERRCODE='22023';
 END IF;
 IF cardinality(p_movimenti)>200 THEN
  RAISE EXCEPTION 'Al massimo 200 spese per volta.' USING ERRCODE='22023';
 END IF;
 PERFORM set_config('lock_timeout','3s',true); PERFORM set_config('statement_timeout','60s',true);
 -- Lo stesso lock di chiudi_movimento_senza_fattura: due lotti della stessa azienda vanno in fila.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company::text, 2810));

 FOR v_id IN SELECT DISTINCT u FROM unnest(p_movimenti) u ORDER BY u LOOP
  SELECT * INTO t FROM public.bank_transactions WHERE id=v_id AND company_id=p_company FOR UPDATE;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Uno dei movimenti non è disponibile: ricarica l''elenco.' USING ERRCODE='P0002';
  END IF;
  -- Già chiuso senza documento (anche da questa stessa richiesta ripetuta): fatto, si salta.
  IF t.chiuso_senza_documento IS NOT NULL THEN n_gia:=n_gia+1; CONTINUE; END IF;
  sb:=private.tes_spesa_bancaria_aperta(p_company,t.id);
  IF sb IS NULL THEN
   RAISE EXCEPTION 'Il movimento del % (% €) non è più una spesa bancaria da chiudere: ricarica l''elenco.',
     to_char(t.booking_date,'DD/MM/YYYY'), replace(to_char(abs(t.amount),'FM999999990.00'),'.',',') USING ERRCODE='PT409';
  END IF;
  -- Già nella prima nota senza banca: resta aperto, da collegare a mano alla sua riga (come il giro notturno).
  IF (sb->>'gia_in_prima_nota')::boolean THEN lasciati:=lasciati||t.id; CONTINUE; END IF;
  SELECT v.nome INTO v_voce FROM public.cassa_voci v WHERE v.id=t.cassa_voce_id AND v.company_id=p_company;
  PERFORM public.chiudi_movimento_senza_fattura(t.id,'spesa',coalesce(v_voce,'Spese bancarie'),
    left(coalesce(nullif(regexp_replace(btrim(coalesce(t.description,'')),'\s+',' ','g'),''),'Spesa bancaria'),185)||' · '||left(t.id::text,8),
    sb->>'categoria_costo');
  chiusi:=chiusi||t.id; totale:=totale+abs(t.amount);
 END LOOP;
 RETURN jsonb_build_object('chiusi',to_jsonb(chiusi),'con_costo',cardinality(chiusi),'lasciati_prima_nota',to_jsonb(lasciati),
                           'gia_chiusi',n_gia,'totale',round(totale,2));
END $function$;

REVOKE ALL ON FUNCTION public.tesoreria_chiudi_spese_bancarie(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_chiudi_spese_bancarie(uuid,uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tesoreria_riapri_spese_bancarie(p_company uuid, p_movimenti uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id uuid; t public.bank_transactions; n int:=0;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 IF p_movimenti IS NULL OR cardinality(p_movimenti)=0 OR cardinality(p_movimenti)>200 THEN
  RAISE EXCEPTION 'Da 1 a 200 movimenti per volta.' USING ERRCODE='22023';
 END IF;
 PERFORM set_config('lock_timeout','3s',true); PERFORM set_config('statement_timeout','60s',true);
 FOR v_id IN SELECT DISTINCT u FROM unnest(p_movimenti) u ORDER BY u LOOP
  SELECT * INTO t FROM public.bank_transactions WHERE id=v_id AND company_id=p_company;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'Uno dei movimenti non è disponibile.' USING ERRCODE='P0002';
  END IF;
  -- Solo ciò che questo comando chiude: una spesa della banca chiusa con un costo. Il resto si
  -- riapre dal dettaglio del movimento, uno per uno.
  IF t.chiuso_senza_documento IS DISTINCT FROM 'spesa'
     OR NOT private.tes_spesa_bancaria_certa(private.tes_norm(concat_ws(' ',t.description,t.reference)),
              private.tes_norm(nullif(coalesce(t.creditor_name,t.counterparty_name,t.merchant_name),'')),
              coalesce(t.counterparty_iban,t.creditor_iban),
              private.tes_norm((SELECT c.institution_name FROM public.bank_accounts a JOIN public.bank_connections c ON c.id=a.connection_id WHERE a.id=t.account_id))) THEN
   RAISE EXCEPTION 'Il movimento del % (% €) non è una spesa bancaria chiusa da questo comando: riaprilo dal suo dettaglio.',
     to_char(t.booking_date,'DD/MM/YYYY'), replace(to_char(abs(t.amount),'FM999999990.00'),'.',',') USING ERRCODE='PT409';
  END IF;
  IF coalesce((public.riapri_movimento_senza_fattura(v_id)->>'riaperto')::boolean,false) THEN n:=n+1; END IF;
 END LOOP;
 RETURN jsonb_build_object('riaperti',n);
END $function$;

REVOKE ALL ON FUNCTION public.tesoreria_riapri_spese_bancarie(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_riapri_spese_bancarie(uuid,uuid[]) TO authenticated, service_role;

-- Interruttore della chiusura notturna: spento per tutti. Colonna con valore costante:
-- solo metadati, nessuna riga riscritta.
ALTER TABLE public.company_governance_settings
  ADD COLUMN IF NOT EXISTS chiusura_spese_bancarie_automatica boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.company_governance_settings.chiusura_spese_bancarie_automatica IS
  'Il giro notturno chiude da solo, senza fattura, le spese della banca riconosciute dalla causale (≤ 50 €, esito R-NESSUNO recente). Spento di base.';

CREATE OR REPLACE FUNCTION private.tes_chiudi_spese_bancarie_auto(p_company uuid, p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE ids uuid[];
BEGIN
 -- Un interruttore suo, spento per tutti: lo accende l'azienda. chiusura_senza_fattura_automatica
 -- vale per la voce di cassa assegnata dalle regole, non per la sola causale.
 IF NOT coalesce((SELECT g.chiusura_spese_bancarie_automatica FROM public.company_governance_settings g WHERE g.company_id=p_company),false) THEN
  RETURN jsonb_build_object('attiva',false);
 END IF;
 SELECT coalesce(array_agg(x.id ORDER BY x.booking_date, x.id),'{}') INTO ids FROM (
  SELECT t.id, t.booking_date FROM public.bank_transactions t
   CROSS JOIN LATERAL (SELECT private.tes_spesa_bancaria_aperta(p_company,t.id,true) sb) s
   WHERE t.company_id=p_company AND t.transaction_type='debit' AND t.amount<0
     AND coalesce(t.reconciliation_status,'pending') IN('pending','suggestion') AND t.chiuso_senza_documento IS NULL
     AND concat_ws(' ',t.description,t.reference) ~* '(comm|boll|compet|interess|canone|tenuta|fx)'
     AND s.sb IS NOT NULL AND NOT (s.sb->>'da_controllare')::boolean AND NOT (s.sb->>'gia_in_prima_nota')::boolean
   ORDER BY t.booking_date, t.id
   LIMIT least(greatest(coalesce(p_limite,50),1),200)) x;
 IF cardinality(ids)=0 THEN RETURN jsonb_build_object('attiva',true,'chiusi',0); END IF;
 BEGIN
  RETURN jsonb_build_object('attiva',true)||public.tesoreria_chiudi_spese_bancarie(p_company,ids);
 EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('attiva',true,'errore',SQLERRM);
 END;
END $function$;
REVOKE ALL ON FUNCTION private.tes_chiudi_spese_bancarie_auto(uuid,integer) FROM PUBLIC, anon, authenticated;

DO $patch$
DECLARE
  d text := pg_get_functiondef('public.tesoreria_conferma_automatica(uuid,integer)'::regprocedure);
  vecchio text := $v$||private.tes_chiudi_senza_fattura(p_company,200);$v$;
  nuovo text := $n$||private.tes_chiudi_senza_fattura(p_company,200)
                  -- 28/11/2026 (lotto B): poi le spese bancarie riconosciute dalla causale, fino a 50.
                  ||jsonb_build_object('spese_bancarie',private.tes_chiudi_spese_bancarie_auto(p_company,50));$n$;
BEGIN
  IF position('private.tes_chiudi_spese_bancarie_auto(' in d) > 0 THEN RETURN; END IF;
  IF (length(d) - length(replace(d, vecchio, ''))) / length(vecchio) <> 1 THEN
    RAISE EXCEPTION 'tesoreria_conferma_automatica: il punto da cambiare non c''è più (o non è unico), la patch va rifatta a mano';
  END IF;
  EXECUTE replace(d, vecchio, nuovo);
END
$patch$;
