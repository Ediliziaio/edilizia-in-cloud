-- Mezzi e attrezzature (Fase B): categorie e attrezzature a QUANTITÀ.
--
-- Categorie: per raggruppare e filtrare gli attrezzi (elettroutensili, taglio,
-- ponteggi…), personalizzabili per azienda. Le predefinite si seminano alla
-- prima apertura (mezzi_categorie_predefinite) e qui per le aziende che hanno
-- già dei mezzi; le attrezzature esistenti vengono pre-classificate dal nome.
--
-- Quantità: un ponteggio non è "un pezzo", è un parco di m² che si monta in
-- parte su più cantieri. Lo stesso per transenne e puntelli (pezzi), reti
-- (metri), casseri (m²). Una riga in mezzi_allocazioni = "tanti m² su quel
-- cantiere dal… al…". Il resto è in magazzino (disponibile). Un attrezzo a
-- quantità non usa l'assegnazione singola (cantiere / caricato su): i costi
-- per commessa li ripartisce in proporzione a quanto è montato.

-- ── 1. Categorie ────────────────────────────────────────────────────────────
create table if not exists public.mezzi_categorie (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  classe      text not null check (classe in ('mezzo','attrezzatura')),
  nome        text not null check (btrim(nome) <> ''),
  icona       text,
  ordine      integer not null default 0,
  attiva      boolean not null default true,
  predefinita boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists uq_mezzi_categorie_nome
  on public.mezzi_categorie(company_id, classe, lower(btrim(nome)));

alter table public.mezzi_categorie enable row level security;
revoke all on public.mezzi_categorie from anon;
drop policy if exists mezzi_categorie_lettura on public.mezzi_categorie;
create policy mezzi_categorie_lettura on public.mezzi_categorie for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', company_id));
drop policy if exists mezzi_categorie_modifica on public.mezzi_categorie;
create policy mezzi_categorie_modifica on public.mezzi_categorie for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id));
drop policy if exists blocco_utente_bloccato on public.mezzi_categorie;
create policy blocco_utente_bloccato on public.mezzi_categorie
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

drop trigger if exists trg_mezzi_categorie_updated on public.mezzi_categorie;
create trigger trg_mezzi_categorie_updated before update on public.mezzi_categorie
  for each row execute function public.set_updated_at();

alter table public.mezzi
  add column if not exists categoria_id uuid references public.mezzi_categorie(id) on delete set null;
create index if not exists idx_mezzi_categoria on public.mezzi(categoria_id) where categoria_id is not null;

-- Semina interna (nessun permesso: la chiama la migrazione e la funzione pubblica).
-- Solo se l'azienda non ha ancora categorie di attrezzi: chi le ha cambiate o
-- tolte non se le ritrova rimesse.
create or replace function public._mezzi_semina_categorie(p_company uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.mezzi_categorie c
              where c.company_id = p_company and c.classe = 'attrezzatura') then
    return;
  end if;
  insert into public.mezzi_categorie (company_id, classe, nome, icona, ordine, predefinita)
  select p_company, 'attrezzatura', x.nome, x.icona, x.ordine, true
    from (values
      ('Ponteggi e accesso',      'layers',   10),
      ('Elettroutensili',         'zap',      20),
      ('Macchine da cantiere',    'cog',      30),
      ('Taglio',                  'scissors', 40),
      ('Demolizione',             'hammer',   50),
      ('Misura e tracciamento',   'ruler',    60),
      ('Energia e compressori',   'plug',     70),
      ('Casseforme e puntelli',   'columns',  80),
      ('Transenne e recinzioni',  'fence',    90),
      ('Sicurezza e DPI',         'shield',  100),
      ('Pulizia',                 'droplets',110),
      ('Altro',                   'package', 120)
    ) as x(nome, icona, ordine)
  on conflict do nothing;
end $$;
revoke all on function public._mezzi_semina_categorie(uuid) from public, anon, authenticated;

