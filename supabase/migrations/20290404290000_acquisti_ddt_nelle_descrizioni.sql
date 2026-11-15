-- DDT scritti nelle descrizioni delle righe (docs/automazioni-acquisti.md §5, riga «DDT nelle descrizioni»).
--
-- Molti gestionali dei fornitori non compilano DatiDDT e scrivono la bolla nella riga: «Rif. DDT n. 1068
-- del 07/09/2026». Il 15/11/2026: 736 fatture, 1.120 riferimenti (804 con la data). Da oggi quei DDT
-- diventano righe di fattura_ddt con origine «descrizione», e si agganciano alla bolla con le stesse
-- regole dei DatiDDT (acquisti_collega_ddt: stesso fornitore, stesso numero, stesso anno, data vicina;
-- senza data → proposta). Si leggono SOLO se l'XML non ha DatiDDT, e solo con la parola DDT/bolla
-- davanti al numero: un numero nudo è anche un prezzo, una misura o una data.
-- Stessa regola di shared/acquisti/riferimentiFattura.ts → ddtNelleDescrizioni.
--
-- Dati storici: acquisti_ddt_descrizioni_anteprima(azienda) conta senza scrivere;
-- acquisti_ddt_descrizioni_lotto(azienda, limite) scrive a lotti con lock_timeout.

set local lock_timeout = '3s';

alter table public.fattura_ddt drop constraint if exists fattura_ddt_origine_check;
alter table public.fattura_ddt add constraint fattura_ddt_origine_check check (origine = any (array['xml', 'manuale', 'descrizione']));

-- «07/09/2026», «7-9-26», «2026-09-07» → data, o null (mai una data inventata).
create or replace function public.acquisti_data_italiana(p text) returns date
language plpgsql immutable set search_path = '' as $$
declare m text[]; a integer;
begin
  if p is null then return null; end if;
  m := regexp_match(btrim(p), '^(\d{4})-(\d{1,2})-(\d{1,2})$');
  if m is not null then return make_date(m[1]::int, m[2]::int, m[3]::int); end if;
  m := regexp_match(btrim(p), '^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$');
  if m is null then return null; end if;
  a := m[3]::int; if a < 100 then a := 2000 + a; end if;
  return make_date(a, m[2]::int, m[1]::int);
exception when others then return null;
end $$;
revoke all on function public.acquisti_data_italiana(text) from public, anon;
grant execute on function public.acquisti_data_italiana(text) to authenticated;

-- I DDT citati nelle descrizioni delle righe di una fattura.
create or replace function public.acquisti_ddt_dalle_descrizioni(p_righe jsonb)
returns table (numero text, data date)
language sql immutable set search_path = '' as $$
  select distinct on (n.chiave, coalesce(public.acquisti_data_italiana(x[2]), '0001-01-01'::date))
         left(regexp_replace(x[1], '[.\-/]+$', ''), 100), public.acquisti_data_italiana(x[2])
    from jsonb_array_elements(case when jsonb_typeof(p_righe) = 'array' then p_righe else '[]'::jsonb end) r,
         regexp_matches(coalesce(r->>'descrizione', ''),
           '(?:^|[^A-Za-z])(?:d\.?\s*d\.?\s*t\.?|bolla|doc\.?\s*trasp(?:orto)?\.?)\s*(?:n(?:r|um)?\.?|n°|numero)?\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9/.\-]{0,20})(?:\s*(?:del|dd|data)\.?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{4}-\d{2}-\d{2}))?',
           'gi') x,
         lateral public.acquisti_numero_documento(regexp_replace(x[1], '[.\-/]+$', '')) n
   where n.chiave is not null
$$;
revoke all on function public.acquisti_ddt_dalle_descrizioni(jsonb) from public, anon;
grant execute on function public.acquisti_ddt_dalle_descrizioni(jsonb) to authenticated;

