-- Confine d'azienda nel trigger ricezioni→ODA (hardening di 20280121).
--
-- Il fallback "senza DDT" cercava l'ordine collegato all'articolo di
-- commessa SENZA vincolo di azienda: con un link sporco cross-tenant in
-- purchase_order_items (trovati 2 casi nei dati demo), la ricezione
-- dell'azienda A avrebbe potuto far avanzare l'ordine dell'azienda B.
-- Ora il candidato deve appartenere alla STESSA azienda della ricezione;
-- fuori confine = nessun candidato = non si tocca niente.

create or replace function public.trg_goods_receipt_muove_oda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_item uuid;
  v_company uuid;
  v_po uuid;
  v_quanti int;
begin
  v_order_item := coalesce(new.order_item_id, old.order_item_id);
  v_company := coalesce(new.company_id, old.company_id);

  -- L'ordine lo dice il DDT, quando c'e': e' il segnale esplicito.
  -- (Anche qui: mai oltre il confine dell'azienda della ricezione.)
  if coalesce(new.ddt_ricezione_id, old.ddt_ricezione_id) is not null then
    select purchase_order_id into v_po
      from ddt_ricezione
     where id = coalesce(new.ddt_ricezione_id, old.ddt_ricezione_id)
       and company_id = v_company;
  end if;

  -- Senza DDT: l'ordine collegato all'articolo — solo se e' UNO solo,
  -- e della stessa azienda della ricezione.
  if v_po is null then
    select count(distinct purchase_order_id), min(purchase_order_id::text)::uuid
      into v_quanti, v_po
      from purchase_order_items
     where order_item_id = v_order_item
       and company_id = v_company;
    if coalesce(v_quanti, 0) <> 1 then
      return coalesce(new, old); -- zero o piu' ordini: ambiguo, non si indovina
    end if;
  end if;

  perform ricalcola_ricezione_oda(v_po);
  return coalesce(new, old);
end;
$$;
