import type { PurchaseOrder,PurchaseOrderItem } from "@/hooks/usePurchaseOrders";
import {recapitiFornitore} from "./fornitore";
import {descrizioneConMisure} from "@/lib/acquisti/misureSuDocumenti";
import {applicaDettagliOda} from "@/lib/orders/dettagliDocumentoOda";
import {totaliRigheOda} from "@/lib/orders/articoloAcquisto";
import type {DocumentoOperativo} from "./modello";

/** Medesimo documento nella scheda ordine e nei confronti DDT/fattura. */
export function documentoDaOrdineAcquisto(order:PurchaseOrder,items:PurchaseOrderItem[]):DocumentoOperativo {
 const supplier=order.suppliers;
 const recapiti=recapitiFornitore({...supplier,id:order.supplier_id,name:supplier?.name||'Fornitore'});
 const totali=totaliRigheOda(items);
 return applicaDettagliOda({tipo:'materiali',numero:order.oda_number,data:order.issue_date,prezziDaConfermare:items.some(i=>i.price_pending),...recapiti,
  commessa:order.orders?.order_code,codiceCliente:supplier?.codice_cliente,luogo:order.delivery_address||order.orders?.work_address,
  indirizzoCantiere:order.orders?.work_address,magazzinoId:order.delivery_warehouse_id,destinazioneTipo:order.delivery_warehouse_id?'magazzino':order.order_id?'cantiere':order.delivery_address?'altro':'magazzino',riferimento:order.supplier_reference,
  consegna:order.expected_delivery_date,pagamento:order.payment_terms||recapiti.pagamento,note:order.notes,
  righe:items.map(i=>({origineId:i.id,specifiche:{riferimento:i.riferimento,sku:i.sku,misure:i.misure,colore:i.colore,apertura:i.apertura,dettagli:i.misure_testo},descrizione:descrizioneConMisure(i.description,i.misure_testo),nota:i.notes,unita:i.unit_of_measure||'pz',quantita:Number(i.quantity),prezzo:i.price_pending?null:Number(i.unit_price),sconto:Number(i.discount_percent),iva:Number(i.vat_rate),importo:i.price_pending?undefined:Number(i.line_total)})),
  totali:{imponibile:totali.imponibile,iva:totali.iva,totale:totali.totale},
 },order.document_details);
}
