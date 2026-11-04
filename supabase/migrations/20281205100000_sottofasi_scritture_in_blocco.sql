-- Date e ordine di tante sottofasi in una scrittura sola: con centinaia di righe, una richiesta per riga
-- appesantiva il database e un errore di rete a metà lasciava il lavoro parziale. Tutto o niente.
-- Girano coi permessi di chi chiama: valgono le policy di sempre. Idempotente, nessun dato toccato.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.sottofasi_pianifica_in_blocco(p_passi jsonb)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_attese integer := jsonb_array_length(p_passi);
  v_scritte integer;
begin
  update public.order_work_subphases s
     set data_inizio = x.data_inizio, data_fine = x.data_fine, giorni = x.giorni
    from jsonb_to_recordset(p_passi) as x(id uuid, data_inizio date, data_fine date, giorni integer)
   where s.id = x.id;
  get diagnostics v_scritte = row_count;
  if v_scritte <> v_attese then
    raise exception using errcode = '42501', message = 'Alcune righe non si possono modificare: non è stato salvato niente.';
  end if;
  return v_scritte;
end;
$$;

create or replace function public.sottofasi_riordina(p_ids uuid[])
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_scritte integer;
begin
  if exists (select 1 from unnest(p_ids) i(id)
              where not exists (select 1 from public.order_work_subphases s where s.id = i.id)) then
    raise exception using errcode = '42501', message = 'Alcune righe non si possono spostare: non è stato salvato niente.';
  end if;
  -- Solo le righe che cambiano posto.
  update public.order_work_subphases s
     set position = x.ord - 1
    from unnest(p_ids) with ordinality as x(id, ord)
   where s.id = x.id and s.position is distinct from x.ord - 1;
  get diagnostics v_scritte = row_count;
  return v_scritte;
end;
$$;

revoke all on function public.sottofasi_pianifica_in_blocco(jsonb) from public, anon;
grant execute on function public.sottofasi_pianifica_in_blocco(jsonb) to authenticated, service_role;
revoke all on function public.sottofasi_riordina(uuid[]) from public, anon;
grant execute on function public.sottofasi_riordina(uuid[]) to authenticated, service_role;
