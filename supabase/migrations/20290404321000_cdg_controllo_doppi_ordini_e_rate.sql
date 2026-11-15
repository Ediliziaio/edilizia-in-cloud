-- Controllo di gestione: due controlli in più in cdg_controllo_doppi (15/11/2026).
-- 7. fattura_su_ordine_e_su_commessa: una fattura ricevuta collegata a un ordine (anche via
--    fattura_ricevuta_ordini) il cui costo NON porta l'ordine ma sta su una commessa: il consuntivo
--    la conterebbe nei costi diretti e di nuovo nell'ordine (marginalita_costo_oda). 0 casi al 15/11.
-- 8. scadenza_e_rata_sullo_stesso_costo: un costo con scadenze aperte E rate fornitore aperte. La
--    cassa prevista usa le scadenze e ignora le rate (forecastLedger), quindi conta una volta, ma i
--    due calendari possono divergere. 1 caso al 15/11 (335,40 €).
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

DO $do$
DECLARE src text; a text; b text;
BEGIN
 SELECT prosrc INTO src FROM pg_proc WHERE oid='public.cdg_controllo_doppi(uuid)'::regprocedure;
 -- Rilanciata a mano non deve duplicare i controlli: se ci sono già, non fa niente.
 IF position('fattura_su_ordine_e_su_commessa' IN src)>0 THEN RETURN; END IF;
 a:=$a$ RETURN out;
END $a$;
 b:=$b$ -- 7. Fattura su un ordine e, col suo costo, anche direttamente sulla commessa
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','fattura_su_ordine_e_su_commessa','ids',jsonb_build_array(fr.id,cc.id),'importo',cc.amount,
   'descrizione',format('Fattura %s collegata a un ordine, ma il suo costo (%s €) sta sulla commessa senza l''ordine',fr.numero_fattura,cc.amount),
   'cosa_fare','Collegare il costo all''ordine: altrimenti la commessa lo conta due volte'))
  FROM public.fatture_ricevute fr JOIN public.company_costs cc ON cc.id=fr.company_cost_id AND cc.company_id=fr.company_id
  WHERE fr.company_id=p_company AND cc.purchase_order_id IS NULL
   AND (cc.order_id IS NOT NULL OR (jsonb_typeof(cc.allocations)='array' AND jsonb_array_length(cc.allocations)>0))
   AND (fr.purchase_order_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.fattura_ricevuta_ordini q WHERE q.company_id=fr.company_id AND q.fattura_id=fr.id))),'[]');
 -- 8. Scadenze aperte e rate fornitore aperte sullo stesso costo
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','scadenza_e_rata_sullo_stesso_costo','ids',jsonb_build_array(x.cost_id),'importo',x.sovrapposto,
   'descrizione',format('Costo con %s € in scadenze aperte e %s € in rate fornitore aperte',x.s_aperto,x.r_aperto),
   'cosa_fare','Tenere un solo calendario: la cassa prevista usa le scadenze e ignora le rate'))
  FROM (SELECT s.cost_id,s.aperto s_aperto,r.aperto r_aperto,least(s.aperto,r.aperto) sovrapposto
        FROM (SELECT cost_id,round(sum(amount-coalesce(paid_amount,0)),2) aperto FROM public.scadenze WHERE company_id=p_company AND cost_id IS NOT NULL AND direction='uscita' AND status IN('da_pagare','parziale') GROUP BY 1) s
        JOIN (SELECT company_cost_id cost_id,round(sum(importo),2) aperto FROM public.rate_fornitori WHERE company_id=p_company AND company_cost_id IS NOT NULL AND stato='da_pagare' GROUP BY 1) r USING (cost_id)) x),'[]');
 RETURN out;
END $b$;
 IF (length(src)-length(replace(src,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'fine della funzione non trovata'; END IF;
 src:=replace(src,a,b);
 EXECUTE 'CREATE OR REPLACE FUNCTION public.cdg_controllo_doppi(p_company uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='''' AS '||quote_literal(src);
END $do$;
REVOKE ALL ON FUNCTION public.cdg_controllo_doppi(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cdg_controllo_doppi(uuid) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
