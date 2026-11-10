-- ============================================================================
-- Subappalto dal computo, lotto 2 (docs/piano-subappalto-computo-listino.md):
-- il listino della ditta si scrive dalla sua scheda.
--
-- 1. `listino_ditta_salva(subappaltatore, valido_dal, righe)` scrive i prezzi
--    della ditta sulle voci del listino aziendale, tutti insieme. Una riga è
--    {tariffa_id, costo}; costo vuoto = la ditta non ha più un prezzo per quella
--    voce. Il listino ha una storia: un prezzo che valeva già prima della data
--    si CHIUDE (valid_to = giorno prima) e se ne apre uno nuovo, così i prezzi
--    vecchi restano leggibili. Un prezzo nato da quella data in poi si corregge
--    sul posto. I contratti non cambiano mai: hanno la loro fotografia.
--    Tocca solo il prezzo principale della ditta per quella voce (il primo per
--    ordine): gli altri prezzi con nome («con smontaggio») restano come sono.
--    `is_default` NON è della ditta: è la variante che l'azienda usa di norma
--    per quella voce (una sola per voce, ux_varianti_one_default_per_tariffa).
--    Un prezzo nuovo della ditta nasce senza; chiudendo un prezzo che lo era,
--    il segno passa al prezzo nuovo.
--    Gira con i permessi di chi la chiama (le regole della tabella valgono) e
--    controlla prima i permessi «listino» e «costi» dell'azienda della ditta.
--
-- 2. Cancellare una squadra non cancella più i prezzi della ditta: quelli che
--    hanno l'anagrafica perdono solo la squadra (prima ON DELETE CASCADE li
--    portava via). I prezzi senza anagrafica si comportano come prima.
-- ============================================================================

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1. Salvare il listino della ditta -------------------------------------------
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

  -- La squadra della ditta, se c'è: il prezzo la porta, così il calendario e l'app la ritrovano.
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

    -- Il prezzo predefinito della ditta per quella voce, valido alla data.
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

    if v_costo is null then
      if v_trovato then
        if v_att.valid_from >= p_valido_dal then
          delete from public.tariffa_costi_varianti where id = v_att.id;
        else
          -- Chiuso, non è più la variante di norma per la voce.
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
        -- Il segno «predefinita per la voce» passa al prezzo nuovo: prima lo si toglie al vecchio.
        update public.tariffa_costi_varianti set valid_to = p_valido_dal - 1, is_default = false where id = v_att.id;
        insert into public.tariffa_costi_varianti
          (company_id, tariffa_id, nome, descrizione, modalita_contabile, external_team_id, subappaltatore_id,
           costo, valid_from, valid_to, is_default, attivo, sort_order)
        values
          (v_att.company_id, v_att.tariffa_id, v_att.nome, v_att.descrizione, v_att.modalita_contabile, v_att.external_team_id,
           p_subappaltatore, v_costo, p_valido_dal, v_att.valid_to, v_att.is_default, true, v_att.sort_order);
        n_nuovi := n_nuovi + 1;
      end if;
    else
      insert into public.tariffa_costi_varianti
        (company_id, tariffa_id, nome, modalita_contabile, external_team_id, subappaltatore_id, costo, valid_from, is_default)
      values
        (v_azienda, v_tariffa, coalesce(nullif(trim(v_nome), ''), 'Prezzo della ditta'), 'subappalto_fatturato', v_squadra,
         p_subappaltatore, v_costo, p_valido_dal, false);
      n_nuovi := n_nuovi + 1;
    end if;
  end loop;

  return jsonb_build_object('nuovi', n_nuovi, 'corretti', n_corretti, 'chiusi', n_chiusi, 'uguali', n_uguali);
end;
$$;
revoke all on function public.listino_ditta_salva(uuid, date, jsonb) from public, anon;
grant execute on function public.listino_ditta_salva(uuid, date, jsonb) to authenticated, service_role;

comment on function public.listino_ditta_salva(uuid, date, jsonb) is
  'Scrive i prezzi di un subappaltatore sulle voci del listino aziendale dalla data indicata: chiude i prezzi vecchi, apre i nuovi, toglie quelli vuoti. Permessi listino + costi.';

-- 2. Una squadra cancellata non porta via i prezzi della ditta ------------------
create or replace function public.squadra_cancellata_listino_resta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tariffa_costi_varianti
     set external_team_id = null
   where external_team_id = old.id
     and subappaltatore_id is not null;
  return old;
end;
$$;
revoke all on function public.squadra_cancellata_listino_resta() from public, anon, authenticated;

drop trigger if exists squadra_cancellata_listino_resta on public.external_teams;
create trigger squadra_cancellata_listino_resta
  before delete on public.external_teams
  for each row execute function public.squadra_cancellata_listino_resta();
