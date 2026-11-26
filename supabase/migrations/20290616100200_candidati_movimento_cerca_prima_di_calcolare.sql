-- Cercare una fattura da abbinare: da 5,2 secondi a 26 millisecondi (26/11/2026).
--
-- Terzo e ultimo passo su `bank_candidati_movimento`, che tornava «L'operazione ha
-- impiegato troppo tempo» e lasciava vuoto l'elenco dei documenti da abbinare alla
-- distinta RiBa. Misurato su Impresa Vulcano, 1.300 rate e 1.340 fatture ricevute:
--   · partenza                              11,7 s
--   · con la CTE materializzata (…100)       5,2 s
--   · cercando il testo prima del residuo   0,026 s
--
-- Il punto: `private.fornitore_residuo_rata` è una query su rate, prima nota e anticipi,
-- e il filtro sul testo stava FUORI, applicato dopo. Così il residuo veniva calcolato per
-- tutte le 1.300 rate anche quando la ricerca ne teneva 13. Spostare il filtro dentro non
-- bastava: il pianificatore lo rimandava comunque in fondo allo scan. Serve una barriera —
-- una CTE materializzata che seleziona le righe per testo — e il residuo si calcola solo
-- su quelle che restano.
--
-- La ricerca per importo continua a funzionare: se il testo cercato è un numero il
-- pre-filtro si tira indietro e passano tutte, perché l'importo lo si conosce solo dopo
-- aver calcolato il residuo.
--
-- Resta lento l'elenco iniziale senza ricerca (circa 5 s su Vulcano): lì i residui vanno
-- calcolati tutti per poter ordinare per vicinanza all'importo del movimento. Il pannello
-- dice già «Primi 100 risultati, usa la ricerca per trovare gli altri documenti», ed è la
-- ricerca il gesto che si fa davvero quando si abbina una distinta.

