SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- pg_net.created marks the START of the HTTP batch, not response completion.
-- The gateway upstream timing measures the actual API work. End-to-end timing
-- is measured independently by the GitHub sentinel, outside this database.
CREATE OR REPLACE FUNCTION public.battito_interpreta_risposta(
 p_status integer,p_content text,p_errore text,p_headers jsonb
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog AS $function$
DECLARE v_body jsonb; v_ms integer; v_timing text; v_error text;
BEGIN
 BEGIN v_body := p_content::jsonb; EXCEPTION WHEN invalid_text_representation THEN v_body := NULL; END;
 v_timing := p_headers->>'x-envoy-upstream-service-time';
 IF v_timing ~ '^[0-9]+([.][0-9]+)?$' AND length(v_timing) <= 32 THEN
   v_ms := least(2147483647,ceil(v_timing::numeric))::integer;
 END IF;
 v_error := CASE
   WHEN nullif(p_errore,'') IS NOT NULL THEN p_errore
   WHEN p_status IS DISTINCT FROM 200 THEN 'Risposta HTTP non valida: ' || coalesce(p_status::text,'assente')
   WHEN v_body IS DISTINCT FROM 'true'::jsonb THEN 'La sonda non ha confermato la risposta del database'
   WHEN v_ms > 15000 THEN 'risposta lenta (oltre 15 secondi)'
   ELSE NULL END;
 RETURN jsonb_build_object('esito',CASE WHEN v_error IS NULL THEN 'ok' ELSE 'fallito' END,
   'durata_ms',v_ms,'errore',v_error);
END; $function$;
REVOKE ALL ON FUNCTION public.battito_interpreta_risposta(integer,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.battito_interpreta_risposta(integer,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.battito_verifica()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public,net,pg_catalog AS $function$
DECLARE v_chiusi integer; v_scaduti integer; v_avviso jsonb;
BEGIN
 WITH risposte AS (
   SELECT b.id, r.status_code,
     public.battito_interpreta_risposta(r.status_code,r.content,r.error_msg,r.headers) AS risultato
   FROM public.battito_esterno b JOIN net._http_response r ON r.id=b.request_id
   WHERE b.esito IS NULL ORDER BY b.avviato_il LIMIT 100
 ), aggiornati AS (
   UPDATE public.battito_esterno b SET esito=s.risultato->>'esito',
     status_code=s.status_code,errore=s.risultato->>'errore',durata_ms=(s.risultato->>'durata_ms')::integer
   FROM risposte s WHERE b.id=s.id AND b.esito IS NULL RETURNING b.id
 ) SELECT count(*) INTO v_chiusi FROM aggiornati;
 WITH aggiornati AS (
   UPDATE public.battito_esterno SET esito='fallito',errore='nessuna risposta entro 90 secondi',durata_ms=NULL
   WHERE id IN (SELECT id FROM public.battito_esterno WHERE esito IS NULL
     AND avviato_il<now()-interval '90 seconds' ORDER BY avviato_il LIMIT 100)
   RETURNING id
 ) SELECT count(*) INTO v_scaduti FROM aggiornati;
 DELETE FROM public.battito_esterno WHERE id IN (
   SELECT id FROM public.battito_esterno WHERE avviato_il<now()-interval '30 days' ORDER BY avviato_il LIMIT 1000);
 BEGIN v_avviso := public.battito_avvisa();
 EXCEPTION WHEN OTHERS THEN
   v_avviso := jsonb_build_object('errore',SQLERRM);
   RAISE WARNING 'Battito: avviso non riuscito: %',SQLERRM;
 END;
 RETURN jsonb_build_object('chiusi',v_chiusi,'senza_risposta',v_scaduti,'avviso',v_avviso);
END; $function$;
REVOKE ALL ON FUNCTION public.battito_verifica() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.battito_verifica() TO service_role;
COMMENT ON COLUMN public.battito_esterno.durata_ms IS
 'Tempo upstream API dal gateway x-envoy-upstream-service-time; NULL se assente. Non include rete/attesa pg_net e non deriva dal timestamp iniziale del lotto. La sonda GitHub misura separatamente il tempo end-to-end.';
