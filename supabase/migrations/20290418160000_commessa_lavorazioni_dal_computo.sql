-- Commessa creata direttamente dal computo: le lavorazioni, non solo i materiali (17/11/2026).
--
-- Simulazione con un computo PriMus vero (182 voci di lavoro, 1.948.331,82 €), commessa creata
-- senza preventivo e computo caricato in «Genera dal computo»: nascevano 165 materiali in 6 fasi,
-- ma le fasi erano vuote (nessun importo venduto, nessuna sottofase, nessuna voce), e il capitolo
-- «Oneri della sicurezza» (153.873,55 €, senza materiali) non diventava nemmeno una fase. Niente
-- avanzamento, niente margine per fase. La strada del preventivo
-- (`crea_commessa_preventivo_atomic`, ramo computo) invece le crea.
--
-- `commessa_lavorazioni_dal_computo` fa lo stesso a partire dal computo della commessa
-- (`computo_uploads` / `computo_voci_estratte`):
-- - un capitolo (come lo legge `capitoloVoce`: super-categoria, categoria, capitolo) = una fase: quella indicata in `p_fasi` ({capitolo: {id} | {nome}}), altrimenti
--   una fase con lo stesso nome, altrimenti una nuova;
-- - una voce = una sottofase con la sua voce prevista; le detrazioni riducono la fase (voce
--   negativa, senza sottofase), come nel ramo del preventivo;
-- - il venduto della fase è la somma delle sue voci, se la fase non ne ha già uno;
-- - il costo previsto viene SOLO da un listino a monte: la tariffa aziendale abbinata alla voce o
--   con lo stesso codice. Senza listino la voce resta senza costo (la commessa mostra «—»).
-- Si rifiuta se la commessa ha già delle voci previste: niente doppioni.

