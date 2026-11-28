-- Riconciliazione, lotto D (28/11/2026): la controparte imparata conta come riscontro forte.
--
-- bank_proposte_movimento (la «proposta forte» della conferma in blocco) prima conosceva solo:
-- nome della controparte nella causale + numero del documento, oppure IBAN + uno dei due. Nelle
-- aziende reali la banca non manda IBAN né nome, e i documenti dei fornitori ricorrenti non sono
-- citati: forte non risultava quasi mai. Qui si aggiunge la memoria delle scelte a mano
-- (20290701400000): se il movimento è riconosciuto come di un soggetto, il documento di QUEL
-- soggetto con importo uguale al residuo, senza incongruenze, è forte. Restano le altre garanzie:
-- * l'importo deve essere esatto e nessuna incongruenza (date oltre 120 giorni, proposta scartata,
--   abbinamento annullato su questo movimento…);
-- * se la causale cita fatture, decide il motore degli esiti come prima: la memoria basta solo a
--   sostituire l'esito «automatico» per un documento che il motore ha già riconosciuto citato;
-- * la conferma in blocco accetta una proposta solo se è l'UNICA forte del movimento e nessun altro
--   movimento della pagina la reclama (strongProposal, lato client): due fatture dello stesso
--   cliente con lo stesso importo non passano.
--
-- * rate uguali dello stesso soggetto (8–11 per movimento nella prova del 28/11: canoni, leasing):
--   resta forte solo quella con la scadenza più vicina alla data del movimento, entro 45 giorni e
--   senza pari merito. Senza questo spareggio la memoria non serviva proprio ai pagamenti ricorrenti.
--
-- Il soggetto del candidato si cerca solo quando la memoria ha una risposta e l'importo coincide:
-- di solito zero o una ricerca per movimento.
--
-- plan_cache_mode = force_custom_plan anche qui: bank_proposte_lotto la chiama fino a 50 volte
-- nella stessa transazione, oltre la soglia (5) del piano generico di plpgsql. Le sue query sono
-- semplici, ma la regola del 28/11 è «mai piano generico su queste funzioni».
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.bank_proposte_movimento(p_company uuid, p_tx uuid, p_search text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE t public.bank_transactions; c jsonb; result jsonb:='[]'; party text; iban text; docdate date; title text; normparty text; normbank text; normtitle text; why jsonb; warnings jsonb; score int; exact_amount boolean; party_ok boolean; iban_ok boolean; number_ok boolean; old_match boolean; remaining numeric; rif_fatture text[]; analisi jsonb; proposta jsonb; citata boolean;
 memoria jsonb; memoria_ok boolean; sog text; distanza int; n_forti int; vincitore text;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile'; END IF;
 remaining:=(private.bank_movimento_links(p_company,p_tx)->>'remaining')::numeric;
 rif_fatture:=private.tes_riferimenti_fattura(concat_ws(' ',t.description,t.reference));
 IF cardinality(rif_fatture)>0 THEN analisi:=private.tes_classifica(p_company,p_tx); END IF;
 -- Lotto D: il soggetto che le scelte a mano hanno legato a questo movimento (una volta sola).
 memoria:=private.tes_memoria_soggetto(p_company,t);
 FOR c IN SELECT value FROM jsonb_array_elements(public.bank_candidati_movimento(p_company,p_tx,p_search,false)) LOOP
  proposta:=NULL;
  IF analisi IS NOT NULL THEN
   SELECT p INTO proposta FROM jsonb_array_elements(analisi->'candidati') p
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(p->'righe') r WHERE r->>'id'=c->>'id' AND r->>'tipo'=c->>'tipo')
    LIMIT 1;
   IF proposta IS NULL AND btrim(coalesce(p_search,''))='' THEN CONTINUE; END IF;
  END IF;
  party:=NULL;iban:=NULL;docdate:=NULL;
  IF c->>'tipo' IN('documento','invoice') THEN
   SELECT coalesce(nullif(d.cliente_snapshot->>'ragione_sociale',''),nullif(d.cliente_snapshot->>'company_name',''),concat_ws(' ',d.cliente_snapshot->>'nome',d.cliente_snapshot->>'cognome')),
    coalesce(d.cliente_snapshot->>'iban',d.cliente_snapshot->>'iban_bancario'),d.data_scadenza INTO party,iban,docdate
   FROM public.documenti_fiscali_elenco_operativo d WHERE d.id=(c->>'id')::uuid AND d.company_id=p_company;
  ELSE
   SELECT f.name,coalesce(to_jsonb(f)->>'iban',to_jsonb(f)->>'bank_iban'),s.due_date INTO party,iban,docdate
   FROM public.scadenze s LEFT JOIN public.suppliers f ON f.id=s.supplier_id AND f.company_id=s.company_id WHERE s.id=(c->>'id')::uuid AND s.company_id=p_company;
  END IF;
  normparty:=lower(regexp_replace(coalesce(party,''),'[^[:alnum:]]','','g'));
  normbank:=lower(regexp_replace(concat_ws(' ',t.description,t.debtor_name,t.creditor_name),'[^[:alnum:]]','','g'));
  title:=c->>'titolo';normtitle:=lower(regexp_replace(coalesce(title,''),'[^[:alnum:]]','','g'));
  exact_amount:=abs((c->>'residuo')::numeric-remaining)<0.005;
  party_ok:=length(normparty)>=5 AND strpos(normbank,normparty)>0;
  iban_ok:=length(regexp_replace(coalesce(iban,''),'\s','','g'))>=15 AND upper(regexp_replace(iban,'\s','','g'))=upper(regexp_replace(coalesce(CASE WHEN t.transaction_type='credit' THEN t.debtor_iban ELSE t.creditor_iban END,''),'\s','','g'));
  -- Full document identifiers, not a short digit occurring inside an IBAN.
  number_ok:=length(normtitle)>=5 AND normtitle~'[0-9]' AND strpos(lower(regexp_replace(coalesce(t.description,''),'[^[:alnum:]]','','g')),normtitle)>0;
  memoria_ok:=false;
  IF memoria IS NOT NULL AND exact_amount THEN
   sog:=NULL;
   SELECT s.soggetto INTO sog FROM private.tes_soggetto_di(p_company,c->>'tipo',(c->>'id')::uuid) s LIMIT 1;
   memoria_ok:=sog IS NOT NULL AND sog=memoria->>'soggetto';
  END IF;
  distanza:=NULL;
  IF memoria_ok AND t.booking_date IS NOT NULL THEN
   distanza:=abs(t.booking_date-coalesce(docdate,CASE WHEN c->>'tipo'='rata_fornitore' THEN
     (SELECT nullif(r.scadenza,date '9999-12-31') FROM public.rate_fornitori r WHERE r.id=(c->>'id')::uuid AND r.company_id=p_company) END));
  END IF;
  why:='[]';warnings:='[]';score:=0;
  IF exact_amount THEN why:=why||'"Importo uguale al residuo"'::jsonb;score:=score+30;ELSE warnings:=warnings||'"Importo diverso dal residuo: verifica acconto, cumulativo o differenza"'::jsonb;END IF;
  IF party_ok THEN why:=why||'"Controparte corrispondente"'::jsonb;score:=score+25;END IF;
  IF iban_ok THEN why:=why||'"IBAN della controparte corrispondente"'::jsonb;score:=score+35;
  ELSIF nullif(iban,'') IS NOT NULL AND nullif(CASE WHEN t.transaction_type='credit' THEN t.debtor_iban ELSE t.creditor_iban END,'') IS NOT NULL THEN warnings:=warnings||'"IBAN diverso da quello del documento"'::jsonb;END IF;
  IF number_ok THEN why:=why||'"Numero documento nella causale"'::jsonb;score:=score+35;END IF;
  IF memoria_ok THEN
   why:=why||to_jsonb(CASE WHEN (memoria->>'conferme')::int>1
     THEN format('Stessa controparte di %s abbinamenti fatti a mano',memoria->>'conferme')
     ELSE 'Stessa controparte di un abbinamento fatto a mano' END);
   score:=score+35;
  END IF;
  IF docdate IS NOT NULL AND t.booking_date IS NOT NULL THEN
   IF abs(t.booking_date-docdate)<=30 THEN why:=why||'"Data entro 30 giorni dalla scadenza"'::jsonb;score:=score+10;
   ELSIF abs(t.booking_date-docdate)>120 THEN warnings:=warnings||'"Data distante oltre 120 giorni dalla scadenza"'::jsonb;END IF;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.bank_reconciliations r WHERE r.company_id=p_company AND r.transaction_id=p_tx AND r.unmatched_at IS NOT NULL AND ((c->>'id')::uuid IN(r.invoice_id,r.documento_id,r.scadenza_id) OR r.payment_source->>'documento_id'=c->>'id' OR r.payment_source->>'invoice_id'=c->>'id' OR r.payment_source->>'scadenza_id'=c->>'id')) INTO old_match;
  IF old_match OR t.proposta_rifiutata_at IS NOT NULL THEN warnings:=warnings||'"Proposta già scartata o abbinamento annullato: verifica manuale"'::jsonb;END IF;
  citata:=proposta IS NOT NULL;
  IF citata THEN
   why:=coalesce(proposta->'motivi',why);
   IF memoria_ok THEN why:=why||to_jsonb('Stessa controparte degli abbinamenti fatti a mano'::text); END IF;
   score:=100;
  ELSIF analisi IS NOT NULL THEN
   warnings:=warnings||to_jsonb('Il documento non corrisponde ai riferimenti riconosciuti nella causale.'::text);
  END IF;
  result:=result||jsonb_build_array(c||jsonb_build_object('motivi',why,'incongruenze',warnings,'punteggio',least(score,100),
    'forte',exact_amount AND jsonb_array_length(warnings)=0 AND
      CASE WHEN analisi IS NOT NULL THEN citata AND (analisi->>'esito'='automatico' OR memoria_ok)
           ELSE (party_ok AND number_ok) OR (iban_ok AND (party_ok OR number_ok)) OR memoria_ok END,
    'appresa',memoria_ok,'_distanza',distanza,
    'data',docdate,'controparte',coalesce(party,CASE WHEN memoria_ok THEN memoria->>'nome' END)));
 END LOOP;
 -- Rate uguali dello stesso soggetto (leasing, canoni): la memoria le rende forti tutte e la conferma
 -- in blocco le scarterebbe tutte. Resta forte solo la più vicina alla data del movimento, se tutte
 -- hanno una data, se la più vicina è entro 45 giorni e non ha pari merito; le altre tornano normali.
 IF memoria IS NOT NULL THEN
  SELECT count(*) INTO n_forti FROM jsonb_array_elements(result) v WHERE (v->>'appresa')::boolean AND (v->>'forte')::boolean;
  IF n_forti>1 THEN
   SELECT CASE WHEN count(*)=n_forti AND count(*) FILTER (WHERE z.d=z.md)=1 AND z.md<=45 THEN min(z.k) FILTER (WHERE z.d=z.md) END INTO vincitore
     FROM (SELECT v->>'key' k,(v->>'_distanza')::int d,min((v->>'_distanza')::int) OVER () md
             FROM jsonb_array_elements(result) v
            WHERE (v->>'appresa')::boolean AND (v->>'forte')::boolean AND jsonb_typeof(v->'_distanza')='number') z
    GROUP BY z.md;
   SELECT jsonb_agg(CASE WHEN NOT ((v->>'appresa')::boolean AND (v->>'forte')::boolean) THEN v
                         WHEN v->>'key'=vincitore THEN jsonb_set(v,'{motivi}',(v->'motivi')||to_jsonb('Fra le rate uguali dello stesso soggetto, la più vicina alla data del movimento'::text))
                         ELSE v||jsonb_build_object('forte',false,'motivi',(v->'motivi')||to_jsonb('Ci sono altre rate uguali dello stesso soggetto: scegli quella giusta'::text)) END ORDER BY o)
     INTO result FROM jsonb_array_elements(result) WITH ORDINALITY x(v,o);
  END IF;
 END IF;
 result:=coalesce((SELECT jsonb_agg(v-'_distanza' ORDER BY o) FROM jsonb_array_elements(result) WITH ORDINALITY x(v,o)),'[]');
 RETURN coalesce((SELECT jsonb_agg(value ORDER BY (value->>'forte')::boolean DESC,(value->>'punteggio')::int DESC,value->>'key') FROM jsonb_array_elements(result)),'[]');
