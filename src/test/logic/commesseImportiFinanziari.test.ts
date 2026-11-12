import { expect,it,vi } from 'vitest';
import { getAmountCollected,getAmountDue,getGrossOrderAmount,getPendingPayments,type OrderWithDetails } from '@/lib/orderUtils';
import { leggiCreditiMisura,caricaImportiFinanziari } from '@/lib/orders/importiFinanziari';
import { orderEconomics } from '@/lib/orders/annualScope';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc}}));
const base={id:'ordine',total_amount:1000,vat_rate:22,deposit_amount:0,deposit_paid:false,deposit_2_amount:0,balance_amount:1220,balance_paid:false} as OrderWithDetails;
it('separa il credito emesso dall’importo stimato, anche negli aggregati della lista',()=>{
  const row={...base,order_type:'appaltatore_lavoro',valorizzazione:'a_misura',crediti_misura:{fatturato:549,incassato:100,residuo:449,scaduto:449,documenti:[]}} as OrderWithDetails;
  expect(getGrossOrderAmount(row)).toBe(549);expect(getAmountCollected(row)).toBe(100);expect(getAmountDue(row)).toBe(449);
  expect(getPendingPayments(row)).toEqual(['Fatture emesse']);
  expect(orderEconomics([row])).toEqual({count:1,sold:549,collected:100,pending:449});
});
it('conserva il calcolo delle commesse a corpo',()=>{expect(getGrossOrderAmount(base)).toBe(1220);expect(getAmountDue(base)).toBe(1220);});
it('usa la cassa confermata dell’unità senza trasformare un’altra volta la quota prezzo',()=>{
  const row={...base,incasso_unita_lordo:100,coperto_unita_netto:100};
  expect(getAmountCollected(row)).toBe(100);
  expect(orderEconomics([row],new Map([['ordine',100]]))).toMatchObject({collected:100,pending:1120});
});
it('non converte risposte mancanti o errori di accesso in crediti a zero',async()=>{
  expect(()=>leggiCreditiMisura({fatturato:100,documenti:[]})).toThrow();
  rpc.mockResolvedValueOnce({data:null,error:{code:'42501'}});
  await expect(caricaImportiFinanziari('demo',[{id:'ordine'}])).rejects.toThrow('non disponibili');
  rpc.mockResolvedValueOnce({data:[],error:null});
  await expect(caricaImportiFinanziari('demo',[{id:'ordine'}])).rejects.toThrow('non è più disponibile');
});
