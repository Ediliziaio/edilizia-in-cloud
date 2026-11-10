-- ============================================================================
-- Subappalto dal computo, lotti 1-3: correzioni dalla revisione indipendente
-- del 10/11/2026 (prima della pubblicazione, nessun dato reale toccato).
--
-- listino_ditta_salva
--   1. Il prezzo riaperto tiene il `created_at` di quello che chiude: a parità
--      di ordine il «principale» è il più vecchio, e senza questo dopo un
--      salvataggio diventava principale un altro prezzo della ditta («con
--      smontaggio»).
--   2. Un prezzo scritto da una data che precede un prezzo già fissato per il
--      futuro si ferma il giorno prima di quello: niente due prezzi aperti.
--   3. Togliere un prezzo nato in quel giorno lo cancella; se un preventivo lo
--      usa già (FK di preventivo_manodopera_assegnazioni) lo spegne invece di
--      fallire con un errore tecnico.
--   4. Alla fine ricalcola il previsto delle ditte sulle fasi delle commesse
--      NON chiuse dove lavora la ditta (come quando cambiano le voci).
-- voci_abbina_listino
--   5. Un solo UPDATE per tutte le voci (prima uno per voce, e il trigger delle
--      voci ricalcolava la fase a ogni riga: 643 voci a Villa Ida).
-- unita_normalizzata
--   6. Anche il trattino basso si toglie: «a_corpo» del listino = «a corpo»,
--      come in normalizzaUnita (src/lib/prezzario/confronto.ts).
-- Dal controllo degli accessi (guardiano, stesso giorno):
--   7. Su tariffa_costi_varianti squadra e voce devono essere della STESSA
--      azienda del prezzo (chiavi esterne composte, come su tariffe_aziendali).
--      Prima l'amministratore di un'azienda B poteva scrivere nella sua azienda
--      un prezzo che punta a squadra e voce di un'azienda A: invisibile ad A, ma
--      ditte_ricalcola_previsto (DEFINER) lo usava per il previsto di A, e
--      squadra_anagrafica_al_listino faceva fallire il collegamento di A.
--      Provato prima/dopo in transazione annullata; in produzione 0 righe così.
--   8. ditte_ricalcola_previsto e squadra_anagrafica_al_listino filtrano anche
--      per azienda. ditte_ricalcola_previsto resta solo del service role: dal
--      listino si passa per listino_ditta_ricalcola_previsto, che controlla i
--      permessi di chi salva.
-- ============================================================================

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 6 ---------------------------------------------------------------------------
create or replace function public.unita_normalizzata(p_unita text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
    '{"mq":"m2","m2":"m2","metroquadro":"m2","metriquadri":"m2","metroquadrato":"m2","mc":"m3","m3":"m3","metrocubo":"m3","metricubi":"m3","ml":"m","m":"m","mt":"m","metro":"m","metrolineare":"m","metrilineari":"m","cad":"cad","pz":"cad","pezzo":"cad","pezzi":"cad","n":"cad","nr":"cad","num":"cad","cadauno":"cad","kg":"kg","chilogrammo":"kg","chili":"kg","t":"t","ton":"t","tonnellata":"t","h":"h","ora":"h","ore":"h","l":"l","lt":"l","litro":"l","litri":"l","acorpo":"a corpo","acorpo1":"a corpo","corpo":"a corpo","ac":"a corpo","forfait":"a corpo","aforfait":"a corpo","fisso":"a corpo","gg":"gg","giorno":"gg","giorni":"gg","giornata":"gg","giornate":"gg","mese":"mese","mesi":"mese","paio":"paio","paia":"paio","km":"km","chilometro":"km","chilometri":"km","piano":"piano","piani":"piano"}'
      ::jsonb ->> x.t,
    x.t)
  from (select translate(regexp_replace(lower(coalesce(p_unita, '')), '[[:space:]._]', '', 'g'), '²³', '23') as t) x
$$;
revoke all on function public.unita_normalizzata(text) from public, anon;
grant execute on function public.unita_normalizzata(text) to authenticated, service_role;

