-- «Creazione progetto fallita» (05/10/2026, Renova: Massimo e Roberto che fanno un preventivo a testa).
-- Il numero del preventivo serramenti (SF-AAMMGG-NNNN) lo dà un trigger che prende il più alto del giorno + 1.
-- Il trigger girava con i permessi di chi crea, e il personale vede solo i preventivi suoi: due colleghi
-- calcolavano lo stesso numero e il secondo andava in «duplicate key» (sr_progetti_company_code_uk).
-- Ora il trigger conta tutti i preventivi dell'azienda (anche cestinati) e un solo preventivo per volta
-- prende il numero. È una funzione di trigger: nessun EXECUTE a nessuno.
create or replace function public.sr_progetti_autocode()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_seq int;
  v_giorno text := to_char(now(), 'YYMMDD');
begin
  if new.code is not null and length(new.code) > 0 then
    return new;
  end if;

  -- Un solo preventivo per volta prende il numero dell'azienda in quel giorno.
  perform pg_advisory_xact_lock(hashtext('sr_progetti_autocode:' || new.company_id::text || ':' || v_giorno));

  -- Si contano TUTTI i preventivi dell'azienda, anche quelli che chi crea non vede
  -- (il personale vede solo i suoi): prima il numero si calcolava solo sui visibili e due colleghi
  -- ricevevano lo stesso codice («Creazione progetto fallita», duplicate key).
  select coalesce(max(
    nullif(regexp_replace(code, '^SF-\d{6}-(\d+)$', '\1'), code)::int
  ), 0) + 1
  into v_seq
  from public.sr_progetti
  where company_id = new.company_id
    and code like 'SF-' || v_giorno || '-%';

  new.code := 'SF-' || v_giorno || '-' || lpad(v_seq::text, 4, '0');
  return new;
end
$function$;

revoke all on function public.sr_progetti_autocode() from public, anon, authenticated;
