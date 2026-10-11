/** Physical trace of the existing procurement, not a second purchase or expense. */
import {C,A,YEAR,AS_OF,MARK,uid,q,j,sql,guard,read,insert,plan,round,stamp} from './demo-company-history.mjs';
import {purchaseChapterCents} from './demo-company-history-money.mjs';
guard();const jobs=read('business-manifest').orders,d=read('before'),warehouse=d.warehouses.find(w=>w.is_default)||d.warehouses[0];
const catalog=[['Cemento 32.5 - sacco 25 kg','sacchi',7.5],['Malta premiscelata 25 kg','sacchi',8.9],['Rasante cementizio 25 kg','sacchi',14.5],['Laterizio forato','pz',1.8],['Gres 60x60 - scatola 1.44 mq','scatole',38],['Collante C2TE 25 kg','sacchi',19],['Stucco fughe 5 kg','confezioni',17],['Battiscopa gres 1 m','barre',8],['Lavabo ceramica','pz',140],['WC sospeso','pz',240],['Piatto doccia 80x120','pz',310],['Miscelatore lavabo','pz',75],['Cavo elettrico 3x2.5 100 m','bobine',125],['Tubo multistrato 20 mm 50 m','rotoli',95],['Presa elettrica completa','pz',14],['Raccordo a pressare','pz',8],['Finestra PVC 2 ante 120x140','pz',450],['Porta interna 80x210','pz',210],['Portafinestra 2 ante 140x220','pz',600],['Kit ferramenta','kit',90],['Idropittura 14 l','secchi',55],['Lastra cartongesso','lastre',13],['Profilo metallico 3 m','barre',5],['Nastro giunti 150 m','rotoli',12]];
const stocks=catalog.map(([name,unit,price],i)=>({id:uid('stock-'+i),company_id:C,warehouse_id:warehouse.id,name:`DEMO · ${name}`,description:MARK+' Lotto annuale dimostrativo. Unità '+unit,quantity:0,unit_cost:price,internal_code:`DEMO-H${YEAR}-SKU-${i+1}`,tracking_mode:'fungible',min_stock_level:0,created_at:`${YEAR}-01-01T08:00:00Z`}));
const batches=[stocks.map(s=>insert('warehouse_stock',s))],moves=[],usages=[];
for(const o of jobs.filter(o=>o.start<=AS_OF)){
  // Each rollback group must be self-contained; ON CONFLICT preserves real stock.
  const s=stocks.map(stock=>insert('warehouse_stock',stock)),materials=new Map(o.reports.map(r=>[r.id,[]])),purchaseNets=purchaseChapterCents(Math.round(o.materialCost*100));
  for(let group=0;group<6;group++){
    const familyCost=purchaseNets[group]/100;let allocated=0;
    const phaseDates=o.dates.filter((_,i)=>Math.min(5,Math.floor(i*6/40))===group),reports=o.reports.filter(r=>r.phaseId===uid(`phase-${o.index}-${group}`));
    for(let part=0;part<4;part++){
      const [name,unit,standard]=catalog[group*4+part],stock=stocks[group*4+part],qty=Math.max(1,Math.floor(familyCost*[.32,.28,.24,.16][part]/standard)),unitCost=part===3?Math.round((familyCost-allocated)/qty*1e6)/1e6:standard;allocated+=qty*unitCost;if(unitCost<=0)throw Error('Invalid physical unit cost');
      const base={company_id:C,stock_item_id:stock.id,order_item_id:uid(`item-${o.index}-${group}`),warehouse_id:warehouse.id,performed_by:A,unit_cost:unitCost,lot_number:`LOT-${o.code}-${group}-${part}`,notes:MARK+' Dettaglio dell’ODA esistente; non un altro costo.'};
      const incoming={...base,id:uid(`stock-in-${o.index}-${group}-${part}`),movement_type:'carico',quantity:qty,order_id:null,created_at:stamp(o.start,'07:00:00')};moves.push(incoming);s.push(insert('warehouse_movements',incoming));
      // Installation dates are phased. Unused packs on open jobs stay in stock.
      let used=0;
      for(const [n,date]of phaseDates.entries()){
        if(date>AS_OF)continue;const count=Math.floor(qty/phaseDates.length)+(n<qty%phaseDates.length?1:0);if(!count)continue;
        const movement={...base,id:uid(`stock-out-${o.index}-${group}-${part}-${date}`),movement_type:'scarico',quantity:count,order_id:o.id,created_at:stamp(date,'08:00:00')};moves.push(movement);s.push(insert('warehouse_movements',movement));used+=count;
      }
      if(reports.length){for(const [n,r]of reports.entries()){const count=Math.floor(used/reports.length)+(n<used%reports.length?1:0);if(count)materials.get(r.id).push({stock_item_id:stock.id,order_item_id:base.order_item_id,nome:'DEMO · '+name,quantita:count,unita:unit,fase_id:r.phaseId,demo_marker:MARK});}}
      usages.push({order:o.id,stock:stock.id,purchased:qty,used,residual:qty-used});
    }if(round(allocated)!==familyCost)throw Error('Physical budget split differs from saved PO');
  }
  for(const [id,rows]of materials)s.push(`update campo_rapportini set materiali_usati=${j(rows)},note=${q(MARK+' Utilizzi fisici dell’ODA esistente. Materiali non ancora impiegati restano in giacenza; nessun costo o pagamento duplicato.')} where id=${q(id)} and company_id=${q(C)} and order_id=${q(o.id)} and approvato;`);
  s.push(`do $$begin if abs((select consuntivo from v_ordine_marginalita where id=${q(o.id)})-${o.consuntivo})>.025 then raise exception 'Inventory duplicated financial costs';end if;end $$;`);batches.push(s);
}
batches.push([...stocks.map(stock=>insert('warehouse_stock',stock)),...stocks.map(stock=>`update warehouse_stock s set quantity=(select coalesce(sum(case when movement_type='carico' then quantity else -quantity end),0) from warehouse_movements m where m.company_id=${q(C)} and m.stock_item_id=s.id) where s.company_id=${q(C)} and s.id=${q(stock.id)};`)]);
plan('warehouse',batches,{company:C,year:YEAR,stocks,movements:moves.length,usages,newFinancialCosts:0});
