-- Elenco delle province nel pannello Filtri dei contatti (24/09/2026).
--
-- La prima versione di marketing_valori_filtro_contatti (migrazione
-- 20280925000400) andava in errore sul ramo «province»: l'etichetta usava
-- coalesce(sigla, mode()) su colonne del join che il GROUP BY vedeva solo
-- dentro un'altra espressione. Qui le colonne si calcolano prima, in una
-- sottoquery, e il raggruppamento le usa così come sono. Tag e fonte non
-- cambiano. Il file 20280925000400 è già corretto: questa migrazione porta la
-- stessa versione in produzione.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

create or replace function public.marketing_valori_filtro_contatti(
  p_company uuid,
  p_campo   text
)
returns table (valore text, etichetta text, contatti bigint)
language plpgsql
stable
set search_path to 'public'
as $$
begin
  if p_company is null then
    return;
  end if;

  if p_campo = 'tags' then
    return query
      select t.tag, t.tag, count(*)::bigint
        from marketing_contacts c
       cross join lateral unnest(c.tags) as t(tag)
       where c.company_id = p_company
         and btrim(t.tag) <> ''
       group by t.tag
       order by 3 desc, 1
       limit 500;
  elsif p_campo = 'source' then
    return query
      select mode() within group (order by btrim(c.source)),
             mode() within group (order by btrim(c.source)),
             count(*)::bigint
        from marketing_contacts c
       where c.company_id = p_company
         and btrim(coalesce(c.source, '')) <> ''
       group by lower(btrim(c.source))
       order by 3 desc, 1
       limit 500;
  elsif p_campo = 'province' then
    -- Due join per uguaglianza (sigla, poi nome) invece di un OR: su
    -- novantaseimila contatti l'OR confronterebbe ogni riga con 107 province.
    return query
      select coalesce(x.sigla, mode() within group (order by x.grezza)),
             coalesce(x.nome || ' (' || x.sigla || ')', mode() within group (order by x.grezza)),
             count(*)::bigint
        from (
          select btrim(c.province) as grezza,
                 coalesce(ps.sigla, pn.sigla) as sigla,
                 coalesce(ps.nome, pn.nome) as nome
            from marketing_contacts c
            left join it_province ps on ps.sigla = upper(btrim(c.province))
            left join it_province pn on lower(pn.nome) = lower(btrim(c.province))
           where c.company_id = p_company
             and btrim(coalesce(c.province, '')) <> ''
        ) x
       group by x.sigla, x.nome, case when x.sigla is null then lower(x.grezza) end
       order by 3 desc, 1
       limit 500;
  end if;
end;
$$;

revoke all on function public.marketing_valori_filtro_contatti(uuid, text) from public, anon;
grant execute on function public.marketing_valori_filtro_contatti(uuid, text) to authenticated, service_role;
