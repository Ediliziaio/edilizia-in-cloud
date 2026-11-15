-- Lotto 3 del piano docs/piano-clienti-pa-commessa-fattura.md:
-- «Dati appalto e fatturazione PA» nella commessa.
--
-- Una commessa può avere più riferimenti (più affidamenti, lotti, progetti): ognuno è una riga
-- di order_riferimenti_pa con il suo tipo (contratto / ordine d'acquisto / convenzione), CIG, CUP,
-- determina, impegno di spesa e ufficio destinatario. Il lotto 5 li porterà nell'XML in
-- DatiContratto / DatiOrdineAcquisto / DatiConvenzione.
--
-- «Non dovuto» si dichiara con la spunta (cig_non_dovuto / cup_non_dovuto), mai con valori finti:
-- il CHECK impedisce di avere insieme il codice e la spunta.
--
-- ufficio_id è senza chiave esterna: anagrafica_uffici_pa (lotto 2) non esisteva quando questa
-- migrazione è stata applicata (15/11/2026). Va aggiunta con una migrazione successiva.
--
-- fonte / fonte_id: una riga importata dal contratto della commessa generale o dal computo
-- ricorda da dove viene, e l'indice unico impedisce di importarla due volte.
-- Le colonne cig/cup di generale_contratti e computo_uploads restano dove sono.

-- ALTER TABLE orders prende un lock esclusivo: meglio fallire che bloccare la produzione.
set local lock_timeout = '3s';

create table if not exists public.order_riferimenti_pa (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  tipo text not null default 'contratto',
  numero text,
  data date,
  cig text,
  cig_non_dovuto boolean not null default false,
  cig_motivo_esclusione text,
  cup text,
  cup_non_dovuto boolean not null default false,
  lotto text,
  determina text,
  impegno_spesa text,
  ufficio_id uuid,
  codice_univoco_ufficio text,
  note_fatturazione text,
  fonte text not null default 'manuale',
  fonte_id uuid,
  ordinamento integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

alter table public.order_riferimenti_pa drop constraint if exists order_riferimenti_pa_tipo;
alter table public.order_riferimenti_pa add constraint order_riferimenti_pa_tipo
  check (tipo in ('contratto', 'ordine_acquisto', 'convenzione'));
-- CIG: 10 caratteri alfanumerici (CIG ordinario e vecchi SmartCIG, es. Z1A2B3C4D5).
alter table public.order_riferimenti_pa drop constraint if exists order_riferimenti_pa_cig_formato;
alter table public.order_riferimenti_pa add constraint order_riferimenti_pa_cig_formato
  check (cig is null or cig ~ '^[A-Z0-9]{10}$');
-- CUP: 15 caratteri, il primo è una lettera.
alter table public.order_riferimenti_pa drop constraint if exists order_riferimenti_pa_cup_formato;
alter table public.order_riferimenti_pa add constraint order_riferimenti_pa_cup_formato
  check (cup is null or cup ~ '^[A-Z][A-Z0-9]{14}$');
alter table public.order_riferimenti_pa drop constraint if exists order_riferimenti_pa_ufficio_formato;
alter table public.order_riferimenti_pa add constraint order_riferimenti_pa_ufficio_formato
  check (codice_univoco_ufficio is null or codice_univoco_ufficio ~ '^[A-Z0-9]{6}$');
alter table public.order_riferimenti_pa drop constraint if exists order_riferimenti_pa_cig_o_non_dovuto;
alter table public.order_riferimenti_pa add constraint order_riferimenti_pa_cig_o_non_dovuto
  check (not (cig_non_dovuto and cig is not null));
alter table public.order_riferimenti_pa drop constraint if exists order_riferimenti_pa_cup_o_non_dovuto;
alter table public.order_riferimenti_pa add constraint order_riferimenti_pa_cup_o_non_dovuto
  check (not (cup_non_dovuto and cup is not null));
alter table public.order_riferimenti_pa drop constraint if exists order_riferimenti_pa_fonte;
alter table public.order_riferimenti_pa add constraint order_riferimenti_pa_fonte
  check (fonte in ('manuale', 'contratto_generale', 'computo'));

create index if not exists order_riferimenti_pa_order_idx on public.order_riferimenti_pa (order_id, ordinamento);
create index if not exists order_riferimenti_pa_company_idx on public.order_riferimenti_pa (company_id);
create unique index if not exists order_riferimenti_pa_fonte_unica
  on public.order_riferimenti_pa (order_id, fonte, fonte_id) where fonte <> 'manuale' and fonte_id is not null;

-- Normalizza i codici (maiuscolo, senza spazi), prende company_id dalla commessa
-- e accende i riferimenti PA sulla commessa.
create or replace function public.order_riferimenti_pa_normalizza()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.cig := nullif(upper(regexp_replace(coalesce(new.cig, ''), '\s', '', 'g')), '');
  new.cup := nullif(upper(regexp_replace(coalesce(new.cup, ''), '\s', '', 'g')), '');
  new.codice_univoco_ufficio := nullif(upper(regexp_replace(coalesce(new.codice_univoco_ufficio, ''), '\s', '', 'g')), '');
  new.numero := nullif(btrim(new.numero), '');
  new.cig_motivo_esclusione := case when new.cig_non_dovuto then nullif(btrim(new.cig_motivo_esclusione), '') else null end;
  select o.company_id into new.company_id from public.orders o where o.id = new.order_id;
  if new.company_id is null then
    raise exception 'Commessa % inesistente', new.order_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.order_riferimenti_pa_normalizza() from public, anon, authenticated;

drop trigger if exists order_riferimenti_pa_normalizza on public.order_riferimenti_pa;
create trigger order_riferimenti_pa_normalizza
  before insert or update on public.order_riferimenti_pa
  for each row execute function public.order_riferimenti_pa_normalizza();

-- Sulla commessa: la sezione si vede per i clienti PA e per chi l'accende a mano.
alter table public.orders add column if not exists riferimenti_pa_attivi boolean not null default false;
comment on column public.orders.riferimenti_pa_attivi is
  'Sezione «Dati appalto e fatturazione PA» accesa: da sola se il cliente è PA, a mano per privati e aziende (es. CUP di un finanziamento pubblico).';

create or replace function public.order_riferimenti_pa_accendi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders set riferimenti_pa_attivi = true
   where id = new.order_id and not riferimenti_pa_attivi;
  return null;
end;
$$;
revoke all on function public.order_riferimenti_pa_accendi() from public, anon, authenticated;

drop trigger if exists order_riferimenti_pa_accendi on public.order_riferimenti_pa;
create trigger order_riferimenti_pa_accendi
  after insert on public.order_riferimenti_pa
  for each row execute function public.order_riferimenti_pa_accendi();

-- Cliente PA → sezione accesa (mai spenta da sola).
create or replace function public.orders_riferimenti_pa_da_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is not null and not new.riferimenti_pa_attivi
     and (tg_op = 'INSERT' or new.customer_id is distinct from old.customer_id) then
    if exists (
      select 1 from public.anagrafiche_native a
       where a.company_id = new.company_id and a.cliente_id = new.customer_id
         and (upper(coalesce(a.tipo_cliente, '')) = 'PA' or lower(coalesce(a.tipo_soggetto, '')) = 'pa')
    ) then
      new.riferimenti_pa_attivi := true;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.orders_riferimenti_pa_da_cliente() from public, anon, authenticated;

drop trigger if exists orders_riferimenti_pa_da_cliente on public.orders;
create trigger orders_riferimenti_pa_da_cliente
  before insert or update of customer_id on public.orders
  for each row execute function public.orders_riferimenti_pa_da_cliente();

-- Accessi: come le fasi della commessa.
alter table public.order_riferimenti_pa enable row level security;

drop policy if exists order_riferimenti_pa_lettura on public.order_riferimenti_pa;
create policy order_riferimenti_pa_lettura on public.order_riferimenti_pa
  for select to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'can_view_orders'))
    and company_id = (select public.get_user_company_id((select auth.uid())))
    and public._order_visible_under_rls(order_id, false)
  );

