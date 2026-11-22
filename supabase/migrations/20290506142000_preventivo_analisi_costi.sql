insert into public.platform_feature_flags
  (key, name, description, category, is_beta, default_value, plans_included, icon, sort_order, supports_preview)
select 'preventivi_analisi_costi', 'Analisi costi preventivi',
  'Composizione interna dei costi, simulazione del prezzo e PDF interno per preventivi e computi.',
  coalesce((select category from public.platform_feature_flags where key = 'preventivi_crm'), 'beta'),
  true, false, '{}'::text[], 'Calculator', 900, false
on conflict (key) do nothing;

-- Identificatore commerciale privo di dati economici, stabile anche nella riscrittura delle righe.
alter table public.quote_items add column if not exists analisi_riga_id uuid;
alter table public.quote_items alter column analisi_riga_id set default gen_random_uuid();

do $$
declare
  definizione text := pg_get_functiondef('public.save_quote_items_atomic(uuid,uuid,jsonb)'::regprocedure);
begin
  if strpos(definizione, 'analisi_riga_id') = 0 then
    if strpos(definizione, 'computo_voce_id') = 0 or strpos(definizione, 'AND v.company_id = p_company_id)') = 0 then
      raise exception 'Verificare il contratto di save_quote_items_atomic prima di aggiungere l’identificatore';
    end if;
    definizione := replace(definizione, E'      computo_voce_id\n', E'      computo_voce_id, analisi_riga_id\n');
    definizione := replace(definizione, 'AND v.company_id = p_company_id)',
      'AND v.company_id = p_company_id), coalesce(nullif(v_item->>''analisi_riga_id'', '''')::uuid, gen_random_uuid())');
    execute definizione;
  end if;
end;
$$;

create table public.preventivo_analisi_costi (
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('computo', 'preventivo')),
  documento_id uuid not null,
  revisione text not null default '' check (char_length(revisione) <= 100),
  versione integer not null default 1 check (versione > 0),
  dati jsonb not null check (jsonb_typeof(dati) = 'object' and dati->>'versione' = '1' and octet_length(dati::text) <= 1048576),
  fotografia jsonb check (fotografia is null or octet_length(fotografia::text) <= 6291456),
  primary key (company_id, tipo, documento_id, revisione)
);

alter table public.preventivo_analisi_costi enable row level security;
revoke all on public.preventivo_analisi_costi from public, anon, authenticated;
grant select, insert on public.preventivo_analisi_costi to authenticated;
grant update (dati, versione) on public.preventivo_analisi_costi to authenticated;
grant select, insert, update, delete on public.preventivo_analisi_costi to service_role;

create function public.puo_leggere_analisi_preventivo(p_azienda uuid, p_tipo text, p_id uuid)
returns boolean
language plpgsql stable security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or public.utente_bloccato() or not public.user_can_access_company(p_azienda)
    or not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_costs', p_azienda), false)
    or not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_margins', p_azienda), false) then
    return false;
  end if;
  if not exists (select 1 from public.resolve_company_feature(p_azienda, 'preventivi_analisi_costi') f
    where f.is_enabled and f.access_level::text = 'enabled') then
    return false;
  end if;
  if p_tipo = 'computo' then
    return exists (select 1 from public.computo_preventivo_drafts where company_id = p_azienda and id = p_id);
  end if;
  return p_tipo = 'preventivo' and exists (select 1 from public.quotes where company_id = p_azienda and id = p_id);
end;
$$;
revoke all on function public.puo_leggere_analisi_preventivo(uuid, text, uuid) from public, anon;
grant execute on function public.puo_leggere_analisi_preventivo(uuid, text, uuid) to authenticated;

create policy preventivo_analisi_lettura on public.preventivo_analisi_costi for select to authenticated
  using (public.puo_leggere_analisi_preventivo(company_id, tipo, documento_id));
create policy preventivo_analisi_inserimento on public.preventivo_analisi_costi for insert to authenticated
  with check (revisione = '' and fotografia is null
    and public.puo_leggere_analisi_preventivo(company_id, tipo, documento_id)
    and public.has_permission_for_company((select auth.uid()), 'can_edit_preventivi', company_id)
    and not public.utente_sola_lettura(company_id)
    and (tipo = 'computo' or exists (select 1 from public.quotes q where q.id = documento_id
      and q.company_id = preventivo_analisi_costi.company_id and q.status in ('bozza', 'draft'))));
create policy preventivo_analisi_modifica on public.preventivo_analisi_costi for update to authenticated
  using (revisione = '' and public.puo_leggere_analisi_preventivo(company_id, tipo, documento_id)
    and public.has_permission_for_company((select auth.uid()), 'can_edit_preventivi', company_id)
    and not public.utente_sola_lettura(company_id)
    and (tipo = 'computo' or exists (select 1 from public.quotes q where q.id = documento_id
      and q.company_id = preventivo_analisi_costi.company_id and q.status in ('bozza', 'draft'))))
  with check (revisione = '' and fotografia is null
    and public.puo_leggere_analisi_preventivo(company_id, tipo, documento_id)
    and public.has_permission_for_company((select auth.uid()), 'can_edit_preventivi', company_id)
    and not public.utente_sola_lettura(company_id)
    and (tipo = 'computo' or exists (select 1 from public.quotes q where q.id = documento_id
      and q.company_id = preventivo_analisi_costi.company_id and q.status in ('bozza', 'draft'))));

-- Le versioni del documento conservano una copia dei costi, nello stesso ambito riservato.
create function private.fotografa_analisi_preventivo()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_snapshot jsonb;
  v_revisione text;
begin
  if tg_table_name = 'quote_versions' then
    insert into public.preventivo_analisi_costi (company_id,tipo,documento_id,revisione,dati,fotografia)
    select company_id,tipo,documento_id,'Rev. ' || new.version_num::text,dati,new.snapshot
    from public.preventivo_analisi_costi
    where company_id = new.company_id and tipo = 'preventivo' and documento_id = new.quote_id and revisione = ''
    on conflict do nothing;
  else
    for v_snapshot in select value from jsonb_array_elements(coalesce(new.payload->'revisioni', '[]'::jsonb)) loop
      if v_snapshot->>'id' is not null and not exists (
        select 1 from jsonb_array_elements(coalesce(old.payload->'revisioni', '[]'::jsonb)) r
        where r->>'id' = v_snapshot->>'id'
      ) then
        v_revisione := left(v_snapshot->>'nome', 60) || '|' || (v_snapshot->>'id');
        insert into public.preventivo_analisi_costi (company_id,tipo,documento_id,revisione,dati,fotografia)
        select company_id,tipo,documento_id,v_revisione,dati,new.payload - 'revisioni'
        from public.preventivo_analisi_costi
        where company_id = new.company_id and tipo = 'computo' and documento_id = new.id and revisione = ''
        on conflict do nothing;
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.fotografa_analisi_preventivo() from public, anon, authenticated;
create trigger quote_versions_analisi_costi after insert on public.quote_versions
  for each row execute function private.fotografa_analisi_preventivo();
create trigger computo_revisioni_analisi_costi after update of payload on public.computo_preventivo_drafts
  for each row when (old.payload->'revisioni' is distinct from new.payload->'revisioni')
  execute function private.fotografa_analisi_preventivo();

-- Costi e quantità dell'offerta accettata, per il budget della commessa.
create function private.congela_analisi_preventivo_accettato()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.preventivo_analisi_costi (company_id,tipo,documento_id,revisione,dati,fotografia)
  select company_id,tipo,documento_id,'Accettata',dati,
    jsonb_build_object('quote',to_jsonb(new),'items',coalesce((
      select jsonb_agg(to_jsonb(i) order by i.sort_order,i.id) from public.quote_items i
      where i.quote_id=new.id and i.company_id=new.company_id
    ),'[]'::jsonb))
  from public.preventivo_analisi_costi
  where company_id=new.company_id and tipo='preventivo' and documento_id=new.id and revisione=''
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.congela_analisi_preventivo_accettato() from public, anon, authenticated;
create trigger quotes_congela_analisi_costi after update of status on public.quotes
  for each row when (old.status is distinct from new.status and new.status = 'accettata')
  execute function private.congela_analisi_preventivo_accettato();

create function private.numero_analisi_preventivo(testo text)
returns numeric language sql immutable set search_path = ''
as $$
  select case when n ~ '^[0-9]+([.][0-9]+)?$' and length(n)<=32
    then case when n::numeric<=999999999 then n::numeric end end
  from (select case when strpos(s,',')>0 then replace(replace(s,'.',''),',','.') else s end n
    from (select regexp_replace(testo,'[[:space:]]','','g') s) pulito) decimale
$$;

create function private.somma_risorse_preventivo(risorse jsonb, quantita numeric, base numeric)
returns table(diretto numeric, costo numeric)
language sql immutable set search_path = ''
as $$
  with ingressi as (
    select coalesce(nullif(btrim(r->>'nome'),''),'') as nome, r->>'base' as modo,
      private.numero_analisi_preventivo(r->>'prezzo') as prezzo,
      private.numero_analisi_preventivo(r->>'quantita') as q,
      private.numero_analisi_preventivo(r->>'fattore') as fattore
    from jsonb_array_elements(case when jsonb_typeof(risorse)='array' then risorse else '[]'::jsonb end) r
  ), importi as (
    select *, case modo when 'unitaria' then round(prezzo*q*fattore*quantita,2)
      when 'totale' then round(prezzo*q*fattore,2) end as importo from ingressi
  ), d as (select coalesce(sum(importo),0) totale from importi)
  select d.totale,
    case when not exists(select 1 from importi where nome='' or
      (modo='percentuale' and prezzo is null) or (modo is distinct from 'percentuale' and importo is null))
    then d.totale + coalesce((select sum(round((d.totale+base)*prezzo/100,2)) from importi where modo='percentuale'),0) end
  from d
$$;

create function private.budget_analisi_preventivo(p_azienda uuid, p_preventivo uuid)
returns jsonb language sql stable set search_path = ''
as $$
  with foto as (
    select dati, fotografia from public.preventivo_analisi_costi where company_id=p_azienda
      and tipo='preventivo' and documento_id=p_preventivo and revisione='Accettata'
  ), voci as (
    select dati, i->>'id' id, (i->>'quantity')::numeric quantita,
      greatest(coalesce((i->>'line_total')::numeric,0),0) as vendita,
      nullif((i->>'prezzo_acquisto')::numeric,0)*(i->>'quantity')::numeric as costo_legacy,
      dati->'voci'->coalesce(i->>'analisi_riga_id',i->>'id') risorse
    from foto cross join jsonb_array_elements(fotografia->'items') i
    where coalesce(i->>'item_category','') not in ('nota','sconto','subtotale')
      and (i->>'is_optional') is distinct from 'true' and (i->>'quantity')::numeric>0
  ), conti as (
    select v.id,v.quantita,case when v.vendita>0 then v.vendita else 1 end peso,
      case when jsonb_typeof(v.risorse)='array' and v.risorse<>'[]'::jsonb then s.costo else v.costo_legacy end costo,
      case when jsonb_typeof(v.risorse)='array' and v.risorse<>'[]'::jsonb then s.diretto else coalesce(v.costo_legacy,0) end diretto
    from voci v cross join lateral private.somma_risorse_preventivo(v.risorse,v.quantita,0) s
  ), comuni as (
    select s.costo from foto f cross join lateral private.somma_risorse_preventivo(
      f.dati->'generali',null,coalesce((select sum(diretto) from conti),0)) s
  ), pesi as (
    select *, sum(peso) over (order by id) cumulato, sum(peso) over () somma from conti
  )
  select coalesce(jsonb_object_agg(p.id,
    round((p.costo + round(c.costo*p.cumulato/p.somma,2) - round(c.costo*(p.cumulato-p.peso)/p.somma,2))/p.quantita,4)), '{}'::jsonb)
  from pesi p cross join comuni c
  where not exists (select 1 from conti where costo is null) and c.costo is not null
    and not exists (select 1 from conti where costo>999999999)
    and c.costo<=999999999
$$;
revoke all on function private.numero_analisi_preventivo(text) from public, anon, authenticated;
revoke all on function private.somma_risorse_preventivo(jsonb,numeric,numeric) from public, anon, authenticated;
revoke all on function private.budget_analisi_preventivo(uuid,uuid) from public, anon, authenticated;

-- La RPC già autorizzata usa il budget nell'unica transazione di conversione.
do $$
declare
  definizione text := pg_get_functiondef('public.crea_commessa_preventivo_atomic(uuid,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure);
begin
  if strpos(definizione,'private.budget_analisi_preventivo')=0 then
    if strpos(definizione,'  v_result := public.create_order_atomic(')=0
      or strpos(definizione,'greatest(coalesce(r.prezzo_acquisto,0),0),r.line_total')=0 then
      raise exception 'Verificare la conversione del preventivo prima di aggiungere il budget';
    end if;
    definizione := replace(definizione,E'  v_costo numeric;\n',E'  v_costo numeric;\n  v_budget jsonb;\n');
    definizione := replace(definizione,'  v_result := public.create_order_atomic(', $patch$
  if not v_computo then
    v_budget := private.budget_analisi_preventivo(q.company_id,q.id);
    if v_budget<>'{}'::jsonb and jsonb_typeof(p_items)='array' then
      select coalesce(jsonb_agg(
        case when v_budget ? (i->>'origine_preventivo_id') and not exists (
          select 1 from jsonb_array_elements(p_items) with ordinality a(j,n)
          where a.n<x.n and a.j->>'origine_preventivo_id'=x.i->>'origine_preventivo_id'
        ) then i || jsonb_build_object('purchase_price',v_budget->(i->>'origine_preventivo_id'))
        else i end order by x.n),'[]'::jsonb) into p_items
      from jsonb_array_elements(p_items) with ordinality x(i,n);
    end if;
  end if;
  v_result := public.create_order_atomic($patch$);
    definizione := replace(definizione,'greatest(coalesce(r.prezzo_acquisto,0),0),r.line_total',
      'greatest(coalesce((v_budget->>r.id::text)::numeric,r.prezzo_acquisto,0),0),r.line_total');
    execute definizione;
  end if;
end;
$$;
