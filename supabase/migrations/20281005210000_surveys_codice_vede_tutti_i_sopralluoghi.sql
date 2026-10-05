-- Come per i preventivi serramenti (20281005200000): il codice del sopralluogo (SOP-AAAA-NNNN) si calcolava coi
-- permessi di chi crea, che vede solo i suoi sopralluoghi: due colleghi potevano avere lo stesso numero.
-- Ora conta tutti i sopralluoghi dell'azienda e un solo sopralluogo per volta prende il numero.
-- Funzione di trigger: nessun EXECUTE a nessuno.
create or replace function public.generate_survey_code()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_year text := to_char(now(), 'YYYY');
  v_next int;
begin
  if new.code is null or new.code = '' then
    -- Un solo sopralluogo per volta prende il numero dell'azienda in quell'anno.
    perform pg_advisory_xact_lock(hashtext('generate_survey_code:' || new.company_id::text || ':' || v_year));
    -- Si contano TUTTI i sopralluoghi dell'azienda, anche quelli che chi crea non vede.
    select coalesce(max(
      cast(regexp_replace(code, '^SOP-\d{4}-', '') as int)
    ), 0) + 1
    into v_next
    from public.surveys
    where company_id = new.company_id
      and code like 'SOP-' || v_year || '-%';
    new.code := 'SOP-' || v_year || '-' || lpad(v_next::text, 4, '0');
  end if;
  return new;
end;
$function$;

revoke all on function public.generate_survey_code() from public, anon, authenticated;
