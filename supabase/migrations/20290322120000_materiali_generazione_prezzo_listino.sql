-- «Genera dal computo» (14/11/2026): il prezzo del listino del fornitore arriva sulla riga.
--
-- Fino a oggi materiali_salva_generazione prendeva il prezzo solo dall'articolo
-- collegato (article_templates): un materiale collegato a una voce di
-- listino_fornitore_voci («Cemento CEM II sacco 25 kg», 4,68 € netti) si salvava a
-- 0 €, anche se la finestra lo mostrava col prezzo. Ora, quando l'articolo non dà un
-- prezzo, vale quello della riga (purchase_price, già netto di sconto e per l'unità
-- d'acquisto) con la sua fonte (prezzo_fonte, 'listino'). Il resto della funzione è
-- identico a 20281222140000_materiali_quantita_decimali.
create or replace function public.materiali_salva_generazione(p_order uuid, p_righe jsonb, p_escluse jsonb default '[]'::jsonb, p_avvisi jsonb default '[]'::jsonb, p_computo uuid default null::uuid)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  azienda uuid;
  fasi uuid[];
  bloccata text;
  a_mano jsonb;
  liberi uuid[];
  tenute text[];
  inserite integer;
  tolte integer;
  saltate integer;
begin
  select o.company_id into azienda from public.orders o where o.id = p_order;
  if azienda is null then
    raise exception 'Commessa non trovata' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_righe, '[]'::jsonb)) <> 'array' then
    raise exception 'Righe non valide' using errcode = '22023';
  end if;

  select array_agg(distinct (r->>'phase_id')::uuid) filter (where r->>'phase_id' is not null)
    into fasi from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) r;

  if exists (select 1 from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) r
              where r->>'phase_id' is not null
                and not exists (select 1 from public.order_work_phases w where w.id = (r->>'phase_id')::uuid and w.order_id = p_order)) then
    raise exception 'Una fase indicata non è di questa commessa' using errcode = '22023';
  end if;

  select w.name into bloccata
    from public.materiali_fasi_validazione v join public.order_work_phases w on w.id = v.phase_id
   where v.order_id = p_order and v.stato <> 'bozza' and v.phase_id = any(coalesce(fasi, '{}'))
   limit 1;
  if bloccata is not null then
    raise exception 'La fase «%» è inviata al tecnico o validata: va rimessa in bozza prima di rigenerare i materiali', bloccata
      using errcode = '22023';
  end if;

  select coalesce(array_agg(oi.id), '{}'),
         coalesce(jsonb_object_agg(oi.chiave_materiale, oi.quantity)
                    filter (where oi.chiave_materiale is not null
                              and oi.quantita_calcolata is not null
                              and oi.quantity is distinct from oi.quantita_calcolata
                              and oi.quantity is distinct from ceil(oi.quantita_calcolata)), '{}'::jsonb)
    into liberi, a_mano
    from public.order_items oi
   where oi.order_id = p_order
     and oi.natura_riga = 'materiale'
     and oi.origine_materiale in ('computo', 'planimetria')
     and oi.supplier_rfq_item_id is null
     and oi.status = 'da_ordinare'
     and coalesce(oi.quantity_received, 0) = 0
     and not exists (select 1 from public.purchase_order_items poi
                       join public.purchase_orders po on po.id = poi.purchase_order_id
                      where poi.order_item_id = oi.id and po.status <> 'annullato')
     and (oi.phase_id is null or not exists (
           select 1 from public.materiali_fasi_validazione v where v.phase_id = oi.phase_id and v.stato <> 'bozza'));

  select coalesce(array_agg(oi.chiave_materiale), '{}') into tenute
    from public.order_items oi
   where oi.order_id = p_order and oi.chiave_materiale is not null
     and oi.origine_materiale in ('computo', 'planimetria')
     and not (oi.id = any(liberi));

  delete from public.order_items where id = any(liberi);
  get diagnostics tolte = row_count;

  insert into public.order_items (
    order_id, name, description, quantity, status, natura_riga, phase_id, supplier_id, article_template_id,
    purchase_price, prezzo_fonte, categoria, unita_misura, specifiche, origine_materiale, quantita_netta, quantita_calcolata,
    sfrido, origini, chiave_materiale, computo_voce_id, scomposizione_id, planimetria_documento_id, locale, position)
  select p_order,
         left(x.r->>'descrizione', 500),
         nullif(x.r->>'specifiche', ''),
         round(coalesce((a_mano->>(x.r->>'chiave'))::numeric, (x.r->>'quantita_calcolata')::numeric), 4),
         'da_ordinare', 'materiale', (x.r->>'phase_id')::uuid, (x.r->>'supplier_id')::uuid, at.id,
         -- Prima l'articolo dell'azienda, poi il prezzo della riga (listino del fornitore).
         coalesce(nullif(at.prezzo_acquisto_netto, 0), nullif(at.standard_cost, 0), riga.prezzo, 0),
         case
           when nullif(at.prezzo_acquisto_netto, 0) is not null or nullif(at.standard_cost, 0) is not null then null
           when riga.prezzo is not null and x.r->>'prezzo_fonte' in ('listino', 'ultimo_acquisto', 'scomposizione') then x.r->>'prezzo_fonte'
         end,
         x.r->>'categoria', x.r->>'unita_misura', nullif(x.r->>'specifiche', ''),
         coalesce(x.r->>'origine', 'computo'),
         (x.r->>'quantita_netta')::numeric, (x.r->>'quantita_calcolata')::numeric, (x.r->>'sfrido')::numeric,
         coalesce(x.r->'origini', '[]'::jsonb), x.r->>'chiave',
         (x.r->>'computo_voce_id')::uuid, (x.r->>'scomposizione_id')::uuid,
         (x.r->>'planimetria_documento_id')::uuid, x.r->>'locale',
         1000 + x.n::integer
    from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) with ordinality as x(r, n)
    left join public.article_templates at on at.id = (x.r->>'article_template_id')::uuid and at.company_id = azienda
    cross join lateral (
      select case when jsonb_typeof(x.r->'purchase_price') = 'number' and (x.r->>'purchase_price')::numeric > 0
                  then round((x.r->>'purchase_price')::numeric, 4) end as prezzo
    ) riga
   where coalesce((x.r->>'quantita_calcolata')::numeric, 0) > 0
     and not ((x.r->>'chiave') = any(tenute));
  get diagnostics inserite = row_count;

  saltate := jsonb_array_length(coalesce(p_righe, '[]'::jsonb)) - inserite;

  insert into public.materiali_generazioni (company_id, order_id, computo_upload_id, righe, escluse, avvisi)
  values (azienda, p_order, p_computo, inserite, coalesce(p_escluse, '[]'::jsonb), coalesce(p_avvisi, '[]'::jsonb));

  return jsonb_build_object('inserite', inserite, 'sostituite', tolte, 'saltate', saltate);
end;
$function$;
