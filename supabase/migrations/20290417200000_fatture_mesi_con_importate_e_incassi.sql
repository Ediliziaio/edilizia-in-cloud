-- Fatture: la striscia dei mesi e i conteggi delle schede contano anche le importate (16/11/2026).
--
-- L'elenco dei documenti legge sempre `documenti_fiscali_elenco_con_importate` (nativi + fatture
-- importate da XML o ricostruite dalla prima nota), anche per chi fattura qui. La striscia dei mesi
-- e il numero sulle schede invece, per un'azienda «native», leggevano solo i nativi: un'azienda
-- passata a fatturare qui con centinaia di fatture importate vedeva «0 doc» in ogni mese e
-- «Fatture 1». Ora leggono la stessa vista dell'elenco, per tutti.
--
-- La striscia, inoltre:
-- - lavora per anno (`p_anno`): prima guardava solo gli ultimi 12 mesi, e l'anno prima restava
--   vuoto anche con le frecce;
-- - per ogni mese dà imponibile, IVA, incassato, da incassare e scaduto, che servono ai numeri
--   veloci sopra l'elenco. Si incassano solo i documenti che hanno un incasso (non bozze,
--   annullate, stornate, note di credito, DDT, preventivi, proforma); una «pagata» senza importo
--   registrato conta come incassata per intero.

DROP FUNCTION IF EXISTS public.get_documenti_monthly_timeline(uuid, text[]);

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
         and e.stato <> 'annullata'
         and e.deleted_at is null   -- la striscia conta cio' che la lista sa mostrare
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

CREATE OR REPLACE FUNCTION public.get_documenti_counts(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_result json;
begin
  perform public.assert_company_access(p_company_id);

  -- Stessa vista dell'elenco, per tutti: nativi + importate.
  select json_build_object(
    'fatture',      count(*) filter (where tipo in ('fattura', 'fattura_pa', 'autofattura', 'reverse_charge_interno', 'integrazione_servizi_estero', 'integrazione_beni_ue', 'integrazione_beni_extra_ue') and stato <> 'annullata' and deleted_at is null),
    'proforma',     count(*) filter (where tipo = 'proforma' and stato <> 'annullata' and deleted_at is null),
    'nota_credito', count(*) filter (where tipo = 'nota_credito' and stato <> 'annullata' and deleted_at is null),
    'ddt',          count(*) filter (where tipo = 'ddt' and stato <> 'annullata' and deleted_at is null),
    'preventivo',   count(*) filter (where tipo = 'preventivo' and stato <> 'annullata' and deleted_at is null),
    'annullate',    count(*) filter (where stato = 'annullata'),
    'cestinati',    count(*) filter (where deleted_at is not null)
  ) into v_result
  from public.documenti_fiscali_elenco_con_importate
  where company_id = p_company_id;

  return v_result;
end;
$function$;
