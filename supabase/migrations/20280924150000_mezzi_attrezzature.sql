-- Mezzi e attrezzature (24/09/2026, richiesta di Florin).
--
-- Fino a oggi un'impresa non aveva dove mettere furgoni, mezzi e attrezzi: né
-- targa, né assicurazione, né revisione, né tagliandi. Lo scadenzario esistente
-- è solo economico (incassi, pagamenti, costi, fiscale). La pagina pubblica
-- /funzionalita/mezzi-attrezzature prometteva già tutto questo.
--
-- Tre tabelle, sul modello della scheda dipendente (hr_documenti):
--   mezzi               — il mezzo o l'attrezzo, a chi o a quale cantiere è assegnato
--   mezzi_documenti     — assicurazione, bollo, revisione, contratto leasing/noleggio,
--                         verifiche periodiche: con scadenza e "avvisa N giorni prima"
--   mezzi_manutenzioni  — tagliandi e interventi, con il prossimo tagliando per data o km/ore
-- e una vista, mezzi_scadenze, che è l'unico posto dove si decide cosa è scaduto
-- o in scadenza: la leggono la pagina e l'avviso giornaliero (hr-check-scadenze).
--
-- Permessi: gli stessi del Magazzino (can_view_warehouse per vedere,
-- can_edit_warehouse per modificare) — il mezzo è una risorsa dell'impresa come
-- i materiali, e non serve toccare l'editor dei ruoli.
--
-- Idempotente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── Mezzi ────────────────────────────────────────────────────────────────────
create table if not exists public.mezzi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null,
  tipo text not null default 'furgone',
  targa text,
  marca text,
  modello text,
  matricola text,
  anno integer,
  contatore numeric(12,1),
  contatore_unita text not null default 'km',
  contatore_aggiornato_il date,
  possesso text not null default 'proprieta',
  stato text not null default 'in_servizio',
  assegnato_hr_profilo_id uuid references public.hr_profili(id) on delete set null,
  assegnato_order_id uuid references public.orders(id) on delete set null,
  note text,
  deleted_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mezzi_tipo_chk check (tipo in
    ('furgone','autocarro','autovettura','macchina_movimento_terra','sollevamento','rimorchio','attrezzatura','altro')),
  constraint mezzi_contatore_unita_chk check (contatore_unita in ('km','ore')),
  constraint mezzi_possesso_chk check (possesso in ('proprieta','leasing','noleggio_lungo','noleggio_breve')),
  constraint mezzi_stato_chk check (stato in ('in_servizio','in_officina','fuori_servizio'))
);
create index if not exists idx_mezzi_company on public.mezzi(company_id) where deleted_at is null;
drop trigger if exists trg_mezzi_updated on public.mezzi;
create trigger trg_mezzi_updated before update on public.mezzi
  for each row execute function public.set_updated_at();

-- ── Documenti con scadenza ──────────────────────────────────────────────────
create table if not exists public.mezzi_documenti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mezzo_id uuid not null references public.mezzi(id) on delete cascade,
  categoria text not null default 'assicurazione',
  titolo text,
  ente text,
  importo numeric(12,2),
  data_inizio date,
  data_scadenza date,
  alert_giorni_prima integer not null default 30,
  file_path text,
  file_name text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mezzi_documenti_categoria_chk check (categoria in
    ('assicurazione','bollo','revisione','contratto','verifica_periodica','libretto','altro')),
  constraint mezzi_documenti_alert_chk check (alert_giorni_prima between 0 and 365)
);
create index if not exists idx_mezzi_documenti_mezzo on public.mezzi_documenti(mezzo_id);
create index if not exists idx_mezzi_documenti_company_scad on public.mezzi_documenti(company_id, data_scadenza);
drop trigger if exists trg_mezzi_documenti_updated on public.mezzi_documenti;
create trigger trg_mezzi_documenti_updated before update on public.mezzi_documenti
  for each row execute function public.set_updated_at();

