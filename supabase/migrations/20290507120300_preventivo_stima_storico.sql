-- I consuntivi di commessa sono confrontabili con una voce quando il perimetro
-- commerciale coincide con quella voce e la quantità eseguita è registrata.
create or replace function private.preventivo_riferimenti_storici(
  p_azienda uuid, p_codice text, p_descrizione text, p_tariffa uuid, p_preventivo uuid
)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(public.utente_bloccato(), true)
    or coalesce(public.e_solo_campo(), true) or coalesce(public.utente_e_cliente_esterno(), true)
    or not coalesce(public.user_can_access_company(p_azienda), false)
    or not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_preventivi', p_azienda), false)
    or not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_costs', p_azienda), false)
    or not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_margins', p_azienda), false)
    or not exists (select 1 from public.resolve_company_feature(p_azienda, 'preventivi_analisi_costi') f
       where f.is_enabled and f.access_level::text = 'enabled') then
    raise exception 'Storico costi non disponibile per questo utente' using errcode = '42501';
  end if;

  return (
    with parole as (
      select distinct parola from regexp_split_to_table(
        lower(left(coalesce(p_descrizione, ''), 500)), '[^[:alnum:]]+'
      ) as parole(parola) where char_length(parola) >= 4
    ), lavori as materialized (
      select v.id, v.descrizione, v.origine_codice, v.tariffa_id, v.unita, v.quantita as quantita_contratto,
             f.id as fase_id, s.id as sottofase_id,
             s.quantita_fatta, o.id as commessa_id, o.order_code, o.tipo_lavoro, o.distanza_sede_km,
             o.total_amount, greatest(f.completata_il, s.fatta_il) as completata_il,
             lower(btrim(v.origine_codice)) = lower(nullif(btrim(p_codice), ''))
               or v.tariffa_id = p_tariffa as stesso_codice,
             r.diritti
      from public.order_work_phase_voci v
      join public.orders o on o.id = v.order_id and o.company_id = v.company_id
      join public.order_work_phases f on f.id = v.phase_id and f.order_id = o.id and f.company_id = o.company_id
      join public.order_work_subphases s on s.id = v.subphase_id and s.phase_id = f.id
      cross join lateral (select private.office_order_rights(o.id) as diritti offset 0) r
      where v.company_id = p_azienda and o.deleted_at is null
        and (p_preventivo is null or o.quote_id is distinct from p_preventivo)
        and f.status = 'completata' and s.fatta and s.quantita_fatta > 0
        and greatest(f.completata_il, s.fatta_il) <= now()
        and not exists (select 1 from public.order_work_phases altra
          where altra.order_id = o.id and altra.status is distinct from 'completata')
        and not exists (select 1 from public.order_work_phase_voci altra
          where altra.order_id = o.id and altra.id <> v.id)
        and (r.diritti->>'costs')::boolean and (r.diritti->>'margins')::boolean
        and (lower(btrim(v.origine_codice)) = lower(nullif(btrim(p_codice), '')) or v.tariffa_id = p_tariffa
          or exists (select 1 from parole where strpos(lower(v.descrizione), parola) > 0))
      order by stesso_codice desc nulls last,
        (lower(btrim(v.descrizione)) = lower(btrim(p_descrizione))) desc nulls last, completata_il desc, v.id
      limit 100
    ), costi as (
      select l.*, b.costo_acquisti + b.costo_materiali_magazzino as acquisti,
             coalesce(operai.costo, 0) as operai, coalesce(operai.ore, 0) as ore,
             esterni.giorni as giorni_ditta, consegne.giorni as giorni_consegna,
             greatest(b.costo_manodopera - coalesce(operai.costo, 0), 0)
               + coalesce(diretti.ditte, 0) + coalesce(private.sal_sub_da_fatturare(l.commessa_id), 0) as ditte,
             coalesce(diretti.mezzi, 0) as mezzi, coalesce(diretti.altri, 0) as altri,
             coalesce(diretti.trasporti, 0) + coalesce(km.importo, 0) as trasporti,
             km.km as km_rimborsati, km.importo / nullif(km.km, 0) as tariffa_km,
             case when (l.diritti->>'amounts')::boolean and l.quantita_contratto > 0
               and l.total_amount > 0 then l.total_amount / l.quantita_contratto end as venduto_unitario
      from lavori l
      join private.office_order_economics_base b on b.id = l.commessa_id and b.company_id = p_azienda
      left join lateral (
        select sum(e.hours_worked) as ore, sum(e.total_cost) as costo,
               bool_or(e.hours_worked > 0 and coalesce(e.total_cost, 0) = 0) as senza_tariffa
        from public.order_employees e where e.order_id = l.commessa_id
      ) operai on true
      left join lateral (
        select nullif(count(distinct r.data_lavoro), 0) as giorni
        from public.campo_rapportini r
        where r.order_id = l.commessa_id and r.company_id = p_azienda
          and r.stato = 'approvato' and r.annullato_at is null and r.role_type = 'subcontractor'
          and r.data_lavoro <= (l.completata_il at time zone 'Europe/Rome')::date
          and exists (
            select from jsonb_array_elements(case when jsonb_typeof(r.fasi_lavorate) = 'array'
              then r.fasi_lavorate else '[]'::jsonb end) f
            where f->>'phase_id' = l.fase_id::text and (
              (f->'sottofasi_fatte') ? l.sottofase_id::text or (f->'sottofasi_lavorate') ? l.sottofase_id::text
              or (f->'sottofasi_avanzate') @> jsonb_build_array(jsonb_build_object('id', l.sottofase_id))
            )
          )
      ) esterni on true
      left join lateral (
        -- Tempi di fornitura verificabili dall'invio alla ricezione di ogni ODA.
        -- Se un acquisto rilevante manca delle date, l'attesa storica resta sconosciuta.
        select case when count(*) = count(*) filter (where giorni >= 0)
          then max(giorni) end as giorni
        from (
          select case when po.actual_delivery_date <= (l.completata_il at time zone 'Europe/Rome')::date
            then po.actual_delivery_date - (po.sent_at at time zone 'Europe/Rome')::date end as giorni
          from public.purchase_orders po where po.company_id = p_azienda and po.order_id = l.commessa_id
            and po.status = 'ricevuto'
        ) tempi
      ) consegne on true
      left join lateral (
        select sum(k.km) as km, sum(k.importo) as importo
        from public.hr_rimborsi_km k where k.order_id = l.commessa_id and k.company_id = p_azienda
          and k.stato in ('approvato', 'rimborsato')
      ) km on true
      left join lateral (
        select sum(x.importo) filter (where x.tipo = 'subappalto') as ditte,
               sum(x.importo) filter (where x.tipo = 'mezzi') as mezzi,
               sum(x.importo) filter (where x.tipo = 'trasporto') as trasporti,
               sum(x.importo) filter (where x.tipo = 'altro') as altri
        from (
          select case
            when lower(btrim(c.category)) in ('trasporto', 'trasporti', 'logistica', 'smaltimento')
              or btrim(c.name) ~* '^(trasport[oi]|spedizion[ei]|smaltimento|rimborso km)\y' then 'trasporto'
            when s.tipo = 'subappalto' or s.subappaltatore_id is not null then 'subappalto'
            when s.tipo in ('mezzi', 'noli_servizi') or c.mezzo_id is not null then 'mezzi'
            else 'altro' end as tipo,
            case when jsonb_array_length(a.riparto) = 0 then c.amount else c.amount * q.pct / 100 end as importo
          from public.company_costs c
          left join public.suppliers s on s.id = c.supplier_id and s.company_id = c.company_id
          cross join lateral (select case when jsonb_typeof(c.allocations) = 'array'
            then c.allocations else '[]'::jsonb end as riparto) a
          left join lateral (
            select sum(case when v->>'pct' ~ '^[0-9]+(\.[0-9]+)?$' then (v->>'pct')::numeric end) as pct
            from jsonb_array_elements(a.riparto) v where v->>'order_id' = l.commessa_id::text
          ) q on true
          where c.company_id = p_azienda and c.annullato_il is null
            and c.purchase_order_id is null and c.order_external_team_id is null
            and (q.pct > 0 or (jsonb_array_length(a.riparto) = 0 and c.order_id = l.commessa_id))
        ) x
      ) diretti on true
      where not coalesce(operai.senza_tariffa, false)
        and b.movimenti_magazzino_senza_costo = 0 and b.numero_rimborsi_km_da_approvare = 0
        and not exists (
          select 1 from public.purchase_orders po where po.company_id = p_azienda and po.order_id = l.commessa_id
            and (
              po.status in ('inviato', 'confermato', 'parziale')
              or (po.status = 'ricevuto' and exists (
                select 1 from public.purchase_order_items i where i.purchase_order_id = po.id
                  and i.company_id = po.company_id and (i.price_pending or i.description ~*
                    '^[[:space:]]*(trasport[oi]|spedizion[ei]|smaltimento|noleggi[oi])\y')
              ))
            )
        )
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', k.id, 'commessaId', k.commessa_id, 'numero', k.order_code, 'codice', k.origine_codice,
      'descrizione', k.descrizione, 'tipoLavoro', k.tipo_lavoro, 'unita', k.unita,
      'quantita', k.quantita_fatta, 'completataIl', k.completata_il,
      'stessoCodice', coalesce(k.stesso_codice, false), 'ore', k.ore,
      'giorniDitta', k.giorni_ditta, 'giorniConsegna', k.giorni_consegna,
      'kmAndata', case when k.distanza_sede_km >= 0 then k.distanza_sede_km end,
      'kmRimborsati', k.km_rimborsati, 'tariffaKm', k.tariffa_km, 'vendutoUnitario', k.venduto_unitario,
      'costi', jsonb_build_object('acquisti', k.acquisti, 'operai', k.operai, 'ditte', k.ditte,
        'mezzi', k.mezzi, 'altri', k.altri, 'trasporti', k.trasporti)
    ) order by k.completata_il desc, k.id), '[]'::jsonb)
    from costi k
    where k.acquisti >= 0 and k.operai >= 0 and k.ore >= 0 and k.ditte >= 0
      and k.mezzi >= 0 and k.altri >= 0 and k.trasporti >= 0
      and k.acquisti + k.operai + k.ditte + k.mezzi + k.altri > 0
      and (k.ditte > 0 or (
        not exists (select 1 from public.order_external_teams d where d.order_id = k.commessa_id)
        and not exists (select 1 from public.contratti_subappalto c
          where c.company_id = p_azienda and c.order_id = k.commessa_id and c.stato in ('attivo', 'completato', 'sospeso'))
      ))
  );
end;
$$;
revoke all on function private.preventivo_riferimenti_storici(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function private.preventivo_riferimenti_storici(uuid, text, text, uuid, uuid) to authenticated;

create or replace function public.preventivo_riferimenti_storici(
  p_azienda uuid, p_codice text, p_descrizione text, p_tariffa uuid, p_preventivo uuid
)
returns jsonb
language sql stable security invoker
set search_path = ''
as $$
  select private.preventivo_riferimenti_storici(p_azienda, p_codice, p_descrizione, p_tariffa, p_preventivo);
$$;
revoke all on function public.preventivo_riferimenti_storici(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.preventivo_riferimenti_storici(uuid, text, text, uuid, uuid) to authenticated;
