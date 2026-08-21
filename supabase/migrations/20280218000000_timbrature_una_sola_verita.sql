-- Timbrature: una sola verità, il registro HR.
--
-- Fino a oggi la stessa timbrata viveva in due tabelle scollegate:
-- `campo_timbrature` (app operaio: user_id + cantiere) e `hr_timbrature`
-- (registro ufficio: profilo_id, ed è l'UNICA che alimenta hr_giornate →
-- Presenze → cedolino). La copia da campo a HR la faceva il client, best
-- effort: due round trip non transazionali, con `console.warn` se falliva, e
-- soprattutto SALTATA del tutto quando l'operaio non ha un profilo HR
-- collegato. Su Demo 2: 6 timbrature dal campo, ZERO nel registro HR — ore
-- lavorate che l'ufficio non vedeva e che il cedolino non contava.
--
-- Da qui in poi la copia la fa il database, dentro la stessa transazione
-- dell'insert, per QUALSIASI percorso di scrittura (app, home, kiosk,
-- import futuri). E quando il profilo HR non c'è la timbratura non sparisce
-- in silenzio: resta con `hr_timbratura_id` a NULL, che è esattamente ciò
-- che il pannello "senza profilo HR" mostra all'ufficio.

-- ── 1. Il cantiere entra nel registro HR ────────────────────────────────────
-- Prima sopravviveva solo come stringa dentro `note` ("Cantiere: ORD-...").
alter table public.hr_timbrature
  add column if not exists order_id uuid references public.orders(id) on delete set null;

create index if not exists idx_hr_timbrature_order
  on public.hr_timbrature(order_id) where order_id is not null;

-- ── 2. Il legame esplicito campo → HR ───────────────────────────────────────
-- NULL = questa timbratura non è mai arrivata nel registro (e si vede).
alter table public.campo_timbrature
  add column if not exists hr_timbratura_id uuid references public.hr_timbrature(id) on delete set null;

create index if not exists idx_campo_timbrature_senza_hr
  on public.campo_timbrature(company_id, timestamp_evento)
  where hr_timbratura_id is null;

-- ── 3. 'kiosk' è una fonte legittima anche per HR ───────────────────────────
-- campo_timbrature l'ammette già: senza questo, il mirror di una timbrata da
-- totem violerebbe il CHECK e farebbe fallire l'intera timbratura.
alter table public.hr_timbrature drop constraint if exists hr_timbrature_fonte_check;
alter table public.hr_timbrature add constraint hr_timbrature_fonte_check
  check (fonte = any (array['web'::text, 'app'::text, 'nfc'::text, 'qr'::text, 'manuale'::text, 'kiosk'::text]));