-- ── Manutenzioni e tagliandi ────────────────────────────────────────────────
create table if not exists public.mezzi_manutenzioni (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mezzo_id uuid not null references public.mezzi(id) on delete cascade,
  tipo text not null default 'tagliando',
  data date not null,
  contatore numeric(12,1),
  officina text,
  costo numeric(12,2),
  descrizione text,
  prossima_data date,
  prossimo_contatore numeric(12,1),
  file_path text,
  file_name text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mezzi_manutenzioni_tipo_chk check (tipo in
    ('tagliando','riparazione','gomme','carrozzeria','altro'))
);
create index if not exists idx_mezzi_manutenzioni_mezzo on public.mezzi_manutenzioni(mezzo_id, data desc);
drop trigger if exists trg_mezzi_manutenzioni_updated on public.mezzi_manutenzioni;
create trigger trg_mezzi_manutenzioni_updated before update on public.mezzi_manutenzioni
  for each row execute function public.set_updated_at();

-- I km (o le ore) segnati su un intervento aggiornano quelli del mezzo, se sono
-- più avanti: così il tagliando "ogni 30.000 km" si confronta con un numero vero
-- senza chiedere di aggiornarlo in due posti.
create or replace function public.mezzi_aggiorna_contatore()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.contatore is not null then
    update public.mezzi
       set contatore = new.contatore,
           contatore_aggiornato_il = new.data
     where id = new.mezzo_id
       and (contatore is null or contatore < new.contatore);
  end if;
  return new;
end;
$$;
revoke all on function public.mezzi_aggiorna_contatore() from public, anon, authenticated;

drop trigger if exists trg_mezzi_manutenzioni_contatore on public.mezzi_manutenzioni;
create trigger trg_mezzi_manutenzioni_contatore after insert or update of contatore on public.mezzi_manutenzioni
  for each row execute function public.mezzi_aggiorna_contatore();

-- ── RLS: stessi permessi del Magazzino ──────────────────────────────────────
alter table public.mezzi enable row level security;
alter table public.mezzi_documenti enable row level security;
alter table public.mezzi_manutenzioni enable row level security;

revoke all on public.mezzi, public.mezzi_documenti, public.mezzi_manutenzioni from anon;

drop policy if exists mezzi_lettura on public.mezzi;
create policy mezzi_lettura on public.mezzi for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_warehouse', company_id));
drop policy if exists mezzi_modifica on public.mezzi;
create policy mezzi_modifica on public.mezzi for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id));

drop policy if exists mezzi_documenti_lettura on public.mezzi_documenti;
create policy mezzi_documenti_lettura on public.mezzi_documenti for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_warehouse', company_id));
drop policy if exists mezzi_documenti_modifica on public.mezzi_documenti;
create policy mezzi_documenti_modifica on public.mezzi_documenti for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id));

drop policy if exists mezzi_manutenzioni_lettura on public.mezzi_manutenzioni;
create policy mezzi_manutenzioni_lettura on public.mezzi_manutenzioni for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_warehouse', company_id));
drop policy if exists mezzi_manutenzioni_modifica on public.mezzi_manutenzioni;
create policy mezzi_manutenzioni_modifica on public.mezzi_manutenzioni for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', company_id));

