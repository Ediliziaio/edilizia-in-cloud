-- Contratto letto con l'AI alla creazione della commessa (14/11/2026).
--
-- Prima che la commessa esista l'originale aspetta in documenti-smart, sotto
-- <azienda>/ai-contratti/: in order-attachments la regola office_attachment_file_insert
-- accetta solo cartelle di commesse modificabili, e il caricamento sotto <azienda>/
-- era rifiutato a tutti tranne il servizio. Alla creazione l'app lo copia in
-- order-attachments/<commessa>/ai-contratti/ e lo registra in order_attachments
-- (access_scope «vendita»): è quella copia che il contratto firmato deve indicare.
-- La RPC accettava solo percorsi <azienda>/…: ora anche <commessa>/….
-- Il resto della funzione è identico.

CREATE OR REPLACE FUNCTION public.contratto_importato_collega(p_order uuid, p_path text, p_nome text, p_mime text, p_firmato_il date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.orders;
  v_numero text;
  v_quote uuid;
  v_iva numeric;
begin
  if auth.uid() is null then raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.deleted_at is not null then raise exception 'Commessa non trovata.' using errcode = 'P0002'; end if;
  perform public.assert_company_access(o.company_id);
  if public.has_permission_for_company(auth.uid(), 'can_edit_orders', o.company_id) is not true then
    raise exception 'Non hai il permesso di modificare le commesse.' using errcode = '42501';
  end if;
  if o.quote_id is not null then
    return jsonb_build_object('quote_id', o.quote_id, 'gia_collegato', true);
  end if;
  if p_path is null or p_path like '%..%'
     or not (p_path like o.company_id || '/%' or p_path like o.id || '/%')
     or not exists (select 1 from storage.objects s where s.bucket_id = 'order-attachments' and s.name = p_path) then
    raise exception 'Il documento del contratto non è stato trovato.' using errcode = '22023';
  end if;

  v_numero := public.generate_quote_number(o.company_id);
  v_iva := round(coalesce(o.total_amount, 0) * coalesce(o.vat_rate, 0) / 100, 2);
  insert into public.quotes (
    company_id, quote_number, status, client_name, client_email, client_phone, client_company, client_address,
    title, description, subtotal, vat_amount, total, indirizzo_lavori, tipo_lavoro, opportunity_id,
    signed_at, signed_by_name, firma_modo, contratto_firmato, source, created_by)
  values (
    o.company_id, v_numero, 'convertita', o.client_name, o.client_email, o.client_phone, o.client_company, o.client_address,
    'Contratto importato · ' || coalesce(o.order_code, ''), o.description,
    coalesce(o.total_amount, 0), v_iva, coalesce(o.total_amount, 0) + v_iva, o.indirizzo_lavori, o.tipo_lavoro, o.opportunity_id,
    coalesce((p_firmato_il + time '12:00') at time zone 'Europe/Rome', now()), o.client_name, 'importato',
    jsonb_build_object('bucket', 'order-attachments', 'path', p_path,
                       'name', coalesce(nullif(btrim(p_nome), ''), 'contratto firmato'), 'mime', p_mime),
    'contratto_importato', auth.uid())
  returning id into v_quote;

  update public.orders set quote_id = v_quote, quote_number = v_numero where id = o.id;
  perform public.rate_aggiorna_date(o.id);
  return jsonb_build_object('quote_id', v_quote, 'quote_number', v_numero);
end $function$;
