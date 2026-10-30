-- ════════════════════════════════════════════════════════════════════════════
-- Commesse generali: subappalti sul contratto e varianti dell'acquirente
-- ════════════════════════════════════════════════════════════════════════════
-- Piano: docs/superpowers/plans/2026-10-30-commesse-generali-appalti-sviluppi.md
-- («Cosa mancava»: subappalti sul contratto; §2.2 Unità: varianti dell'acquirente).
-- Viene dopo 20281031100000_generale_contratto_e_sal e 20281031120000_generale_unita_vendite.
--
-- Niente di nuovo dove l'app c'è già:
--   · i contratti di subappalto restano `contratti_subappalto` (uno per commessa),
--     (subappaltatore in `subappaltatori_sicurezza`), i SAL passivi `sal_subappaltatori`,
--     DURC e documenti come li legge la scheda del subappaltatore: `durc_scadenza`,
--     `documenti_subappaltatore` e il fascicolo `subappaltatori_documenti` (attraverso
--     `campo_subappaltatore_id`). Qui si leggono per contratto, non si copiano;
--   · le varianti dell'acquirente sono `ordini_variazione` sulla commessa dell'unità,
--     con il loro documento, la firma online o su carta e il costo previsto
--     (interno, nella bozza: order_variation_workspaces.content.estimatedCost).
--     Le approvate entrano già nella marginalità della commessa (v_ordine_marginalita).
--
-- Si aggiunge solo:
--   · generale_subappalto_ordini       un subappalto legato ad altri ordini di lavoro
--     dello stesso contratto, oltre a quello su cui è nato;
--   · generale_subappalti_impostazioni la soglia della quota subappaltabile, se il
--     contratto ne ha una (negli appalti pubblici la fissa il bando): niente numero
--     imposto, null = nessun avviso;
--   · generale_varianti_acquirente     la scadenza entro cui l'acquirente sceglie.
-- Si scrive solo con le RPC qui sotto; si legge con generale_subappalti_elenco e
-- generale_varianti_elenco (importi, costi e margini a chi ha il permesso).
-- Nessun dato esistente viene toccato. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Le tabelle ───────────────────────────────────────────────────────────
create table if not exists public.generale_subappalto_ordini (
  contratto_id uuid not null references public.contratti_subappalto(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (contratto_id, order_id)
);
create index if not exists generale_subappalto_ordini_order_idx on public.generale_subappalto_ordini(order_id);
create index if not exists generale_subappalto_ordini_company_idx on public.generale_subappalto_ordini(company_id);

create table if not exists public.generale_subappalti_impostazioni (
  generale_id uuid primary key references public.orders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  soglia_pct numeric(5,2) check (soglia_pct is null or (soglia_pct > 0 and soglia_pct <= 100)),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists generale_subappalti_impostazioni_company_idx on public.generale_subappalti_impostazioni(company_id);

create table if not exists public.generale_varianti_acquirente (
  variazione_id uuid primary key references public.ordini_variazione(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  scadenza_scelte date,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists generale_varianti_acquirente_company_idx on public.generale_varianti_acquirente(company_id);

-- Coerenza: azienda della riga = azienda di ciò a cui si appoggia; un ordine legato
-- sta nella stessa generale dell'ordine su cui il subappalto è nato.
create or replace function public.generale_subappalto_ordini_coerente()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_principale uuid;
  v_azienda uuid;
  v_gen_principale uuid;
  v_gen_ordine uuid;
  v_azienda_ordine uuid;
begin
  select c.order_id, c.company_id into v_principale, v_azienda
    from public.contratti_subappalto c where c.id = new.contratto_id;
  select o.commessa_generale_id into v_gen_principale from public.orders o where o.id = v_principale;
  select o.commessa_generale_id, o.company_id into v_gen_ordine, v_azienda_ordine from public.orders o where o.id = new.order_id;
  if v_azienda is distinct from new.company_id or v_azienda_ordine is distinct from new.company_id then
    raise exception 'Subappalto e ordine di lavoro non sono della stessa azienda.' using errcode = '22023';
  end if;
  if new.order_id = v_principale then
    raise exception 'Il subappalto è già su questo ordine di lavoro.' using errcode = '22023';
  end if;
  if v_gen_principale is null or v_gen_ordine is distinct from v_gen_principale then
    raise exception 'Si lega un subappalto solo a ordini di lavoro dello stesso contratto.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.generale_subappalto_ordini_coerente() from public, anon, authenticated;
drop trigger if exists generale_subappalto_ordini_coerente on public.generale_subappalto_ordini;
create trigger generale_subappalto_ordini_coerente before insert or update on public.generale_subappalto_ordini
  for each row execute function public.generale_subappalto_ordini_coerente();

create or replace function public.generale_varianti_acquirente_coerente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.ordini_variazione v where v.id = new.variazione_id and v.company_id = new.company_id) then
    raise exception 'La variante non è di questa azienda.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.generale_varianti_acquirente_coerente() from public, anon, authenticated;
drop trigger if exists generale_varianti_acquirente_coerente on public.generale_varianti_acquirente;
create trigger generale_varianti_acquirente_coerente before insert or update on public.generale_varianti_acquirente
  for each row execute function public.generale_varianti_acquirente_coerente();

create or replace function public.generale_subappalti_impostazioni_coerente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.commesse_generali g where g.order_id = new.generale_id and g.company_id = new.company_id) then
    raise exception 'Commessa generale non trovata.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.generale_subappalti_impostazioni_coerente() from public, anon, authenticated;
drop trigger if exists generale_subappalti_impostazioni_coerente on public.generale_subappalti_impostazioni;
create trigger generale_subappalti_impostazioni_coerente before insert or update on public.generale_subappalti_impostazioni
  for each row execute function public.generale_subappalti_impostazioni_coerente();

-- ── 2. Accessi: si legge con i permessi di ciò che c'è dietro, si scrive con le RPC ──
alter table public.generale_subappalto_ordini enable row level security;
alter table public.generale_subappalti_impostazioni enable row level security;
alter table public.generale_varianti_acquirente enable row level security;

revoke all on public.generale_subappalto_ordini, public.generale_subappalti_impostazioni, public.generale_varianti_acquirente from anon, authenticated;
grant select on public.generale_subappalto_ordini, public.generale_subappalti_impostazioni, public.generale_varianti_acquirente to authenticated;

-- Come contratti_subappalto: costi e amministrazione dei subappaltatori.
drop policy if exists generale_subappalto_ordini_lettura on public.generale_subappalto_ordini;
create policy generale_subappalto_ordini_lettura on public.generale_subappalto_ordini for select to authenticated
  using (
    not (select public.utente_bloccato())
    and public.has_permission_for_company((select auth.uid()), 'can_view_costs', company_id)
    and public.has_permission_for_company((select auth.uid()), 'can_view_subappaltatori_amministrazione', company_id)
  );

drop policy if exists generale_subappalti_impostazioni_lettura on public.generale_subappalti_impostazioni;
create policy generale_subappalti_impostazioni_lettura on public.generale_subappalti_impostazioni for select to authenticated
  using (
    not (select public.utente_bloccato())
    and public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
  );

drop policy if exists generale_varianti_acquirente_lettura on public.generale_varianti_acquirente;
create policy generale_varianti_acquirente_lettura on public.generale_varianti_acquirente for select to authenticated
  using (
    not (select public.utente_bloccato())
    and not (select public.utente_e_cliente_esterno())
    and public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
  );

-- ── 3. Subappalti del contratto: una lettura ────────────────────────────────
-- Tutti i subappalti degli ordini di lavoro della generale (nati lì o legati), con
-- subappaltatore, ordini, SAL passivi e documenti (l'ultimo valido per tipo).
-- Chi non vede costi e amministrazione dei subappaltatori riceve solo i permessi.
create or replace function public.generale_subappalti_elenco(p_generale_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_vede boolean;
  v_modifica boolean;
  v_soglia numeric;
  v_ordini jsonb;
  v_contratti jsonb;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_view_orders', v_azienda) then
    raise exception 'Non hai il permesso di vedere questa commessa.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.commesse_generali g join public.orders o on o.id = g.order_id
     where g.order_id = p_generale_id and o.deleted_at is null
  ) then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;

  v_vede := public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda)
        and public.has_permission_for_company(auth.uid(), 'can_view_subappaltatori_amministrazione', v_azienda);
  v_modifica := v_vede
        and public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda)
        and not public.utente_sola_lettura(v_azienda);
  select i.soglia_pct into v_soglia from public.generale_subappalti_impostazioni i where i.generale_id = p_generale_id;

  if not v_vede then
    return jsonb_build_object(
      'permessi', jsonb_build_object('vede', false, 'modifica', false),
      'soglia_pct', v_soglia, 'ordini', '[]'::jsonb, 'contratti', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'codice', o.order_code, 'nome', o.description)
           order by o.order_code nulls last, o.description), '[]'::jsonb)
    into v_ordini
    from public.orders o
   where o.commessa_generale_id = p_generale_id and o.deleted_at is null;

  with figlie as (
    select o.id from public.orders o
     where o.commessa_generale_id = p_generale_id and o.deleted_at is null
  ), contratti as (
    select c.*
      from public.contratti_subappalto c
     where c.company_id = v_azienda
       and (c.order_id in (select id from figlie)
            or exists (select 1 from public.generale_subappalto_ordini l
                        where l.contratto_id = c.id and l.order_id in (select id from figlie)))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'numero', c.numero_contratto,
           'descrizione', c.descrizione_lavori,
           'importo', c.importo_contrattuale,
           'oneri_sicurezza', c.oneri_sicurezza,
           'stato', c.stato,
           'data_inizio', c.data_inizio,
           'data_fine_prevista', c.data_fine_prevista,
           'firmato_il', c.firmato_il,
           'order_id', c.order_id,
           'ordini_collegati', (
             select coalesce(jsonb_agg(l.order_id order by l.created_at), '[]'::jsonb)
               from public.generale_subappalto_ordini l
              where l.contratto_id = c.id and l.order_id in (select id from figlie)),
           'subappaltatore', jsonb_build_object('id', s.id, 'ragione_sociale', s.ragione_sociale, 'piva', s.piva,
                                                'durc_scadenza', s.durc_scadenza),
           'sal', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'id', ss.id, 'numero', ss.numero_sal, 'data', ss.data_emissione,
                      'lordo', ss.importo_lordo, 'ritenuta', ss.ritenuta_importo, 'netto', ss.importo_netto,
                      'stato', ss.stato, 'pagato', ss.pagato_registrato, 'data_pagamento', ss.data_pagamento
                    ) order by ss.numero_sal), '[]'::jsonb)
               from public.sal_subappaltatori ss
              where ss.contratto_id = c.id),
           -- Per tipo, il documento con la scadenza più lontana: tra quelli della scheda
           -- (documenti_subappaltatore) e quelli del fascicolo (subappaltatori_documenti).
           'documenti', (
             select coalesce(jsonb_agg(jsonb_build_object('tipo', d.tipo, 'scadenza', d.scadenza, 'rilascio', d.rilascio)
                    order by d.tipo), '[]'::jsonb)
               from (
                 select distinct on (x.tipo) x.tipo, x.scadenza, x.rilascio
                   from (
                     select case ds.tipo when 'visura_camerale' then 'visura' when 'attestazione_soa' then 'soa' else ds.tipo end as tipo,
                            ds.data_scadenza as scadenza, ds.data_rilascio as rilascio, ds.created_at
                       from public.documenti_subappaltatore ds
                      where ds.subappaltatore_id = s.id and ds.company_id = v_azienda
                     union all
                     select sd.tipo, sd.scadenza, sd.data_emissione, sd.created_at
                       from public.subappaltatori_documenti sd
                      where s.campo_subappaltatore_id is not null
                        and sd.subappaltatore_id = s.campo_subappaltatore_id and sd.company_id = v_azienda
                        and sd.status in ('active', 'expired')
                   ) x
                  order by x.tipo, x.scadenza desc nulls last, x.created_at desc
               ) d)
         ) order by s.ragione_sociale, c.numero_contratto nulls last), '[]'::jsonb)
    into v_contratti
    from contratti c
    join public.subappaltatori_sicurezza s on s.id = c.subappaltatore_id;

  return jsonb_build_object(
    'permessi', jsonb_build_object('vede', true, 'modifica', v_modifica),
    'soglia_pct', v_soglia,
    'ordini', v_ordini,
    'contratti', v_contratti);