-- Utente bloccato: fuori da tutto, come nelle altre tabelle con company_id
-- (il trigger di DDL la crea già; qui resta scritta per chi legge il file).
drop policy if exists blocco_utente_bloccato on public.mezzi;
create policy blocco_utente_bloccato on public.mezzi
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists blocco_utente_bloccato on public.mezzi_documenti;
create policy blocco_utente_bloccato on public.mezzi_documenti
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists blocco_utente_bloccato on public.mezzi_manutenzioni;
create policy blocco_utente_bloccato on public.mezzi_manutenzioni
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- ── Scadenze: un posto solo ─────────────────────────────────────────────────
-- Documenti: conta solo il più recente per mezzo e categoria. Quando si rinnova
-- l'assicurazione, la polizza vecchia resta nello storico ma non è più "scaduta":
-- è stata sostituita. Gli "altro" invece sono documenti diversi fra loro e
-- contano tutti.
-- Tagliando: conta l'ultimo intervento che dice quando fare il prossimo, per data
-- o per km/ore. In scadenza a 30 giorni, oppure a 1.000 km / 50 ore dal traguardo.
create or replace view public.mezzi_scadenze
with (security_invoker = on) as
with documenti as (
  select d.*,
         row_number() over (
           partition by d.mezzo_id,
                        case when d.categoria = 'altro' then d.id::text else d.categoria end
           order by d.data_scadenza desc, d.created_at desc
         ) as rn
    from public.mezzi_documenti d
   where d.data_scadenza is not null
),
tagliandi as (
  select distinct on (t.mezzo_id) t.*
    from public.mezzi_manutenzioni t
   where t.prossima_data is not null or t.prossimo_contatore is not null
   order by t.mezzo_id, t.data desc, t.created_at desc
)
select d.company_id,
       d.mezzo_id,
       m.nome as mezzo_nome,
       m.targa,
       'documento'::text as origine,
       d.id as riferimento_id,
       d.categoria,
       d.titolo,
       d.data_scadenza,
       null::numeric as contatore_scadenza,
       m.contatore as contatore_attuale,
       m.contatore_unita,
       d.alert_giorni_prima,
       case
         when d.data_scadenza < current_date then 'scaduto'
         when d.data_scadenza <= current_date + d.alert_giorni_prima then 'in_scadenza'
         else 'valido'
       end as stato
  from documenti d
  join public.mezzi m on m.id = d.mezzo_id and m.deleted_at is null
 where d.rn = 1
union all
select t.company_id,
       t.mezzo_id,
       m.nome,
       m.targa,
       'manutenzione'::text,
       t.id,
       'tagliando'::text,
       t.descrizione,
       t.prossima_data,
       t.prossimo_contatore,
       m.contatore,
       m.contatore_unita,
       30,
       case
         when (t.prossima_data is not null and t.prossima_data < current_date)
           or (t.prossimo_contatore is not null and m.contatore >= t.prossimo_contatore)
           then 'scaduto'
         when (t.prossima_data is not null and t.prossima_data <= current_date + 30)
           or (t.prossimo_contatore is not null
               and m.contatore >= t.prossimo_contatore
                                  - case when m.contatore_unita = 'ore' then 50 else 1000 end)
           then 'in_scadenza'
         else 'valido'
       end
  from tagliandi t
  join public.mezzi m on m.id = t.mezzo_id and m.deleted_at is null;

revoke all on public.mezzi_scadenze from anon;
grant select on public.mezzi_scadenze to authenticated, service_role;

-- ── File (polizze, libretti, fatture dell'officina) ─────────────────────────
-- Bucket privato, percorso {company_id}/{mezzo_id}/{uuid}-{file}, link firmati.
insert into storage.buckets (id, name, public)
values ('mezzi-documenti', 'mezzi-documenti', false)
on conflict (id) do nothing;

drop policy if exists mezzi_file_lettura on storage.objects;
create policy mezzi_file_lettura on storage.objects for select to authenticated
  using (bucket_id = 'mezzi-documenti'
    and (storage.foldername(name))[1] = public.get_my_company_id()::text
    and public.has_permission_for_company((select auth.uid()), 'can_view_warehouse', public.get_my_company_id()));
drop policy if exists mezzi_file_modifica on storage.objects;
create policy mezzi_file_modifica on storage.objects for all to authenticated
  using (bucket_id = 'mezzi-documenti'
    and (storage.foldername(name))[1] = public.get_my_company_id()::text
    and public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', public.get_my_company_id()))
  with check (bucket_id = 'mezzi-documenti'
    and (storage.foldername(name))[1] = public.get_my_company_id()::text
    and public.has_permission_for_company((select auth.uid()), 'can_edit_warehouse', public.get_my_company_id()));

notify pgrst, 'reload schema';
