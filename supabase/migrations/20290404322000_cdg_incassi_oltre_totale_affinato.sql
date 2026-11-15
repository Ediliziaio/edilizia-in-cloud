-- Controllo di gestione: «documento_oltre_totale» affinato sui dati veri (15/11/2026).
-- Su 48 fatture segnalate, 47 erano arrotondamenti sotto 1 € di fatture importate; una era incassata
-- per il LORDO (pagato = totale del documento) mentre il dovuto è il netto: la ritenuta è finita
-- fra gli incassi. Ora: sotto 1 € non si segnala; il caso del lordo dice cosa fare.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

DO $do$
DECLARE src text; a text; b text;
BEGIN
 SELECT prosrc INTO src FROM pg_proc WHERE oid='public.cdg_controllo_doppi(uuid)'::regprocedure;
 a:=$a$'descrizione',format('Fattura %s: incassati %s € su %s €',d.numero,d.importo_pagato,d.totale_da_pagare),'cosa_fare','Controllare gli incassi doppi della fattura'))
  FROM public.documenti_fiscali_elenco_operativo d WHERE d.company_id=p_company AND d.deleted_at IS NULL AND d.tipo<>'nota_credito' AND d.totale_da_pagare>0 AND coalesce(d.importo_pagato,0)>d.totale_da_pagare+0.005),'[]');$a$;
 b:=$b$'descrizione',format('Fattura %s: incassati %s € su %s €',d.numero,d.importo_pagato,d.totale_da_pagare),
   'cosa_fare',CASE WHEN abs(coalesce(d.importo_pagato,0)-coalesce(d.totale_documento,0))<0.01 THEN 'Incassato il lordo: la ritenuta (o lo split payment) è stata registrata come incasso, va stornata'
                    ELSE 'Controllare gli incassi doppi della fattura' END))
  FROM public.documenti_fiscali_elenco_operativo d WHERE d.company_id=p_company AND d.deleted_at IS NULL AND d.tipo<>'nota_credito' AND d.totale_da_pagare>0 AND coalesce(d.importo_pagato,0)>d.totale_da_pagare+1.00),'[]');$b$;
 IF (length(src)-length(replace(src,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'controllo 2 non trovato'; END IF;
 src:=replace(src,a,b);
 EXECUTE 'CREATE OR REPLACE FUNCTION public.cdg_controllo_doppi(p_company uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='''' AS '||quote_literal(src);
END $do$;
REVOKE ALL ON FUNCTION public.cdg_controllo_doppi(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cdg_controllo_doppi(uuid) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
