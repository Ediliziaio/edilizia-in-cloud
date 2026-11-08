-- Correzioni dopo la revisione della fase 7 (8/11/2026). Solo funzioni: nessuna riga viene scritta.
--
-- 1. Bolle: due fornitori diversi con lo stesso numero sulla stessa commessa non sono un doppione.
--    La commessa conta solo se un fornitore non si riesce a leggere. Gli scontrini restano sulla
--    stessa data, come prima: la loro numerazione riparte ogni giorno.
-- 2. L'operaio carica la bolla e poi la spunta con lo stesso numero: è la stessa carta, si collegano.
-- 3. Una bolla già scritta senza ordine si aggancia; una che copre due ordini non blocca più la spunta.
-- 4. Un arrivo parziale non riporta indietro una riga «shipped» o «received».
-- 5. Su un ordine con più commesse il permesso si guarda riga per riga.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function pg_temp.arrivo_correggi(p_nome text, p_vecchio text, p_nuovo text)
 returns void
 language plpgsql
as $function$
declare
  v_def text;
  v_volte int;
begin
  select pg_get_functiondef(p.oid) into strict v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_nome;
  if position(p_nuovo in v_def) > 0 then
    return;
  end if;
  v_volte := (length(v_def) - length(replace(v_def, p_vecchio, ''))) / length(p_vecchio);
  if v_volte <> 1 then
    raise exception '%: il punto da correggere compare % volte', p_nome, v_volte;
  end if;
  execute replace(v_def, p_vecchio, p_nuovo);
end;
$function$;

create or replace function public.bolla_stessa_provenienza(a_id uuid, a_nome text, a_order uuid, b_id uuid, b_nome text, b_order uuid)
 returns boolean
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when a_id is not null and b_id is not null then a_id = b_id
    when length(public.bolla_fornitore_norma(a_nome)) >= 4 and length(public.bolla_fornitore_norma(b_nome)) >= 4
      then public.bolla_stesso_fornitore(a_id, a_nome, b_id, b_nome)
    else a_order is not null and a_order = b_order
  end;
$function$;
revoke all on function public.bolla_stessa_provenienza(uuid, text, uuid, uuid, text, uuid) from public, anon, authenticated;

select pg_temp.arrivo_correggi('bolla_controllo_campo',
$v$     and abs(coalesce(a.data_documento, a.giorno) - v_data) <= 120
     and (public.bolla_stesso_fornitore(a.supplier_id, a.fornitore, new.supplier_id, v_nome)
          or a.order_id is not distinct from new.order_id)$v$,
$n$     and (a.tipo_documento in ('bolla', 'altro')) = (new.tipo_documento in ('bolla', 'altro'))
     and case when new.tipo_documento in ('bolla', 'altro')
              then abs(coalesce(a.data_documento, a.giorno) - v_data) <= 120
              else coalesce(a.data_documento, a.giorno) = v_data end
     and public.bolla_stessa_provenienza(a.supplier_id, a.fornitore, a.order_id, new.supplier_id, v_nome, new.order_id)$n$);

select pg_temp.arrivo_correggi('bolla_controllo_campo',
$v$       and (public.bolla_stesso_fornitore(d.supplier_id, s.name, new.supplier_id, v_nome)
            or d.order_id is not distinct from new.order_id)$v$,
$n$       and public.bolla_stessa_provenienza(d.supplier_id, s.name, d.order_id, new.supplier_id, v_nome, new.order_id)$n$);

select pg_temp.arrivo_correggi('bolla_controllo_ufficio',
$v$     and (public.bolla_stesso_fornitore(a.supplier_id, a.fornitore, new.supplier_id, v_nome)
          or a.order_id is not distinct from new.order_id)$v$,
$n$     and public.bolla_stessa_provenienza(a.supplier_id, a.fornitore, a.order_id, new.supplier_id, v_nome, new.order_id)$n$);

select pg_temp.arrivo_correggi('arrivo_allinea_riga',
$v$           when c.quantita > 0 and c.buoni >= c.quantita then 'delivered'
           else 'not_started' end
   where$v$,
$n$           when c.quantita > 0 and c.buoni >= c.quantita then 'delivered'
           when oi.fulfillment_status = 'delivered' then 'not_started'
           else oi.fulfillment_status end
   where$n$);

select pg_temp.arrivo_correggi('arrivo_allinea_riga',
$v$               when c.quantita > 0 and c.buoni >= c.quantita then 'delivered'
               else 'not_started' end);$v$,
$n$               when c.quantita > 0 and c.buoni >= c.quantita then 'delivered'
               when oi.fulfillment_status = 'delivered' then 'not_started'
               else oi.fulfillment_status end);$n$);