-- 4 (il passaggio) -------------------------------------------------------------
-- ditte_ricalcola_previsto è solo del service role. Chi salva il listino della
-- ditta passa da qui: si controllano i suoi permessi sull'azienda della ditta e
-- si ricalcolano solo fasi di quell'azienda.
create or replace function public.listino_ditta_ricalcola_previsto(p_subappaltatore uuid, p_fasi uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_azienda uuid;
  v_fasi uuid[];
begin
  select s.company_id into v_azienda from public.subappaltatori s where s.id = p_subappaltatore;
  if v_azienda is null
     or not (public.has_permission_for_company(auth.uid(), 'can_edit_settings_pricing', v_azienda)
             and public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda)) then
    raise exception using errcode = '42501', message = 'Permessi insufficienti per ricalcolare il previsto delle ditte.';
  end if;
  select array_agg(f.id) into v_fasi
    from public.order_work_phases f
    join public.orders o on o.id = f.order_id
   where f.id = any(p_fasi) and o.company_id = v_azienda
     and coalesce(o.status, '') not in ('completato', 'completed');
  if v_fasi is not null then
    perform public.ditte_ricalcola_previsto(v_fasi);
  end if;
end;
$$;
revoke all on function public.listino_ditta_ricalcola_previsto(uuid, uuid[]) from public, anon;
grant execute on function public.listino_ditta_ricalcola_previsto(uuid, uuid[]) to authenticated, service_role;

