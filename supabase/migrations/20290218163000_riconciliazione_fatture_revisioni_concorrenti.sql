-- Revisione condivisa tra fatture: il residuo incerto non viene approvato automaticamente.
set local lock_timeout='3s';
create or replace function public.fattura_riconciliazione_contesto(p_fattura uuid, p_documenti jsonb)
returns jsonb language plpgsql security definer set search_path = public set statement_timeout = '15s'
as $$
declare f public.fatture_ricevute%rowtype; v_ddt uuid[]; v_oda uuid[];
  c jsonb; ds jsonb; os jsonb; vs jsonb; af jsonb; rp jsonb; n integer;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Accesso al confronto non consentito.' using errcode='42501';
  end if;
  select * into f from public.fatture_ricevute where id=p_fattura;
  if not found or not coalesce(public.e_super_admin_dentro(f.company_id) or f.company_id = any(public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing')),false) then
    raise exception 'Fattura non disponibile per la tua azienda.' using errcode='42501';
  end if;
  if jsonb_typeof(p_documenti) is distinct from 'object' or jsonb_typeof(p_documenti->'ddt') is distinct from 'array' or jsonb_typeof(p_documenti->'oda') is distinct from 'array' then
    raise exception 'Selezione documenti non valida.' using errcode='22023';
  end if;
  if jsonb_array_length(p_documenti->'ddt') + jsonb_array_length(p_documenti->'oda') not between 1 and 30 then
    raise exception 'Seleziona da uno a trenta documenti.' using errcode='22023';
  end if;
  select coalesce(array_agg(distinct x::uuid order by x::uuid),'{}'::uuid[]) into v_ddt from jsonb_array_elements_text(p_documenti->'ddt') x;
  select coalesce(array_agg(distinct x::uuid order by x::uuid),'{}'::uuid[]) into v_oda from jsonb_array_elements_text(p_documenti->'oda') x;
  select count(*) into n from public.ddt_ricezione where id=any(v_ddt) and company_id=f.company_id and (f.fornitore_id is null or supplier_id is null or supplier_id=f.fornitore_id);
  if n<>cardinality(v_ddt) then raise exception 'Un DDT non è disponibile o appartiene a un altro fornitore.' using errcode='42501'; end if;
  select count(*) into n from public.purchase_orders where id=any(v_oda) and company_id=f.company_id and (f.fornitore_id is null or supplier_id is null or supplier_id=f.fornitore_id);
  if n<>cardinality(v_oda) then raise exception 'Un ordine non è disponibile o appartiene a un altro fornitore.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'numero',d.numero_ddt,'supplier_id',d.supplier_id,'stato',d.stato,'righe',
    (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'codice_articolo',r.codice_articolo,'descrizione',r.descrizione,'unita_misura',r.unita_misura,'quantita',r.quantita,'prezzo_unitario',r.prezzo_unitario,'importo',r.importo) order by r.posizione,r.id),'[]'::jsonb)
     from public.ddt_righe r where r.ddt_ricezione_id=d.id and r.company_id=f.company_id)) order by d.id),'[]'::jsonb)
    into ds from public.ddt_ricezione d where d.id=any(v_ddt) and d.company_id=f.company_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'numero',d.oda_number,'supplier_id',d.supplier_id,'stato',d.status,'righe',
    (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'sku',r.sku,'description',r.description,'unit_of_measure',r.unit_of_measure,'quantity',r.quantity,'unit_price',r.unit_price,'price_pending',r.price_pending,'discount_percent',r.discount_percent,'line_total',r.line_total) order by r.sort_order,r.id),'[]'::jsonb)
     from public.purchase_order_items r where r.purchase_order_id=d.id and r.company_id=f.company_id)) order by d.id),'[]'::jsonb)
    into os from public.purchase_orders d where d.id=any(v_oda) and d.company_id=f.company_id;
  select coalesce(jsonb_agg(jsonb_build_object('riga_id',riga_id,'fattura_id',fattura_id,'quantita',quantita,'ddt_id',ddt_id) order by id),'[]'::jsonb)
    into vs from public.ddt_valorizzazioni where company_id=f.company_id and ddt_id=any(v_ddt) and fattura_id<>f.id;
  select coalesce(jsonb_agg(jsonb_build_object('ddt_ricezione_id',ddt_ricezione_id,'fattura_ricevuta_id',fattura_ricevuta_id) order by id),'[]'::jsonb)
    into af from public.fattura_ddt where company_id=f.company_id and ddt_ricezione_id=any(v_ddt) and fattura_ricevuta_id<>f.id;
  -- Una revisione su un'altra fattura è un segnale di possibile utilizzo, non una quantità inventata.
  select coalesce(jsonb_agg(jsonb_build_object('fattura_id',a.fattura_id,'riga_id',rr.id) order by a.fattura_id,rr.id),'[]'::jsonb) into rp
  from (
    select distinct on (fattura_id) * from public.fattura_riconciliazioni_ai
    where company_id=f.company_id and fattura_id<>f.id
    order by fattura_id,coalesce(rivista_il,created_at) desc,created_at desc,id
  ) a
  cross join lateral jsonb_array_elements(a.proposta->'righe') r
  join public.ddt_righe rr on rr.company_id=f.company_id and rr.ddt_ricezione_id=any(v_ddt)
    and rr.id::text in (select jsonb_array_elements_text(r->'ddt'))
  where a.decisioni->>(r->>'fattura')='accettata';
  c:=jsonb_build_object('fattura',jsonb_build_object('id',f.id,'company_id',f.company_id,'fornitore_id',f.fornitore_id,'tipo_documento',f.tipo_documento,'righe',f.righe),'ddt',ds,'oda',os,'valorizzazioni',vs,'altre_fatture',af,'revisioni_precedenti',rp);
  return jsonb_build_object('contesto',c,'impronta',md5('riconciliazione-v2:'||c::text),'puo_modificare',not public.utente_sola_lettura(f.company_id));