-- Permessi riga per riga
select pg_temp.arrivo_correggi('arrivo_elenco',
$v$  if not public.arrivo_puo_registrare(v_company, v_order) then
    raise exception 'Non puoi vedere$v$,
$n$  if v_order is not null and not exists (
       select 1 from public.purchase_order_items p join public.order_items oi on oi.id = p.order_item_id
        where p.purchase_order_id = po.id and public.arrivo_puo_registrare(v_company, oi.order_id)) then
    raise exception 'Non puoi vedere$n$);

select pg_temp.arrivo_correggi('arrivo_elenco',
$v$       where p.purchase_order_id = po.id and public.riga_e_su_misura(p.order_item_id)), '[]'::jsonb),$v$,
$n$       where p.purchase_order_id = po.id and public.riga_e_su_misura(p.order_item_id)
         and public.arrivo_puo_registrare(v_company, oi.order_id)), '[]'::jsonb),$n$);

select pg_temp.arrivo_correggi('arrivo_riordina',
$v$  if not public.arrivo_puo_riordinare(v_company, v_order) then$v$,
$n$  if exists (select 1 from public.arrivi_posizione x join public.order_items o on o.id = x.order_item_id
              where x.id = any (p_esiti) and not public.arrivo_puo_riordinare(v_company, o.order_id)) then$n$);

select pg_temp.arrivo_correggi('arrivo_registra',
$v$  if not public.arrivo_puo_registrare(v_company, v_order) then
    raise exception 'Non puoi registrare$v$,
$n$  if not exists (select 1 from public.purchase_order_items i join public.order_items oi on oi.id = i.order_item_id
                  where i.purchase_order_id = po.id and public.arrivo_puo_registrare(v_company, oi.order_id)) then
    raise exception 'Non puoi registrare$n$);

select pg_temp.arrivo_correggi('arrivo_registra',
$v$    select coalesce(sum(a.quantita) filter (where a.stato = 'aperto' and a.esito = 'mancante'), 0),$v$,
$n$    if not public.arrivo_puo_registrare(v_company, (select oi.order_id from public.order_items oi where oi.id = p.order_item_id)) then
      v_saltate := v_saltate || jsonb_build_object('poi_id', p.id, 'descrizione', p.description, 'motivo', 'cantiere non tuo');
      continue;
    end if;

    select coalesce(sum(a.quantita) filter (where a.stato = 'aperto' and a.esito = 'mancante'), 0),$n$);

-- La bolla: stessa carta dell'operaio, già scritta senza ordine, o a cavallo di due ordini
select pg_temp.arrivo_correggi('arrivo_registra',
$v$  v_numero text;
$v$,
$n$  v_numero text;
  v_ddt_ordine uuid;
$n$);

select pg_temp.arrivo_correggi('arrivo_registra',
$v$    select d.id into v_ddt from public.ddt_ricezione d
     where d.company_id = v_company and d.purchase_order_id = po.id
       and upper(btrim(d.numero_ddt)) = upper(v_numero)
     order by d.created_at limit 1;
    if v_ddt is null then$v$,
$n$    update public.campo_acquisti a
       set purchase_order_id = po.id
     where a.company_id = v_company and a.order_id = v_order
       and a.purchase_order_id is null and a.ddt_ricezione_id is null and a.company_cost_id is null
       and a.stato = 'da_verificare' and a.tipo_documento in ('bolla', 'altro')
       and public.bolla_numero_norma(v_numero) <> ''
       and public.bolla_numero_norma(a.numero_documento) = public.bolla_numero_norma(v_numero);

    select d.id, d.purchase_order_id into v_ddt, v_ddt_ordine from public.ddt_ricezione d
     where d.company_id = v_company and d.supplier_id is not distinct from po.supplier_id
       and (upper(btrim(d.numero_ddt)) = upper(v_numero)
            or (public.bolla_numero_norma(v_numero) <> '' and public.bolla_numero_norma(d.numero_ddt) = public.bolla_numero_norma(v_numero)))
     order by case when d.purchase_order_id = po.id then 0 when d.purchase_order_id is null then 1 else 2 end, d.created_at
     limit 1;
    if v_ddt is not null and v_ddt_ordine is null then
      update public.ddt_ricezione d set purchase_order_id = po.id where d.id = v_ddt;
    elsif v_ddt is not null and v_ddt_ordine <> po.id then
      v_numero := v_numero || ' ' || po.oda_number;
      select d.id into v_ddt from public.ddt_ricezione d
       where d.company_id = v_company and d.purchase_order_id = po.id and upper(btrim(d.numero_ddt)) = upper(v_numero)
       order by d.created_at limit 1;
    end if;
    if v_ddt is null then$n$);
