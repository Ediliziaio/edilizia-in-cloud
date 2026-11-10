-- Lavori in corso, rimanenza e due letture del Controllo di Gestione: solo con il suo permesso (10/11/2026).
--
-- Quattro funzioni del 09/11 controllavano l'azienda ma non il permesso: le leggeva chiunque ne
-- facesse parte, anche un cliente esterno (provato: lavori in corso dell'impresa, 4 commesse).
-- Ora passano da `_cg_assert_lettura`, lo stesso cancello di tutte le altre funzioni del modulo.
-- La tabella delle rimanenze segue la stessa regola (decisione del titolare, 10/11: «solo chi ha
-- il Controllo di Gestione»).
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Il cancello come domanda sì/no, per le regole della tabella.
create or replace function public.cg_puo_leggere(p_company_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._cg_assert_lettura(p_company_id);
  return true;
exception when insufficient_privilege then
  return false;
end;
$$;

revoke all on function public.cg_puo_leggere(uuid) from public, anon;
grant execute on function public.cg_puo_leggere(uuid) to authenticated, service_role;

comment on function public.cg_puo_leggere(uuid) is
  'Vero se chi chiede può leggere il Controllo di Gestione di quell''azienda: lo stesso cancello di _cg_assert_lettura, come sì/no per le regole delle tabelle (10/11/2026).';

-- Le quattro funzioni: il controllo entra come prima istruzione. Si ferma se il testo è cambiato,
-- non tocca niente se è già stato fatto.
do $patch$
declare
  f record;
  v_def text;
begin
  for f in select * from (values
    ('public.cg_lavori_in_corso(uuid,integer)', 'p_company_id'),
    ('public.cg_ricavi_provenienza(uuid,integer,integer,integer)', 'p_company_id'),
    ('public.cg_voci_non_classificate(uuid,integer)', 'p_company_id'),
    ('public.cg_registra_rimanenza_lavori(integer,numeric,text)', 'null')
  ) v(firma, argomento) loop
    v_def := pg_get_functiondef(f.firma::regprocedure);
    if position('_cg_assert_lettura' in v_def) > 0 then
      continue;
    end if;
    if v_def !~ E'\nbegin\n' then
      raise exception '%: non trovo l''inizio del corpo, questa migrazione va rivista', f.firma;
    end if;
    v_def := regexp_replace(v_def, E'\nbegin\n',
      E'\nbegin\n  perform public._cg_assert_lettura(' || f.argomento || E');\n');
    execute v_def;
  end loop;
end;
$patch$;

-- La tabella: stessa regola per leggere e per scrivere.
drop policy if exists cg_rimanenze_select on public.cg_rimanenze_lavori;
create policy cg_rimanenze_select on public.cg_rimanenze_lavori
  for select
  using (company_id = (select public.get_my_company_id()) and public.cg_puo_leggere(company_id));

drop policy if exists cg_rimanenze_insert on public.cg_rimanenze_lavori;
create policy cg_rimanenze_insert on public.cg_rimanenze_lavori
  for insert
  with check (company_id = (select public.get_my_company_id()) and public.cg_puo_leggere(company_id));

drop policy if exists cg_rimanenze_update on public.cg_rimanenze_lavori;
create policy cg_rimanenze_update on public.cg_rimanenze_lavori
  for update
  using (company_id = (select public.get_my_company_id()) and public.cg_puo_leggere(company_id))
  with check (company_id = (select public.get_my_company_id()) and public.cg_puo_leggere(company_id));

drop policy if exists cg_rimanenze_delete on public.cg_rimanenze_lavori;
create policy cg_rimanenze_delete on public.cg_rimanenze_lavori
  for delete
  using (company_id = (select public.get_my_company_id()) and public.cg_puo_leggere(company_id));
