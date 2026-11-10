-- ============================================================================
-- Lotto 4, correzione dalla prova: nei messaggi di affida_voci e
-- affidamento_modifica le quantità uscivano «70.» (to_char col separatore
-- decimale finale). Ora «70», «70,5», «1.250,75».
-- La sostituzione si fa sul testo delle due funzioni (pg_get_functiondef):
-- idempotente, e se il testo non c'è più lo dice.
-- ============================================================================

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.quantita_testo(p numeric)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when p is null then ''
    else replace(replace(replace(
           trim(trailing '.' from trim(trailing '0' from to_char(round(p, 3), 'FM999,999,999,990.000'))),
           ',', '§'), '.', ','), '§', '.')
  end
$$;
revoke all on function public.quantita_testo(numeric) from public, anon;
grant execute on function public.quantita_testo(numeric) to authenticated, service_role;

do $$
declare
  f text;
  def text;
  nuovo text;
begin
  foreach f in array array['public.affida_voci(uuid,uuid,jsonb,text)', 'public.affidamento_modifica(uuid,numeric,numeric,text,boolean)'] loop
    def := pg_get_functiondef(f::regprocedure);
    nuovo := regexp_replace(def, 'trim\(to_char\((.*?), ''FM999G999G990D999''\)\)', 'public.quantita_testo(\1)', 'g');
    if nuovo = def and position('quantita_testo' in def) = 0 then
      raise exception 'Testo atteso non trovato in %', f;
    end if;
    if nuovo <> def then
      execute nuovo;
    end if;
  end loop;
end $$;