end;
$$;
revoke all on function public.generale_subappalti_elenco(uuid) from public, anon;
grant execute on function public.generale_subappalti_elenco(uuid) to authenticated;

-- ── 4. Legare un subappalto ad altri ordini di lavoro ───────────────────────
-- `p_order_ids` è l'elenco completo degli ordini legati (oltre a quello su cui è nato):
-- quelli che mancano si slegano.
create or replace function public.generale_subappalto_collega(p_generale_id uuid, p_contratto_id uuid, p_order_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_principale uuid;
  v_ids uuid[] := coalesce(p_order_ids, '{}');
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda)
     or not public.has_permission_for_company(auth.uid(), 'can_view_subappaltatori_amministrazione', v_azienda)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda)
     or public.utente_sola_lettura(v_azienda) then
    raise exception 'Non hai il permesso di modificare i subappalti.' using errcode = '42501';
  end if;
  select c.order_id into v_principale
    from public.contratti_subappalto c
    join public.orders o on o.id = c.order_id
   where c.id = p_contratto_id and c.company_id = v_azienda
     and o.commessa_generale_id = p_generale_id;
  if not found then
    raise exception 'Subappalto non trovato in questo contratto.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from unnest(v_ids) x(id)
     where not exists (select 1 from public.orders o
                        where o.id = x.id and o.commessa_generale_id = p_generale_id and o.deleted_at is null)
  ) then
    raise exception 'Si lega un subappalto solo a ordini di lavoro dello stesso contratto.' using errcode = '22023';
  end if;

  delete from public.generale_subappalto_ordini l
   where l.contratto_id = p_contratto_id and not (l.order_id = any (v_ids));
  insert into public.generale_subappalto_ordini (contratto_id, order_id, company_id, created_by)
  select p_contratto_id, x.id, v_azienda, auth.uid()
    from (select distinct unnest(v_ids) as id) x
   where x.id <> v_principale
  on conflict (contratto_id, order_id) do nothing;
