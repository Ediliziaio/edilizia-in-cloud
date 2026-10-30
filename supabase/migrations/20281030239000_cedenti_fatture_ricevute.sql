-- I fornitori delle fatture ricevute, uno per riga (30/10/2026).
--
-- Per classificare i fornitori (tipo: materiali, subappalto, spese generali…)
-- serve l'elenco dei cedenti con quante fatture, quanto, se sono già in
-- anagrafica, se sono subappaltatori e se fatturano in reverse charge edile.
-- Dal browser erano 14.000 righe da sommare (e PostgREST si ferma a mille).
-- Sola lettura, security invoker: le regole di fatture_ricevute, suppliers e
-- subappaltatori valgono come per chi chiama.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- La scheda dell'anagrafica con la stessa partita IVA (o codice fiscale), se è una.
create or replace function public.fornitore_cedente(p_company_id uuid, p_piva text, p_cf text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select case when count(*) = 1 then (array_agg(s.id))[1] end
    from public.suppliers s
   where s.company_id = p_company_id
     and ((public.partner_tax_key(p_piva) <> '' and public.partner_tax_key(s.vat_number) = public.partner_tax_key(p_piva))
       or (public.partner_tax_key(p_piva) = '' and public.partner_tax_key(p_cf) <> '' and public.partner_tax_key(s.fiscal_code) = public.partner_tax_key(p_cf)));
$$;

create or replace function public.cedenti_fatture_ricevute(p_company_id uuid)
returns table (
  chiave text,
  piva text,
  cf text,
  nome text,
  fatture bigint,
  imponibile numeric,
  ultima date,
  fornitore_id uuid,
  fornitore_nome text,
  fornitore_tipo text,
  fornitore_categoria text,
  subappaltatore_id uuid,
  reverse_charge_edile boolean,
  categorie text[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  with f as (
    select r.*,
           coalesce(nullif(public.partner_tax_key(r.cedente_piva), ''), nullif(public.partner_tax_key(r.cedente_cf), '')) as k
      from public.fatture_ricevute r
     where r.company_id = p_company_id
  ), g as (
    select f.k,
           max(f.cedente_piva) as piva,
           max(f.cedente_cf) as cf,
           (array_agg(f.cedente_ragione_sociale order by f.data_fattura desc nulls last))[1] as nome,
           count(*) as fatture,
           coalesce(sum(case when f.tipo_documento = 'TD04' then -abs(f.imponibile_totale) else f.imponibile_totale end), 0) as imponibile,
           max(f.data_fattura) as ultima,
           (array_agg(f.fornitore_id) filter (where f.fornitore_id is not null))[1] as fornitore_id,
           bool_or(exists (
             select 1 from jsonb_array_elements(case when jsonb_typeof(f.righe) = 'array' then f.righe else '[]'::jsonb end) x
              where upper(replace(x ->> 'natura_iva', '.', '_')) in ('N6_3', 'N6_7')
           )) as reverse_charge_edile,
           array_remove(array_agg(distinct f.categoria_ai), null) as categorie
      from f
     where f.k is not null
     group by f.k
  )
  select g.k, g.piva, g.cf, g.nome, g.fatture, g.imponibile, g.ultima,
         coalesce(g.fornitore_id, public.fornitore_cedente(p_company_id, g.piva, g.cf)) as fornitore_id,
         s.name, s.tipo, s.product_category,
         (select sa.id from public.subappaltatori sa
           where sa.company_id = p_company_id and public.partner_tax_key(sa.piva) = g.k
           order by sa.is_active desc nulls last limit 1),
         g.reverse_charge_edile, g.categorie
    from g
    left join public.suppliers s
      on s.id = coalesce(g.fornitore_id, public.fornitore_cedente(p_company_id, g.piva, g.cf))
   order by g.imponibile desc nulls last;
$$;

revoke all on function public.cedenti_fatture_ricevute(uuid) from public, anon;
grant execute on function public.cedenti_fatture_ricevute(uuid) to authenticated, service_role;
revoke all on function public.fornitore_cedente(uuid, text, text) from public, anon;
grant execute on function public.fornitore_cedente(uuid, text, text) to authenticated, service_role;
