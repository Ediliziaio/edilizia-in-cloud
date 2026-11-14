-- Fase 5 del piano anomalie (14/11/2026) — prima le regole, poi l'AI.
--
-- La commessa di una fattura ricevuta si riconosce dai codici che la fattura porta, senza chiamare l'AI:
--   CUP e CIG (tag CodiceCUP/CodiceCIG dell'XML, o «CUP …»/«CIG …» scritti nelle righe), cercati
--     - nei contratti delle commesse generali (generale_contratti),
--     - nelle fatture emesse native della stessa commessa (documenti_fiscali),
--     - nelle fatture ricevute della stessa azienda già messe su UNA commessa (impara dalle scelte fatte);
--   il codice della commessa (orders.order_code) o il riferimento del committente, scritti nei tag
--     CodiceCommessaConvenzione, IdDocumento, Causale, RiferimentoTesto, o nelle righe (qui solo codici con
--     lettere e cifre, perché un numero nudo come «06/2025» è anche una data o un numero di DDT).
-- Vale solo se porta a UNA commessa. Il CUP/CIG vince sul codice; due commesse diverse = nessuna proposta.
-- La proposta va in order_id_suggerito (dove l'AI mette la sua) col motivo in order_suggerito_motivo:
-- resta una proposta, la conferma una persona.
--
-- Cercare il CUP dentro l'XML di tutte le fatture costa ~330 ms a fattura (prova del 14/11 su 2.287 XML):
-- troppo per un trigger d'inserimento. I codici estratti stanno in fattura_ricevuta_codici, riempita qui
-- una volta (399 righe il 14/11, solo questa tabella nuova) e tenuta allineata da un trigger.
-- Verifica in sola lettura del 14/11: 3 fatture riconosciute, 3 giuste, 0 sbagliate; le altre con CUP
-- non hanno ancora una fattura dello stesso CUP messa su una commessa (lo diventano alla prima scelta).

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.fatture_ricevute add column if not exists order_suggerito_motivo text;
comment on column public.fatture_ricevute.order_suggerito_motivo is
  'Perché order_id_suggerito: «CUP …», «CIG …», «codice commessa …» (regole, senza AI) oppure null (proposta dell''AI).';

-- CUP e CIG di un documento: dai tag dell'XML e da «CUP …»/«CIG …» nelle righe.
create or replace function public.codici_cup_cig(p_xml text, p_righe jsonb, out cup text[], out cig text[])
language plpgsql immutable set search_path = public as $$
declare v_righe text;
begin
  v_righe := upper(coalesce((select string_agg(coalesce(r->>'descrizione', ''), ' ')
                               from jsonb_array_elements(case when jsonb_typeof(p_righe) = 'array' then p_righe else '[]'::jsonb end) r), ''));
  select array_agg(distinct v order by v) into cup from (
    select upper(regexp_replace(m[1], '\s', '', 'g')) v from regexp_matches(coalesce(p_xml, ''), '<(?:[\w.-]+:)?CodiceCUP>\s*([^<]+?)\s*</', 'g') m
    union select m[1] from regexp_matches(v_righe, '\mCUP\W{0,3}([A-Z0-9]{15})\M', 'g') m
  ) x where v ~ '^[A-Z0-9]{15}$';
  select array_agg(distinct v order by v) into cig from (
    select upper(regexp_replace(m[1], '\s', '', 'g')) v from regexp_matches(coalesce(p_xml, ''), '<(?:[\w.-]+:)?CodiceCIG>\s*([^<]+?)\s*</', 'g') m
    union select m[1] from regexp_matches(v_righe, '\mCIG\W{0,3}([A-Z0-9]{10})\M', 'g') m
  ) x where v ~ '^[A-Z0-9]{10}$';
end $$;
revoke all on function public.codici_cup_cig(text, jsonb) from public, anon;
grant execute on function public.codici_cup_cig(text, jsonb) to authenticated, service_role;

create table if not exists public.fattura_ricevuta_codici (
  fattura_ricevuta_id uuid primary key references public.fatture_ricevute(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  cup text[] not null default '{}',
  cig text[] not null default '{}'
);
create index if not exists fattura_ricevuta_codici_cup on public.fattura_ricevuta_codici using gin (cup);
create index if not exists fattura_ricevuta_codici_cig on public.fattura_ricevuta_codici using gin (cig);
create index if not exists fattura_ricevuta_codici_azienda on public.fattura_ricevuta_codici (company_id);
-- Tabella di servizio: la leggono solo le funzioni qui sotto. RLS accesa e nessuna policy = chiusa.
alter table public.fattura_ricevuta_codici enable row level security;
revoke all on public.fattura_ricevuta_codici from public, anon, authenticated;
comment on table public.fattura_ricevuta_codici is
  'CUP e CIG estratti da ogni fattura ricevuta (fase 5 del 14/11/2026), per riconoscere la commessa senza rileggere gli XML.';

create or replace function public.fattura_ricevuta_codici_aggiorna()
returns trigger language plpgsql security definer set search_path = public as $$
declare k record;
begin
  begin
    select * into k from public.codici_cup_cig(new.xml_raw, new.righe);
    if k.cup is null and k.cig is null then
      delete from public.fattura_ricevuta_codici where fattura_ricevuta_id = new.id;
    else
      insert into public.fattura_ricevuta_codici (fattura_ricevuta_id, company_id, cup, cig)
      values (new.id, new.company_id, coalesce(k.cup, '{}'), coalesce(k.cig, '{}'))
      on conflict (fattura_ricevuta_id) do update set company_id = excluded.company_id, cup = excluded.cup, cig = excluded.cig;
    end if;
  exception when others then
    raise log 'fattura_ricevuta_codici_aggiorna %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.fattura_ricevuta_codici_aggiorna() from public, anon, authenticated;

drop trigger if exists trg_fattura_ricevuta_codici on public.fatture_ricevute;
create trigger trg_fattura_ricevuta_codici after insert or update of xml_raw, righe on public.fatture_ricevute
  for each row execute function public.fattura_ricevuta_codici_aggiorna();

-- Le fatture già presenti: solo quelle che un codice ce l'hanno (399 su 19.280 il 14/11).
insert into public.fattura_ricevuta_codici (fattura_ricevuta_id, company_id, cup, cig)
select f.id, f.company_id, coalesce(k.cup, '{}'), coalesce(k.cig, '{}')
  from public.fatture_ricevute f
  cross join lateral public.codici_cup_cig(f.xml_raw, f.righe) k
 where (f.xml_raw ~ 'Codice(CUP|CIG)' or f.righe::text ~* '\m(CUP|CIG)\M')
   and (k.cup is not null or k.cig is not null)
on conflict (fattura_ricevuta_id) do nothing;

-- La commessa di una fattura dai suoi codici: una sola, o niente.
create or replace function public.commessa_da_codici(p_company_id uuid, p_xml text, p_righe jsonb, p_escludi uuid default null)
returns table (order_id uuid, motivo text)
language plpgsql stable security definer set search_path = public set statement_timeout to '10s' as $$
declare
  v_righe text; k record; v_tag text[];
  v_ordini uuid[]; v_motivo text;
begin
  select * into k from public.codici_cup_cig(p_xml, p_righe);

  -- 1. CUP / CIG
  if k.cup is not null or k.cig is not null then
    select array_agg(distinct o.id), min(c.motivo) into v_ordini, v_motivo from (
      select gc.generale_id as oid, case when upper(gc.cup) = any (k.cup) then 'CUP ' || upper(gc.cup) else 'CIG ' || upper(gc.cig) end as motivo
        from public.generale_contratti gc
       where gc.company_id = p_company_id and (upper(gc.cup) = any (k.cup) or upper(gc.cig) = any (k.cig))
      union all
      select df.ordine_id, case when upper(df.cup) = any (k.cup) then 'CUP ' || upper(df.cup) else 'CIG ' || upper(df.cig) end
        from public.documenti_fiscali df
       where df.company_id = p_company_id and df.ordine_id is not null and df.deleted_at is null
         and (upper(df.cup) = any (k.cup) or upper(df.cig) = any (k.cig))
      union all
      -- Le fatture già messe su una commessa (direttamente o ripartite al 100% su una sola).
      select coalesce(cc.order_id,
               (select min(a->>'order_id')::uuid from jsonb_array_elements(case when jsonb_typeof(cc.allocations) = 'array' then cc.allocations else '[]'::jsonb end) a
                 where nullif(a->>'order_id', '') is not null having count(distinct a->>'order_id') = 1)),
             case when kc.cup && coalesce(k.cup, '{}') then 'CUP ' || (select u from unnest(kc.cup) u where u = any (k.cup) limit 1)
                  else 'CIG ' || (select u from unnest(kc.cig) u where u = any (k.cig) limit 1) end
        from public.fattura_ricevuta_codici kc
        join public.fatture_ricevute f on f.id = kc.fattura_ricevuta_id
        join public.company_costs cc on cc.id = f.company_cost_id
       where kc.company_id = p_company_id and kc.fattura_ricevuta_id is distinct from p_escludi
         and coalesce(f.stato, '') <> 'rifiutata'
         and (kc.cup && coalesce(k.cup, '{}') or kc.cig && coalesce(k.cig, '{}'))
    ) c join public.orders o on o.id = c.oid and o.company_id = p_company_id and o.deleted_at is null;
    if cardinality(v_ordini) = 1 then
      order_id := v_ordini[1]; motivo := v_motivo; return next; return;
    end if;
  end if;

  -- 2. Codice della commessa o riferimento del committente
  v_righe := upper(coalesce((select string_agg(coalesce(r->>'descrizione', ''), ' ')
                               from jsonb_array_elements(case when jsonb_typeof(p_righe) = 'array' then p_righe else '[]'::jsonb end) r), ''));
  select array_agg(distinct upper(btrim(m[2]))) into v_tag
    from regexp_matches(coalesce(p_xml, ''), '<(?:[\w.-]+:)?(CodiceCommessaConvenzione|IdDocumento|Causale|RiferimentoTesto)>\s*([^<]+?)\s*</', 'g') m;
  select array_agg(distinct x.id), min(x.motivo) into v_ordini, v_motivo from (
    select o.id, 'codice commessa ' || btrim(c.codice) as motivo
      from public.orders o
      cross join lateral (values (o.order_code), (o.riferimento_committente)) c(codice)
     where o.company_id = p_company_id and o.deleted_at is null
       and length(btrim(coalesce(c.codice, ''))) >= 4
       and (
         exists (select 1 from unnest(coalesce(v_tag, '{}'::text[])) t
                  where t = upper(btrim(c.codice))
                     or t ~ ('(^|[^A-Z0-9])' || regexp_replace(upper(btrim(c.codice)), '([^A-Z0-9])', '\\\1', 'g') || '([^A-Z0-9]|$)'))
         or (upper(c.codice) ~ '[A-Z]' and c.codice ~ '[0-9]' and length(btrim(c.codice)) >= 5
             and v_righe ~ ('(^|[^A-Z0-9])' || regexp_replace(upper(btrim(c.codice)), '([^A-Z0-9])', '\\\1', 'g') || '([^A-Z0-9]|$)'))
       )
  ) x;
  if cardinality(v_ordini) = 1 then
    order_id := v_ordini[1]; motivo := v_motivo; return next;
  end if;
end $$;
revoke all on function public.commessa_da_codici(uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.commessa_da_codici(uuid, text, jsonb, uuid) to service_role;

-- All'arrivo della fattura: la proposta senza AI, se non ce n'è già una.
create or replace function public.fattura_ricevuta_commessa_da_codici()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.order_id_suggerito is not null or (new.xml_raw is null and new.righe is null) then return new; end if;
  begin
    select * into r from public.commessa_da_codici(new.company_id, new.xml_raw, new.righe, new.id) limit 1;
    if r.order_id is not null then
      new.order_id_suggerito := r.order_id;
      new.order_match_confidenza := 1;
      new.order_suggerito_motivo := r.motivo;
    end if;
  exception when others then
    raise log 'fattura_ricevuta_commessa_da_codici %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
revoke all on function public.fattura_ricevuta_commessa_da_codici() from public, anon, authenticated;

drop trigger if exists trg_fattura_ricevuta_commessa_da_codici on public.fatture_ricevute;
create trigger trg_fattura_ricevuta_commessa_da_codici before insert on public.fatture_ricevute
  for each row execute function public.fattura_ricevuta_commessa_da_codici();

-- Le fatture già presenti senza commessa e senza proposta: a richiesta, al massimo p_limite per volta.
-- Prima un filtro grossolano (CUP/CIG noti, o uno dei codici delle commesse da qualche parte nel testo),
-- poi la regola vera fattura per fattura.
create or replace function public.fatture_proponi_commessa_da_codici(p_company_id uuid, p_limite integer default 500)
returns integer language plpgsql security definer set search_path = public
  set lock_timeout to '3s' set statement_timeout to '60s' as $$
declare f record; r record; n integer := 0; v_alt text;
begin
  if not (public.e_super_admin_dentro(p_company_id)
          or (p_company_id = any (public.aziende_con_permesso('can_view_costs')) and not public.utente_sola_lettura(p_company_id))) then
    raise exception 'Il tuo ruolo non permette di proporre le commesse delle fatture.' using errcode = '42501';
  end if;
  select string_agg(distinct regexp_replace(upper(btrim(c.codice)), '([^A-Z0-9])', '\\\1', 'g'), '|') into v_alt
    from public.orders o cross join lateral (values (o.order_code), (o.riferimento_committente)) c(codice)
   where o.company_id = p_company_id and o.deleted_at is null and length(btrim(coalesce(c.codice, ''))) >= 4;
  for f in
    select fr.id, fr.xml_raw, fr.righe
      from public.fatture_ricevute fr
      left join public.company_costs cc on cc.id = fr.company_cost_id
     where fr.company_id = p_company_id and fr.order_id_suggerito is null
       and coalesce(fr.stato, '') <> 'rifiutata'
       and (cc.id is null or (cc.order_id is null and not (jsonb_typeof(cc.allocations) = 'array' and jsonb_array_length(cc.allocations) > 0)))
       and (exists (select 1 from public.fattura_ricevuta_codici kc where kc.fattura_ricevuta_id = fr.id)
            or (v_alt is not null and (upper(coalesce(fr.xml_raw, '')) ~ v_alt or upper(coalesce(fr.righe::text, '')) ~ v_alt)))
     order by fr.data_fattura desc nulls last
     limit greatest(1, least(coalesce(p_limite, 500), 2000))
  loop
    select * into r from public.commessa_da_codici(p_company_id, f.xml_raw, f.righe, f.id) limit 1;
    if r.order_id is not null then
      update public.fatture_ricevute
         set order_id_suggerito = r.order_id, order_match_confidenza = 1, order_suggerito_motivo = r.motivo
       where id = f.id and order_id_suggerito is null;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.fatture_proponi_commessa_da_codici(uuid, integer) from public, anon;
grant execute on function public.fatture_proponi_commessa_da_codici(uuid, integer) to authenticated, service_role;
