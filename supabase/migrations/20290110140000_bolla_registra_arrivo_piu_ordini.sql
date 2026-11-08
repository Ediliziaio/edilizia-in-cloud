-- Dalla bolla abbinata si registra l'arrivo su tutti gli ordini che consegna (08/11/2026).
--
-- `bolla_registra_arrivo` raggruppa le righe abbinate per ordine e passa da
-- `oda_registra_arrivo`: stessi controlli, stesso tetto al residuo, stato dell'ordine che avanza.
-- La riga segnata `arrivo_registrato_il` non si conta due volte. La merce su misura resta fuori:
-- si spunta per posizione. La giacenza non si tocca: il carico ha la sua strada.
-- `bolla_tocca_ordine` fa accettare la stessa bolla agli altri ordini che consegna.
--
-- Nessuna riga viene scritta. Rieseguirla non fa niente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.ddt_righe add column if not exists arrivo_registrato_il timestamptz;

create or replace function public.bolla_tocca_ordine(p_ddt uuid, p_po uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (select 1 from public.ddt_ricezione d where d.id = p_ddt and d.purchase_order_id = p_po)
      or exists (select 1 from public.ddt_righe r
                   join public.purchase_order_items p on p.id = r.purchase_order_item_id
                  where r.ddt_ricezione_id = p_ddt and p.purchase_order_id = p_po);
$function$;
revoke all on function public.bolla_tocca_ordine(uuid, uuid) from public, anon, authenticated;

do $migrazione$
declare
  rec record;
  def text;
begin
  for rec in select * from (values
    ('public.oda_registra_arrivo(uuid,jsonb,text,date,uuid,text,text,uuid)',
     $o$WHERE id = p_ddt_id AND purchase_order_id = p_oda_id AND company_id = v_company_id;$o$,
     $n$WHERE id = p_ddt_id AND company_id = v_company_id AND public.bolla_tocca_ordine(p_ddt_id, p_oda_id);$n$),
    ('public.arrivo_registra(uuid,jsonb,uuid,text,date,uuid)',
     $o$and (d.purchase_order_id = po.id or d.purchase_order_id is null) for update;$o$,
     $n$and (d.purchase_order_id = po.id or d.purchase_order_id is null or public.bolla_tocca_ordine(d.id, po.id)) for update;$n$),
    ('public.arrivo_elenco(uuid,uuid)',
     $o$and (d.purchase_order_id = po.id or d.purchase_order_id is null)), '[]'::jsonb)$o$,
     $n$and (d.purchase_order_id = po.id or d.purchase_order_id is null or public.bolla_tocca_ordine(d.id, po.id))), '[]'::jsonb)$n$)
  ) as v(firma, vecchio, nuovo) loop
    def := pg_get_functiondef(rec.firma::regprocedure);
    if position(rec.nuovo in def) > 0 then
      continue;
    end if;
    if position(rec.vecchio in def) = 0 then
      raise exception 'Pezzo non trovato in %: %', rec.firma, left(rec.vecchio, 50);
    end if;
    execute replace(def, rec.vecchio, rec.nuovo);
  end loop;
end
$migrazione$;

create or replace function public.bolla_registra_arrivo(p_ddt uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid := public.get_my_company_id();
  d public.ddt_ricezione%rowtype;
  v_po record;
  v_esito record;
  v_righe integer := 0;
  v_quantita numeric := 0;
  v_ordini integer := 0;
  v_errori jsonb := '[]'::jsonb;
  v_completi boolean := true;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(v_company)
     or not exists (select 1 from unnest(array['can_edit_orders', 'can_manage_purchasing', 'can_edit_warehouse']) x
                     where public.has_permission_for_company(auth.uid(), x, v_company)) then
    raise exception 'Non puoi registrare arrivi merce' using errcode = '42501';
  end if;
  select * into d from public.ddt_ricezione where id = p_ddt and company_id = v_company for update;
  if not found then
    raise exception 'Bolla non trovata' using errcode = 'P0002';
  end if;

  for v_po in
    select x.po_id, jsonb_agg(jsonb_build_object('item_id', x.poi, 'quantity', x.q)) as righe
      from (select p.purchase_order_id as po_id, r.purchase_order_item_id as poi, sum(r.quantita) as q
              from public.ddt_righe r
              join public.purchase_order_items p on p.id = r.purchase_order_item_id
              join public.purchase_orders po on po.id = p.purchase_order_id
             where r.ddt_ricezione_id = p_ddt and r.arrivo_registrato_il is null and coalesce(r.quantita, 0) > 0
               and po.status <> 'annullato' and not public.riga_e_su_misura(p.order_item_id)
             group by 1, 2) x
     group by x.po_id
  loop
    select * into v_esito from public.oda_registra_arrivo(v_po.po_id, v_po.righe, null, d.data_ricezione::date, null, null, null, p_ddt);
    v_ordini := v_ordini + 1;
    v_righe := v_righe + v_esito.righe_registrate;
    v_quantita := v_quantita + v_esito.quantita_totale;
    v_completi := v_completi and v_esito.oda_completo;
    v_errori := v_errori || coalesce(v_esito.errori, '[]'::jsonb);

    -- «già completa» non è un errore: quella merce era già stata registrata dall'ordine.
    update public.ddt_righe r set arrivo_registrato_il = now()
      from public.purchase_order_items p
     where p.id = r.purchase_order_item_id and p.purchase_order_id = v_po.po_id
       and r.ddt_ricezione_id = p_ddt and r.arrivo_registrato_il is null and coalesce(r.quantita, 0) > 0
       and not public.riga_e_su_misura(p.order_item_id)
       and not exists (select 1 from jsonb_array_elements(coalesce(v_esito.errori, '[]'::jsonb)) e
                        where e->>'item_id' = r.purchase_order_item_id::text and e->>'errore' <> 'gia_completa');
  end loop;

  if v_ordini > 0 then
    update public.ddt_ricezione x
       set stato = case when x.stato in ('verificato', 'non_conforme') then x.stato when v_completi then 'ricevuto' else 'parziale' end
     where x.id = p_ddt;
  end if;

  return jsonb_build_object('ordini', v_ordini, 'righe', v_righe, 'quantita', v_quantita, 'errori', v_errori);
end;
$function$;
revoke all on function public.bolla_registra_arrivo(uuid) from public, anon;
grant execute on function public.bolla_registra_arrivo(uuid) to authenticated;