-- 1-4 -------------------------------------------------------------------------
create or replace function public.listino_ditta_salva(p_subappaltatore uuid, p_valido_dal date, p_righe jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_azienda uuid;
  v_nome text;
  v_squadra uuid;
  r jsonb;
  v_tariffa uuid;
  v_costo numeric;
  v_att public.tariffa_costi_varianti%rowtype;
  v_trovato boolean;
  v_fine date;
  v_fasi uuid[];
  n_nuovi int := 0;
  n_corretti int := 0;
  n_chiusi int := 0;
  n_uguali int := 0;
begin
  if p_valido_dal is null then
    raise exception using errcode = '22023', message = 'Manca la data da cui valgono i prezzi.';
  end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' then
    raise exception using errcode = '22023', message = 'Le righe del listino non sono un elenco.';
  end if;

  select s.company_id, s.ragione_sociale into v_azienda, v_nome
    from public.subappaltatori s where s.id = p_subappaltatore;
  if v_azienda is null then
    raise exception using errcode = '42501', message = 'Subappaltatore non trovato.';
  end if;
  if not (public.has_permission_for_company(auth.uid(), 'can_edit_settings_pricing', v_azienda)
          and public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda)) then
    raise exception using errcode = '42501',
      message = 'Per scrivere il listino di una ditta servono i permessi sul listino e sui costi.';
  end if;

  select e.id into v_squadra from public.external_teams e
   where e.subappaltatore_id = p_subappaltatore and e.company_id = v_azienda
   order by e.is_active desc nulls last, e.created_at
   limit 1;

  for r in select value from jsonb_array_elements(p_righe) loop
    v_tariffa := nullif(r->>'tariffa_id', '')::uuid;
    v_costo := nullif(r->>'costo', '')::numeric;
    if v_tariffa is null then
      raise exception using errcode = '22023', message = 'Una riga del listino non dice a quale voce si riferisce.';
    end if;
    if v_costo is not null and (v_costo < 0 or v_costo >= 'Infinity'::numeric) then
      raise exception using errcode = '22023', message = 'Un prezzo della ditta non è valido.';
    end if;
    if not exists (select 1 from public.tariffe_aziendali t where t.id = v_tariffa and t.company_id = v_azienda) then
      raise exception using errcode = '22023', message = 'Una voce del listino non è di questa azienda.';
    end if;

    select v.* into v_att
      from public.tariffa_costi_varianti v
     where v.tariffa_id = v_tariffa
       and v.subappaltatore_id = p_subappaltatore
       and v.attivo
       and v.valid_from <= p_valido_dal
       and (v.valid_to is null or v.valid_to >= p_valido_dal)
     order by v.is_default desc, v.sort_order, v.created_at
     limit 1
     for update;
    v_trovato := found;

    -- Il primo prezzo della ditta già fissato DOPO la data: il nuovo si ferma il giorno prima (2).
    select min(f.valid_from) - 1 into v_fine
      from public.tariffa_costi_varianti f
     where f.tariffa_id = v_tariffa and f.subappaltatore_id = p_subappaltatore
       and f.attivo and f.valid_from > p_valido_dal;

    if v_costo is null then
      if v_trovato then
        if v_att.valid_from >= p_valido_dal then
          begin
            delete from public.tariffa_costi_varianti where id = v_att.id;
          exception when foreign_key_violation then
            -- Già usato in un preventivo: si spegne, la storia del preventivo resta (3).
            update public.tariffa_costi_varianti set attivo = false, is_default = false where id = v_att.id;
          end;
        else
          update public.tariffa_costi_varianti set valid_to = p_valido_dal - 1, is_default = false where id = v_att.id;
        end if;
        n_chiusi := n_chiusi + 1;
      end if;
    elsif v_trovato then
      if v_att.costo = v_costo then
        n_uguali := n_uguali + 1;
      elsif v_att.valid_from >= p_valido_dal then
        update public.tariffa_costi_varianti set costo = v_costo where id = v_att.id;
        n_corretti := n_corretti + 1;
      else
        update public.tariffa_costi_varianti set valid_to = p_valido_dal - 1, is_default = false where id = v_att.id;
        insert into public.tariffa_costi_varianti
          (company_id, tariffa_id, nome, descrizione, modalita_contabile, external_team_id, subappaltatore_id,
           costo, valid_from, valid_to, is_default, attivo, sort_order, created_at)
        values
          (v_att.company_id, v_att.tariffa_id, v_att.nome, v_att.descrizione, v_att.modalita_contabile, v_att.external_team_id,
           p_subappaltatore, v_costo, p_valido_dal,
           case when v_att.valid_to is null then v_fine when v_fine is null then v_att.valid_to else least(v_att.valid_to, v_fine) end,
           v_att.is_default, true, v_att.sort_order,
           v_att.created_at);  -- (1) resta il principale
        n_nuovi := n_nuovi + 1;
      end if;
    else
      insert into public.tariffa_costi_varianti
        (company_id, tariffa_id, nome, modalita_contabile, external_team_id, subappaltatore_id, costo, valid_from, valid_to, is_default)
      values
        (v_azienda, v_tariffa, coalesce(nullif(trim(v_nome), ''), 'Prezzo della ditta'), 'subappalto_fatturato', v_squadra,
         p_subappaltatore, v_costo, p_valido_dal, v_fine, false);
      n_nuovi := n_nuovi + 1;
    end if;
  end loop;

  -- (4) Il previsto delle ditte «dal preventivo» segue il listino nuovo, solo sulle commesse aperte.
  if n_nuovi + n_corretti + n_chiusi > 0 then
    select array_agg(distinct oet.phase_id) into v_fasi
      from public.order_external_teams oet
      join public.external_teams e on e.id = oet.external_team_id
      join public.orders o on o.id = oet.order_id
     where e.subappaltatore_id = p_subappaltatore
       and o.company_id = v_azienda
       and oet.phase_id is not null
       and oet.costo_origine = 'preventivo'
       and coalesce(o.status, '') not in ('completato', 'completed');
    if v_fasi is not null then
      perform public.listino_ditta_ricalcola_previsto(p_subappaltatore, v_fasi);
    end if;
  end if;

  return jsonb_build_object('nuovi', n_nuovi, 'corretti', n_corretti, 'chiusi', n_chiusi, 'uguali', n_uguali);
end;
$$;
revoke all on function public.listino_ditta_salva(uuid, date, jsonb) from public, anon;
grant execute on function public.listino_ditta_salva(uuid, date, jsonb) to authenticated, service_role;

-- 5 ---------------------------------------------------------------------------
create or replace function public.voci_abbina_listino(p_order uuid, p_abbinamenti jsonb, p_ricorda boolean default true)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_azienda uuid;
  v_ids uuid[];
  n_trovate int;
  n_collegate int := 0;
  n_scollegate int := 0;
  n_ricordate int := 0;
