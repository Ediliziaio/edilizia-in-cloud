-- Fattura → commessa: il costo segue il collegamento (15/11/2026, punto 3 del giro «cosa migliorare»).
-- Prima: la catena dei documenti e i codici (CUP/CIG/codice commessa) scrivevano solo order_id_suggerito,
-- e la conferma nel popup di verifica cambiava lo stato della traccia senza toccare il costo.
--   1. acquisti_collegamento_cambia_stato, ramo fattura → commessa: «collegato» porta il costo sulla
--      commessa (tutto, o la quota scritta nel collegamento: ripartizione per riga), «annullato» e
--      «rifiutato» lo riportano indietro. Passa da fattura_collega_commesse: stessi controlli, stesso
--      permesso «Costi» del popup della fattura; se la fattura non è contabilizzata la contabilizza
--      lei, come fa già quel popup. Un costo già su un'altra commessa o diviso non si tocca: si dice.
--   2. acquisti_commessa_della_fattura (solo servizio): la porta da cui le edge function registrano la
--      commessa trovata. «automatico» vale solo con l'interruttore acceso (lo applica la registrazione
--      comune) e solo su una fattura già contabilizzata col costo libero: il collegamento automatico
--      sposta un costo che c'è, non contabilizza nessuna fattura da sé (il 15/11 l'88% non lo è). In
--      tutti gli altri casi diventa una proposta. Mai sopra una scelta di una persona.

