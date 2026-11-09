-- Costo orario dei mezzi di proprieta' e in leasing, e quota sulla commessa dalle ore del rapportino.
-- E' un costo interno: non entra in bilancio, tesoreria o consuntivo. I noleggi arrivano dalla fattura.
set local lock_timeout = '3s';

create table if not exists public.mezzi_costo_orario (
  mezzo_id uuid primary key references public.mezzi(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  costo_orario_manuale numeric check (costo_orario_manuale is null or costo_orario_manuale >= 0),
  ore_annue_previste numeric check (ore_annue_previste is null or ore_annue_previste > 0),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.mezzi_costo_orario enable row level security;
revoke all on public.mezzi_costo_orario from anon, authenticated;

create table if not exists public.rapportino_mezzi_costi (
  rapportino_id uuid not null references public.campo_rapportini(id) on delete cascade,
  mezzo_id uuid not null references public.mezzi(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  data_lavoro date not null,
  ore numeric not null,
  ore_stimate boolean not null default false,
  costo_orario numeric,
  importo numeric,
  primary key (rapportino_id, mezzo_id)
);
create index if not exists rapportino_mezzi_costi_commessa on public.rapportino_mezzi_costi (order_id, mezzo_id);
create index if not exists rapportino_mezzi_costi_mezzo on public.rapportino_mezzi_costi (mezzo_id, data_lavoro);
alter table public.rapportino_mezzi_costi enable row level security;
revoke all on public.rapportino_mezzi_costi from anon, authenticated;
grant select on public.rapportino_mezzi_costi to authenticated;
drop policy if exists rapportino_mezzi_costi_lettura on public.rapportino_mezzi_costi;
create policy rapportino_mezzi_costi_lettura on public.rapportino_mezzi_costi for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_costs', company_id));

-- Di che spesa si tratta, dal testo della fattura. Conta solo per non sommare due volte con la scheda.
create or replace function public.mezzo_spesa_tipo(p_testo text) returns text language sql immutable set search_path to '' as $$
  select case
    when t ~ 'immatricol|trascrizione|contratto di vendita|acquisto (veicolo|mezzo)|fornitura nr' then 'acquisto'
    when t ~ 'canone|leasing|noleggio|locazione|(^|[^a-z])rata([^a-z]|$)' then 'rata'
    when t ~ 'assicura|polizza|broker|premio rc' then 'assicurazione'
    when t ~ 'intervento|officina|tagliando|ricamb|riparaz|manodopera|pneumatic|gomme|revisione|sostituz' then 'manutenzione'
    when t ~ 'benz|gasolio|diesel|carburant|adblue|ad blue|rifornim' then 'carburante'
    else 'altro' end
  from (select lower(coalesce(p_testo, '')) as t) x;
$$;
revoke all on function public.mezzo_spesa_tipo(text) from public, anon, authenticated;

-- Le spese degli ultimi 12 mesi, mezzo per mezzo. Per rate, assicurazione e manutenzioni vale il piu' alto tra
-- scheda e fatture: sono due modi di scrivere la stessa spesa. Una fattura gia' su una commessa resta fuori.
create or replace function public.mezzi_spese_12_mesi(p_company uuid, p_mezzo uuid default null)
returns table(mezzo_id uuid, rata numeric, assicurazione numeric, manutenzioni numeric, carburante numeric, altro numeric, totale numeric, ore_lavorate numeric)
language sql stable security definer set search_path to '' as $$
  with oggi as (select (now() at time zone 'Europe/Rome')::date as d),
  m as (
    select x.id, coalesce(x.rata_mensile, 0) * 12 as rata_scheda from public.mezzi x
     where x.company_id = p_company and x.deleted_at is null and (p_mezzo is null or x.id = p_mezzo)
       and coalesce(x.possesso, '') not like 'noleggio%'
  ),
  fat as (
    select l.mezzo_id, t.tipo, sum(l.importo) as tot
      from public.fattura_ricevuta_mezzi l
      join public.fatture_ricevute fr on fr.id = l.fattura_ricevuta_id
      left join public.company_costs cc on cc.id = fr.company_cost_id
      cross join oggi
      cross join lateral (select public.mezzo_spesa_tipo(coalesce(fr.cedente_ragione_sociale, '') || ' ' || coalesce((
        select string_agg(e->>'descrizione', ' ') from jsonb_array_elements(case when jsonb_typeof(fr.righe) = 'array' then fr.righe else '[]'::jsonb end) e), '')) as tipo) t
     where l.company_id = p_company and fr.data_fattura >= oggi.d - 365 and cc.order_id is null
       and coalesce(fr.stato, '') <> 'rifiutata' and t.tipo <> 'acquisto'
     group by 1, 2
  ),
  doc as (
    select d.mezzo_id, sum(d.importo) as tot from (
      select distinct on (x.mezzo_id, x.categoria) x.mezzo_id, x.categoria, coalesce(x.importo, 0) as importo
        from public.mezzi_documenti x
       where x.company_id = p_company and x.categoria in ('assicurazione', 'bollo') and x.importo is not null
       order by x.mezzo_id, x.categoria, x.data_scadenza desc nulls last, x.created_at desc) d
     group by 1
  ),
  man as (
    select x.mezzo_id, sum(coalesce(x.costo, 0)) as tot from public.mezzi_manutenzioni x, oggi
     where x.company_id = p_company and x.data >= oggi.d - 365 group by 1
  ),
  ore as (
    select x.mezzo_id, sum(x.ore) as tot from public.rapportino_mezzi_costi x, oggi
     where x.company_id = p_company and x.data_lavoro >= oggi.d - 365 group by 1
  ),
  r as (
    select m.id,
           greatest(m.rata_scheda, coalesce((select f.tot from fat f where f.mezzo_id = m.id and f.tipo = 'rata'), 0)) as rata,
           greatest(coalesce((select d.tot from doc d where d.mezzo_id = m.id), 0), coalesce((select f.tot from fat f where f.mezzo_id = m.id and f.tipo = 'assicurazione'), 0)) as assicurazione,
           greatest(coalesce((select x.tot from man x where x.mezzo_id = m.id), 0), coalesce((select f.tot from fat f where f.mezzo_id = m.id and f.tipo = 'manutenzione'), 0)) as manutenzioni,
           coalesce((select f.tot from fat f where f.mezzo_id = m.id and f.tipo = 'carburante'), 0) as carburante,
           coalesce((select f.tot from fat f where f.mezzo_id = m.id and f.tipo = 'altro'), 0) as altro,
           coalesce((select x.tot from ore x where x.mezzo_id = m.id), 0) as ore_lavorate
      from m
  )
  select r.id, r.rata, r.assicurazione, r.manutenzioni, r.carburante, r.altro,
         r.rata + r.assicurazione + r.manutenzioni + r.carburante + r.altro, r.ore_lavorate
    from r;
$$;
revoke all on function public.mezzi_spese_12_mesi(uuid, uuid) from public, anon, authenticated;

-- Il costo orario che si usa: quello scritto a mano, altrimenti spese / ore.
-- Le ore non scendono sotto le previste (800 di base): con poche ore il conto darebbe cifre assurde.
create or replace function public.mezzo_costo_orario_effettivo(p_mezzo uuid) returns numeric language plpgsql stable security definer set search_path to '' as $$
declare m record; c record; s record; v_ore numeric;
begin
  select x.company_id, x.possesso into m from public.mezzi x where x.id = p_mezzo and x.deleted_at is null;
  if m.company_id is null or coalesce(m.possesso, '') like 'noleggio%' then return null; end if;
  select * into c from public.mezzi_costo_orario x where x.mezzo_id = p_mezzo;
  if c.costo_orario_manuale is not null then return c.costo_orario_manuale; end if;
  select * into s from public.mezzi_spese_12_mesi(m.company_id, p_mezzo);
  if coalesce(s.totale, 0) <= 0 then return null; end if;
  v_ore := greatest(coalesce(s.ore_lavorate, 0), coalesce(c.ore_annue_previste, 800));
  return round(s.totale / v_ore, 2);
end; $$;
revoke all on function public.mezzo_costo_orario_effettivo(uuid) from public, anon, authenticated;

create or replace function public.mezzo_costo_orario_leggi(p_mezzo uuid) returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare m record; c record; s record; v_ore numeric;
begin
  select x.company_id, x.possesso into m from public.mezzi x where x.id = p_mezzo and x.deleted_at is null;
  if m.company_id is null or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.has_permission_for_company(auth.uid(), 'can_view_costs', m.company_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_mezzi', m.company_id) then
    raise exception 'Non hai il permesso di vedere i costi dei mezzi' using errcode = '42501';
  end if;
  if coalesce(m.possesso, '') like 'noleggio%' then return jsonb_build_object('noleggio', true); end if;
  select * into c from public.mezzi_costo_orario x where x.mezzo_id = p_mezzo;
  select * into s from public.mezzi_spese_12_mesi(m.company_id, p_mezzo);
  v_ore := greatest(coalesce(s.ore_lavorate, 0), coalesce(c.ore_annue_previste, 800));
  return jsonb_build_object('noleggio', false, 'rata', s.rata, 'assicurazione', s.assicurazione, 'manutenzioni', s.manutenzioni,
    'carburante', s.carburante, 'altro', s.altro, 'totale', s.totale, 'ore_lavorate', s.ore_lavorate, 'ore_previste', c.ore_annue_previste,
    'ore_usate', v_ore, 'calcolato', case when s.totale > 0 then round(s.totale / v_ore, 2) end,
    'manuale', c.costo_orario_manuale, 'effettivo', public.mezzo_costo_orario_effettivo(p_mezzo));
end; $$;
revoke all on function public.mezzo_costo_orario_leggi(uuid) from public, anon;
grant execute on function public.mezzo_costo_orario_leggi(uuid) to authenticated;

create or replace function public.mezzo_costo_orario_salva(p_mezzo uuid, p_manuale numeric, p_ore_previste numeric) returns void language plpgsql security definer set search_path to '' as $$
declare c uuid;
begin
  select x.company_id into c from public.mezzi x where x.id = p_mezzo and x.deleted_at is null;
  if c is null or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.has_permission_for_company(auth.uid(), 'can_view_costs', c)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_mezzi', c) then
    raise exception 'Non hai il permesso di modificare i costi dei mezzi' using errcode = '42501';
  end if;
  if p_manuale is not null and p_manuale < 0 or p_ore_previste is not null and p_ore_previste <= 0 then
    raise exception 'Valori non validi' using errcode = '22023';
  end if;
  insert into public.mezzi_costo_orario (mezzo_id, company_id, costo_orario_manuale, ore_annue_previste, updated_by, updated_at)
  values (p_mezzo, c, p_manuale, p_ore_previste, auth.uid(), now())
  on conflict (mezzo_id) do update set costo_orario_manuale = excluded.costo_orario_manuale,
    ore_annue_previste = excluded.ore_annue_previste, updated_by = excluded.updated_by, updated_at = now();
end; $$;
revoke all on function public.mezzo_costo_orario_salva(uuid, numeric, numeric) from public, anon;
grant execute on function public.mezzo_costo_orario_salva(uuid, numeric, numeric) to authenticated;

-- Le ore del rapportino approvato, fotografate con il costo di quel momento. Senza ore: una giornata di 8, stimata.
create or replace function public.rapportino_mezzi_costi_ricalcola(p_id uuid) returns void language plpgsql security definer set search_path to '' as $$
declare r public.campo_rapportini; x record; v_costo numeric;
begin
  select * into r from public.campo_rapportini where id = p_id;
  delete from public.rapportino_mezzi_costi where rapportino_id = p_id;
  if r.id is null or not coalesce(r.approvato, false) or r.annullato_at is not null or jsonb_typeof(r.mezzi_usati) is distinct from 'array' then return; end if;
  for x in
    select (e->>'mezzo_id')::uuid as mezzo,
           sum(case when replace(e->>'ore', ',', '.') ~ '^[0-9]+([.][0-9]+)?$' and replace(e->>'ore', ',', '.')::numeric > 0 then replace(e->>'ore', ',', '.')::numeric else 8 end) as ore,
           bool_or(not coalesce(replace(e->>'ore', ',', '.') ~ '^[0-9]+([.][0-9]+)?$' and replace(e->>'ore', ',', '.')::numeric > 0, false)) as stimate
      from jsonb_array_elements(r.mezzi_usati) e
     where jsonb_typeof(e) = 'object' and e->>'mezzo_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     group by 1
  loop
    if not exists (select 1 from public.mezzi m where m.id = x.mezzo and m.company_id = r.company_id and m.deleted_at is null and coalesce(m.possesso, '') not like 'noleggio%') then continue; end if;
    v_costo := public.mezzo_costo_orario_effettivo(x.mezzo);
    insert into public.rapportino_mezzi_costi (rapportino_id, mezzo_id, company_id, order_id, data_lavoro, ore, ore_stimate, costo_orario, importo)
    values (r.id, x.mezzo, r.company_id, r.order_id, r.data_lavoro, x.ore, x.stimate, v_costo, case when v_costo is not null then round(x.ore * v_costo, 2) end);
  end loop;
end; $$;
revoke all on function public.rapportino_mezzi_costi_ricalcola(uuid) from public, anon, authenticated;

create or replace function public.rapportino_mezzi_costi_trg() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if coalesce(new.approvato, false) is distinct from coalesce(old.approvato, false)
     or new.annullato_at is distinct from old.annullato_at
     or (coalesce(new.approvato, false) and new.mezzi_usati is distinct from old.mezzi_usati) then
    perform public.rapportino_mezzi_costi_ricalcola(new.id);
  end if;
  return null;
end; $$;
revoke all on function public.rapportino_mezzi_costi_trg() from public, anon, authenticated;
drop trigger if exists trg_rapportino_mezzi_costi on public.campo_rapportini;
create trigger trg_rapportino_mezzi_costi after update of approvato, annullato_at, mezzi_usati on public.campo_rapportini
  for each row execute function public.rapportino_mezzi_costi_trg();

-- I pochi rapportini gia' approvati con mezzi.
do $$
declare x uuid;
begin
  for x in select id from public.campo_rapportini where approvato and annullato_at is null and jsonb_typeof(mezzi_usati) = 'array' and jsonb_array_length(mezzi_usati) > 0 loop
    perform public.rapportino_mezzi_costi_ricalcola(x);
  end loop;
end $$;

-- Nel quadro del rapportino: i mezzi con ore e costo.
do $$
declare v text; vecchio constant text := E'''voci'', coalesce((select jsonb_agg(';
begin
  select pg_get_functiondef(oid) into v from pg_proc where pronamespace = 'public'::regnamespace and proname = 'rapportino_quadro_economico';
  if position('rapportino_mezzi_costi' in v) > 0 then return; end if;
  if position(vecchio in v) = 0 then raise exception 'testo non riconosciuto'; end if;
  v := replace(v, vecchio, $t$'mezzi', coalesce((select jsonb_agg(jsonb_build_object('mezzo_id', u.mezzo, 'nome', coalesce(m.nome, u.nome), 'noleggio', coalesce(m.possesso, '') like 'noleggio%',
          'ore', coalesce(s.ore, u.ore), 'ore_stimate', coalesce(s.ore_stimate, u.stimate),
          'costo_orario', coalesce(s.costo_orario, case when s.rapportino_id is null then public.mezzo_costo_orario_effettivo(u.mezzo) end),
          'importo', coalesce(s.importo, case when s.rapportino_id is null then round(u.ore * public.mezzo_costo_orario_effettivo(u.mezzo), 2) end)) order by coalesce(m.nome, u.nome))
        from (select (e->>'mezzo_id')::uuid as mezzo, min(e->>'nome') as nome,
                     sum(case when replace(e->>'ore', ',', '.') ~ '^[0-9]+([.][0-9]+)?$' and replace(e->>'ore', ',', '.')::numeric > 0 then replace(e->>'ore', ',', '.')::numeric else 8 end) as ore,
                     bool_or(not coalesce(replace(e->>'ore', ',', '.') ~ '^[0-9]+([.][0-9]+)?$' and replace(e->>'ore', ',', '.')::numeric > 0, false)) as stimate
                from jsonb_array_elements(case when jsonb_typeof(v_r.mezzi_usati) = 'array' then v_r.mezzi_usati else '[]'::jsonb end) e
               where e->>'mezzo_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' group by 1) u
        left join public.mezzi m on m.id = u.mezzo and m.company_id = v_r.company_id
        left join public.rapportino_mezzi_costi s on s.rapportino_id = p_rapportino_id and s.mezzo_id = u.mezzo), '[]'::jsonb),
    $t$ || vecchio);
  execute v;
end $$;

-- La stima della commessa: dove ci sono le ore del rapportino valgono quelle, altrimenti i giorni di assegnazione.
-- I noleggi non hanno quota: il costo vero arriva dalla fattura.
do $$
declare v text; a text;
begin
  v := pg_get_viewdef('public.v_ordine_costi_mezzi_stimati'::regclass, true);
  a := E'WHERE ma.order_id IS NOT NULL\n';
  if position('rapportino_mezzi_costi' in v) > 0 then return; end if;
  if position(a in v) = 0 or position(E'WHERE al.order_id IS NOT NULL\n' in v) = 0 or position('LEFT JOIN per_ordine po ON po.order_id = o.id' in v) = 0 then raise exception 'vista non riconosciuta'; end if;
  v := replace(v, a, E'WHERE ma.order_id IS NOT NULL AND COALESCE(m.possesso, '''') !~~ ''noleggio%'' AND NOT (EXISTS (SELECT 1 FROM rapportino_mezzi_costi q WHERE q.order_id = ma.order_id AND q.mezzo_id = ma.mezzo_id AND q.importo > 0))\n');
  v := replace(v, E'WHERE al.order_id IS NOT NULL\n', E'WHERE al.order_id IS NOT NULL AND COALESCE(m.possesso, '''') !~~ ''noleggio%'' AND NOT (EXISTS (SELECT 1 FROM rapportino_mezzi_costi q WHERE q.order_id = al.order_id AND q.mezzo_id = al.mezzo_id AND q.importo > 0))\n');
  v := replace(v, 'COALESCE(po.costo_mezzi_stimato, 0::numeric) AS costo_mezzi_stimato', 'COALESCE(po.costo_mezzi_stimato, 0::numeric) + COALESCE(qr.importo, 0::numeric) AS costo_mezzi_stimato');
  v := replace(v, 'COALESCE(po.mezzi_usati, 0::bigint) AS mezzi_usati', 'COALESCE(po.mezzi_usati, 0::bigint) + COALESCE(qr.mezzi, 0::bigint) AS mezzi_usati');
  v := replace(v, 'COALESCE(po.giorni_mezzo, 0::bigint) AS giorni_mezzo', 'COALESCE(po.giorni_mezzo, 0::bigint) + COALESCE(qr.giorni, 0::bigint) AS giorni_mezzo');
  v := replace(v, 'LEFT JOIN per_ordine po ON po.order_id = o.id', 'LEFT JOIN per_ordine po ON po.order_id = o.id LEFT JOIN (SELECT q.order_id, sum(q.importo) AS importo, count(DISTINCT q.mezzo_id) AS mezzi, count(*) AS giorni FROM rapportino_mezzi_costi q WHERE q.importo > 0 GROUP BY q.order_id) qr ON qr.order_id = o.id');
  execute 'set local search_path to public';
  execute 'create or replace view public.v_ordine_costi_mezzi_stimati with (security_invoker = true) as ' || rtrim(v, E'; \n');
end $$;
