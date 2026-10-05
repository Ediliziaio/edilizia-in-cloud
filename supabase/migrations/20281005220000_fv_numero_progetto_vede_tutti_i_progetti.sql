-- Come per i preventivi serramenti (20281005200000) e i sopralluoghi (…210000): il numero del progetto fotovoltaico
-- (FV-AAAA-NNNN) si calcolava con i permessi di chi crea, che vede solo i suoi progetti: due colleghi potevano
-- avere lo stesso numero. Ora legge tutti i progetti dell'azienda e un solo progetto per volta prende il numero.
-- La funzione è chiamabile dal browser: risponde solo per la propria azienda (o al super admin).
create or replace function public.fv_genera_numero_progetto(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_anno text := to_char(now(), 'YYYY');
  v_progressivo integer;
begin
  if not (public.is_super_admin() or p_company_id = public.get_effective_company_id()) then
    raise exception 'Azienda non autorizzata' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('fv_genera_numero_progetto:' || p_company_id::text || ':' || v_anno));

  select coalesce(max(
    cast(regexp_replace(numero, '^FV-' || v_anno || '-', '') as integer)
  ), 0) + 1
  into v_progressivo
  from public.fv_progetti
  where company_id = p_company_id
    and numero like 'FV-' || v_anno || '-%';

  return 'FV-' || v_anno || '-' || lpad(v_progressivo::text, 4, '0');
end;
$function$;

revoke all on function public.fv_genera_numero_progetto(uuid) from public, anon;
grant execute on function public.fv_genera_numero_progetto(uuid) to authenticated, service_role;
