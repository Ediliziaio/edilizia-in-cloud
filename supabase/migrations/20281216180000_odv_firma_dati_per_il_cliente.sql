-- La pagina di firma del cliente (06/11/2026): chi chiede, quanto si paga con l'IVA, dove.
-- Prima la pagina diceva «Ordine di Variazione n. 1» e un importo IVA esclusa, senza il nome dell'impresa:
-- chi riceve il link non sa da chi arriva né quanto pagherà davvero. Qui si aggiungono tre valori di sola
-- lettura, presi da quello che il cliente già conosce (la sua commessa e l'impresa con cui ha il contratto).
-- Nessun altro dato esce: niente costi interni, margini, note o allegati non suoi. Idempotente.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function public.odv_view_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
DECLARE v public.ordini_variazione%ROWTYPE; d public.order_variation_documents%ROWTYPE; o public.orders%ROWTYPE; h text; v_impresa text;
BEGIN
 IF coalesce(p_token,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN jsonb_build_object('valid',false); END IF;
 SELECT * INTO v FROM public.ordini_variazione WHERE firma_token=p_token;
 IF NOT FOUND OR v.status='bozza' OR v.status='annullato' OR v.link_revoked_at IS NOT NULL OR coalesce(v.link_expires_at,v.created_at+interval '30 days')<=now() THEN RETURN jsonb_build_object('valid',false); END IF;
 SELECT * INTO d FROM public.order_variation_documents WHERE id=v.current_document_id AND variation_id=v.id AND company_id=v.company_id AND order_id=v.order_id;
 SELECT * INTO o FROM public.orders WHERE id=v.order_id;
 -- Il nome sul documento è quello che il cliente ha letto; se manca, la ragione sociale dell'impresa.
 v_impresa = nullif(btrim(coalesce(d.context->>'companyName', '')), '');
 IF v_impresa IS NULL THEN SELECT nullif(btrim(c.name), '') INTO v_impresa FROM public.companies c WHERE c.id = v.company_id; END IF;
 h=coalesce(d.document_hash,encode(extensions.digest(jsonb_build_object('id',v.id,'numero',v.numero_odv,'titolo',v.titolo,'descrizione',v.descrizione,'importo',v.impatto_economico,'giorni',v.impatto_giorni)::text,'sha256'),'hex'));
 RETURN jsonb_build_object('valid',true,'gia_firmato',v.status<>'in_attesa','id',v.id,'numero_odv',v.numero_odv,'titolo',v.titolo,'descrizione',v.descrizione,'motivazione',v.motivazione,'impatto_economico',v.impatto_economico,'impatto_giorni',v.impatto_giorni,'richiesto_da',v.richiesto_da,'richiesto_il',v.richiesto_il,'status',v.status,'document_hash',h,'has_document',d.id IS NOT NULL,
   'impresa', v_impresa,
   'iva_percentuale', o.vat_rate,
   'cantiere', nullif(btrim(coalesce(d.context->>'siteAddress', o.indirizzo_lavori, o.work_address, '')), ''),
   'attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x->>'id','name',x->>'name','size',x->'size')) FROM jsonb_array_elements(d.attachments) x),'[]'::jsonb));
END $function$;