begin
  if p_abbinamenti is null or jsonb_typeof(p_abbinamenti) <> 'array' then
    raise exception using errcode = '22023', message = 'Gli abbinamenti non sono un elenco.';
  end if;
  select o.company_id into v_azienda from public.orders o where o.id = p_order;
  if v_azienda is null then
    raise exception using errcode = '42501', message = 'Commessa non trovata.';
  end if;
  if not (public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda)
          and public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda)) then
    raise exception using errcode = '42501',
      message = 'Per collegare le voci al listino servono i permessi sulle commesse e sui costi.';
  end if;

  select array_agg(distinct x.voce_id) into v_ids
    from jsonb_to_recordset(p_abbinamenti) as x(voce_id uuid, tariffa_id uuid, chiave text)
   where x.voce_id is not null;
  if v_ids is null then
    return jsonb_build_object('collegate', 0, 'scollegate', 0, 'ricordate', 0);
  end if;

  -- Le voci sono tutte di questa commessa, e restano bloccate mentre si scrive.
  perform 1 from public.order_work_phase_voci v where v.id = any(v_ids) and v.order_id = p_order for update;
  select count(*) into n_trovate from public.order_work_phase_voci v where v.id = any(v_ids) and v.order_id = p_order;
  if n_trovate <> cardinality(v_ids) then
    raise exception using errcode = '22023', message = 'Una voce non è di questa commessa.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_abbinamenti) as x(voce_id uuid, tariffa_id uuid, chiave text)
     where x.tariffa_id is not null and not exists (
       select 1 from public.tariffe_aziendali t
        where t.id = x.tariffa_id and t.company_id = v_azienda
          and t.external_team_id is null and t.subappaltatore_id is null)) then
    raise exception using errcode = '22023',
      message = 'Si collega solo a una voce del listino dell''azienda, non a una voce propria di una ditta.';
  end if;

  -- Un solo UPDATE: il trigger delle voci ricalcola le fasi una volta sola.
  with a as (
    select distinct on (x.voce_id) x.voce_id, x.tariffa_id
      from jsonb_to_recordset(p_abbinamenti) as x(voce_id uuid, tariffa_id uuid, chiave text)
     where x.voce_id is not null
  )
  update public.order_work_phase_voci v set tariffa_id = a.tariffa_id
    from a
   where v.id = a.voce_id and v.tariffa_id is distinct from a.tariffa_id;

  select count(*) filter (where y.tariffa_id is not null), count(*) filter (where y.tariffa_id is null)
    into n_collegate, n_scollegate
    from (select distinct on (x.voce_id) x.voce_id, x.tariffa_id
            from jsonb_to_recordset(p_abbinamenti) as x(voce_id uuid, tariffa_id uuid, chiave text)
           where x.voce_id is not null) y;

  if p_ricorda then
    -- L'ultima scelta vince: per la stessa descrizione resta un solo abbinamento ricordato.
    with a as (
      select distinct on (k.chiave) k.chiave, k.tariffa_id from (
        select nullif(trim(left(lower(trim(x.chiave)), 300)), '') as chiave, x.tariffa_id
          from jsonb_to_recordset(p_abbinamenti) as x(voce_id uuid, tariffa_id uuid, chiave text)
         where x.tariffa_id is not null) k
       where k.chiave is not null
    )
    delete from public.product_aliases p
     using a
     where p.company_id = v_azienda and p.learned_from = 'voce_computo'
       and p.alias_normalized = a.chiave and p.tariffa_id is distinct from a.tariffa_id;

    with a as (
      select distinct on (k.chiave) k.chiave, k.tariffa_id from (
        select nullif(trim(left(lower(trim(x.chiave)), 300)), '') as chiave, x.tariffa_id
          from jsonb_to_recordset(p_abbinamenti) as x(voce_id uuid, tariffa_id uuid, chiave text)
         where x.tariffa_id is not null) k
       where k.chiave is not null
    )
    insert into public.product_aliases (company_id, alias_text, tariffa_id, confidence, learned_from, use_count, last_used_at, created_by)
    select v_azienda, a.chiave, a.tariffa_id, 1, 'voce_computo', 1, now(), auth.uid() from a
    on conflict (company_id, alias_normalized, tariffa_id) where tariffa_id is not null
    do update set use_count = public.product_aliases.use_count + 1, last_used_at = now();
    get diagnostics n_ricordate = row_count;
  end if;

  return jsonb_build_object('collegate', n_collegate, 'scollegate', n_scollegate, 'ricordate', n_ricordate);