create or replace function public.acquisti_collegamento_cambia_stato(p_id uuid, p_stato text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.acquisti_collegamenti%rowtype; f record; k record;
begin
  select * into c from public.acquisti_collegamenti where id = p_id for update;
  if not found then raise exception 'Collegamento non trovato.' using errcode = 'P0002'; end if;
  if not public.acquisti_puo_collegare(c.company_id) then raise exception 'Non hai il permesso di collegare i documenti d''acquisto.' using errcode = '42501'; end if;
  if not public.acquisti_transizione_ammessa(c.stato, p_stato) then
    raise exception 'Da «%» non si passa a «%».', c.stato, p_stato using errcode = 'P0001';
  end if;
  if p_stato in ('annullato', 'rifiutato') and btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Scrivi perché: resta nella storia del collegamento.' using errcode = '22023';
  end if;
  perform set_config('acquisti.motivo', coalesce(p_motivo, ''), true);
  update public.acquisti_collegamenti set stato = p_stato, updated_at = now() where id = p_id;
  if c.da_tipo = 'fattura_ricevuta' and c.a_tipo = 'ddt' then
    if p_stato in ('annullato', 'rifiutato') then
      update public.fattura_ddt set ddt_ricezione_id = null
       where fattura_ricevuta_id = c.da_id and ddt_ricezione_id = c.a_id and company_id = c.company_id;
    elsif p_stato = 'collegato' then
      update public.fattura_ddt fd set ddt_ricezione_id = c.a_id
       where fd.fattura_ricevuta_id = c.da_id and fd.company_id = c.company_id and fd.ddt_ricezione_id is null
         and exists (select 1 from public.ddt_ricezione d join public.fatture_ricevute f2 on f2.id = fd.fattura_ricevuta_id
                      where d.id = c.a_id and d.supplier_id = f2.fornitore_id
                        and (public.acquisti_numero_documento(d.numero_ddt)).chiave = (public.acquisti_numero_documento(fd.numero_ddt)).chiave);
    end if;
  elsif c.da_tipo = 'fattura_ricevuta' and c.a_tipo = 'ordine' then
    select id, purchase_order_id into f from public.fatture_ricevute where id = c.da_id and company_id = c.company_id;
    if p_stato = 'collegato' then
      if f.purchase_order_id is not null and f.purchase_order_id <> c.a_id then
        raise exception 'La fattura è già collegata a un altro ordine: scollegala prima.' using errcode = 'P0001';
      end if;
      if exists (select 1 from public.fattura_ricevuta_ordini q where q.fattura_id = c.da_id) then
        raise exception 'La fattura è già divisa fra più ordini: scegli gli ordini dalla fattura.' using errcode = 'P0001';
      end if;
      if f.purchase_order_id is null then
        perform public.collega_fattura_a_ordini(c.da_id, jsonb_build_array(jsonb_build_object('purchase_order_id', c.a_id)));
      end if;
    elsif p_stato in ('annullato', 'rifiutato') and f.purchase_order_id = c.a_id then
      -- Scollega e segna la scelta: l'automatismo non la riaggancia più. I costi restano dove sono.
      perform public.collega_fattura_a_ordini(c.da_id, '[]'::jsonb);
    end if;
  elsif c.da_tipo = 'fattura_ricevuta' and c.a_tipo = 'commessa' then
    -- La commessa confermata porta con sé il costo; annullata o rifiutata, lo riporta indietro.
    -- Passa da fattura_collega_commesse: stessi controlli e stesso permesso («Costi») del popup della fattura.
    select fr.id, fr.company_cost_id, abs(coalesce(fr.imponibile_totale, fr.totale_documento, 0)) base into f
      from public.fatture_ricevute fr where fr.id = c.da_id and fr.company_id = c.company_id;
    select cc.order_id, coalesce(cc.allocations, '[]'::jsonb) allocations into k
      from public.company_costs cc where cc.id = f.company_cost_id;
    if p_stato = 'collegato' then
      if k.order_id is distinct from c.a_id then
        if k.order_id is not null or jsonb_array_length(coalesce(k.allocations, '[]'::jsonb)) > 0 then
          raise exception 'Il costo di questa fattura è già su un''altra commessa o diviso: cambialo dalla fattura.' using errcode = 'P0001';
        end if;
        perform public.fattura_collega_commesse(c.da_id, jsonb_build_array(jsonb_build_object(
          'order_id', c.a_id, 'importo', case when coalesce(c.importo, 0) > 0 then least(abs(c.importo), f.base) else f.base end)));
      end if;
    elsif p_stato in ('annullato', 'rifiutato')
          and (k.order_id = c.a_id
               or (jsonb_array_length(coalesce(k.allocations, '[]'::jsonb)) = 1 and k.allocations -> 0 ->> 'order_id' = c.a_id::text)) then
      perform public.fattura_collega_commesse(c.da_id, '[]'::jsonb);
    end if;
  end if;
  return jsonb_build_object('id', p_id, 'stato', p_stato);
end $$;
revoke all on function public.acquisti_collegamento_cambia_stato(uuid, text, text) from public, anon;
grant execute on function public.acquisti_collegamento_cambia_stato(uuid, text, text) to authenticated;

create or replace function public.acquisti_commessa_della_fattura(
  p_fattura uuid, p_order uuid, p_regola text, p_esito text, p_motivo text default null,
  p_prove jsonb default '[]'::jsonb, p_percorso jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f record; k record; v_esito text := p_esito; v_motivo text := p_motivo; v_id uuid; v_stato text; v_costo text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'La commessa trovata dalle regole la registra il servizio.' using errcode = '42501';
  end if;
  if p_esito not in ('automatico', 'proposta') then
    raise exception 'Esito non valido: automatico o proposta.' using errcode = '22023';
  end if;
  select fr.id, fr.company_id, fr.company_cost_id, fr.purchase_order_id, fr.stato, coalesce(fr.aggancio_oda_manuale, false) manuale
    into f from public.fatture_ricevute fr where fr.id = p_fattura;
  if not found then return jsonb_build_object('esito', 'saltata', 'motivo', 'fattura non trovata'); end if;
  if f.stato = 'rifiutata' then return jsonb_build_object('esito', 'saltata', 'motivo', 'fattura rifiutata'); end if;
  -- La commessa viene dall'ordine d'acquisto: non è questa la strada.
  if f.purchase_order_id is not null or exists (select 1 from public.fattura_ricevuta_ordini q where q.fattura_id = f.id) then
    return jsonb_build_object('esito', 'saltata', 'motivo', 'collegata a un ordine d''acquisto');
  end if;
  select cc.order_id, coalesce(cc.allocations, '[]'::jsonb) allocations, cc.quota_magazzino, cc.purchase_order_id, cc.order_external_team_id
    into k from public.company_costs cc where cc.id = f.company_cost_id;
  if k.order_id is not null and k.order_id <> p_order
     or jsonb_array_length(coalesce(k.allocations, '[]'::jsonb)) > 0 or k.quota_magazzino is not null
     or k.purchase_order_id is not null or k.order_external_team_id is not null then
    return jsonb_build_object('esito', 'saltata', 'motivo', 'il costo è già assegnato');
  end if;
  if v_esito = 'automatico' then
    if f.company_cost_id is null then
      v_esito := 'proposta';
      v_motivo := concat_ws(' · ', v_motivo, 'fattura non ancora contabilizzata: il costo va sulla commessa alla conferma');
    elsif f.manuale and k.order_id is null then
      v_esito := 'proposta';
      v_motivo := concat_ws(' · ', v_motivo, 'una persona aveva tolto la commessa: si propone, non si rimette');
    end if;
  end if;
  v_id := public.acquisti_collegamento_registra(f.company_id, 'fattura_ricevuta', f.id, null, 'commessa', p_order, null,
                                                p_regola, v_esito, coalesce(p_prove, '[]'::jsonb), p_percorso,
                                                null, null, null, 1, false, v_motivo);
  select stato into v_stato from public.acquisti_collegamenti where id = v_id;
  -- Mai sopra una persona: se ha tolto la commessa dal costo, la traccia «collegato» di prima non la rimette.
  if v_stato = 'collegato' and f.company_cost_id is not null and k.order_id is null and not f.manuale then
    update public.company_costs set order_id = p_order, allocations = '[]'::jsonb, updated_at = now()
     where id = f.company_cost_id and order_id is null;
    update public.fatture_ricevute set order_id_suggerito = p_order, updated_at = now() where id = f.id;
    v_costo := 'sulla_commessa';
  elsif v_stato = 'proposto' then
    update public.fatture_ricevute set order_id_suggerito = coalesce(order_id_suggerito, p_order), updated_at = now() where id = f.id;
  end if;
  return jsonb_build_object('esito', v_stato, 'id', v_id, 'costo', v_costo);
end $$;
revoke all on function public.acquisti_commessa_della_fattura(uuid, uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.acquisti_commessa_della_fattura(uuid, uuid, text, text, text, jsonb, jsonb) to service_role;