set local lock_timeout = '3s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.bank_candidati_movimento(p_company uuid, p_tx uuid, p_search text DEFAULT ''::text, p_existing boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  t public.bank_transactions;
  result jsonb;
  q text:=lower(btrim(p_search));
  -- Chiesti una volta sola: dentro i WHERE costavano 14 ms per valutazione.
  v_scadenze boolean;
  v_incassi boolean;
  -- Un testo che è tutto cifre può voler dire l'importo, che si conosce solo dopo aver
  -- calcolato il residuo: in quel caso il pre-filtro non filtra.
  v_cerca_testo boolean;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile';END IF;
 IF coalesce(t.currency,'EUR')<>'EUR' THEN RAISE EXCEPTION 'Per movimenti in altre valute serve verificare il cambio: non vengono convertiti automaticamente';END IF;
 IF p_existing THEN
  IF public.has_permission_for_company(auth.uid(),'can_view_prima_nota',p_company) IS NOT TRUE THEN RAISE EXCEPTION 'Non hai accesso al registro pagamenti' USING ERRCODE='42501';END IF;
  SELECT coalesce(jsonb_agg(j),'[]') INTO result FROM(
   SELECT jsonb_build_object('id',p.id,'tipo','pagamento','key','pagamento:'||p.id,'titolo',p.description,'sottotitolo',concat(p.entry_date,' · ',p.payment_method),'residuo',p.amount) j
   FROM public.prima_nota_entries p WHERE p.company_id=p_company AND p.amount>0 AND p.reversal_of IS NULL AND p.bank_transaction_id IS NULL
   AND coalesce(lower(p.payment_method),'') NOT IN('contanti','cash')
   AND p.direction=CASE WHEN t.transaction_type='credit' THEN 'entrata' ELSE 'uscita' END
   AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries z WHERE z.company_id=p_company AND z.reversal_of=p.id)
   AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations r WHERE r.company_id=p_company AND r.unmatched_at IS NULL AND (r.prima_nota_id=p.id OR (p.movimento_id IS NOT NULL AND r.movimento_id=p.movimento_id)))
   AND (q='' OR strpos(lower(concat_ws(' ',p.description,p.notes,p.reference_number,p.amount,p.entry_date)),q)>0)
   ORDER BY p.entry_date DESC,p.id LIMIT 100) z;
 ELSE
  v_scadenze := t.transaction_type='debit' AND public.puo_gestire_scadenze(p_company);
  v_incassi := t.transaction_type='credit' AND public.puo_incassare_fatture(p_company)
               AND public.has_permission_for_company(auth.uid(),'can_view_billing',p_company);
  v_cerca_testo := q<>'' AND q !~ '^[0-9][0-9.,]*$';

  WITH rate_filtrate AS MATERIALIZED (
   -- Barriera: qui si sceglie per testo, e il residuo (che è una query) si calcola solo
   -- sulle righe che restano. Senza, il pianificatore lo rimanda in fondo allo scan e lo
   -- esegue per tutte le rate dell'azienda.
   SELECT r AS rata, r.id,
     'Rata '||r.numero||' · '||coalesce(f.numero_fattura,c.name) AS titolo,
     concat_ws(' · ',coalesce(s.name,f.cedente_ragione_sociale),r.scadenza) AS sottotitolo
   FROM public.rate_fornitori r
   JOIN public.company_costs c ON c.id=r.company_cost_id AND c.company_id=r.company_id AND c.annullato_il IS NULL
   LEFT JOIN public.fatture_ricevute f ON f.id=r.fattura_ricevuta_id AND f.company_id=r.company_id
   LEFT JOIN public.suppliers s ON s.id=coalesce(c.supplier_id,f.fornitore_id) AND s.company_id=r.company_id
   WHERE r.company_id=p_company AND r.stato NOT IN('stornata','da_bloccare','richiamata') AND v_scadenze
     AND NOT EXISTS(select 1 from public.scadenze x where x.company_id=p_company and x.cost_id=c.id
       and x.direction='uscita' and x.status in ('da_pagare','parziale'))
     AND (NOT v_cerca_testo OR strpos(lower(concat_ws(' ',
           'Rata '||r.numero||' · '||coalesce(f.numero_fattura,c.name),
           coalesce(s.name,f.cedente_ragione_sociale),r.scadenza)),q)>0)
  ), candidates AS MATERIALIZED (
   SELECT id,CASE origine WHEN 'nativa' THEN 'documento' ELSE 'invoice' END tipo,numero titolo,
    concat_ws(' · ',coalesce(nullif(cliente_snapshot->>'ragione_sociale',''),nullif(cliente_snapshot->>'company_name',''),nullif(concat_ws(' ',cliente_snapshot->>'nome',cliente_snapshot->>'cognome'),'')),data_scadenza) sottotitolo,greatest(0,coalesce(totale_da_pagare,0)-coalesce(importo_pagato,0)-coalesce(stornato,0)) residuo, false segnata_pagata
   FROM public.documenti_fiscali_elenco_operativo WHERE company_id=p_company AND deleted_at IS NULL AND v_incassi
   AND tipo IN('fattura','fattura_pa','parcella','fattura_accompagnatoria','acconto_fattura','acconto_parcella','fattura_differita_b','fattura_riepilogativa','nota_debito')
   AND stato IN('emessa','inviata_sdi','consegnata','accettata','scaduta','parzialmente_pagata')
   UNION ALL
   SELECT s.id,'scadenza',s.description,concat_ws(' · ',f.name,s.due_date),s.amount-coalesce(s.paid_amount,0), false
   FROM public.scadenze s LEFT JOIN public.suppliers f ON f.id=s.supplier_id AND f.company_id=s.company_id
   WHERE s.company_id=p_company AND s.direction='uscita' AND s.status IN('da_pagare','parziale') AND coalesce(s.is_previsionale,false)=false AND v_scadenze
   UNION ALL
   -- Anche le rate segnate pagate che hanno ancora un residuo (26/11/2026): la riga dice
   -- pagata ma i soldi non risultano usciti, e il pagamento vero deve potercisi attaccare.
   -- A tenere fuori quelle pagate davvero basta il `residuo>0` qui sotto.
   SELECT rf.id,'rata_fornitore',rf.titolo,rf.sottotitolo,private.fornitore_residuo_rata(rf.rata),(rf.rata).stato='pagata'
   FROM rate_filtrate rf
   UNION ALL
   SELECT f.id,'ricevuta','Fattura '||f.numero_fattura,concat_ws(' · ',f.cedente_ragione_sociale,f.data_fattura),saldi.residuo, false
   FROM private.fatture_ricevute_calcola_saldi(p_company,null,null) saldi
   JOIN public.fatture_ricevute f ON f.id=saldi.id AND f.company_id=p_company
   WHERE v_scadenze
     AND f.pagata_il IS NULL AND saldi.residuo>0 AND saldi.rate_totali=0
     AND NOT EXISTS(select 1 from public.scadenze x where x.company_id=p_company and x.cost_id=f.company_cost_id
       and x.direction='uscita' and x.status in ('da_pagare','parziale'))
  ) SELECT coalesce(jsonb_agg(j),'[]') INTO result FROM(
   SELECT jsonb_build_object('id',id,'tipo',tipo,'key',tipo||':'||id,'titolo',titolo,'sottotitolo',sottotitolo,'residuo',residuo,'affine',id=ANY(coalesce(t.reconciliation_suggestions,ARRAY[]::uuid[])),
     'etichetta',CASE WHEN segnata_pagata THEN 'Segnata pagata · pagamento non registrato'
                      WHEN id=ANY(coalesce(t.reconciliation_suggestions,ARRAY[]::uuid[])) THEN 'Suggerita · da verificare' END) j FROM candidates
   WHERE residuo>0 AND (q='' OR strpos(lower(concat_ws(' ',titolo,sottotitolo,residuo)),q)>0) ORDER BY abs(residuo-abs(t.amount)),id LIMIT 100) z;
 END IF;
 RETURN result;
END $function$;
