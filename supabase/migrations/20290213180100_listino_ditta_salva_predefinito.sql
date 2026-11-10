-- ============================================================================
-- Correzione di 20290213180000 (listino_ditta_salva), stesso giorno.
--
-- `is_default` su tariffa_costi_varianti è UNO per voce in tutta l'azienda
-- (ux_varianti_one_default_per_tariffa): è la variante che l'azienda usa di
-- norma per quella voce nei preventivi, non «il prezzo principale della ditta».
-- La prima versione lo metteva sui prezzi nuovi delle ditte e, chiudendo un
-- prezzo predefinito, ne apriva un secondo prima di togliere il segno al primo:
-- errore di chiave doppia. Trovato nella prova in transazione annullata, prima
-- che qualcuno la usasse. Ora: un prezzo nuovo della ditta nasce senza segno;
-- chiudendo un prezzo che lo aveva, il segno passa al prezzo nuovo.
-- ============================================================================

set local lock_timeout = '3s';
set local statement_timeout = '60s';

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
