-- Giornale dei lavori, lotto 5: gli eventi della giornata hanno un tipo.
--   consegna, problema, sospensione, ripresa, istruzione, sopralluogo, sicurezza, nota.
-- Su una pagina firmata niente si aggiunge, si cambia o si toglie: resta permesso solo
-- chiudere o riaprire un problema (un problema si risolve anche dopo la firma).
-- Il cliente del portale vede solo le pagine firmate e marcate visibili, mai gli eventi.
--
-- Due sole CREATE POLICY: ognuna tiene un lock fino alla fine della transazione.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1. Gli eventi. La cancellazione a cascata dalla pagina serve alle bozze:
--    una pagina firmata non si cancella (lo impedisce la sua guardia).
--    I collegamenti vanno a NULL se la bolla, il ticket o la fase spariscono.
create table if not exists public.giornale_eventi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  giornale_id uuid not null references public.giornale_lavori(id) on delete cascade,
  tipo text not null check (tipo in ('consegna', 'problema', 'sospensione', 'ripresa', 'istruzione', 'sopralluogo', 'sicurezza', 'nota')),
  testo text not null check (length(btrim(testo)) between 1 and 5000),
  ora time,
  ddt_id uuid references public.ddt_ricezione(id) on delete set null,
  ticket_id uuid references public.tickets(id) on delete set null,
  fase_id uuid references public.order_work_phases(id) on delete set null,
  stato text,
  chiuso_il timestamptz,
  chiuso_da uuid,
  nota_chiusura text,
  autore_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint giornale_eventi_stato_check check (
    (tipo = 'problema' and stato in ('aperto', 'chiuso')) or (tipo <> 'problema' and stato is null)
  ),
  constraint giornale_eventi_chiusura_check check (
    stato is distinct from 'chiuso' or (chiuso_il is not null and length(btrim(coalesce(nota_chiusura, ''))) > 0)
  )
);

create index if not exists idx_giornale_eventi_giornale on public.giornale_eventi (giornale_id, created_at);
create index if not exists idx_giornale_eventi_problemi_aperti on public.giornale_eventi (company_id) where tipo = 'problema' and stato = 'aperto';
create index if not exists idx_giornale_eventi_ddt on public.giornale_eventi (ddt_id) where ddt_id is not null;
create index if not exists idx_giornale_eventi_ticket on public.giornale_eventi (ticket_id) where ticket_id is not null;
create index if not exists idx_giornale_eventi_fase on public.giornale_eventi (fase_id) where fase_id is not null;
-- Una bolla o una segnalazione, un solo evento per pagina. Indici interi, non parziali:
-- i NULL non confliggono e l'upsert di PostgREST li riconosce.
create unique index if not exists uq_giornale_eventi_ddt on public.giornale_eventi (giornale_id, ddt_id);
create unique index if not exists uq_giornale_eventi_ticket on public.giornale_eventi (giornale_id, ticket_id);

alter table public.giornale_eventi enable row level security;

revoke all on table public.giornale_eventi from public, anon;
grant select, insert, update, delete on table public.giornale_eventi to authenticated;
grant all on table public.giornale_eventi to service_role;

drop policy if exists giornale_eventi_select on public.giornale_eventi;
create policy giornale_eventi_select on public.giornale_eventi
  for select to authenticated
  using (company_id = (select public.get_my_company_id())
         and not (select public.utente_e_cliente_esterno())
         and not (select public.utente_bloccato()));

drop policy if exists giornale_eventi_scrittura on public.giornale_eventi;
create policy giornale_eventi_scrittura on public.giornale_eventi
  for all to authenticated
  using (public.puo_modificare_giornale(company_id))
  with check (public.puo_modificare_giornale(company_id));

-- 2. Gli eventi entrano nell'impronta, ma solo quel che dichiarano: id, tipo, ora, testo.
--    Fuori lo stato del problema (si chiude dopo la firma) e i collegamenti (vanno a NULL
--    se la bolla viene cancellata). Senza eventi la chiave non c'è: stessa impronta di prima.
create or replace function public.giornale_testo_canonico(g public.giornale_lavori)
returns text
language sql
stable
set search_path = ''
as $$
  select (
    (to_jsonb(g) - array[
      'stato', 'pm_signed_at', 'pm_signed_by', 'pm_signature_hash', 'created_by',
      'visibile_cliente', 'archived_storage_path', 'archived_at',
      'dl_notified_at', 'dl_notification_method'
    ])
    || jsonb_build_object('foto', coalesce((
         select jsonb_agg(jsonb_build_array(f.id, f.storage_path) order by f.id)
           from public.giornale_foto f
          where f.giornale_id = g.id), '[]'::jsonb))
    || coalesce((
         select jsonb_build_object('eventi', jsonb_agg(jsonb_build_array(e.id, e.tipo, e.ora, e.testo) order by e.id))
           from public.giornale_eventi e
          where e.giornale_id = g.id
         having count(*) > 0), '{}'::jsonb)
  )::text;
$$;

revoke all on function public.giornale_testo_canonico(public.giornale_lavori) from public, anon;
grant execute on function public.giornale_testo_canonico(public.giornale_lavori) to authenticated, service_role;

-- 3. Guardia degli eventi: vale per tutti, service role compreso.
create or replace function public.giornale_eventi_guardia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Su una firmata può cambiare la chiusura; i collegamenti solo verso NULL (FK ON DELETE SET NULL).
  chiusura constant text[] := array['stato', 'chiuso_il', 'chiuso_da', 'nota_chiusura', 'ddt_id', 'ticket_id', 'fase_id'];
  v_pagina public.giornale_lavori;
