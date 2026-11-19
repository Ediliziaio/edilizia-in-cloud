-- Metadati di aggiornamento: nessun importo, nominativo o movimento viene pubblicato.
set local lock_timeout='3s';
set local statement_timeout='60s';

create table if not exists public.finanza_revisioni (
  company_id uuid not null references public.companies(id) on delete cascade,
  revisione uuid primary key default gen_random_uuid(),
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists finanza_revisioni_azienda on public.finanza_revisioni(company_id,revisione);
create index if not exists finanza_revisioni_pulizia on public.finanza_revisioni(company_id,updated_at);
alter table public.finanza_revisioni enable row level security;
revoke all on public.finanza_revisioni from public, anon, authenticated;
grant select on public.finanza_revisioni to authenticated;
grant all on public.finanza_revisioni to service_role;
drop policy if exists finanza_revisioni_lettura on public.finanza_revisioni;
create policy finanza_revisioni_lettura on public.finanza_revisioni for select to authenticated
using (public.user_can_access_company(company_id) and public.puo_vedere_scadenze(company_id));

create or replace function private.finanza_segnala_modifica()
returns trigger language plpgsql security definer set search_path='' as $function$
declare prima jsonb; dopo jsonb; aziende uuid[]; azienda uuid; chiave text;
begin
  if tg_op<>'INSERT' then prima:=to_jsonb(old); end if;
  if tg_op<>'DELETE' then dopo:=to_jsonb(new); end if;
  if tg_table_name='order_installments' then
    select array_agg(distinct o.company_id) into aziende from public.orders o
    where o.id in (nullif(prima->>'order_id','')::uuid,nullif(dopo->>'order_id','')::uuid);
  else
    aziende:=array[nullif(prima->>'company_id','')::uuid,nullif(dopo->>'company_id','')::uuid];
  end if;
  for azienda in select distinct x from unnest(aziende) x where x is not null loop
    if not exists(select 1 from public.companies where id=azienda) then continue; end if;
    chiave:='finanza.revisione_'||replace(azienda::text,'-','');
    if current_setting(chiave,true)='on' then continue; end if;
    perform set_config(chiave,'on',true);
    -- Una riga per transazione/azienda, senza serializzare operazioni indipendenti
    -- sullo stesso contatore. Nessun blocco condiviso tra pagamenti e commesse.
    insert into public.finanza_revisioni(company_id) values(azienda);
    -- Retenzione opportunistica e limitata: non aspetta altre transazioni e
    -- riguarda esclusivamente segnali tecnici, mai movimenti finanziari.
    delete from public.finanza_revisioni where revisione in (
      select revisione from public.finanza_revisioni where company_id=azienda
        and updated_at<clock_timestamp()-interval '1 day'
      order by updated_at for update skip locked limit 100
    );
  end loop;
  return null;
end;
$function$;
revoke all on function private.finanza_segnala_modifica() from public, anon, authenticated;

create or replace function public.finanza_revisione(p_company_id uuid)
returns text language plpgsql stable security invoker set search_path='' as $function$
begin
  perform public.assert_company_access(p_company_id);
  if not public.ai_is_service_role() and not public.puo_vedere_scadenze(p_company_id) then
    raise exception 'Non hai il permesso di vedere i dati finanziari.' using errcode='42501';
  end if;
  -- L'impronta include tutte le righe visibili: recupera anche transazioni
  -- iniziate prima e terminate dopo, senza assumere un ordine di commit.
  return (select md5(coalesce(string_agg(revisione::text,',' order by revisione),''))
    from public.finanza_revisioni where company_id=p_company_id);
end;
$function$;
revoke all on function public.finanza_revisione(uuid) from public,anon;
grant execute on function public.finanza_revisione(uuid) to authenticated,service_role;

do $migration$
declare tabella text;
begin
  foreach tabella in array array['scadenze','prima_nota_entries','company_costs','rate_fornitori',
    'fatture_ricevute','invoices','invoice_payments','documenti_fiscali','movimenti_cassa_native',
    'orders','order_installments','ordini_variazione','unita_movimenti','unita_immobiliari','note_credito_storni'] loop
    execute format('drop trigger if exists finanza_revisione on public.%I',tabella);
    execute format('create trigger finanza_revisione after insert or update or delete on public.%I for each row execute function private.finanza_segnala_modifica()',tabella);
  end loop;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
      and schemaname='public' and tablename='finanza_revisioni') then
    alter publication supabase_realtime add table public.finanza_revisioni;
  end if;
end;
$migration$;
