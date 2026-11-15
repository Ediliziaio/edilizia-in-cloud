-- Fattura ↔ ordine d'acquisto per importo uguale: decisione del titolare del 15/11/2026.
--
-- Prima: aggancia_fattura_a_oda agganciava DA SOLA la fattura all'ordine dello stesso fornitore con lo
-- stesso totale (o imponibile), se era l'unico non ancora fatturato. L'importo da solo non identifica un
-- documento. Da oggi:
--   - solo importo (+ fornitore)                         → proposta da confermare con un clic, sempre;
--   - importo + numero d'ordine citato in fattura         → regola normale: interruttore acceso = si collega
--     (DatiOrdineAcquisto, stesso numero e anno)            da solo, spento = proposta.
-- Le proposte vanno nella traccia (acquisti_collegamenti) e si vedono nel popup «Verifica collegamenti».
-- Confermare = collega_fattura_a_ordini (lo stesso percorso di chi aggancia a mano: costi compresi);
-- annullare un aggancio = collega_fattura_a_ordini con nessun ordine (scollega e segna la scelta).
--
-- Storico: le 147 fatture già agganciate senza una scelta registrata (aggancio_oda_manuale = false; 144 di
-- Demo Azienda 2, 3 di un'altra azienda) NON si scollegano e i costi non si toccano: entrano nella traccia
-- come «collegate, da ricontrollare» (regola oda_importo_fornitore_storico), una per una dal popup.

set local lock_timeout = '3s';

-- L'ordine candidato per importo: stesso fornitore (P.IVA/CF), stesso totale o imponibile al centesimo,
-- ordine emesso, non ancora fatturato. Uno solo, o niente. `identifica` = la fattura cita il suo numero.
create or replace function public.acquisti_oda_da_importo(p_company uuid, p_fattura uuid, p_piva text, p_cf text,
                                                         p_totale numeric, p_imponibile numeric, p_tipo text, p_xml text)
returns table (oda_id uuid, oda_numero text, identifica boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_piva text; v_cf text; v_ids uuid[]; v_num text; v_rif text;
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
  select oda_number into v_num from public.purchase_orders where id = v_ids[1];
  oda_id := v_ids[1]; oda_numero := v_num; identifica := false;
  -- Il numero d'ordine nei DatiOrdineAcquisto: stessa chiave, anno e serie compatibili.
  if p_xml is not null and position('DatiOrdineAcquisto' in p_xml) > 0 and v_num is not null then
    for v_rif in
      select btrim(m[1]) from regexp_matches(p_xml, '<(?:[\w.-]+:)?DatiOrdineAcquisto>.*?<(?:[\w.-]+:)?IdDocumento>\s*([^<]+?)\s*</', 'g') m
    loop
      if exists (select 1 from public.acquisti_numero_documento(v_rif) a, public.acquisti_numero_documento(v_num) b
                  where a.chiave is not null and a.chiave = b.chiave
                    and (a.anno is null or b.anno is null or a.anno = b.anno)
                    and (a.serie is null or b.serie is null or a.serie = b.serie)) then
        identifica := true;
      end if;
    end loop;
  end if;
  return next;
end $$;
revoke all on function public.acquisti_oda_da_importo(uuid, uuid, text, text, numeric, numeric, text, text) from public, anon, authenticated;

-- Il trigger di sempre (BEFORE, stesse colonne): aggancia da solo SOLO se l'ordine è identificato dal
-- numero e l'interruttore dell'azienda è acceso. Tutto il resto lo propone il trigger qui sotto.
create or replace function public.aggancia_fattura_a_oda()
returns trigger language plpgsql set search_path = 'public' as $$
declare c record;
begin
  select * into c from public.acquisti_oda_da_importo(new.company_id, new.id, new.cedente_piva, new.cedente_cf,
                                                      new.totale_documento, new.imponibile_totale, new.tipo_documento, new.xml_raw);
  if found and c.identifica and public.azienda_collegamento_automatico(new.company_id) then
    new.purchase_order_id := c.oda_id;
  end if;
  return new;
end $$;

-- Dopo il salvataggio: la traccia. Aggancio automatico → «collegato/automatico»; candidato non agganciato
-- → proposta. Mai un errore che fermi il salvataggio della fattura.
create or replace function public.acquisti_traccia_ordine_da_importo()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record; v_regola text; v_prove jsonb; v_auto boolean;
begin
  if coalesce(new.aggancio_oda_manuale, false) then return null; end if;
  begin
    select * into c from public.acquisti_oda_da_importo(new.company_id, new.id, new.cedente_piva, new.cedente_cf,
                                                        new.totale_documento, new.imponibile_totale, new.tipo_documento, new.xml_raw);
    if not found then
      -- L'aggancio fatto adesso dal trigger qui sopra: il candidato è sparito perché ora l'ordine è «fatturato».
      if new.purchase_order_id is not null and (tg_op = 'INSERT' or old.purchase_order_id is null) then
        select * into c from public.acquisti_oda_da_importo(new.company_id, null, new.cedente_piva, new.cedente_cf,
                                                            new.totale_documento, new.imponibile_totale, new.tipo_documento, new.xml_raw);
        if not found or c.oda_id <> new.purchase_order_id then return null; end if;
      else
        return null;
      end if;
    end if;
    v_auto := new.purchase_order_id is not null and new.purchase_order_id = c.oda_id;
    if new.purchase_order_id is not null and not v_auto then return null; end if;
    if exists (select 1 from public.fattura_ricevuta_ordini q where q.fattura_id = new.id) then return null; end if;
    v_regola := case when c.identifica then 'oda_numero_importo_fornitore' else 'oda_importo_fornitore' end;
    v_prove := jsonb_build_array(
      jsonb_build_object('campo', 'fornitore', 'ruolo', 'conferma', 'esito', 'uguale', 'testo', 'stesso fornitore (P.IVA)'),
      jsonb_build_object('campo', 'importo', 'ruolo', 'conferma', 'esito', 'uguale', 'testo', 'stesso importo dell''ordine ' || coalesce(c.oda_numero, '')))
      || case when c.identifica
              then jsonb_build_array(jsonb_build_object('campo', 'numero_ordine', 'ruolo', 'identifica', 'esito', 'uguale', 'testo', 'la fattura cita l''ordine ' || coalesce(c.oda_numero, '')))
              else jsonb_build_array(jsonb_build_object('campo', 'numero_ordine', 'ruolo', 'identifica', 'esito', 'mancante', 'testo', 'la fattura non cita il numero d''ordine: il solo importo non basta'))
         end;
    insert into public.acquisti_collegamenti (company_id, da_tipo, da_id, a_tipo, a_id, regola, versione_regola, esito, prove, stato,
                                              autore_tipo, autore_processo, chiave)
    values (new.company_id, 'fattura_ricevuta', new.id, 'ordine', c.oda_id, v_regola, 1,
            case when v_auto then 'automatico' else 'proposta' end, v_prove,
            case when v_auto then 'collegato' else 'proposto' end, 'processo', 'aggancia_fattura_a_oda',
            new.company_id || '|fattura_ricevuta:' || new.id || '|ordine:' || c.oda_id || '|' || v_regola)
    on conflict (company_id, chiave) do nothing;
  exception when others then
    raise log 'acquisti_traccia_ordine_da_importo %: %', new.id, sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.acquisti_traccia_ordine_da_importo() from public, anon, authenticated;
drop trigger if exists acquisti_traccia_ordine_da_importo on public.fatture_ricevute;
create trigger acquisti_traccia_ordine_da_importo
  after insert or update of cedente_piva, cedente_cf, totale_documento, imponibile_totale, tipo_documento, purchase_order_id on public.fatture_ricevute
  for each row execute function public.acquisti_traccia_ordine_da_importo();

-- Confermare o annullare dal popup ha l'effetto vero anche per fattura ↔ ordine.
create or replace function public.acquisti_collegamento_cambia_stato(p_id uuid, p_stato text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.acquisti_collegamenti%rowtype; f record;
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
  end if;
  return jsonb_build_object('id', p_id, 'stato', p_stato);
end $$;
revoke all on function public.acquisti_collegamento_cambia_stato(uuid, text, text) from public, anon;
grant execute on function public.acquisti_collegamento_cambia_stato(uuid, text, text) to authenticated;

-- Lo storico: gli agganci già fatti senza una scelta registrata entrano nella traccia, da ricontrollare.
insert into public.acquisti_collegamenti (company_id, da_tipo, da_id, a_tipo, a_id, regola, versione_regola, esito, prove, stato,
                                          autore_tipo, autore_processo, chiave)
select f.company_id, 'fattura_ricevuta', f.id, 'ordine', f.purchase_order_id, 'oda_importo_fornitore_storico', 1, 'automatico',
       jsonb_build_array(jsonb_build_object('campo', 'storico', 'ruolo', 'conferma', 'esito', 'mancante',
         'testo', 'agganciata prima del 15/11/2026 senza una conferma registrata (di solito per importo uguale): da ricontrollare')),
       'collegato', 'processo', 'storico_15_11_2026',
       f.company_id || '|fattura_ricevuta:' || f.id || '|ordine:' || f.purchase_order_id || '|oda_importo_fornitore_storico'
  from public.fatture_ricevute f
 where f.purchase_order_id is not null and coalesce(f.aggancio_oda_manuale, false) = false
on conflict (company_id, chiave) do nothing;
