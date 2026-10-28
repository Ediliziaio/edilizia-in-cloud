-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

-- Add source traceability and append-only change history; do not rewrite old dossiers.
set local lock_timeout='3s';
set local statement_timeout='60s';
create unique index if not exists sicurezza_figure_id_azienda on public.sicurezza_figure(id,company_id);
alter table public.sicurezza_incarichi add column if not exists figura_id uuid;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='incarichi_figura_azienda_fk') then
    alter table public.sicurezza_incarichi add constraint incarichi_figura_azienda_fk foreign key(figura_id,company_id) references public.sicurezza_figure(id,company_id);
  end if;
end $$;
create index if not exists sicurezza_incarichi_figura on public.sicurezza_incarichi(figura_id,company_id) where figura_id is not null;
create or replace function public.sicurezza_fascicolo_guardia()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' then
    if (new.company_id,new.subappaltatore_id,new.operaio_id) is distinct from (old.company_id,old.subappaltatore_id,old.operaio_id) then
      raise exception 'Il titolare del documento non si cambia: crea una nuova evidenza';
    end if;
    if old.file_path is not null and new.file_path is distinct from old.file_path then
      raise exception 'Il file non si sostituisce: carica una nuova versione';
    end if;
    if old.stato='verificato' and (new.order_id,new.tipo,new.data_rilascio,new.data_scadenza,new.revisione) is distinct from (old.order_id,old.tipo,old.data_rilascio,old.data_scadenza,old.revisione) then
      raise exception 'Per modificare i dati di un documento verificato riaprilo prima in integrazione';
    end if;
  end if;
  if new.file_path is not null and not exists (
    select 1 from storage.objects o where o.bucket_id='fascicoli-cantiere' and o.name=new.file_path
  ) then
    raise exception 'Il file non è presente nel fascicolo: completare il caricamento';
  end if;
  if new.stato='verificato' and auth.uid() is null then
    raise exception 'La verifica deve essere attribuita a un utente autenticato';
  end if;
  if new.stato='verificato' then
    if tg_op='INSERT' or old.stato is distinct from 'verificato' then
      new.verificato_da := auth.uid(); new.verificato_il := now();
    else
      new.verificato_da := old.verificato_da; new.verificato_il := old.verificato_il;
    end if;
  else
    new.verificato_da := null; new.verificato_il := null;
  end if;
  new.updated_at := now();
  return new;
end; $$;

revoke all on function public.sicurezza_fascicolo_guardia() from public,anon,authenticated;

create table if not exists public.sicurezza_fascicolo_eventi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  tabella text not null,
  record_id uuid not null,
  azione text not null check(azione in ('INSERT','UPDATE')),
  autore uuid references auth.users(id),
  registrato_il timestamptz not null default now(),
  prima jsonb,
  dopo jsonb not null
);
create index if not exists sicurezza_eventi_record on public.sicurezza_fascicolo_eventi(company_id,tabella,record_id,registrato_il);
create index if not exists sicurezza_eventi_autore on public.sicurezza_fascicolo_eventi(autore) where autore is not null;
alter table public.sicurezza_fascicolo_eventi enable row level security;
revoke all on public.sicurezza_fascicolo_eventi from anon,authenticated;
grant select on public.sicurezza_fascicolo_eventi to authenticated;
grant all on public.sicurezza_fascicolo_eventi to service_role;
drop policy if exists sicurezza_eventi_lettura on public.sicurezza_fascicolo_eventi;
create policy sicurezza_eventi_lettura on public.sicurezza_fascicolo_eventi for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',company_id));
create or replace function public.registra_evento_fascicolo()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.sicurezza_fascicolo_eventi(company_id,tabella,record_id,azione,autore,prima,dopo)
  values(new.company_id,tg_table_name,new.id,tg_op,auth.uid(),case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end $$;
revoke all on function public.registra_evento_fascicolo() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['subappaltatori_operai','subappaltatori_assegnazioni','sicurezza_incarichi','sicurezza_fascicolo'] loop
    execute format('drop trigger if exists registra_evento_fascicolo on public.%I',t);
    execute format('create trigger registra_evento_fascicolo after insert or update on public.%I for each row execute function public.registra_evento_fascicolo()',t);
  end loop;
end $$;
notify pgrst,'reload schema';