begin
  if tg_op = 'DELETE' then
    -- Purga dell'azienda a cascata: l'azienda non c'è più, si lascia fare.
    if not exists (select 1 from public.companies c where c.id = old.company_id) then
      return old;
    end if;
    -- Pagina già sparita = bozza cancellata con i suoi eventi.
    if exists (select 1 from public.giornale_lavori g where g.id = old.giornale_id and g.stato = 'firmata') then
      raise exception 'Questa pagina del giornale è firmata: gli eventi non si possono togliere.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  -- FOR SHARE: se qualcuno sta firmando si aspetta, e si vede la pagina già firmata.
  select * into v_pagina from public.giornale_lavori where id = new.giornale_id for share;
  if not found then
    raise exception 'Pagina del giornale non trovata.' using errcode = 'P0002';
  end if;
  if v_pagina.company_id is distinct from new.company_id then
    raise exception 'La pagina del giornale è di un''altra azienda.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    new.autore_id := coalesce((select auth.uid()), new.autore_id);
    new.created_at := now();
  end if;

  -- Chiudere e riaprire un problema: data e autore li scrive il database.
  if new.tipo = 'problema' then
    new.stato := coalesce(new.stato, 'aperto');
    if new.stato = 'chiuso' then
      if tg_op = 'UPDATE' and old.stato = 'chiuso' then
        new.chiuso_il := old.chiuso_il;
        new.chiuso_da := old.chiuso_da;
      else
        new.chiuso_il := now();
        new.chiuso_da := coalesce((select auth.uid()), new.chiuso_da);
      end if;
    else
      new.chiuso_il := null;
      new.chiuso_da := null;
      new.nota_chiusura := null;
    end if;
  else
    new.stato := null;
    new.chiuso_il := null;
    new.chiuso_da := null;
    new.nota_chiusura := null;
  end if;

  -- I collegamenti restano dentro l'azienda (e la fase dentro la commessa della pagina).
  if new.ddt_id is not null and (tg_op = 'INSERT' or new.ddt_id is distinct from old.ddt_id)
     and not exists (select 1 from public.ddt_ricezione d where d.id = new.ddt_id and d.company_id = new.company_id) then
    raise exception 'La bolla collegata non è di questa azienda.' using errcode = '42501';
  end if;
  if new.ticket_id is not null and (tg_op = 'INSERT' or new.ticket_id is distinct from old.ticket_id)
     and not exists (select 1 from public.tickets t where t.id = new.ticket_id and t.company_id = new.company_id) then
    raise exception 'La segnalazione collegata non è di questa azienda.' using errcode = '42501';
  end if;
  if new.fase_id is not null and (tg_op = 'INSERT' or new.fase_id is distinct from old.fase_id)
     and not exists (select 1 from public.order_work_phases f where f.id = new.fase_id and f.order_id = v_pagina.order_id) then
    raise exception 'La fase collegata non è di questa commessa.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if v_pagina.stato = 'firmata' then
      raise exception 'Questa pagina del giornale è firmata: non si possono aggiungere eventi. Aggiungi un''annotazione.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if v_pagina.stato = 'firmata'
     or exists (select 1 from public.giornale_lavori g where g.id = old.giornale_id and g.stato = 'firmata') then
    if (to_jsonb(new) - chiusura) is distinct from (to_jsonb(old) - chiusura)
       or (new.ddt_id is not null and new.ddt_id is distinct from old.ddt_id)
       or (new.ticket_id is not null and new.ticket_id is distinct from old.ticket_id)
       or (new.fase_id is not null and new.fase_id is distinct from old.fase_id) then
      raise exception 'Questa pagina del giornale è firmata: si può solo chiudere o riaprire un problema.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.giornale_eventi_guardia() from public, anon, authenticated;

drop trigger if exists trg_giornale_eventi_guardia on public.giornale_eventi;
create trigger trg_giornale_eventi_guardia
  before insert or update or delete on public.giornale_eventi
  for each row execute function public.giornale_eventi_guardia();

-- 4. Gli invii alla direzione lavori: il link porta un token, qui c'è solo la sua impronta.
--    Nessuna policy: legge e scrive solo il service role (edge giornale-invia-dl e giornale-dl-documento).
create table if not exists public.giornale_invii_dl (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  giornale_id uuid not null references public.giornale_lavori(id) on delete cascade,
  email text not null check (length(btrim(email)) between 3 and 320),
  token_hash text not null unique,
  scade_il timestamptz not null,
  inviato_da uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_giornale_invii_dl_giornale on public.giornale_invii_dl (giornale_id, created_at);

alter table public.giornale_invii_dl enable row level security;

revoke all on table public.giornale_invii_dl from public, anon, authenticated;
grant all on table public.giornale_invii_dl to service_role;

-- 5. Il cliente del portale: solo le pagine firmate E marcate visibili, delle sue commesse.
--    ALTER e non una policy accanto: le policy permissive si sommano in OR.
alter policy giornale_lavori_lettura_authenticated on public.giornale_lavori
  using (
    public.user_can_read_accountant_company(company_id)
    or (coalesce(visibile_cliente, false) is true
        and stato = 'firmata'
        and exists (select 1 from public.orders o
                     where o.id = giornale_lavori.order_id
                       and o.customer_id = (select auth.uid())))
  );

alter policy giornale_foto_cliente_select on public.giornale_foto
  using (
    exists (select 1 from public.giornale_lavori g
              join public.orders o on o.id = g.order_id
             where g.id = giornale_foto.giornale_id
               and coalesce(g.visibile_cliente, false) is true
               and g.stato = 'firmata'
               and o.customer_id = (select auth.uid()))
  );