end $$;
revoke all on function public.fattura_riconciliazione_contesto(uuid,jsonb) from public,anon;
grant execute on function public.fattura_riconciliazione_contesto(uuid,jsonb) to authenticated;

create or replace function public.fattura_riconciliazione_salva(p_analisi uuid,p_revisione integer,p_decisioni jsonb)
returns jsonb language plpgsql security definer set search_path = public set lock_timeout = '3s'
as $$
declare a public.fattura_riconciliazioni_ai%rowtype; c jsonb; k text; v jsonb;
begin
  select * into a from public.fattura_riconciliazioni_ai where id=p_analisi;
  if not found then raise exception 'Analisi non disponibile.' using errcode='P0002'; end if;
  c:=public.fattura_riconciliazione_contesto(a.fattura_id,a.documenti);
  -- Stesso ordine del flusso prezzi DDT: bolle ordinate, fattura, revisione.
  -- Due fatture non possono confermare contemporaneamente la stessa disponibilità.
  perform id from public.ddt_ricezione where company_id=a.company_id
    and id in (select x::uuid from jsonb_array_elements_text(a.documenti->'ddt') x) order by id for update;
  perform id from public.fatture_ricevute where id=a.fattura_id for update;
  select * into a from public.fattura_riconciliazioni_ai where id=p_analisi for update;
  c:=public.fattura_riconciliazione_contesto(a.fattura_id,a.documenti);
  if not (c->>'puo_modificare')::boolean then raise exception 'Il tuo ruolo consente solo la lettura.' using errcode='42501'; end if;
  if c->>'impronta'<>a.impronta then raise exception 'I documenti sono cambiati. Aggiorna il confronto e ripeti l’analisi.' using errcode='PT409'; end if;
  if a.revisione<>p_revisione then raise exception 'Un collega ha aggiornato la revisione. Ricarica prima di salvare.' using errcode='PT409'; end if;
  if jsonb_typeof(p_decisioni) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_decisioni))<>jsonb_array_length(a.proposta->'righe') then
    raise exception 'Controlla tutte le voci prima di salvare.' using errcode='22023';
  end if;
  for k,v in select * from jsonb_each(p_decisioni) loop
    if v #>> '{}' not in ('accettata','rifiutata','da_rivedere') or jsonb_typeof(v)<>'string' or not exists(select 1 from jsonb_array_elements(a.proposta->'righe') r where r->>'fattura'=k) then
      raise exception 'Scelta di revisione non valida.' using errcode='22023';
    end if;
  end loop;
  update public.fattura_riconciliazioni_ai set decisioni=p_decisioni,revisione=revisione+1,rivista_da=auth.uid(),rivista_il=now() where id=a.id returning * into a;
  return to_jsonb(a);
end $$;
revoke all on function public.fattura_riconciliazione_salva(uuid,integer,jsonb) from public,anon;
grant execute on function public.fattura_riconciliazione_salva(uuid,integer,jsonb) to authenticated;
