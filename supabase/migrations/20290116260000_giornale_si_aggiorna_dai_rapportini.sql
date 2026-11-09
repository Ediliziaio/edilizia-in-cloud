-- Il giornale si aggiorna finche' non e' firmato, solo per chi ha acceso la bozza automatica.
-- Una pagina toccata a mano non si sovrascrive: si segna che ci sono novita'.
set local lock_timeout = '3s';
alter table public.giornale_lavori
  add column if not exists bozza_auto_campi jsonb,
  add column if not exists aggiornamento_disponibile_il timestamptz;

create table if not exists public.giornale_da_aggiornare (
  order_id uuid not null references public.orders(id) on delete cascade,
  data_lavori date not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  richiesto_il timestamptz not null default now(),
  primary key (order_id, data_lavori)
);
create index if not exists giornale_da_aggiornare_coda on public.giornale_da_aggiornare (richiesto_il);
alter table public.giornale_da_aggiornare enable row level security;
revoke all on public.giornale_da_aggiornare from anon, authenticated;

create or replace function public.giornale_coda_rapportino_trg() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.order_id is null or new.data_lavoro is null then return null; end if;
  if not (new.stato in ('inviato', 'approvato') or (tg_op = 'UPDATE' and old.stato in ('inviato', 'approvato'))) then return null; end if;
  if not exists (select 1 from public.companies c where c.id = new.company_id and c.giornale_auto_enabled) then return null; end if;
  insert into public.giornale_da_aggiornare (order_id, data_lavori, company_id) values (new.order_id, new.data_lavoro, new.company_id)
  on conflict (order_id, data_lavori) do update set richiesto_il = now();
  return null;
end; $$;
revoke all on function public.giornale_coda_rapportino_trg() from public, anon, authenticated;
drop trigger if exists trg_giornale_coda_rapportino on public.campo_rapportini;
create trigger trg_giornale_coda_rapportino after insert or update of stato, descrizione_lavori, presenze, materiali_usati, mezzi_usati, meteo, annullato_at, percentuale_avanzamento
  on public.campo_rapportini for each row execute function public.giornale_coda_rapportino_trg();

create or replace function public.giornale_coda_prendi(p_limite integer default 25)
returns table(order_id uuid, data_lavori date, company_id uuid) language sql security definer set search_path to '' as $$
  delete from public.giornale_da_aggiornare q
   using (select x.order_id, x.data_lavori from public.giornale_da_aggiornare x order by x.richiesto_il for update skip locked limit greatest(p_limite, 1)) s
   where q.order_id = s.order_id and q.data_lavori = s.data_lavori
  returning q.order_id, q.data_lavori, q.company_id;
$$;
revoke all on function public.giornale_coda_prendi(integer) from public, anon, authenticated;
grant execute on function public.giornale_coda_prendi(integer) to service_role;

-- Chi riscrive il testo a mano ha visto le novita'.
create or replace function public.giornale_novita_viste_trg() returns trigger language plpgsql set search_path to '' as $$
begin
  if new.aggiornamento_disponibile_il is not distinct from old.aggiornamento_disponibile_il
     and new.lavorazioni_eseguite is distinct from old.lavorazioni_eseguite then
    new.aggiornamento_disponibile_il := null;
  end if;
  return new;
end; $$;
revoke all on function public.giornale_novita_viste_trg() from public, anon, authenticated;
drop trigger if exists trg_giornale_novita_viste on public.giornale_lavori;
create trigger trg_giornale_novita_viste before update on public.giornale_lavori for each row when (old.stato = 'bozza') execute function public.giornale_novita_viste_trg();
