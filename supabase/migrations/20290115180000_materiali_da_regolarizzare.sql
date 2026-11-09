-- Materiali usati in cantiere fuori dalla commessa: dal rapportino a una bolla di entrata.
-- Il rapportino dice cosa si e' usato; il costo arriva poi da ordine o fattura del fornitore.
set local lock_timeout = '3s';
create table if not exists public.rapportino_materiali_regolarizzati (
  rapportino_id uuid not null references public.campo_rapportini(id) on delete cascade,
  chiave text not null,
  ddt_ricezione_id uuid references public.ddt_ricezione(id) on delete set null,
  ignorato boolean not null default false,
  fatto_da uuid default auth.uid(),
  fatto_il timestamptz not null default now(),
  primary key (rapportino_id, chiave)
);
alter table public.rapportino_materiali_regolarizzati enable row level security;
revoke all on public.rapportino_materiali_regolarizzati from anon, authenticated;

create or replace function public.materiali_da_regolarizzare(p_order_id uuid)
returns table(rapportino_id uuid, chiave text, data_lavoro date, nome text, quantita numeric, unita text, fase_id text, fornitore text)
language plpgsql stable security definer set search_path to '' as $$
declare v_company uuid;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if v_company is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not public.puo_vedere_commessa(p_order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company) then
    raise exception 'Non hai accesso a questa commessa' using errcode = '42501';
  end if;
  return query
    with m as (
      select r.id as rid, r.data_lavoro as dl, e as v,
             coalesce(nullif(btrim(e->>'nome'), ''), nullif(btrim(e->>'descrizione'), '')) as n
        from public.campo_rapportini r, jsonb_array_elements(case when jsonb_typeof(r.materiali_usati) = 'array' then r.materiali_usati else '[]'::jsonb end) e
       where r.order_id = p_order_id and r.stato = 'approvato' and jsonb_typeof(e) = 'object'
    )
    select m.rid, lower(m.n) || '|' || coalesce(m.v->>'quantita', ''), m.dl, m.n,
           case when m.v->>'quantita' ~ '^[0-9]+([.,][0-9]+)?$' then replace(m.v->>'quantita', ',', '.')::numeric end,
           coalesce(nullif(m.v->>'unita', ''), nullif(m.v->>'unita_misura', '')),
           m.v->>'fase_id', nullif(btrim(m.v->>'fornitore'), '')
      from m
     where m.n is not null
       and nullif(m.v->>'order_item_id', '') is null
       and nullif(m.v->>'stock_item_id', '') is null
       and coalesce(m.v->>'provenienza', '') not in ('magazzino', 'consumo')
       and coalesce((m.v->>'da_furgone')::boolean, false) = false
       and not exists (select 1 from public.rapportino_materiali_regolarizzati x
                        where x.rapportino_id = m.rid and x.chiave = lower(m.n) || '|' || coalesce(m.v->>'quantita', ''))
     order by m.dl, m.n;
end; $$;
revoke all on function public.materiali_da_regolarizzare(uuid) from public, anon;
grant execute on function public.materiali_da_regolarizzare(uuid) to authenticated;

create or replace function public.materiali_regolarizza(p_order_id uuid, p_righe jsonb, p_azione text, p_supplier_id uuid default null, p_numero text default null, p_data date default null)
returns uuid
language plpgsql security definer set search_path to '' as $$
declare
  v_company uuid; v_ddt uuid; v_riga record; v_pos integer := 0; v_tutte record;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order_id and o.deleted_at is null;
  if v_company is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or auth.uid() is null
     or not public.puo_vedere_commessa(p_order_id)
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company) then
    raise exception 'Non hai il permesso' using errcode = '42501';
  end if;
  if p_azione not in ('bolla', 'ignora') then raise exception 'Azione sconosciuta' using errcode = '22023'; end if;
  if jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then raise exception 'Scegli almeno un materiale' using errcode = '22023'; end if;
  if p_supplier_id is not null and not exists (select 1 from public.suppliers s where s.id = p_supplier_id and s.company_id = v_company) then
    raise exception 'Fornitore di un''altra azienda' using errcode = '42501';
  end if;

  if p_azione = 'bolla' then
    insert into public.ddt_ricezione (company_id, numero_ddt, data_ricezione, stato, order_id, supplier_id, destinazione, source, note, created_by)
    values (v_company, coalesce(nullif(btrim(p_numero), ''), 'Da rapportini ' || to_char(coalesce(p_data, current_date), 'DD/MM/YYYY')),
            coalesce(p_data, current_date), 'ricevuto', p_order_id, p_supplier_id, 'cantiere', 'manual', 'Materiali usati in cantiere, dai rapportini', auth.uid())
    returning id into v_ddt;
  end if;

  for v_riga in select (e->>'rapportino_id')::uuid as rid, e->>'chiave' as chiave from jsonb_array_elements(p_righe) e loop
    select * into v_tutte from public.materiali_da_regolarizzare(p_order_id) c where c.rapportino_id = v_riga.rid and c.chiave = v_riga.chiave limit 1;
    if v_tutte.rapportino_id is null then continue; end if;
    if p_azione = 'bolla' then
      v_pos := v_pos + 1;
      insert into public.ddt_righe (company_id, ddt_ricezione_id, posizione, descrizione, unita_misura, quantita, origine, note)
      values (v_company, v_ddt, v_pos, v_tutte.nome, v_tutte.unita, v_tutte.quantita, 'manuale', 'Dal rapportino del ' || to_char(v_tutte.data_lavoro, 'DD/MM/YYYY'));
    end if;
    insert into public.rapportino_materiali_regolarizzati (rapportino_id, chiave, ddt_ricezione_id, ignorato)
    values (v_riga.rid, v_riga.chiave, v_ddt, p_azione = 'ignora') on conflict do nothing;
  end loop;
  return v_ddt;
end; $$;
revoke all on function public.materiali_regolarizza(uuid, jsonb, text, uuid, text, date) from public, anon;
grant execute on function public.materiali_regolarizza(uuid, jsonb, text, uuid, text, date) to authenticated;