drop policy if exists order_riferimenti_pa_modifica on public.order_riferimenti_pa;
create policy order_riferimenti_pa_modifica on public.order_riferimenti_pa
  for all to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and company_id = (select public.get_user_company_id((select auth.uid())))
    and public._order_visible_under_rls(order_id, true)
  )
  with check (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and public.get_order_company_id(order_id) = (select public.get_user_company_id((select auth.uid())))
    and public._order_visible_under_rls(order_id, true)
  );

drop policy if exists order_riferimenti_pa_admin on public.order_riferimenti_pa;
create policy order_riferimenti_pa_admin on public.order_riferimenti_pa
  for all to authenticated
  using ((select public.e_amministratore_di(company_id)))
  with check ((select public.e_amministratore_di(public.get_order_company_id(order_id))));

drop policy if exists order_riferimenti_pa_super_admin on public.order_riferimenti_pa;
create policy order_riferimenti_pa_super_admin on public.order_riferimenti_pa
  for all to authenticated
  using ((select public.has_role((select auth.uid()), 'super_admin'::app_role)))
  with check ((select public.has_role((select auth.uid()), 'super_admin'::app_role)));

drop policy if exists blocco_utente_bloccato on public.order_riferimenti_pa;
create policy blocco_utente_bloccato on public.order_riferimenti_pa
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

revoke all on public.order_riferimenti_pa from anon;
grant select, insert, update, delete on public.order_riferimenti_pa to authenticated;
grant all on public.order_riferimenti_pa to service_role;

-- Aggiunto il 15/11/2026 (ricostruzione da zero): la chiave esterna verso l'ufficio PA.
-- In produzione l'ha messa 20290410230000, applicata dopo questa; ricostruendo in ordine
-- di versione quella gira prima che la tabella esista e non fa niente, quindi la si
-- rimette qui. Idempotente: in produzione questo file non si riapplica.
do $fk_ufficio$
begin
  if to_regclass('public.anagrafica_uffici_pa') is not null
     and not exists (select 1 from pg_constraint
                      where conrelid = 'public.order_riferimenti_pa'::regclass
                        and conname = 'order_riferimenti_pa_ufficio_fk') then
    alter table public.order_riferimenti_pa
      add constraint order_riferimenti_pa_ufficio_fk
      foreign key (ufficio_id) references public.anagrafica_uffici_pa(id) on delete set null;
  end if;
end
$fk_ufficio$;
create index if not exists order_riferimenti_pa_ufficio_idx
  on public.order_riferimenti_pa (ufficio_id) where ufficio_id is not null;
