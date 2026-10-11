/** Repartition demo chapter prices by centimes; generated totals stay authoritative. */
import {C,YEAR,MARK,uid,q,sql,guard,read,plan,round} from './demo-company-history.mjs';
import {purchaseChapterCents} from './demo-company-history-money.mjs';
guard();const orders=read('business-manifest').orders,groups=[];
for(let i=0;i<orders.length;i+=8){const s=[];
 for(const o of orders.slice(i,i+8)){
  const po=uid('po-'+o.index),tax=round(o.materialCost*.22),nets=purchaseChapterCents(Math.round(o.materialCost*100));
  for(const [group,cents]of nets.entries()){
   const price=cents/100,item=uid(`item-${o.index}-${group}`),stock=uid('stock-'+(group*4+3));
   s.push(`update purchase_order_items set unit_price=${price},notes=${q(MARK+' Prezzo del capitolo DEMO ripartito ai centesimi; IVA calcolata dal sistema. Totale netto del contratto di fornitura invariato.')} where company_id=${q(C)} and purchase_order_id=${q(po)} and id=${q(uid(`po-row-${o.index}-${group}`))};`);
   s.push(`update order_items set purchase_price=${price},standard_cost=${price} where order_id=${q(o.id)} and id=${q(item)};`);
   if(o.start<= '2026-10-10')s.push(`with residual as (select round((${price}-(select sum(quantity*unit_cost) from warehouse_movements where company_id=${q(C)} and order_item_id=${q(item)} and movement_type='carico' and stock_item_id<>${q(stock)}))/quantity,6) price from warehouse_movements where company_id=${q(C)} and order_item_id=${q(item)} and movement_type='carico' and stock_item_id=${q(stock)}) update warehouse_movements set unit_cost=(select price from residual) where company_id=${q(C)} and order_item_id=${q(item)} and stock_item_id=${q(stock)};`);
  }
  s.push(`do $$begin if exists(select 1 from purchase_orders where company_id=${q(C)} and id=${q(po)} and (subtotal<>${o.materialCost} or vat_total<>${tax} or total<>${round(o.materialCost+tax)})) or abs((select consuntivo from v_ordine_marginalita where id=${q(o.id)})-${o.consuntivo})>.025 then raise exception 'Purchase rounding mismatch';end if;end $$;`);
 }groups.push(s);
}
plan('rounding',groups,{company:C,year:YEAR,orders:orders.length,newNetCosts:0,newCash:0});