END $function$;

REVOKE ALL ON FUNCTION public.bank_proposte_movimento(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bank_proposte_movimento(uuid,uuid,text) TO authenticated, service_role;

-- «Fai lo stesso per i simili»: gli altri movimenti aperti che la memoria lega allo stesso soggetto
-- di questo. Solo gli id (al massimo 20, i più recenti): le proposte le calcola poi
-- bank_proposte_lotto, e la conferma resta della persona.
CREATE OR REPLACE FUNCTION public.bank_movimenti_simili(p_company uuid, p_tx uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE t public.bank_transactions; memoria jsonb; result jsonb;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile'; END IF;
 memoria:=private.tes_memoria_soggetto(p_company,t);
 IF memoria IS NULL THEN RETURN '[]'::jsonb; END IF;
 SELECT coalesce(jsonb_agg(z.id ORDER BY z.booking_date DESC, z.id),'[]') INTO result FROM (
  SELECT o.id, o.booking_date
  FROM public.bank_transactions o
  WHERE o.company_id=p_company AND o.id<>p_tx AND o.transaction_type=t.transaction_type
    AND o.status='booked' AND coalesce(o.currency,'EUR')='EUR' AND o.chiuso_senza_documento IS NULL
    AND coalesce(o.reconciliation_status,'pending') NOT IN ('reconciled','matched','ignored')
    AND o.booking_date>=current_date-400
    AND EXISTS(SELECT 1 FROM private.tes_chiavi_movimento(o) a JOIN private.tes_chiavi_movimento(t) b USING (tipo_chiave,chiave))
    AND private.tes_memoria_soggetto(p_company,o)->>'soggetto'=memoria->>'soggetto'
  ORDER BY o.booking_date DESC, o.id
  LIMIT 20) z;
 RETURN result;
END $function$;

REVOKE ALL ON FUNCTION public.bank_movimenti_simili(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bank_movimenti_simili(uuid,uuid) TO authenticated, service_role;