end;
$$;
revoke all on function public.voci_abbina_listino(uuid, jsonb, boolean) from public, anon;
grant execute on function public.voci_abbina_listino(uuid, jsonb, boolean) to authenticated, service_role;

-- 7. Chiavi esterne composte (8 righe in tutto: la verifica è istantanea) ------
alter table public.tariffa_costi_varianti
  drop constraint if exists tariffa_costi_varianti_squadra_stessa_azienda;
alter table public.tariffa_costi_varianti
  add constraint tariffa_costi_varianti_squadra_stessa_azienda
  foreign key (company_id, external_team_id)
  references public.external_teams (company_id, id) on delete cascade;

alter table public.tariffa_costi_varianti
  drop constraint if exists tariffa_costi_varianti_voce_stessa_azienda;
alter table public.tariffa_costi_varianti
  add constraint tariffa_costi_varianti_voce_stessa_azienda
  foreign key (company_id, tariffa_id)
  references public.tariffe_aziendali (company_id, id) on delete cascade;

-- 8a. Il costo previsto prende solo prezzi dell'azienda della commessa ---------
create or replace function public.ditte_ricalcola_previsto(p_fasi uuid[])
returns void
language sql
security definer
set search_path to ''
as $function$
  with sole as (
    select oet.id, oet.phase_id, oet.external_team_id, e.subappaltatore_id, o.company_id,
           coalesce(oet.vat_rate, 0) as iva
      from public.order_external_teams oet
      join public.orders o on o.id = oet.order_id
      left join public.external_teams e on e.id = oet.external_team_id and e.company_id = o.company_id
     where oet.phase_id = any(p_fasi)
       and oet.costo_origine = 'preventivo'
       and oet.external_team_id is not null
       and (select count(*) from public.order_external_teams x
             where x.phase_id = oet.phase_id and x.external_team_id is not null) = 1
  ), costo as (
    select s.id, s.iva,
           coalesce(sum(v.quantita * coalesce(
             (select tv.costo from public.tariffa_costi_varianti tv
               where tv.tariffa_id = v.tariffa_id
                 and tv.company_id = s.company_id
                 and (tv.external_team_id = s.external_team_id
                      or (s.subappaltatore_id is not null and tv.subappaltatore_id = s.subappaltatore_id))
                 and tv.attivo is not false and tv.costo is not null
                 and (tv.valid_from is null or tv.valid_from <= (now() at time zone 'Europe/Rome')::date)
                 and (tv.valid_to is null or tv.valid_to >= (now() at time zone 'Europe/Rome')::date)
               order by (tv.external_team_id is not distinct from s.external_team_id) desc,
                        tv.is_default desc nulls last, tv.sort_order nulls last, tv.created_at
               limit 1),
             v.costo_manodopera, 0)), 0) as netto
      from sole s
      left join public.order_work_phase_voci v on v.phase_id = s.phase_id
     group by s.id, s.iva
  )
  update public.order_external_teams oet
     set cost_preventivo = round(c.netto * (1 + c.iva / 100), 2)
    from costo c
   where oet.id = c.id
     and oet.cost_preventivo is distinct from round(c.netto * (1 + c.iva / 100), 2);
$function$;
revoke all on function public.ditte_ricalcola_previsto(uuid[]) from public, anon, authenticated;
grant execute on function public.ditte_ricalcola_previsto(uuid[]) to service_role;

-- 8b. La squadra ricollegata aggiorna solo le righe della sua azienda ----------
create or replace function public.squadra_anagrafica_al_listino()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.subappaltatore_id is not distinct from old.subappaltatore_id then
    return new;
  end if;
  update public.tariffa_costi_varianti v
     set subappaltatore_id = new.subappaltatore_id
   where v.external_team_id = new.id
     and v.company_id = new.company_id
     and v.subappaltatore_id is not distinct from old.subappaltatore_id;
  update public.tariffe_aziendali t
     set subappaltatore_id = new.subappaltatore_id
   where t.external_team_id = new.id
     and t.company_id = new.company_id
     and t.subappaltatore_id is not distinct from old.subappaltatore_id;
  return new;
end;
$$;
revoke all on function public.squadra_anagrafica_al_listino() from public, anon, authenticated;
