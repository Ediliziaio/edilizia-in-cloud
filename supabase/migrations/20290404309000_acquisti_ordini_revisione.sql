-- Fattura ↔ ordine: correzioni dalla revisione finale del 15/11/2026 (lotti 11 e 12).
--   1. Costo doppio. Una fattura già contabilizzata collegata DOPO a un ordine che ha già il costo della
--      merce arrivata: fattura_ricevuta_porta_costo_su_ordine mette l'ordine anche sul costo della
--      fattura e i costi sono due (contabilizza_fattura_ricevuta li riassorbe solo se l'ordine c'è già).
--      Ora la conferma lo blocca con un messaggio, e il trigger non lo aggancia da solo.
--   2. Il numero citato. La regex di DatiOrdineAcquisto era tutta «greedy» (in Postgres la prima
--      quantità decide per tutta l'espressione) e prendeva l'ultimo IdDocumento del file: il contratto,
--      una fattura collegata. Ora si leggono i blocchi uno per uno (acquisti_ordini_citati), anche più
--      ordini citati, con la data del blocco.
--   3. Citato un altro ordine. Se la fattura cita un numero d'ordine leggibile e nessuno è quello trovato
--      per importo, è un conflitto: nessuna proposta (prima nasceva con la prova falsa «non cita»).
--   4. Rifiutato resta rifiutato. Il trigger non riaggancia da solo un ordine che una persona ha
--      rifiutato o annullato nella traccia, nemmeno a interruttore acceso e importi cambiati.
--   7. L'anno. Se il numero non ha l'anno, vale quello della data citata e della data dell'ordine.
--   8. Fornitori nuovi: le fatture agganciate al fornitore appena creato ricollegano le loro bolle.
--   9. Permessi: la conferma di un ordine o di una commessa dice in chiaro chi può farla, invece di
--      «Fattura non trovata» (collega_fattura_a_ordini e fattura_collega_commesse hanno regole loro).
set local lock_timeout = '3s';

-- I numeri d'ordine citati, blocco per blocco. Ogni espressione inizia con una quantità non «greedy»
-- (`??`): così anche `.*?` è minima e un blocco finisce alla sua chiusura.
create or replace function public.acquisti_ordini_citati(p_xml text)
returns table (testo text, chiave text, anno integer, serie text)
language sql immutable set search_path = public as $$
  select btrim(id[1]), (public.acquisti_numero_documento(btrim(id[1]))).chiave,
         coalesce((public.acquisti_numero_documento(btrim(id[1]))).anno, substring(dt[1] from 1 for 4)::integer),
         (public.acquisti_numero_documento(btrim(id[1]))).serie
    from regexp_matches(coalesce(p_xml, ''), '<(?:[\w.-]+:)??DatiOrdineAcquisto>(.*?)</(?:[\w.-]+:)?DatiOrdineAcquisto>', 'g') b(blocco),
         lateral regexp_match(b.blocco[1], '<(?:[\w.-]+:)??IdDocumento>([^<]*)</') id,
         lateral (select regexp_match(b.blocco[1], '<(?:[\w.-]+:)??Data>\s*(\d{4})-\d\d-\d\d\s*</') dt) d
   where id is not null and btrim(id[1]) <> ''
$$;
revoke all on function public.acquisti_ordini_citati(text) from public, anon;
grant execute on function public.acquisti_ordini_citati(text) to authenticated, service_role;

-- L'ordine ha già un costo suo (nato all'arrivo della merce) che nessuna fattura ha ancora confermato?
create or replace function public.acquisti_ordine_ha_costo_proprio(p_po uuid, p_costo_fattura uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_costo_fattura is not null and exists (
    select 1 from public.company_costs c
     where c.purchase_order_id = p_po and c.id <> p_costo_fattura
       and not exists (select 1 from public.fatture_ricevute fr where fr.company_cost_id = c.id))
$$;
revoke all on function public.acquisti_ordine_ha_costo_proprio(uuid, uuid) from public, anon, authenticated;

create or replace function public.acquisti_oda_da_importo(p_company uuid, p_fattura uuid, p_piva text, p_cf text,
                                                         p_totale numeric, p_imponibile numeric, p_tipo text, p_xml text)
returns table (oda_id uuid, oda_numero text, identifica boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_piva text; v_cf text; v_ids uuid[]; v_num text; v_data date; b record; r record; v_citati integer := 0;
begin
  if left(coalesce(p_tipo, ''), 4) in ('TD04', 'TD05') or (p_totale is null and p_imponibile is null) then return; end if;
  v_piva := nullif(public.partner_tax_key(p_piva), '');
  v_cf := nullif(public.partner_tax_key(p_cf), '');
  if v_piva is null and v_cf is null then return; end if;
  select array_agg(c.id) into v_ids from (
    select po.id from public.purchase_orders po join public.suppliers s on s.id = po.supplier_id
     where po.company_id = p_company
       and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
       and coalesce(po.total, po.subtotal, 0) > 0
       and ((v_piva is not null and public.partner_tax_key(s.vat_number) = v_piva)
            or (v_cf is not null and public.partner_tax_key(s.fiscal_code) = v_cf))
       and ((p_totale is not null and abs(coalesce(po.total, 0) - p_totale) <= 0.01)
            or (p_imponibile is not null and abs(coalesce(po.subtotal, 0) - p_imponibile) <= 0.01))
       and not exists (select 1 from public.fatture_ricevute f2 where f2.purchase_order_id = po.id and f2.id is distinct from p_fattura)
       and not exists (select 1 from public.fattura_ricevuta_ordini q where q.purchase_order_id = po.id and q.fattura_id is distinct from p_fattura)
     limit 2) c;
  if coalesce(array_length(v_ids, 1), 0) <> 1 then return; end if;
  select oda_number, issue_date into v_num, v_data from public.purchase_orders where id = v_ids[1];
  oda_id := v_ids[1]; oda_numero := v_num; identifica := false;
  select * into b from public.acquisti_numero_documento(v_num);
  for r in select * from public.acquisti_ordini_citati(p_xml) loop
    if r.chiave is null then continue; end if; -- un riferimento illeggibile non dice niente
    v_citati := v_citati + 1;
    if b.chiave is not null and r.chiave = b.chiave
       and (r.anno is null or coalesce(b.anno, extract(year from v_data)::integer) is null
            or r.anno = coalesce(b.anno, extract(year from v_data)::integer))
       and (r.serie is null or b.serie is null or r.serie = b.serie) then
      identifica := true;
    end if;
  end loop;
  -- La fattura cita un ordine, e non è questo: conflitto, nessuna proposta.
  if v_citati > 0 and not identifica then return; end if;
  return next;
end $$;
revoke all on function public.acquisti_oda_da_importo(uuid, uuid, text, text, numeric, numeric, text, text) from public, anon, authenticated;

create or replace function public.aggancia_fattura_a_oda()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.acquisti_oda_da_importo(new.company_id, new.id, new.cedente_piva, new.cedente_cf,
                                                      new.totale_documento, new.imponibile_totale, new.tipo_documento, new.xml_raw);
  if found and c.identifica and public.azienda_collegamento_automatico(new.company_id)
     -- Una persona l'ha rifiutato o annullato: non lo si rimette da soli.
     and not exists (select 1 from public.acquisti_collegamenti k
                      where k.company_id = new.company_id and k.da_tipo = 'fattura_ricevuta' and k.da_id = new.id
                        and k.a_tipo = 'ordine' and k.a_id = c.oda_id and k.stato in ('rifiutato', 'annullato'))
     -- Già contabilizzata e l'ordine ha il suo costo: agganciarla conterebbe il costo due volte.
     and not public.acquisti_ordine_ha_costo_proprio(c.oda_id, new.company_cost_id) then
    new.purchase_order_id := c.oda_id;
  end if;
  return new;
end $$;
revoke all on function public.aggancia_fattura_a_oda() from public, anon, authenticated;

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
    select id, purchase_order_id, company_cost_id into f from public.fatture_ricevute where id = c.da_id and company_id = c.company_id;
    -- Se la fattura cambia davvero, lo stesso permesso di collega_fattura_a_ordini, detto prima e in chiaro
    -- (non «Fattura non trovata»). Rifiutare una proposta che non ha toccato la fattura resta a chi collega.
    if ((p_stato = 'collegato' and f.purchase_order_id is null) or (p_stato in ('annullato', 'rifiutato') and f.purchase_order_id = c.a_id))
       and (public.get_my_company_id() is distinct from c.company_id or not public.puo_vedere_documenti_fornitore()) then
      raise exception 'Collegare o scollegare una fattura da un ordine lo fa chi vede fatture, costi o fornitori di questa azienda.' using errcode = '42501';
    end if;
    if p_stato = 'collegato' and f.purchase_order_id is null and public.acquisti_ordine_ha_costo_proprio(c.a_id, f.company_cost_id) then
      raise exception 'La fattura è già contabilizzata e l''ordine ha già il costo della merce arrivata: collegarli conterebbe il costo due volte. Collega la fattura all''ordine prima di contabilizzarla, oppure sistema il costo dell''ordine.' using errcode = 'P0001';
    end if;
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
    -- Lo stesso permesso di fattura_collega_commesse («Costi»), detto prima e in chiaro.
    if p_stato = 'collegato' and not public.puo_registrare_costi(c.company_id) then
      raise exception 'Portare il costo sulla commessa lo fa chi registra i costi delle commesse.' using errcode = '42501';
    end if;
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

-- 8. Il fornitore creato dalle fatture ricollega le bolle di quelle fatture.
create or replace function public.acquisti_crea_fornitore_da_cedente(p_company uuid, p_chiave text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f record; v_id uuid; v_tipo text; v_creato boolean := false; v_righe integer := 0; v_azienda text[];
begin
  if p_company is null or coalesce(p_chiave, '') = '' then return jsonb_build_object('esito', 'saltato', 'motivo', 'nessun identificativo'); end if;
  select array_remove(array[nullif(public.partner_tax_key(vat_number), ''), nullif(public.partner_tax_key(fiscal_code), '')], null)
    into v_azienda from public.companies where id = p_company;
  if p_chiave = any (coalesce(v_azienda, '{}')) then
    return jsonb_build_object('esito', 'saltato', 'motivo', 'è l''azienda stessa');
  end if;
  select fr.cedente_ragione_sociale nome, fr.cedente_piva piva, fr.cedente_cf cf, coalesce(fr.cedente_paese, 'IT') paese,
         fr.cedente_indirizzo, fr.cedente_comune, fr.cedente_cap, fr.cedente_provincia
    into f from public.fatture_ricevute fr
   where fr.company_id = p_company and fr.fornitore_id is null
     and coalesce(nullif(public.partner_tax_key(fr.cedente_piva), ''), nullif(public.partner_tax_key(fr.cedente_cf), '')) = p_chiave
   order by fr.data_fattura desc nulls last limit 1;
  if not found then return jsonb_build_object('esito', 'saltato', 'motivo', 'nessuna fattura senza fornitore'); end if;

  v_id := public.fornitore_unico_per_cedente(p_company, f.piva, f.cf);
  if v_id is null then
    if exists (select 1 from public.suppliers s where s.company_id = p_company
                 and (public.partner_tax_key(s.vat_number) = p_chiave or public.partner_tax_key(s.fiscal_code) = p_chiave)) then
      return jsonb_build_object('esito', 'saltato', 'motivo', 'in rubrica ci sono già fornitori con questo identificativo ma non uno solo: uniscili o correggili');
    end if;
    if f.paese <> 'IT' then return jsonb_build_object('esito', 'saltato', 'motivo', 'fornitore estero: va creato a mano'); end if;
    if not ((coalesce(f.piva, '') <> '' and public.piva_valida(f.piva))
            or (coalesce(f.piva, '') = '' and coalesce(f.cf, '') <> '' and public.codice_fiscale_valido(f.cf))) then
      return jsonb_build_object('esito', 'saltato', 'motivo', 'P.IVA o codice fiscale non valido');
    end if;
    v_tipo := public.acquisti_tipo_fornitore_certo(p_company, p_chiave, f.nome);
    begin
      insert into public.suppliers (company_id, name, vat_number, fiscal_code, address, city, postal_code, province, country, is_active, tipo)
      values (p_company, coalesce(nullif(btrim(f.nome), ''), 'Fornitore ' || p_chiave), nullif(btrim(f.piva), ''), nullif(btrim(f.cf), ''),
              f.cedente_indirizzo, f.cedente_comune, f.cedente_cap, f.cedente_provincia, f.paese, true, v_tipo)
      returning id into v_id;
      v_creato := true;
    exception when unique_violation then
      return jsonb_build_object('esito', 'saltato', 'motivo', 'esiste già un fornitore con questo nome: aggiungi la P.IVA a quello');
    when check_violation then
      return jsonb_build_object('esito', 'saltato', 'motivo', 'P.IVA o codice fiscale non accettati dal controllo');
    end;
  end if;
  -- Il trigger dei fornitori di solito le ha già agganciate alla nascita: qui si prendono le rimaste.
  begin
    update public.fatture_ricevute fr set fornitore_id = v_id
     where fr.company_id = p_company and fr.fornitore_id is null
       and coalesce(nullif(public.partner_tax_key(fr.cedente_piva), ''), nullif(public.partner_tax_key(fr.cedente_cf), '')) = p_chiave
       and public.fornitore_unico_per_cedente(p_company, fr.cedente_piva, fr.cedente_cf) = v_id;
  exception when others then
    return jsonb_build_object('esito', case when v_creato then 'creato' else 'agganciato' end, 'id', v_id, 'tipo', v_tipo,
                              'fatture', (select count(*) from public.fatture_ricevute where fornitore_id = v_id),
                              'motivo', 'fornitore pronto, ma alcune fatture non si sono agganciate (controlli della fattura): riprova dalla pagina Fornitori');
  end;
  select count(*) into v_righe from public.fatture_ricevute where company_id = p_company and fornitore_id = v_id;
  -- Le bolle delle sue fatture: prima, senza fornitore, il confronto col fornitore della bolla non poteva
  -- riuscire. Fino a 50 fatture per volta; le altre le prende il lotto acquisti_ricollega_ddt_lotto.
  begin
    perform public.acquisti_collega_ddt(p_company, x.id, null, true, 500)
       from (select fr.id from public.fatture_ricevute fr
              where fr.company_id = p_company and fr.fornitore_id = v_id
                and exists (select 1 from public.fattura_ddt fd where fd.fattura_ricevuta_id = fr.id and fd.ddt_ricezione_id is null)
              limit 50) x;
  exception when others then
    raise log 'acquisti_crea_fornitore_da_cedente, bolle non ricollegate per %: %', v_id, sqlerrm;
  end;
  return jsonb_build_object('esito', case when v_creato then 'creato' else 'agganciato' end, 'id', v_id, 'tipo', v_tipo, 'fatture', v_righe);
end $$;
revoke all on function public.acquisti_crea_fornitore_da_cedente(uuid, text) from public, anon, authenticated;