end;
$$;
revoke all on function public.generale_subappalto_collega(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.generale_subappalto_collega(uuid, uuid, uuid[]) to authenticated;

-- ── 5. La soglia della quota subappaltata ───────────────────────────────────
create or replace function public.generale_subappalti_soglia(p_generale_id uuid, p_soglia_pct numeric)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda)
     or public.utente_sola_lettura(v_azienda) then
    raise exception 'Non hai il permesso di modificare il contratto.' using errcode = '42501';
  end if;
  if p_soglia_pct is not null and (p_soglia_pct <= 0 or p_soglia_pct > 100) then
    raise exception 'La soglia va da 0 a 100%%.' using errcode = '22023';
  end if;
  insert into public.generale_subappalti_impostazioni (generale_id, company_id, soglia_pct, updated_by, updated_at)
  values (p_generale_id, v_azienda, round(p_soglia_pct, 2), auth.uid(), now())
  on conflict (generale_id) do update
     set soglia_pct = excluded.soglia_pct, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;
revoke all on function public.generale_subappalti_soglia(uuid, numeric) from public, anon;
grant execute on function public.generale_subappalti_soglia(uuid, numeric) to authenticated;

-- ── 6. Varianti dell'acquirente: una lettura per tutta la generale ──────────
-- Le varianti (ordini_variazione) delle commesse delle unità. Importo a chi vede gli
-- importi; costo previsto (scritto nella bozza, testo come l'ha digitato) a chi vede
-- i costi, o margini e importi insieme, come i costi delle unità.
create or replace function public.generale_varianti_elenco(p_generale_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_importi boolean;
  v_costi boolean;
  v_margini boolean;
  v_vede_costi boolean;
  v_varianti jsonb;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_view_orders', v_azienda)
     or public.utente_e_cliente_esterno() then
    raise exception 'Non hai il permesso di vedere questa commessa.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.commesse_generali g join public.orders o on o.id = g.order_id
     where g.order_id = p_generale_id and o.deleted_at is null
  ) then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);
  v_costi := public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda);
  v_margini := public.has_permission_for_company(auth.uid(), 'can_view_margins', v_azienda);
  v_vede_costi := v_costi or (v_margini and v_importi);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'order_id', v.order_id, 'numero', v.numero_odv, 'titolo', v.titolo,
           'stato', v.status,
           'importo', case when v_importi then v.impatto_economico end,
           'costo_previsto', case when v_vede_costi then nullif(btrim(w.content ->> 'estimatedCost'), '') end,
           'scadenza_scelte', a.scadenza_scelte,
           'richiesto_da', v.richiesto_da,
           'creata_il', v.created_at,
           'firmata_il', coalesce(v.offline_signed_on::timestamptz, v.firmato_il),
           'canale', v.approval_channel,
           'documento', v.current_document_id is not null
         ) order by v.order_id, v.numero_odv), '[]'::jsonb)
    into v_varianti
    from public.ordini_variazione v
    join public.orders o on o.id = v.order_id
    left join public.order_variation_workspaces w on w.variation_id = v.id
    left join public.generale_varianti_acquirente a on a.variazione_id = v.id
   where o.commessa_generale_id = p_generale_id and o.deleted_at is null
     and v.company_id = v_azienda;

  return jsonb_build_object(
    'permessi', jsonb_build_object(
      'importi', v_importi, 'costi', v_vede_costi,
      'modifica', public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda)
                  and not public.utente_sola_lettura(v_azienda)),
    'varianti', v_varianti);
end;
$$;
revoke all on function public.generale_varianti_elenco(uuid) from public, anon;
grant execute on function public.generale_varianti_elenco(uuid) to authenticated;

-- ── 7. La scadenza delle scelte di una variante ─────────────────────────────
create or replace function public.generale_variante_scadenza(p_variazione_id uuid, p_scadenza date)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_azienda uuid;
begin
  select v.company_id into v_azienda
    from public.ordini_variazione v
    join public.orders o on o.id = v.order_id
   where v.id = p_variazione_id and o.commessa_generale_id is not null and o.deleted_at is null;
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda)
     or public.utente_sola_lettura(v_azienda) or public.utente_e_cliente_esterno() then
    raise exception 'Non hai il permesso di modificare questa variante.' using errcode = '42501';
  end if;
  insert into public.generale_varianti_acquirente (variazione_id, company_id, scadenza_scelte, updated_by, updated_at)
  values (p_variazione_id, v_azienda, p_scadenza, auth.uid(), now())
  on conflict (variazione_id) do update
     set scadenza_scelte = excluded.scadenza_scelte, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;
revoke all on function public.generale_variante_scadenza(uuid, date) from public, anon;
grant execute on function public.generale_variante_scadenza(uuid, date) to authenticated;