-- ── 4. Da login a profilo HR: due gambe ─────────────────────────────────────
-- Diretta (hr_profili.user_id) oppure via anagrafica (employees.user_id →
-- hr_profili.employee_id). Sulle due Demo la seconda gamba recupera 6
-- timbrature su 13 che la prima da sola perdeva.
create or replace function public.hr_profilo_da_user(p_user_id uuid, p_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from (
    select hp.id, 0 as priorita, hp.attivo
      from hr_profili hp
     where hp.user_id = p_user_id
       and hp.company_id = p_company_id
    union all
    select hp.id, 1 as priorita, hp.attivo
      from employees e
      join hr_profili hp on hp.employee_id = e.id
     where e.user_id = p_user_id
       and e.company_id = p_company_id
       and hp.company_id = p_company_id
  ) x
  order by priorita, attivo desc nulls last
  limit 1
$$;

-- ── 5. Il mirror ────────────────────────────────────────────────────────────
-- BEFORE INSERT: scrive il registro HR e si porta a casa l'id nella stessa
-- riga. Se l'insert di campo fallisce dopo, la transazione annulla anche la
-- copia — cosa che il doppio insert lato client non poteva garantire.
create or replace function public.mirror_campo_timbratura_su_hr()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_profilo uuid;
  v_esistente uuid;
  v_nuova uuid;
begin
  if new.hr_timbratura_id is not null then
    return new;                      -- già collegata (backfill, import)
  end if;

  v_profilo := public.hr_profilo_da_user(new.user_id, new.company_id);
  if v_profilo is null then
    return new;                      -- nessun profilo HR: non si inventa nulla
  end if;

  -- I client già installati scrivono ancora la loro copia: non raddoppiare.
  select ht.id into v_esistente
    from hr_timbrature ht
   where ht.profilo_id = v_profilo
     and ht.tipo = new.tipo
     and ht."timestamp" between new.timestamp_evento - interval '2 minutes'
                            and new.timestamp_evento + interval '2 minutes'
   order by abs(extract(epoch from (ht."timestamp" - new.timestamp_evento)))
   limit 1;

  if v_esistente is not null then
    new.hr_timbratura_id := v_esistente;
    return new;
  end if;

  insert into hr_timbrature (company_id, profilo_id, tipo, "timestamp", lat, lng, fonte, note, order_id)
  values (new.company_id, v_profilo, new.tipo, new.timestamp_evento,
          new.gps_lat, new.gps_lng, coalesce(new.fonte, 'app'), new.note, new.order_id)
  returning id into v_nuova;

  new.hr_timbratura_id := v_nuova;
  return new;
end $$;

drop trigger if exists trg_mirror_campo_timbratura on public.campo_timbrature;
create trigger trg_mirror_campo_timbratura
  before insert on public.campo_timbrature
  for each row execute function public.mirror_campo_timbratura_su_hr();

-- ── 6. Backfill dello storico ───────────────────────────────────────────────
-- Il seed ha creato coppie identiche allo stesso microsecondo: si deduplica
-- la SORGENTE per (profilo, tipo, minuto), altrimenti il NOT EXISTS — valutato
-- sullo snapshot d'inizio statement — le farebbe passare entrambe.
with risolte as (
  select ct.id, ct.company_id, ct.tipo, ct.timestamp_evento, ct.gps_lat, ct.gps_lng,
         ct.fonte, ct.note, ct.order_id,
         public.hr_profilo_da_user(ct.user_id, ct.company_id) as profilo_id
    from campo_timbrature ct
   where ct.hr_timbratura_id is null
),
candidate as (
  select distinct on (profilo_id, tipo, date_trunc('minute', timestamp_evento)) *
    from risolte
   where profilo_id is not null
     and not exists (
       select 1 from hr_timbrature ht
        where ht.profilo_id = risolte.profilo_id
          and ht.tipo = risolte.tipo
          and ht."timestamp" between risolte.timestamp_evento - interval '2 minutes'
                                 and risolte.timestamp_evento + interval '2 minutes'
     )
   order by profilo_id, tipo, date_trunc('minute', timestamp_evento), timestamp_evento
),
inserite as (
  insert into hr_timbrature (company_id, profilo_id, tipo, "timestamp", lat, lng, fonte, note, order_id)
  select company_id, profilo_id, tipo, timestamp_evento, gps_lat, gps_lng,
         coalesce(fonte, 'app'), note, order_id
    from candidate
  returning id, profilo_id, tipo, "timestamp"
)
update campo_timbrature ct
   set hr_timbratura_id = i.id
  from inserite i
 where ct.hr_timbratura_id is null
   and ct.tipo = i.tipo
   and ct.timestamp_evento between i."timestamp" - interval '2 minutes'
                               and i."timestamp" + interval '2 minutes'
   and public.hr_profilo_da_user(ct.user_id, ct.company_id) = i.profilo_id;

-- Le già-gemelle (copia scritta dal client prima d'oggi): collega e basta.
update campo_timbrature ct
   set hr_timbratura_id = ht.id
  from hr_timbrature ht
 where ct.hr_timbratura_id is null
   and ht.profilo_id = public.hr_profilo_da_user(ct.user_id, ct.company_id)
   and ht.tipo = ct.tipo
   and ht."timestamp" between ct.timestamp_evento - interval '2 minutes'
                          and ct.timestamp_evento + interval '2 minutes';

-- ── 7. L'ufficio deve poter correggere ──────────────────────────────────────
-- campo_timbrature aveva SELECT e INSERT e basta: una timbrata sbagliata era
-- inemendabile. Admin/staff dell'azienda ora possono correggerla o toglierla.
-- Stesso predicato del ramo admin di ct_select: nessuna funzione nuova,
-- nessuna deriva rispetto al modello di sicurezza già in vigore sulla tabella.
drop policy if exists ct_update_admin on public.campo_timbrature;
create policy ct_update_admin on public.campo_timbrature
  for update
  using (
    company_id = (select p.company_id from profiles p where p.id = (select auth.uid()))
    and exists (
      select 1 from user_roles ur
       where ur.user_id = (select auth.uid())
         and ur.role = any (array['company_admin'::app_role, 'company_staff'::app_role, 'super_admin'::app_role])
    )
  )
  with check (
    company_id = (select p.company_id from profiles p where p.id = (select auth.uid()))
    and exists (
      select 1 from user_roles ur
       where ur.user_id = (select auth.uid())
         and ur.role = any (array['company_admin'::app_role, 'company_staff'::app_role, 'super_admin'::app_role])
    )
  );

drop policy if exists ct_delete_admin on public.campo_timbrature;
create policy ct_delete_admin on public.campo_timbrature
  for delete
  using (
    company_id = (select p.company_id from profiles p where p.id = (select auth.uid()))
    and exists (
      select 1 from user_roles ur
       where ur.user_id = (select auth.uid())
         and ur.role = any (array['company_admin'::app_role, 'company_staff'::app_role, 'super_admin'::app_role])
    )
  );