-- Chiamata dall'app all'apertura degli attrezzi: idempotente, solo per chi
-- vede i mezzi di quell'azienda.
create or replace function public.mezzi_categorie_predefinite(p_company uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.has_permission_for_company(auth.uid(), 'can_view_mezzi', p_company) then
    raise exception using errcode = '42501', message = 'Non puoi vedere i mezzi di questa azienda.';
  end if;
  perform public._mezzi_semina_categorie(p_company);
end $$;
revoke all on function public.mezzi_categorie_predefinite(uuid) from public, anon;
grant execute on function public.mezzi_categorie_predefinite(uuid) to authenticated;

-- ── 2. Attrezzature a quantità ──────────────────────────────────────────────
alter table public.mezzi
  add column if not exists gestione text not null default 'singola',
  add column if not exists unita_misura text,
  add column if not exists quantita_totale numeric(12,2);

alter table public.mezzi drop constraint if exists mezzi_gestione_chk;
alter table public.mezzi add constraint mezzi_gestione_chk check (
  gestione in ('singola','quantita')
  and (
    gestione = 'singola'
    or (
      tipo = 'attrezzatura'
      and unita_misura in ('mq','pz','ml','mc','kg')
      and quantita_totale > 0
      -- a quantità si ripartisce sui cantieri con le allocazioni, non col cantiere singolo
      and assegnato_order_id is null
      and su_mezzo_id is null
    )
  )
);

create table if not exists public.mezzi_allocazioni (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  mezzo_id    uuid not null references public.mezzi(id) on delete cascade,
  order_id    uuid references public.orders(id) on delete set null,
  luogo       text,
  quantita    numeric(12,2) not null check (quantita > 0),
  dal         date not null default ((now() at time zone 'Europe/Rome')::date),
  al          date,
  note        text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint mezzi_allocazioni_date_chk check (al is null or al >= dal),
  constraint mezzi_allocazioni_dove_chk check (order_id is not null or nullif(btrim(luogo), '') is not null)
);
create index if not exists idx_mezzi_allocazioni_mezzo on public.mezzi_allocazioni(mezzo_id);
create index if not exists idx_mezzi_allocazioni_order on public.mezzi_allocazioni(order_id) where order_id is not null;

alter table public.mezzi_allocazioni enable row level security;
revoke all on public.mezzi_allocazioni from anon;
drop policy if exists mezzi_allocazioni_lettura on public.mezzi_allocazioni;
create policy mezzi_allocazioni_lettura on public.mezzi_allocazioni for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', company_id));
drop policy if exists mezzi_allocazioni_modifica on public.mezzi_allocazioni;
create policy mezzi_allocazioni_modifica on public.mezzi_allocazioni for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_mezzi', company_id));
drop policy if exists blocco_utente_bloccato on public.mezzi_allocazioni;
create policy blocco_utente_bloccato on public.mezzi_allocazioni
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

drop trigger if exists trg_mezzi_allocazioni_updated on public.mezzi_allocazioni;
create trigger trg_mezzi_allocazioni_updated before update on public.mezzi_allocazioni
  for each row execute function public.set_updated_at();

-- In uso = allocazioni non ancora smontate (al vuoto o nel futuro). Smontare
-- "oggi" libera la quantità oggi stesso.
create or replace function public.mezzi_quantita_in_uso(p_mezzo uuid, p_escludi uuid default null)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(a.quantita), 0)
    from public.mezzi_allocazioni a
   where a.mezzo_id = p_mezzo
     and (a.al is null or a.al > (now() at time zone 'Europe/Rome')::date)
     and (p_escludi is null or a.id <> p_escludi);
$$;
revoke all on function public.mezzi_quantita_in_uso(uuid, uuid) from public, anon;
grant execute on function public.mezzi_quantita_in_uso(uuid, uuid) to authenticated;

-- Non si monta più di quanto si ha; l'azienda la decide il mezzo.
create or replace function public.mezzi_allocazioni_controlla()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_m record;
  v_in_uso numeric;
