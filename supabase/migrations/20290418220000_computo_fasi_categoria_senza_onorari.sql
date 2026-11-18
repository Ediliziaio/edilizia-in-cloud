-- Fasi dal computo: la categoria, e niente onorari, casse e IVA (17/11/2026).
--
-- Prova coi due computi veri di un cantiere ecobonus + sismabonus (226 e 167 voci): la fase nasceva dalla
-- SUPER-categoria, che in questi computi è l'intero intervento. Il computo ECO diventava una fase «Eco» da
-- 1.948.331,82 € con 182 lavori dentro, più tre fasi «Oneri tecnici eco», «Iva lavori ecobonus» e «Visto di
-- conformità eco» (694.604,53 €) come se fossero lavori dell'impresa; il SISMA, stampato senza capitoli,
-- una fase «Senza capitolo» con dentro progettazione, direzione lavori, Inarcassa, visto e IVA.
--
-- Ora:
-- - la fase è la CATEGORIA (Oneri della sicurezza, Isolamento termico, Impianto termico, Infissi…), poi la
--   super-categoria, poi il capitolo: lo stesso ordine di `capitoloVoce` (src/lib/distinta/fasiMateriali.ts),
--   perché le scelte del browser (`p_fasi`) arrivano con quel nome;
-- - le voci che non sono lavori restano fuori: `computo_voce_non_lavoro`, la stessa regola di
--   src/lib/computo/vociNonLavori.ts (con i capitoli decidono i capitoli; senza, la descrizione).
-- Idempotente: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.computo_voce_non_lavoro(p_super text, p_categoria text, p_sotto text, p_descrizione text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when nullif(btrim(concat_ws(' | ', nullif(btrim(p_super), ''), nullif(btrim(p_categoria), ''), nullif(btrim(p_sotto), ''))), '') is not null
      then concat_ws(' | ', p_super, p_categoria, p_sotto)
           ~* 'oneri tecnici|\miva\M|visto di conformit|asseveraz|inarcassa|\mcassa\M|progettazion|spese tecniche'
    else btrim(coalesce(p_descrizione, ''))
           ~* '^(progettazione(\s+categoria|\s+[a-z]{1,2}\s?[0-9]|\s*$)|d\.?\s?l\.?\s|direzione (dei )?lavori|coordinament[oi] (della )?sicurezza|responsabile (dei )?lavori|asseverazion|inarcassa|cassa\M|iva\M|visto di conformit|ape (ante|post)|r\.?\s?l\.?\s)'
  end
$function$;

REVOKE ALL ON FUNCTION public.computo_voce_non_lavoro(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.computo_voce_non_lavoro(text, text, text, text) TO authenticated, service_role;

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
    select coalesce(nullif(btrim(v.categoria), ''), nullif(btrim(v.super_categoria), ''), nullif(btrim(v.capitolo_nome), ''), 'Senza capitolo') as capitolo,
           min(v.ordine) as primo,
           sum(case when coalesce(v.is_detrazione, false) then -1 else 1 end * coalesce(v.importo_computo, 0)) as venduto,
           bool_or(not coalesce(v.is_detrazione, false)) as con_lavori
      from public.computo_voci_estratte v
     where v.computo_upload_id = p_computo_id and coalesce(v.is_included, true)
       and coalesce(v.quantita, 1) <> 0
       and not public.computo_voce_non_lavoro(v.super_categoria, v.categoria, v.sotto_categoria, v.descrizione_breve)
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
         and not public.computo_voce_non_lavoro(v.super_categoria, v.categoria, v.sotto_categoria, v.descrizione_breve)
         and coalesce(nullif(btrim(v.categoria), ''), nullif(btrim(v.super_categoria), ''), nullif(btrim(v.capitolo_nome), ''), 'Senza capitolo') = c.capitolo
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