CREATE OR REPLACE FUNCTION public.commessa_lavorazioni_dal_computo(p_order_id uuid, p_computo_id uuid, p_fasi jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.orders%rowtype;
  c record;
  r record;
  v_scelta jsonb;
  v_fase uuid;
  v_sotto uuid;
  v_pos_fase integer;
  v_pos_sotto integer;
  v_importo numeric;
  v_costo numeric;
  v_mano numeric;
  v_fasi integer := 0;
  v_nuove integer := 0;
  v_voci integer := 0;
  v_con_costo integer := 0;
begin
  if auth.uid() is null then raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.deleted_at is not null then raise exception 'Commessa non trovata.' using errcode = 'P0002'; end if;
  perform public.assert_company_access(o.company_id);
  if public.has_permission_for_company(auth.uid(), 'can_edit_orders', o.company_id) is not true then
    raise exception 'Non hai il permesso di modificare le commesse.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.computo_uploads u where u.id = p_computo_id and u.order_id = o.id and u.company_id = o.company_id) then
    raise exception 'Il computo non è di questa commessa.' using errcode = '22023';
  end if;
  if exists (select 1 from public.order_work_phase_voci where order_id = o.id) then
    raise exception 'La commessa ha già le sue lavorazioni: dal computo si aggiungono solo i materiali.' using errcode = '22023';
  end if;

  select coalesce(max(position), -1) + 1 into v_pos_fase from public.order_work_phases where order_id = o.id;

  for c in
    select coalesce(nullif(btrim(v.super_categoria), ''), nullif(btrim(v.categoria), ''), nullif(btrim(v.capitolo_nome), ''), 'Senza capitolo') as capitolo,
           min(v.ordine) as primo,
           sum(case when coalesce(v.is_detrazione, false) then -1 else 1 end * coalesce(v.importo_computo, 0)) as venduto,
           bool_or(not coalesce(v.is_detrazione, false)) as con_lavori
      from public.computo_voci_estratte v
     where v.computo_upload_id = p_computo_id and coalesce(v.is_included, true)
       and coalesce(v.quantita, 1) <> 0
     group by 1
     order by 2
  loop
    continue when not c.con_lavori;
    v_scelta := coalesce(p_fasi -> c.capitolo, '{}'::jsonb);
    v_fase := null;
    if nullif(v_scelta ->> 'id', '') is not null then
      select id into v_fase from public.order_work_phases
       where id = (v_scelta ->> 'id')::uuid and order_id = o.id;
    end if;
    if v_fase is null then
      select id into v_fase from public.order_work_phases
       where order_id = o.id and lower(btrim(name)) = lower(btrim(coalesce(nullif(v_scelta ->> 'nome', ''), c.capitolo)))
       order by position limit 1;
    end if;
    if v_fase is null then
      insert into public.order_work_phases(company_id, order_id, name, position, notes)
      values (o.company_id, o.id, left(coalesce(nullif(btrim(v_scelta ->> 'nome'), ''), c.capitolo), 160), v_pos_fase, 'Dal computo')
      returning id into v_fase;
      v_pos_fase := v_pos_fase + 1;
      v_nuove := v_nuove + 1;
    end if;
    v_fasi := v_fasi + 1;
    update public.order_work_phases set importo_venduto = greatest(round(c.venduto, 2), 0)
     where id = v_fase and importo_venduto is null;

    select coalesce(max(position), -1) + 1 into v_pos_sotto from public.order_work_subphases where phase_id = v_fase;
    for r in
      select v.*, t.id as t_id, t.prezzo_costo as t_costo, t.costo_interno as t_interno, t.incidenza_manodopera_pct as t_incidenza
        from public.computo_voci_estratte v
        left join lateral (
          select t.* from public.tariffe_aziendali t
           where t.company_id = o.company_id and coalesce(t.attiva, true)
             and (t.id = v.matched_tariffa_id
                  or (nullif(btrim(coalesce(v.codice_prezzario, v.codice_tariffa, v.codice_voce)), '') is not null
                      and t.codice = btrim(coalesce(v.codice_prezzario, v.codice_tariffa, v.codice_voce))))
           order by (t.id = v.matched_tariffa_id) desc, t.created_at
           limit 1
        ) t on true
       where v.computo_upload_id = p_computo_id and coalesce(v.is_included, true)
         and coalesce(v.quantita, 1) <> 0
         and coalesce(nullif(btrim(v.super_categoria), ''), nullif(btrim(v.categoria), ''), nullif(btrim(v.capitolo_nome), ''), 'Senza capitolo') = c.capitolo
       order by v.ordine, v.id
    loop
      v_importo := round(coalesce(r.importo_computo, 0), 2);
      if coalesce(r.is_detrazione, false) then
        insert into public.order_work_phase_voci(company_id, order_id, phase_id, position, descrizione, unita, quantita,
          costo_manodopera, costo_materiali, importo, tariffa_id, origine, origine_id, origine_codice, subphase_id)
        values (o.company_id, o.id, v_fase, v_pos_sotto, r.descrizione_breve, nullif(r.unita_misura, ''), abs(coalesce(r.quantita, 1)),
          0, 0, -abs(v_importo), null, 'computo', r.id, nullif(btrim(coalesce(r.codice_prezzario, r.codice_voce)), ''), null)
        on conflict do nothing;
      else
        insert into public.order_work_subphases(phase_id, name, position, peso)
        values (v_fase, left(coalesce(nullif(btrim(split_part(r.descrizione_breve, E'\n', 1)), ''), 'Voce'), 160), v_pos_sotto, 1)
        returning id into v_sotto;
        -- Il costo solo da un listino a monte; senza, la voce resta senza costo.
        v_costo := coalesce(nullif(r.t_costo, 0), nullif(r.t_interno, 0), 0);
        v_mano := case when r.t_incidenza between 0 and 100 then round(v_costo * r.t_incidenza / 100, 4) else v_costo end;
        if v_costo > 0 then v_con_costo := v_con_costo + 1; end if;
        insert into public.order_work_phase_voci(company_id, order_id, phase_id, position, descrizione, unita, quantita,
          costo_manodopera, costo_materiali, importo, tariffa_id, origine, origine_id, origine_codice, subphase_id)
        values (o.company_id, o.id, v_fase, v_pos_sotto, r.descrizione_breve, nullif(r.unita_misura, ''), abs(coalesce(r.quantita, 1)),
          greatest(v_mano, 0), greatest(v_costo - v_mano, 0), v_importo, r.t_id,
          'computo', r.id, nullif(btrim(coalesce(r.codice_prezzario, r.codice_voce)), ''), v_sotto)
        on conflict do nothing;
      end if;
      v_pos_sotto := v_pos_sotto + 1;
      v_voci := v_voci + 1;
    end loop;
  end loop;

  return jsonb_build_object('fasi', v_fasi, 'fasi_nuove', v_nuove, 'voci', v_voci, 'voci_con_costo', v_con_costo);
end;
$function$;

REVOKE ALL ON FUNCTION public.commessa_lavorazioni_dal_computo(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commessa_lavorazioni_dal_computo(uuid, uuid, jsonb) TO authenticated, service_role;