begin
  select company_id, gestione, quantita_totale, unita_misura, deleted_at
    into v_m from public.mezzi where id = new.mezzo_id;
  if v_m.company_id is null or v_m.deleted_at is not null then
    raise exception using errcode = '23503', message = 'Attrezzatura non trovata.';
  end if;
  if v_m.gestione is distinct from 'quantita' then
    raise exception using errcode = '22023',
      message = 'Solo le attrezzature a quantità si ripartiscono tra i cantieri.';
  end if;
  new.company_id := v_m.company_id;
  if new.al is null or new.al > (now() at time zone 'Europe/Rome')::date then
    v_in_uso := public.mezzi_quantita_in_uso(new.mezzo_id, new.id);
    if v_in_uso + new.quantita > v_m.quantita_totale then
      raise exception using errcode = '23514',
        message = format('Non basta: disponibili %s %s.',
                         trim(to_char(greatest(v_m.quantita_totale - v_in_uso, 0), 'FM999G999G990D99')),
                         v_m.unita_misura);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_mezzi_allocazioni_controlla on public.mezzi_allocazioni;
create trigger trg_mezzi_allocazioni_controlla
  before insert or update of quantita, al, mezzo_id on public.mezzi_allocazioni
  for each row execute function public.mezzi_allocazioni_controlla();

-- Il totale non scende sotto quanto è montato in giro.
create or replace function public.mezzi_quantita_controlla_totale()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_in_uso numeric;
begin
  if new.gestione = 'quantita' and new.quantita_totale is not null then
    v_in_uso := public.mezzi_quantita_in_uso(new.id);
    if new.quantita_totale < v_in_uso then
      raise exception using errcode = '23514',
        message = format('Ne sono montati %s %s nei cantieri: il totale non può essere più basso.',
                         trim(to_char(v_in_uso, 'FM999G999G990D99')), new.unita_misura);
    end if;
  end if;
  if old.gestione = 'quantita' and new.gestione = 'singola'
     and exists (select 1 from public.mezzi_allocazioni a
                  where a.mezzo_id = new.id and (a.al is null or a.al > (now() at time zone 'Europe/Rome')::date)) then
    raise exception using errcode = '23514',
      message = 'È ancora montato in qualche cantiere: fai rientrare tutto prima di cambiarlo in pezzo singolo.';
  end if;
  return new;
end $$;
drop trigger if exists trg_mezzi_quantita_totale on public.mezzi;
create trigger trg_mezzi_quantita_totale
  before update of quantita_totale, gestione on public.mezzi
  for each row execute function public.mezzi_quantita_controlla_totale();

-- Rientro (tutto o in parte), in un colpo solo. Il rientro parziale lascia la
-- riga aperta con quanto resta e scrive una riga chiusa per la parte rientrata
-- (dal giorno di montaggio al giorno di rientro): lo storico e i costi per
-- commessa restano giusti, senza contare due volte nessun giorno.
create or replace function public.mezzi_rientro(p_allocazione uuid, p_quantita numeric, p_data date default null)
returns void
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  a public.mezzi_allocazioni;
  v_data date := coalesce(p_data, (now() at time zone 'Europe/Rome')::date);
begin
  select * into a from public.mezzi_allocazioni where id = p_allocazione for update;
  if a.id is null then
    raise exception using errcode = '23503', message = 'Montaggio non trovato.';
  end if;
  if a.al is not null and a.al <= (now() at time zone 'Europe/Rome')::date then
    raise exception using errcode = '22023', message = 'Questo è già rientrato.';
  end if;
  if p_quantita is null or p_quantita <= 0 then
    raise exception using errcode = '22023', message = 'Indica quanto rientra.';
  end if;
  if v_data < a.dal then
    raise exception using errcode = '22023', message = 'Il rientro non può essere prima del montaggio.';
  end if;
  if p_quantita >= a.quantita then
    update public.mezzi_allocazioni set al = v_data where id = a.id;
  else
    update public.mezzi_allocazioni set quantita = a.quantita - p_quantita where id = a.id;
    insert into public.mezzi_allocazioni (company_id, mezzo_id, order_id, luogo, quantita, dal, al, note)
    values (a.company_id, a.mezzo_id, a.order_id, a.luogo, p_quantita, a.dal, v_data, 'Rientro parziale');
  end if;
