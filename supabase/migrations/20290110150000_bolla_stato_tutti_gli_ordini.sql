-- La bolla è «ricevuta» solo se sono completi tutti gli ordini che consegna (08/11/2026).
-- Prima `bolla_registra_arrivo` guardava solo gli ordini del giro appena fatto.
--
-- Nessuna riga viene scritta. Rieseguirla non fa niente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $migrazione$
declare
  vecchio text := $o$  if v_ordini > 0 then
    update public.ddt_ricezione x$o$;
  nuovo text := $n$  if v_ordini > 0 then
    -- Ricevuta solo se sono completi TUTTI gli ordini che consegna, non solo quelli di questo giro.
    v_completi := not exists (
      select 1 from public.purchase_order_items p
       where p.purchase_order_id in (
               select d.purchase_order_id where d.purchase_order_id is not null
               union
               select i.purchase_order_id from public.ddt_righe r
                 join public.purchase_order_items i on i.id = r.purchase_order_item_id
                where r.ddt_ricezione_id = p_ddt)
         and coalesce(p.quantity_received, 0) < p.quantity);
    update public.ddt_ricezione x$n$;
  def text := pg_get_functiondef('public.bolla_registra_arrivo(uuid)'::regprocedure);
begin
  if position('Ricevuta solo se sono completi' in def) > 0 then
    return;
  end if;
  if position(vecchio in def) = 0 then
    raise exception 'Pezzo non trovato in bolla_registra_arrivo';
  end if;
  execute replace(def, vecchio, nuovo);
end
$migrazione$;
