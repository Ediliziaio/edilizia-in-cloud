-- Fatture sui mezzi: le officine scrivono la targa su una riga senza prezzo e l'importo nelle righe sotto.
-- Con un solo mezzo sulla fattura l'importo è l'imponibile della fattura. Con più mezzi non si può dividere:
-- resta vuoto, non zero, perché uno zero sembra un costo nullo. Solo funzioni, nessuna riga scritta.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.importo_legame_mezzo(p_righe numeric, p_mezzi_sulla_fattura integer, p_imponibile numeric, p_nota boolean)
returns numeric language sql immutable set search_path to '' as $$
  select case when p_nota then -v else v end from (
    select case when coalesce(p_righe, 0) <> 0 then abs(p_righe)
                when p_mezzi_sulla_fattura = 1 and p_imponibile is not null then abs(p_imponibile)
           end as v
  ) x
$$;
revoke all on function public.importo_legame_mezzo(numeric, integer, numeric, boolean) from public, anon;
grant execute on function public.importo_legame_mezzo(numeric, integer, numeric, boolean) to authenticated, service_role;

create or replace function public.fattura_collega_ddt_e_mezzi(p_fattura_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.fatture_ricevute%rowtype; v_ddt integer := 0; v_mezzi integer := 0; v_nota boolean;
begin
  select * into f from public.fatture_ricevute where id = p_fattura_id;
  if not found then return jsonb_build_object('ddt', 0, 'mezzi', 0); end if;
  v_nota := public.e_nota_credito_ricevuta(f.tipo_documento);

  if f.xml_raw is not null and position('NumeroDDT' in f.xml_raw) > 0 then
    with letti as (
      select distinct left(btrim(m[1]), 100) as numero,
             case when m[2] ~ '^\d{4}-\d{2}-\d{2}$' then m[2]::date end as data
        from regexp_matches(f.xml_raw, '<(?:[\w.-]+:)?NumeroDDT>\s*([^<]+?)\s*</(?:[\w.-]+:)?NumeroDDT>\s*<(?:[\w.-]+:)?DataDDT>\s*([^<]+?)\s*</', 'g') as m
    ), scritti as (
      insert into public.fattura_ddt (company_id, fattura_ricevuta_id, numero_ddt, data_ddt, origine, created_by, ddt_ricezione_id)
      select f.company_id, f.id, l.numero, l.data, 'xml', null,
             (select case when count(*) = 1 then min(d.id::text)::uuid end from public.ddt_ricezione d
               where d.company_id = f.company_id and d.numero_ddt = l.numero and f.fornitore_id is not null and d.supplier_id = f.fornitore_id)
        from letti l
      on conflict do nothing returning 1
    ) select count(*) into v_ddt from scritti;
  end if;

  if not public.e_autofattura_ricevuta(f.tipo_documento) and jsonb_typeof(f.righe) = 'array' then
    with chiavi as (
      select m.id, upper(regexp_replace(coalesce(nullif(m.targa, ''), m.matricola, ''), '[^A-Za-z0-9]', '', 'g')) as k
        from public.mezzi m where m.company_id = f.company_id and m.deleted_at is null
    ), righe as (
      select upper(regexp_replace(coalesce(r->>'descrizione', ''), '[^A-Za-z0-9]', '', 'g')) as testo,
             case when (r->>'imponibile') ~ '^-?\d+(\.\d+)?$' then (r->>'imponibile')::numeric else 0 end as importo
        from jsonb_array_elements(f.righe) r
    ), trovati as (
      select c.id as mezzo_id, sum(abs(ri.importo)) as importo
        from chiavi c join righe ri on length(c.k) >= 6 and ri.testo like '%' || c.k || '%'
       group by c.id
    ), scritti as (
      insert into public.fattura_ricevuta_mezzi (company_id, fattura_ricevuta_id, mezzo_id, importo, origine, created_by)
      select f.company_id, f.id, t.mezzo_id,
             public.importo_legame_mezzo(t.importo, (select count(*)::integer from trovati), f.imponibile_totale, v_nota), 'targa', null
        from trovati t
      on conflict (fattura_ricevuta_id, mezzo_id) do nothing returning 1
    ) select count(*) into v_mezzi from scritti;
  end if;
  return jsonb_build_object('ddt', v_ddt, 'mezzi', v_mezzi);
end $$;

create or replace function public.mezzo_cerca_nelle_fatture(p_mezzo_id uuid)
returns integer language plpgsql security definer set search_path = public set statement_timeout to '60s' as $$
declare v_azienda uuid; v_k text; n integer;
begin
  select company_id, upper(regexp_replace(coalesce(nullif(targa, ''), matricola, ''), '[^A-Za-z0-9]', '', 'g')) into v_azienda, v_k from public.mezzi where id = p_mezzo_id;
  if v_azienda is null then raise exception 'Mezzo non trovato.' using errcode = 'P0002'; end if;
  if not (public.e_super_admin_dentro(v_azienda) or (v_azienda = any (public.aziende_con_permesso('can_view_costs')) and not public.utente_sola_lettura(v_azienda))) then
    raise exception 'Il tuo ruolo non permette di collegare le fatture.' using errcode = '42501';
  end if;
  if length(coalesce(v_k, '')) < 6 then raise exception 'Serve una targa o una matricola di almeno 6 caratteri.' using errcode = '22023'; end if;
  with trovati as (
    select f.id, f.imponibile_totale, sum(abs(case when (r->>'imponibile') ~ '^-?\d+(\.\d+)?$' then (r->>'imponibile')::numeric else 0 end)) as importo,
           public.e_nota_credito_ricevuta(f.tipo_documento) as nota
      from public.fatture_ricevute f, jsonb_array_elements(case when jsonb_typeof(f.righe) = 'array' then f.righe else '[]'::jsonb end) r
     where f.company_id = v_azienda and not public.e_autofattura_ricevuta(f.tipo_documento)
       and upper(regexp_replace(coalesce(r->>'descrizione', ''), '[^A-Za-z0-9]', '', 'g')) like '%' || v_k || '%'
     group by f.id, f.tipo_documento, f.imponibile_totale
  ), scritti as (
    insert into public.fattura_ricevuta_mezzi (company_id, fattura_ricevuta_id, mezzo_id, importo, origine, created_by)
    select v_azienda, t.id, p_mezzo_id,
           public.importo_legame_mezzo(t.importo, 1 + (select count(*)::integer from public.fattura_ricevuta_mezzi l where l.fattura_ricevuta_id = t.id and l.mezzo_id <> p_mezzo_id), t.imponibile_totale, t.nota),
           'targa', auth.uid() from trovati t
    on conflict (fattura_ricevuta_id, mezzo_id) do nothing returning 1
  ) select count(*) into n from scritti;
  return n;
end $$;
