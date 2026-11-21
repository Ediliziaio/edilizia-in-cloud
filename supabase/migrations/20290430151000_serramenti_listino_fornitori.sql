-- Collega una voce d'acquisto alla geometria condivisa e congela i dati
-- commerciali della posizione quotata. I listini e i preventivi esistenti restano validi.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.listino_fornitore_voci add column if not exists configurazione_serramento jsonb;
alter table public.sr_serramenti_progetto add column if not exists fornitura_listino jsonb;

create index if not exists listino_fornitore_voci_configurazione_idx
  on public.listino_fornitore_voci(company_id, (configurazione_serramento->>'tipologia'))
  where configurazione_serramento is not null;

create or replace function public.sr_dati_acquisto_da_fornitura(p_azienda uuid, p_riga jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  f jsonb := p_riga->'fornitura_listino';
  fornitore uuid;
begin
  if jsonb_typeof(f) is distinct from 'object' then return '{}'::jsonb; end if;
  if f->>'v' is distinct from '1'
    or nullif(btrim(f->>'codice'),'') is null
    or nullif(btrim(f->>'serie'),'') is null
    or jsonb_typeof(f->'acquisto_unitario') is distinct from 'number'
    or jsonb_typeof(f->'iva_acquisto') is distinct from 'number'
    or (f->>'acquisto_unitario')::numeric <= 0
    or (f->>'acquisto_unitario')::numeric >= 1000000000
    or (f->>'iva_acquisto')::numeric not between 0 and 100
    or f->>'larghezza_mm' is distinct from p_riga->>'larghezza_mm'
    or f->>'altezza_mm' is distinct from p_riga->>'altezza_mm' then
    raise exception 'Fornitura serramento incompleta o misura diversa da quella quotata.' using errcode = '22023';
  end if;
  select id into fornitore from public.suppliers
   where id::text = f->>'supplier_id' and company_id = p_azienda and is_active;
  if fornitore is null then
    raise exception 'Seleziona un fornitore attivo della tua azienda prima di creare la commessa.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'supplier_id', fornitore,
    'product_code', f->>'codice',
    'purchase_price', (f->>'acquisto_unitario')::numeric,
    'standard_cost', (f->>'acquisto_unitario')::numeric,
    'unita_misura', 'pz',
    'prezzo_fonte', 'listino',
    'specifiche', concat_ws(' · ', f->>'serie', nullif(f->>'specifiche','')),
    'axis_selections', coalesce(nullif(p_riga->'valori_assi', 'null'::jsonb), '{}'::jsonb)
                       || jsonb_build_object('_fornitura_su_misura', 'listino_fornitore',
                                             '_iva_acquisto_listino', trim_scale((f->>'iva_acquisto')::numeric)::text));
end;
$$;
revoke all on function public.sr_dati_acquisto_da_fornitura(uuid,jsonb) from public, anon, authenticated;

-- Mantiene il motore condiviso di conversione e cambia soltanto la proiezione
-- del serramento. Il ramo accessori e tutti gli altri moduli restano identici.
do $migrazione$
declare
  definizione text := pg_get_functiondef('public.converti_modulo_commessa_atomic(text, uuid, boolean, boolean, text, uuid[])'::regprocedure);
  riga_serramento text := E'''axis_selections'',case when jsonb_typeof(r->''valori_assi'')=''object'' and r->''valori_assi''<>''{}''::jsonb then r->''valori_assi'' end));\n    end loop;\n    for r in select value from jsonb_array_elements(accessori) loop';
  sostituzione text := E'''axis_selections'',case when jsonb_typeof(r->''valori_assi'')=''object'' and r->''valori_assi''<>''{}''::jsonb then r->''valori_assi'' end)\n        || public.sr_dati_acquisto_da_fornitura(azienda, r));\n    end loop;\n    for r in select value from jsonb_array_elements(accessori) loop';
begin
  if position('sr_dati_acquisto_da_fornitura' in definizione) > 0 then return; end if;
  if position(riga_serramento in definizione) = 0 then
    raise exception 'Proiezione atomica dei serramenti non trovata';
  end if;
  execute replace(definizione, riga_serramento, sostituzione);
end;
$migrazione$;

-- Si applica anche quando l'OdA viene generato dalla distinta, oltre al popup
-- manuale. Il codice viene preso dalla riga salvata per il fornitore scelto.
create or replace function public.oda_dati_serramento_da_listino()
returns trigger language plpgsql set search_path = public as $$
declare
  articolo record;
  larghezza numeric;
  altezza numeric;
  misura_verificata text;
begin
  if new.order_item_id is null then return new; end if;
  select i.product_code, i.supplier_id, i.measure_status, i.misure_preventivo, i.misure_da_ordinare,
         i.axis_selections, po.supplier_id as fornitore_oda
    into articolo
    from public.purchase_orders po
    join public.order_items i on i.id = new.order_item_id and i.order_id = po.order_id
   where po.id = new.purchase_order_id and po.company_id = new.company_id
     and i.axis_selections->>'_fornitura_su_misura' = 'listino_fornitore';
  if not found then return new; end if;
  if articolo.supplier_id is distinct from articolo.fornitore_oda then
    raise exception 'Il fornitore dell’ordine deve coincidere con quello della fornitura scelta.' using errcode = '22023';
  end if;
  larghezza := coalesce(articolo.misure_da_ordinare->>'larghezza_mm', articolo.misure_da_ordinare->>'larghezza')::numeric;
  altezza := coalesce(articolo.misure_da_ordinare->>'altezza_mm', articolo.misure_da_ordinare->>'altezza')::numeric;
  if articolo.measure_status is distinct from 'confermato'
    or larghezza is null or altezza is null or larghezza <= 0 or altezza <= 0 then
    raise exception 'Conferma le misure del serramento prima di creare l’ordine.' using errcode = '22023';
  end if;
  misura_verificata := coalesce(articolo.axis_selections->>'_misure_listino_verificate',
    trim_scale(coalesce(articolo.misure_preventivo->>'larghezza_mm', articolo.misure_preventivo->>'larghezza')::numeric)
    || '×' ||
    trim_scale(coalesce(articolo.misure_preventivo->>'altezza_mm', articolo.misure_preventivo->>'altezza')::numeric));
  if misura_verificata is distinct from (trim_scale(larghezza) || '×' || trim_scale(altezza)) then
    raise exception 'Le misure sono cambiate: verifica il costo e il codice con il fornitore.' using errcode = '22023';
  end if;
  new.sku := articolo.product_code;
  new.vat_rate := (articolo.axis_selections->>'_iva_acquisto_listino')::numeric;
  -- Il trigger purchase_order_items_copia_misure salva misure, riferimento
  -- e specifiche nei campi dedicati usati dal PDF e dall'email.
  return new;
end;
$$;
revoke all on function public.oda_dati_serramento_da_listino() from public, anon, authenticated;
drop trigger if exists oda_dati_serramento_da_listino on public.purchase_order_items;
create trigger oda_dati_serramento_da_listino
  before insert on public.purchase_order_items for each row execute function public.oda_dati_serramento_da_listino();