-- All'arrivo della fattura: DatiDDT dell'XML, oppure (se non ci sono) i DDT delle descrizioni; poi l'aggancio.
create or replace function public.fattura_collega_ddt_e_mezzi(p_fattura_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f public.fatture_ricevute%rowtype; v_ddt integer := 0; v_mezzi integer := 0; v_nota boolean; v_agganciati integer := 0;
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
      insert into public.fattura_ddt (company_id, fattura_ricevuta_id, numero_ddt, data_ddt, origine, created_by)
      select f.company_id, f.id, l.numero, l.data, 'xml', null from letti l
      on conflict do nothing returning 1
    ) select count(*) into v_ddt from scritti;
  elsif jsonb_typeof(f.righe) = 'array' then
    with scritti as (
      insert into public.fattura_ddt (company_id, fattura_ricevuta_id, numero_ddt, data_ddt, origine, created_by)
      select f.company_id, f.id, d.numero, d.data, 'descrizione', null from public.acquisti_ddt_dalle_descrizioni(f.righe) d
      on conflict do nothing returning 1
    ) select count(*) into v_ddt from scritti;
  end if;
  select count(*) into v_agganciati from public.acquisti_collega_ddt(f.company_id, f.id) where esito = 'automatico';

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
  return jsonb_build_object('ddt', v_ddt, 'mezzi', v_mezzi, 'ddt_agganciati', v_agganciati);
end $$;

-- Storico: le fatture senza DatiDDT e senza nessuna riga fattura_ddt, che citano DDT nelle descrizioni.
create or replace function public.acquisti_ddt_descrizioni_anteprima(p_company uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.acquisti_puo_collegare(p_company) then raise exception 'Non hai il permesso di collegare i documenti d''acquisto.' using errcode = '42501'; end if;
  with f as (
    select fr.id, fr.righe from public.fatture_ricevute fr
     where fr.company_id = p_company and jsonb_typeof(fr.righe) = 'array'
       and (fr.xml_raw is null or position('NumeroDDT' in fr.xml_raw) = 0)
       and not exists (select 1 from public.fattura_ddt fd where fd.fattura_ricevuta_id = fr.id)
  ), d as (select f.id, x.* from f, lateral public.acquisti_ddt_dalle_descrizioni(f.righe) x)
  select jsonb_build_object('fatture', count(distinct id), 'ddt', count(*), 'con_data', count(*) filter (where data is not null),
                            'esempi', coalesce((select jsonb_agg(e) from (select numero, data from d limit 10) e), '[]'::jsonb))
    into v from d;
  return v;
end $$;
revoke all on function public.acquisti_ddt_descrizioni_anteprima(uuid) from public, anon;
grant execute on function public.acquisti_ddt_descrizioni_anteprima(uuid) to authenticated;

create or replace function public.acquisti_ddt_descrizioni_lotto(p_company uuid, p_limite integer default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_fatture integer := 0; v_ddt integer := 0; v_righe integer;
begin
  if not public.acquisti_puo_collegare(p_company) then raise exception 'Non hai il permesso di collegare i documenti d''acquisto.' using errcode = '42501'; end if;
  perform set_config('lock_timeout', '3s', true);
  perform set_config('acquisti.processo', 'acquisti_ddt_descrizioni_lotto', true);
  for r in
    select fr.id, fr.company_id, fr.righe from public.fatture_ricevute fr
     where fr.company_id = p_company and jsonb_typeof(fr.righe) = 'array'
       and (fr.xml_raw is null or position('NumeroDDT' in fr.xml_raw) = 0)
       and not exists (select 1 from public.fattura_ddt fd where fd.fattura_ricevuta_id = fr.id)
       and exists (select 1 from public.acquisti_ddt_dalle_descrizioni(fr.righe))
     order by fr.data_fattura nulls last
     limit least(greatest(coalesce(p_limite, 200), 1), 1000)
  loop
    insert into public.fattura_ddt (company_id, fattura_ricevuta_id, numero_ddt, data_ddt, origine, created_by)
    select r.company_id, r.id, d.numero, d.data, 'descrizione', null from public.acquisti_ddt_dalle_descrizioni(r.righe) d
    on conflict do nothing;
    get diagnostics v_righe = row_count;
    v_ddt := v_ddt + v_righe;
    v_fatture := v_fatture + 1;
    perform 1 from public.acquisti_collega_ddt(r.company_id, r.id);
  end loop;
  return jsonb_build_object('fatture', v_fatture, 'ddt', v_ddt);
end $$;
revoke all on function public.acquisti_ddt_descrizioni_lotto(uuid, integer) from public, anon;
grant execute on function public.acquisti_ddt_descrizioni_lotto(uuid, integer) to authenticated;