end $$;
revoke all on function public.mezzi_rientro(uuid, numeric, date) from public, anon;
grant execute on function public.mezzi_rientro(uuid, numeric, date) to authenticated;

-- Disponibilità di ogni attrezzatura a quantità.
create or replace view public.mezzi_disponibilita
with (security_invoker = true)
as
select m.id as mezzo_id,
       m.company_id,
       m.unita_misura,
       m.quantita_totale,
       coalesce(sum(a.quantita) filter (
         where a.al is null or a.al > (now() at time zone 'Europe/Rome')::date), 0) as in_uso,
       m.quantita_totale - coalesce(sum(a.quantita) filter (
         where a.al is null or a.al > (now() at time zone 'Europe/Rome')::date), 0) as disponibile,
       count(distinct a.order_id) filter (
         where a.order_id is not null and (a.al is null or a.al > (now() at time zone 'Europe/Rome')::date)) as cantieri
  from public.mezzi m
  left join public.mezzi_allocazioni a on a.mezzo_id = m.id
 where m.gestione = 'quantita' and m.deleted_at is null
 group by m.id, m.company_id, m.unita_misura, m.quantita_totale;
revoke all on public.mezzi_disponibilita from anon;
grant select on public.mezzi_disponibilita to authenticated, service_role;

-- ── 3. Costi per commessa: anche le quantità, in proporzione ────────────────
-- Stessa formula e stesse colonne della vista del 01/10: si aggiungono i
-- periodi delle allocazioni, pesati per la quota montata (250 m² su 800 =
-- 31% del costo annuo dell'attrezzo, per i giorni di montaggio).
create or replace view public.v_ordine_costi_mezzi_stimati
with (security_invoker = true)
as
with parametri as (
  select (now() at time zone 'Europe/Rome')::date as oggi
),
documenti_ultimi as (
  select distinct on (d.mezzo_id, d.categoria)
    d.mezzo_id,
    d.categoria,
    coalesce(d.importo, 0::numeric) as importo
  from public.mezzi_documenti d
  where d.categoria in ('assicurazione', 'bollo')
    and d.importo is not null
  order by d.mezzo_id, d.categoria, d.data_scadenza desc nulls last, d.created_at desc
),
costi_documenti as (
  select d.mezzo_id, sum(d.importo) as costo_documenti_annuo
  from documenti_ultimi d
  group by d.mezzo_id
),
costi_manutenzione as (
  select mm.mezzo_id, sum(coalesce(mm.costo, 0::numeric)) as costo_manutenzione_annuo
  from public.mezzi_manutenzioni mm
  cross join parametri p
  where mm.data >= p.oggi - 365
  group by mm.mezzo_id
),
costi_annui as (
  select
    m.id as mezzo_id,
    coalesce(cd.costo_documenti_annuo, 0::numeric)
      + coalesce(m.rata_mensile, 0::numeric) * 12::numeric
      + coalesce(cm.costo_manutenzione_annuo, 0::numeric) as costo_annuo
  from public.mezzi m
  left join costi_documenti cd on cd.mezzo_id = m.id
  left join costi_manutenzione cm on cm.mezzo_id = m.id
  where m.deleted_at is null
),
periodi as (
  select
    ma.order_id,
    ma.mezzo_id,
    greatest(
      0,
      least(coalesce((ma.al at time zone 'Europe/Rome')::date, p.oggi), p.oggi)
        - (ma.dal at time zone 'Europe/Rome')::date
        + 1
    )::numeric as giorni,
    1::numeric as peso
  from public.mezzi_assegnazioni ma
  join public.mezzi m on m.id = ma.mezzo_id and m.deleted_at is null
  cross join parametri p
  where ma.order_id is not null
  union all
  select
    al.order_id,
    al.mezzo_id,
    greatest(0, least(coalesce(al.al, p.oggi), p.oggi) - al.dal + 1)::numeric as giorni,
    coalesce(al.quantita / nullif(m.quantita_totale, 0), 0) as peso
  from public.mezzi_allocazioni al
  join public.mezzi m on m.id = al.mezzo_id and m.deleted_at is null
  cross join parametri p
  where al.order_id is not null
),
per_ordine as (
  select
    pe.order_id,
    count(distinct pe.mezzo_id)::bigint as mezzi_usati,
    sum(pe.giorni)::bigint as giorni_mezzo,
    count(distinct pe.mezzo_id) filter (where coalesce(ca.costo_annuo, 0::numeric) <= 0::numeric)::bigint as mezzi_senza_costo,
    round(sum(pe.giorni * pe.peso * coalesce(ca.costo_annuo, 0::numeric) / 365::numeric), 2) as costo_mezzi_stimato
  from periodi pe
  left join costi_annui ca on ca.mezzo_id = pe.mezzo_id
  group by pe.order_id
)
select
  o.id as order_id,
  o.company_id,
  coalesce(po.costo_mezzi_stimato, 0::numeric) as costo_mezzi_stimato,
  coalesce(po.mezzi_usati, 0::bigint) as mezzi_usati,
  coalesce(po.giorni_mezzo, 0::bigint) as giorni_mezzo,
  coalesce(po.mezzi_senza_costo, 0::bigint) as mezzi_senza_costo,
  public.has_permission_for_company((select auth.uid()), 'can_view_mezzi', o.company_id) as dati_mezzi_visibili
from public.orders o
left join per_ordine po on po.order_id = o.id;

comment on view public.v_ordine_costi_mezzi_stimati is
  'Stima gestionale dei mezzi assegnati alla commessa (anche le attrezzature a quantità, in proporzione a quanto è montato). Non entra nel consuntivo ufficiale e non va sommata a costi mezzo gia registrati manualmente.';
revoke all on public.v_ordine_costi_mezzi_stimati from anon;
grant select on public.v_ordine_costi_mezzi_stimati to authenticated;

-- ── 4. Semina e pre-classificazione per chi ha già dei mezzi ────────────────
select public._mezzi_semina_categorie(c.company_id)
  from (select distinct company_id from public.mezzi) c;

update public.mezzi m
   set categoria_id = c.id
  from public.mezzi_categorie c
 where c.company_id = m.company_id
   and c.classe = 'attrezzatura'
   and m.tipo = 'attrezzatura'
   and m.categoria_id is null
   and c.nome = case
     when m.nome ~* 'ponteggi|trabattell|scala|pedana'                         then 'Ponteggi e accesso'
     when m.nome ~* 'demolitor|martello demol'                                 then 'Demolizione'
     when m.nome ~* 'betonier|miscelator|intonacatric|impastatric|molazz'      then 'Macchine da cantiere'
     when m.nome ~* 'tagliapiastrell|troncatric|flessibil|sega|taglierin'      then 'Taglio'
     when m.nome ~* 'livell|laser|distanziometr|stadia'                        then 'Misura e tracciamento'
     when m.nome ~* 'generator|compressor'                                     then 'Energia e compressori'
     when m.nome ~* 'puntell|cassefor|casser'                                  then 'Casseforme e puntelli'
     when m.nome ~* 'transenn|recinzion'                                       then 'Transenne e recinzioni'
     when m.nome ~* 'imbracatur|linea vita|casco'                              then 'Sicurezza e DPI'
     when m.nome ~* 'aspirator|idropulitric'                                   then 'Pulizia'
     when m.nome ~* 'avvitator|trapan|smerigliatric|tassellator|perforator'    then 'Elettroutensili'
   end;
