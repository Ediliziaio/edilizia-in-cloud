-- Tipi dei fornitori: una fattura senza partita IVA né codice fiscale si aggancia all'anagrafica per nome, se il nome è
-- di un fornitore solo. Senza, un fornitore già in anagrafica risultava «non in anagrafica» e salvando nasceva un doppione.
create or replace function public.fornitore_per_nome(p_company_id uuid, p_nome text)
returns uuid language sql stable set search_path to ''
as $$
  select case when count(*) = 1 then (array_agg(s.id))[1] end
    from public.suppliers s
   where s.company_id = p_company_id
     and lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(p_nome), '\s+', ' ', 'g'));
$$;
revoke all on function public.fornitore_per_nome(uuid, text) from public, anon;
grant execute on function public.fornitore_per_nome(uuid, text) to authenticated, service_role;

create or replace function public.cedenti_fatture_ricevute(p_company_id uuid)
 returns table(chiave text, piva text, cf text, nome text, fatture bigint, imponibile numeric, ultima date, fornitore_id uuid, fornitore_nome text, fornitore_tipo text, fornitore_categoria text, subappaltatore_id uuid, reverse_charge_edile boolean, categorie text[])
 language sql
 stable
 set search_path to ''
as $function$
  with f as (
    select r.*,
           coalesce(nullif(public.partner_tax_key(r.cedente_piva), ''), nullif(public.partner_tax_key(r.cedente_cf), ''),
                    'nome:' || nullif(lower(regexp_replace(btrim(r.cedente_ragione_sociale), '\s+', ' ', 'g')), '')) as k
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
  ), h as (
    select g.*,
           coalesce(g.fornitore_id, public.fornitore_cedente(p_company_id, g.piva, g.cf),
                    case when g.k like 'nome:%' then public.fornitore_per_nome(p_company_id, g.nome) end) as fornitore_trovato
      from g
  )
  select h.k, h.piva, h.cf, h.nome, h.fatture, h.imponibile, h.ultima, h.fornitore_trovato,
         s.name, s.tipo, s.product_category,
         coalesce(s.subappaltatore_id, (select sa.id from public.subappaltatori sa
           where sa.company_id = p_company_id and public.partner_tax_key(sa.piva) = h.k
           order by sa.is_active desc nulls last limit 1)),
         h.reverse_charge_edile, h.categorie
    from h
    left join public.suppliers s on s.id = h.fornitore_trovato
   order by h.imponibile desc nulls last;
$function$;
