-- Conto predefinito per le nuove ricevute riconosciute dal fornitore in anagrafica.
set local lock_timeout = '3s';
create schema if not exists private;

alter table public.fatture_ricevute
  add column if not exists conto_costo_origine text
    check (conto_costo_origine in ('fornitore', 'manuale'));

create table if not exists public.fornitori_conti_costo (
  company_id uuid not null references public.companies(id) on delete cascade,
  fornitore_id uuid not null references public.suppliers(id) on delete cascade,
  categoria_id uuid not null references public.cost_categories(id),
  primary key (company_id, fornitore_id)
);

create index if not exists fornitori_conti_costo_fornitore_idx on public.fornitori_conti_costo(fornitore_id);
create index if not exists fornitori_conti_costo_categoria_idx on public.fornitori_conti_costo(categoria_id);

alter table public.fornitori_conti_costo enable row level security;
revoke all on public.fornitori_conti_costo from public, anon, authenticated;
grant select, insert, update, delete on public.fornitori_conti_costo to authenticated, service_role;

drop policy if exists "Legge regole fornitore conto" on public.fornitori_conti_costo;
create policy "Legge regole fornitore conto" on public.fornitori_conti_costo
  for select to authenticated
  using (company_id in (select unnest(public.aziende_con_permesso('can_view_costs'))));

drop policy if exists "Gestisce regole fornitore conto" on public.fornitori_conti_costo;
create policy "Gestisce regole fornitore conto" on public.fornitori_conti_costo
  for all to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not public.utente_sola_lettura(company_id)
  )
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not public.utente_sola_lettura(company_id)
    and exists (
      select 1 from public.suppliers s
      where s.id = fornitore_id and s.company_id = fornitori_conti_costo.company_id
    )
    and exists (
      select 1 from public.cost_categories c
      where c.id = categoria_id and c.company_id = fornitori_conti_costo.company_id
    )
  );

create or replace function private.conto_costo_del_fornitore(p_company uuid, p_fornitore uuid)
returns text language sql stable set search_path = '' as $$
  select c.name
  from public.fornitori_conti_costo r
  join public.cost_categories c on c.id = r.categoria_id and c.company_id = r.company_id
  join public.suppliers s on s.id = r.fornitore_id and s.company_id = r.company_id
  where r.company_id = p_company and r.fornitore_id = p_fornitore;
$$;
revoke all on function private.conto_costo_del_fornitore(uuid, uuid) from public, anon, authenticated;

-- La scelta del fornitore si applica quando arriva o si collega la ricevuta.
-- Una riclassificazione AI conserva i conti già scelti.
create or replace function private.ricevuta_conto_predefinito_fornitore()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if old.conto_costo_origine is not null and new.conto_costo_origine = old.conto_costo_origine
       and auth.jwt() ->> 'role' = 'service_role' then
      new.categoria_ai := old.categoria_ai;
      new.sottocategoria_ai := old.sottocategoria_ai;
      new.categoria_confidenza := old.categoria_confidenza;
    end if;
    if new.fornitore_id is not distinct from old.fornitore_id then
      return new;
    end if;
  end if;

  if new.company_cost_id is not null or new.conto_costo_origine = 'manuale'
     or (new.conto_costo_origine is null and nullif(btrim(new.categoria_ai), '') is not null)
     or (coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
         and not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_billing', new.company_id), false)) then
    return new;
  end if;

  new.categoria_ai := private.conto_costo_del_fornitore(new.company_id, new.fornitore_id);
  new.conto_costo_origine := case when new.categoria_ai is not null then 'fornitore' end;
  return new;
end;
$$;
revoke all on function private.ricevuta_conto_predefinito_fornitore() from public, anon, authenticated;

-- L'aggancio per P.IVA/CF (fattura_ricevuta_fornitore_automatico) precede questo trigger.
drop trigger if exists fattura_ricevuta_z_conto_fornitore on public.fatture_ricevute;
create trigger fattura_ricevuta_z_conto_fornitore
  before insert or update of fornitore_id, cedente_piva, cedente_cf, categoria_ai on public.fatture_ricevute
  for each row execute function private.ricevuta_conto_predefinito_fornitore();

-- Mantiene il ramo dei costi già collegati agli ordini. Sul costo nuovo
-- prevale il conto esplicito, poi il tipo fornitore e la classificazione.
do $$
declare
  definizione text := pg_get_functiondef('public.contabilizza_fattura_ricevuta(uuid)'::regprocedure);
  categoria text := $c$coalesce(v_tipo_forn, nullif(f.categoria_ai, ''), 'materiali')$c$;
  ricerca text := 'select * into f from public.fatture_ricevute where id = p_fattura_id;';
  tipo_fornitore text := 'v_tipo_forn      text;';
  calcola_piano text := 'v_piano := public.piano_pagamento_da_xml(f.xml_raw, f.indice_corpo, f.data_fattura);';
begin
  if strpos(definizione, 'private.conto_costo_del_fornitore(f.company_id, v_supplier_id)') > 0 then
    return;
  end if;
  if strpos(definizione, categoria) = 0 or strpos(definizione, ricerca) = 0
     or strpos(definizione, tipo_fornitore) = 0 or strpos(definizione, calcola_piano) = 0 then
    raise exception 'Verificare il conto predefinito nella versione corrente di contabilizza_fattura_ricevuta';
  end if;
  definizione := replace(definizione, tipo_fornitore, tipo_fornitore || E'\n  v_conto_forn      text;');
  definizione := replace(definizione, calcola_piano,
    'v_conto_forn := private.conto_costo_del_fornitore(f.company_id, v_supplier_id);' || E'\n    ' || calcola_piano);
  definizione := replace(definizione, categoria, $c$
      coalesce(
        case when f.conto_costo_origine is not null or v_conto_forn is not null
          then nullif(btrim(f.categoria_ai), '') end,
        v_conto_forn,
        v_tipo_forn, nullif(f.categoria_ai, ''), 'materiali'
      )$c$);
  -- Il secondo invio vede il costo registrato dal primo.
  execute replace(definizione, ricerca,
    'select * into f from public.fatture_ricevute where id = p_fattura_id for update;');
end $$;

notify pgrst, 'reload schema';
