-- Fatture: la striscia dei mesi e i numeri veloci contano solo i documenti davvero emessi (16/11/2026).
--
-- Richiesta del titolare: nei numeri delle fatture vanno solo le fatture effettivamente inviate.
-- Restano fuori le bozze (native e importate) e le native ancora da inviare allo SDI o scartate.
-- Le importate sono gia' passate dal loro gestionale; una nativa a trasmissione «manuale» conta
-- (l'ha spedita l'azienda). Il resto e' come in 20290417200000.
--
-- L'incassato resta quello DELLE fatture del periodo (anche se arrivato il mese dopo): l'incasso
-- per data di arrivo sta nel Registro incassi e in Tesoreria.

CREATE OR REPLACE FUNCTION public.get_documenti_monthly_timeline(
  p_company_id uuid, p_tipos text[] DEFAULT NULL, p_anno integer DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_anno integer := coalesce(p_anno, extract(year from (now() at time zone 'Europe/Rome'))::integer);
  v_result json;
begin
  perform public.assert_company_access(p_company_id);

  select json_agg(row_to_json(t) order by t.month) into v_result
  from (
    select
      v_anno as year,
      extract(month from d.data_emissione)::integer as month,
      count(*)::integer as doc_count,
      coalesce(sum(d.totale_documento), 0)::numeric as total_amount,
      coalesce(sum(d.imponibile_totale), 0)::numeric as imponibile,
      coalesce(sum(d.iva_totale), 0)::numeric as iva,
      coalesce(sum(d.incassato) filter (where d.incassabile), 0)::numeric as incassato,
      coalesce(sum(d.totale_da_pagare - d.incassato) filter (where d.incassabile), 0)::numeric as da_incassare,
      coalesce(sum(d.totale_da_pagare - d.incassato) filter (where d.incassabile and d.elenco_scaduta), 0)::numeric as scaduto
    from (
      select e.data_emissione, e.totale_documento, e.imponibile_totale, e.iva_totale, e.elenco_scaduta,
             greatest(coalesce(e.totale_da_pagare, e.totale_documento, 0), 0) as totale_da_pagare,
             case when e.stato = 'pagata' then greatest(coalesce(e.totale_da_pagare, e.totale_documento, 0), 0)
                  else least(greatest(coalesce(e.importo_pagato, 0), 0), greatest(coalesce(e.totale_da_pagare, e.totale_documento, 0), 0))
             end as incassato,
             (e.stato not in ('bozza', 'annullata', 'stornata')
              and e.tipo not in ('nota_credito', 'ddt', 'preventivo', 'proforma')) as incassabile
        from public.documenti_fiscali_elenco_con_importate e
       where e.company_id = p_company_id
         and e.stato not in ('annullata', 'bozza')
         and e.deleted_at is null   -- la striscia conta cio' che la lista sa mostrare
         -- solo cio' che e' davvero partito: una nativa ancora da inviare allo SDI o scartata non conta
         and (e.origine = 'importata' or coalesce(e.elenco_fase_sdi, '') not in ('da_inviare', 'scartata'))
         and (p_tipos is null or e.tipo = any(p_tipos))
         and e.data_emissione >= make_date(v_anno, 1, 1)
         and e.data_emissione < make_date(v_anno + 1, 1, 1)
    ) d
    group by 2
  ) t;

  return coalesce(v_result, '[]'::json);
end;
$function$;

REVOKE ALL ON FUNCTION public.get_documenti_monthly_timeline(uuid, text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_documenti_monthly_timeline(uuid, text[], integer) TO authenticated, service_role;
