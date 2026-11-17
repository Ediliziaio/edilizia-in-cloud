-- Il preventivo con computo si firma anche su carta (17/11/2026).
--
-- La commessa nasce solo dal preventivo firmato (il firmato è il contratto). Il computo però
-- aveva una sola strada: la firma online. Un ente pubblico, o un cliente che firma il contratto
-- d'appalto stampato, lasciava il preventivo «inviato» per sempre, e «Crea la commessa» apriva un
-- modulo che al salvataggio rispondeva «Il preventivo deve essere accettato».
--
-- Il preventivo del computo è una riga vera di `quotes` (source `modulo:computo:<bozza>`), con le
-- sue righe: si firma su carta come il preventivo classico. Gli altri preventivatori restano sulla
-- loro funzione (`modulo_firmato_su_carta`). Il resto è identico.

CREATE OR REPLACE FUNCTION public.preventivo_firmato_su_carta(p_quote uuid, p_path text, p_nome text, p_mime text, p_firmato_il date, p_firmatario text, p_solo_verifica boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare q public.quotes;
begin
  if auth.uid() is null then raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if q.id is null or q.deleted_at is not null then raise exception 'Preventivo non trovato.' using errcode = 'P0002'; end if;
  perform public.assert_company_access(q.company_id);
  if public.has_permission_for_company(auth.uid(), 'can_edit_preventivi', q.company_id) is not true then
    raise exception 'Non hai il permesso di modificare i preventivi.' using errcode = '42501';
  end if;
  if coalesce(q.source, '') like 'modulo:%' and coalesce(q.source, '') not like 'modulo:computo:%' then
    raise exception 'Questo preventivo si firma dal suo preventivatore.' using errcode = '22023';
  end if;
  if q.status in ('accettata', 'convertita') then
    raise exception 'Il preventivo è già firmato: è già il contratto.' using errcode = '22023';
  end if;
  if q.status not in ('bozza', 'inviata', 'scaduta') then
    raise exception 'Un preventivo «%» non si firma: riaprilo o fanne una revisione.', q.status using errcode = '22023';
  end if;
  if p_firmato_il is null or p_firmato_il > (now() at time zone 'Europe/Rome')::date then
    raise exception 'Indica il giorno della firma (non nel futuro).' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_firmatario, '')), '') is null then
    raise exception 'Indica chi ha firmato.' using errcode = '22023';
  end if;
  if p_solo_verifica then return jsonb_build_object('quote_id', q.id, 'verificato', true); end if;
  if p_path is null or p_path not like q.company_id || '/contratti-carta/' || q.id || '/%' or p_path like '%..%'
     or not exists (select 1 from storage.objects s where s.bucket_id = 'quote-pdfs' and s.name = p_path) then
    raise exception 'Carica prima la scansione del contratto firmato.' using errcode = '22023';
  end if;

  update public.quotes
     set status = 'accettata',
         signed_at = (p_firmato_il + time '12:00') at time zone 'Europe/Rome',
         signed_by_name = btrim(p_firmatario),
         firma_modo = 'carta',
         contratto_firmato = jsonb_build_object('bucket', 'quote-pdfs', 'path', p_path,
                               'name', coalesce(nullif(btrim(p_nome), ''), 'contratto firmato'), 'mime', p_mime),
         updated_at = now()
   where id = q.id;
  return jsonb_build_object('quote_id', q.id, 'status', 'accettata');
end $function$;

REVOKE ALL ON FUNCTION public.preventivo_firmato_su_carta(uuid, text, text, text, date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preventivo_firmato_su_carta(uuid, text, text, text, date, text, boolean) TO authenticated, service_role;
