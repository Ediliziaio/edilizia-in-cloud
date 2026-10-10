import type { CashFlowResult, CashFlowMese } from '@/hooks/controlloGestione/useCashFlow';
export interface ForecastDue { id: string; direction: string; description: string; amount: number; paid_amount: number | null; due_date: string; status: string; cost_id: string | null; invoice_id: string | null; order_id: string | null; notes?: string | null; auto_source?: string | null }
export interface ForecastPayment { id: string; direction: string; amount: number; entry_date: string; scadenza_id: string | null; cost_id: string | null; installment_id: string | null; invoice_id?: string | null; documento_fiscale_id?: string | null }
export interface ForecastCost { id: string; name: string; amount: number; vat_rate: number | null; due_date: string | null; is_paid: boolean | null; payment_method?: string | null }
export interface ForecastRate { id: string; order_id: string; label: string | null; amount: number; expected_date: string | null; is_paid: boolean; invoice_id: string | null; documento_fiscale_id?: string | null }
export interface ForecastManual { id: string; anno: number; mese: number; tipo: string; descrizione: string; importo: number; ricorrente: boolean | null }
type Item = { date: string; direction: 'entrata' | 'uscita'; kind: 'scadenze' | 'manuali' | 'costi' | 'commesse'; amount: number; label: string };
const cents = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 100);
const validDate = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
const unique = <T extends { id: string }>(rows: T[]) => [...new Map(rows.map(r => [r.id, r])).values()];
// Native invoice triggers persist their authoritative reference in this marker.
// Ordinary descriptions/notes are never used to guess invoice ownership.
const dueInvoiceIds = (d: ForecastDue): string[] => {
  const markers = d.auto_source === 'documento_fiscale'
    ? [...(d.notes ?? '').matchAll(/\[DOC:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi)]
    : [];
  const native = new Set(markers.map(m => m[1].toLowerCase()));
  return [...new Set([d.invoice_id, native.size === 1 ? [...native][0] : null].filter((id): id is string => !!id))];
};

/** Documented residual commitments, not accrual expenses. Never projects today's bank balance backwards. */
export function projectedCashFlow(input: {
  companyId: string; year: number; from?: number; to?: number; today: string; opening: number;
  dues: ForecastDue[]; payments: ForecastPayment[]; costs: ForecastCost[]; rates: ForecastRate[]; manuals: ForecastManual[];
}): CashFlowResult {
  const { today, year } = input;
  if (!validDate(today) || year < Number(today.slice(0,4)) || year > Number(today.slice(0,4)) + 5) throw new Error('La previsione è disponibile solo per l’anno corrente e i prossimi cinque anni.');
  if (!Number.isFinite(input.opening)) throw new Error('Serve un saldo bancario disponibile per il previsionale.');
  const items: Item[] = []; let overdue = 0;
  const verifiche: NonNullable<CashFlowResult['verifiche']> = [];
  const flag = (source: Omit<NonNullable<CashFlowResult['verifiche']>[number], 'motivo'>, motivo: string) => {
    if (!verifiche.some(v => v.id === source.id && v.origine === source.origine)) verifiche.push({ ...source, motivo });
  };
  const payments = unique(input.payments).filter(p => validDate(p.entry_date) && p.entry_date <= today && Number.isFinite(Number(p.amount)) && Number(p.amount) > 0);
  const paid = (field: 'scadenza_id' | 'cost_id' | 'installment_id', id: string, direction: string) => payments.filter(p=>p[field]===id&&p.direction===direction).reduce((s,p)=>s+cents(p.amount),0);
  const add = (date: string | null, amount: number, direction: string, kind: Item['kind'], label: string, source: Omit<NonNullable<CashFlowResult['verifiche']>[number], 'motivo'>) => {
    // A zero residual is not a commitment requiring a payment date.
    if (amount === 0) return;
    if (!Number.isFinite(amount) || amount < 0 || !['entrata','uscita'].includes(direction) || !validDate(date)) {
      flag(source, !validDate(date) ? 'Manca una data di pagamento valida.' : 'Importo o direzione da verificare.'); return;
    }
    if (date! < today) overdue++;
    items.push({ date: date! < today ? today : date!, amount, direction: direction as Item['direction'], kind, label });
  };
  const dues = unique(input.dues);
  const extraPayments=new Map<string,number>();
  const groupKey=(d: ForecastDue)=>d.direction==='uscita'&&d.cost_id ? 'cost:'+d.cost_id : dueInvoiceIds(d)[0] ? d.direction+':invoice:'+dueInvoiceIds(d)[0] : null;
  for(const d of dues){
    const key=groupKey(d);if(!key||extraPayments.has(key))continue;
    const group=dues.filter(x=>groupKey(x)===key&&x.status!=='annullata');
    const declared=group.reduce((s,x)=>s+(x.status==='pagata'?cents(x.amount):Math.max(cents(x.paid_amount),paid('scadenza_id',x.id,x.direction))),0);
    const refs=dueInvoiceIds(d);
    const actual=payments.filter(p=>p.direction===d.direction&&(d.direction==='uscita'&&d.cost_id?p.cost_id===d.cost_id:refs.some(id=>p.invoice_id===id||p.documento_fiscale_id===id))).reduce((s,p)=>s+cents(p.amount),0);
    extraPayments.set(key,Math.max(0,actual-declared));
  }
  for (const d of [...dues].sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date))||a.id.localeCompare(b.id))) {
    if (['pagata','annullata'].includes(d.status)) continue;
    let residual=Math.max(0,cents(d.amount)-Math.max(cents(d.paid_amount),paid('scadenza_id',d.id,d.direction)));
    const key=groupKey(d);
    if(key){const extra=extraPayments.get(key)??0,used=Math.min(residual,extra);residual-=used;extraPayments.set(key,extra-used);}
    add(d.due_date,residual,d.direction,'scadenze',d.description,{ id:d.id,origine:'scadenza',etichetta:d.description,order_id:d.order_id });
  }
  for (const c of unique(input.costs)) {
    // Linked dues own the schedule, even when already paid or cancelled.
    if (c.is_paid || c.payment_method==='internal_allocation' || dues.some(d=>d.cost_id===c.id&&d.direction==='uscita')) continue;
    const gross=cents(c.amount*(1+Number(c.vat_rate??0)/100));
    add(c.due_date,Math.max(0,gross-paid('cost_id',c.id,'uscita')),'uscita','costi',c.name,{ id:c.id,origine:'costo',etichetta:c.name });
  }
  for (const r of unique(input.rates)) {
    if (r.is_paid || Number(r.amount) === 0) continue;
    const invoiceIds=[r.invoice_id,r.documento_fiscale_id].filter((id):id is string=>!!id);
    if (invoiceIds.length && dues.some(d=>dueInvoiceIds(d).some(id=>invoiceIds.includes(id))&&d.direction==='entrata')) continue;
    const source={ id:r.id,origine:'rata' as const,etichetta:r.label??'Rata commessa',order_id:r.order_id };
    const ambiguousDue = dues.some(d => {
      if (d.order_id !== r.order_id || d.direction !== 'entrata' || ['pagata','annullata'].includes(d.status)) return false;
      if (cents(d.amount) <= Math.max(cents(d.paid_amount), paid('scadenza_id', d.id, 'entrata'))) return false;
      const refs = dueInvoiceIds(d);
      // An invoiced deposit owns its dues; it must not suppress a separate,
      // still-unbilled balance in the same explicit job payment plan.
      return !input.rates.some(other => other.id !== r.id && other.order_id === r.order_id &&
        [other.invoice_id,other.documento_fiscale_id].some(id => !!id && refs.includes(id)));
    });
    if (!invoiceIds.length && ambiguousDue) { flag(source,'Collega la rata alla fattura: esistono scadenze non riconciliate di questa commessa, possibile doppio conteggio.'); continue; }
    const invoicePaid=payments.filter(p=>p.direction==='entrata'&&invoiceIds.some(id=>p.invoice_id===id||p.documento_fiscale_id===id)).reduce((s,p)=>s+cents(p.amount),0);
    if(invoicePaid && input.rates.some(other=>other.id!==r.id&&[other.invoice_id,other.documento_fiscale_id].some(id=>!!id&&invoiceIds.includes(id)))){
      flag(source,'Più rate sulla stessa fattura: collega gli incassi alle rate o alle scadenze per ripartire il residuo.');continue;
    }
    add(r.expected_date,Math.max(0,cents(r.amount)-Math.max(paid('installment_id',r.id,'entrata'),invoicePaid)),'entrata','commesse',r.label??'Rata commessa',source);
  }
  for (const m of unique(input.manuals)) {
    const source={ id:m.id,origine:'manuale' as const,etichetta:m.descrizione };
    if (!Number.isInteger(m.mese)||m.mese<1||m.mese>12||!Number.isInteger(m.anno)||m.anno<Number(today.slice(0,4))) { flag(source,'Anno o mese della voce manuale non valido.'); continue; }
    for(let month=m.mese;month<=(m.ricorrente?12:m.mese);month++) {
      const date=`${m.anno}-${String(month).padStart(2,'0')}-28`;
      if(date.slice(0,7)<today.slice(0,7))continue;
      add(date,cents(m.importo),m.tipo,'manuali',m.descrizione,source);
    }
  }
  let balance=cents(input.opening),opening=balance;
  const months: CashFlowMese[]=[];
  const currentYear=Number(today.slice(0,4)),currentMonth=Number(today.slice(5,7));
  const from=Math.max(year===currentYear?currentMonth:1,input.from??1),to=Math.min(12,input.to??12);
  for(let y=currentYear;y<=year;y++)for(let m=y===currentYear?currentMonth:1;m<=12;m++) {
    if(y===year&&m>to)break;
    const prefix=`${y}-${String(m).padStart(2,'0')}`,entries=items.filter(i=>i.date.startsWith(prefix));
    const entrate={scadenze:0,manuali:0,fatture:0,commesse:0},uscite={scadenze:0,personale:0,mutui:0,manuali:0,costi:0};
    for(const i of entries){if(i.direction==='entrata')entrate[i.kind==='costi'?'scadenze':i.kind]+=i.amount;else uscite[i.kind==='commesse'?'scadenze':i.kind]+=i.amount;}
    const netIn=Object.values(entrate).reduce((s,n)=>s+n,0),netOut=Object.values(uscite).reduce((s,n)=>s+n,0),start=balance;
    balance+=netIn-netOut;
    if(y===year&&m>=from){
      if(months.length===0)opening=start;
      months.push({mese:m,saldo_inizio:start/100,entrate:Object.fromEntries(Object.entries(entrate).map(([k,n])=>[k,n/100])) as typeof entrate,uscite:Object.fromEntries(Object.entries(uscite).map(([k,n])=>[k,n/100])) as typeof uscite,entrate_totali:netIn/100,uscite_totali:netOut/100,saldo_fine:balance/100,flusso_netto:(netIn-netOut)/100,sotto_zero:balance<0,dettaglio_entrate:entries.filter(i=>i.direction==='entrata').map(i=>({etichetta:i.label,importo:i.amount/100})),dettaglio_uscite:entries.filter(i=>i.direction==='uscita').map(i=>({etichetta:i.label,importo:i.amount/100}))});
    }
  }
  return { meta:{ company_id:input.companyId,anno:year,mese_da:from,mese_a:to,saldo_apertura:opening/100,saldo_chiusura:balance/100,generato_il:new Date().toISOString(),ancorato_al:today,scaduti:overdue,da_verificare:verifiche.length },mesi:months,verifiche };
}
