import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinancialSummaryReadOnly } from '@/components/orders/FinancialSummary';
import { FattureIncassiElenco } from '@/components/orders/FattureIncassiElenco';
import { setupRadixMenus, scegliNelMenu } from "@/test/helpers/radixMenus";
setupRadixMenus();
import { vociIncassi } from '@/lib/orders/elencoIncassi';
import type { Installment } from '@/lib/orderUtils';
import type { FatturaCommessa } from '@/lib/orders/fattureCommessa';
import { scadenze30_30_40 } from '@/lib/fatturazione/scadenzeFattura';
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({effectiveCompany:{id:'c1'}})}));
vi.mock('@/components/orders/RegistraIncassoPrimaNota',()=>({RegistraIncassoPrimaNota:(): null=>null,useIncassiRegistrati:()=>({data:{}})}));
const invoice=(changes:Partial<FatturaCommessa>={}):FatturaCommessa=>({id:'f1',numero:'FT-1',data_emissione:'2026-11-17',tipo:'fattura',stato:'pagata',totale_documento:122,totale_da_pagare:122,importo_pagato:122,importo_associato:null,...changes});
const rate=(changes:Partial<Installment>={}):Installment=>({id:'r1',position:0,label:'Acconto 30%',type:'deposit',amount:122,is_paid:true,documento_fiscale_id:'f1',fattura:{id:'f1',numero:'FT-1',stato:'pagata',importo_pagato:122},...changes});
function show({rates=[rate()],documents=[invoice()],toggle=vi.fn(),manage=vi.fn(),error=false,totali,totalAmount=100}: {rates?:Installment[];documents?:FatturaCommessa[];toggle?:(rata:Installment,paid:boolean)=>void;manage?:(rata:Installment,amount:number)=>void;error?:boolean;totali?:{incassato:number;daIncassare:number};totalAmount?:number}={}) {
 return render(<MemoryRouter><FinancialSummaryReadOnly totalAmount={totalAmount} vatRate={22} paymentType="standard" installments={rates} totaliIncassi={totali} onInstallmentPaidToggle={toggle} onManageInvoice={manage} elencoUnificato={piano=><FattureIncassiElenco piano={piano} documents={documents} onRetry={()=>{}} onDownload={()=>{}} error={error}/>} /></MemoryRouter>);
}
afterEach(cleanup);
it('una variante non modifica la quota del saldo già collegata alla fattura',()=>{
 const manage=vi.fn();
 show({totalAmount:200,manage,rates:[rate({amount:61,documento_quota_lorda:61,fattura:{id:'f1',numero:'FT-1',stato:'emessa',importo_pagato:61}}),rate({id:'r2',position:1,type:'balance',label:'Saldo',amount:61,documento_quota_lorda:61,quota_fattura_residua:52,is_paid:false,fattura:{id:'f1',numero:'FT-1',stato:'emessa',importo_pagato:9}})],documents:[invoice({stato:'parzialmente_pagata',importo_pagato:70})]});
 fireEvent.click(screen.getByRole('button',{name:'Gestisci fattura · Saldo'}));
 expect(manage).toHaveBeenCalledWith(expect.objectContaining({id:'r2',documento_quota_lorda:61}),61);
 expect(screen.getByText(/Quota della fattura: 61,00.*incassato 9,00.*residuo 52,00/)).toBeInTheDocument();
});
it('una fattura aggiuntiva senza rata conserva incassi e residuo anche con il piano già saldato',async()=>{
 show({documents:[invoice(),invoice({id:'extra',numero:'EXTRA-1',stato:'parzialmente_pagata',totale_documento:200,totale_da_pagare:200,importo_pagato:50})],totali:{incassato:172,daIncassare:0}});
 const summary=screen.getByLabelText('Riepilogo fatture e incassi');
 expect(summary).toHaveTextContent('Fatturato emesso322,00');expect(summary).toHaveTextContent('Incassato172,00');
 expect(summary).toHaveTextContent('Da incassare150,00');
 const extra=screen.getByRole('region',{name:'Fatture e incassi aggiuntivi'});
 expect(extra).toHaveTextContent('Fatturato oltre il contratto: 200,00');
 expect(extra).toHaveTextContent('Incassato oltre il contratto: 50,00');
 expect(extra).toHaveTextContent('Residuo delle fatture emesse: 150,00');
 await scegliNelMenu('Mostra rate e documenti','Fatture senza rata');
 expect(screen.getAllByRole('link',{name:'Fattura EXTRA-1'})).toHaveLength(1);
 expect(screen.queryByRole('link',{name:'Fattura FT-1'})).toBeNull();
 expect(screen.getByLabelText('Incassi fattura EXTRA-1')).toHaveTextContent('Residuo150,00');
 expect(screen.getByLabelText('Riepilogo fatture e incassi')).toHaveTextContent('Incassato172,00');
});
describe('Una sola vista per rate, fatture e incassi',()=>{
 it('la fattura collegata compare nella sua rata, non in una seconda scheda',()=>{
  show();expect(screen.getByRole('heading',{name:'Fatture e incassi'})).toBeInTheDocument();
  expect(screen.queryByRole('heading',{name:'Incassi dal cliente'})).toBeNull();
  expect(screen.queryByRole('heading',{name:/Fatture e documenti/})).toBeNull();
  const list=screen.getByRole('list',{name:'Rate e fatture del cliente'});
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(within(list).getAllByRole('link',{name:'Fattura FT-1'})).toHaveLength(1);
  expect(within(list).getByLabelText('Incassi fattura FT-1')).toHaveTextContent('Incassato122,00');
 });
 it('mantiene le rate senza fattura, con il comando che collega un documento esistente',()=>{
  const manage=vi.fn();show({rates:[rate({documento_fiscale_id:null,fattura:null,is_paid:false})],documents:[],manage});
  fireEvent.click(screen.getByRole('button',{name:'Collega fattura · Acconto 30%'}));
  expect(manage).toHaveBeenCalledWith(expect.objectContaining({id:'r1'}),122);
 });
 it('i documenti senza rata restano presenti una sola volta',()=>{
  show({documents:[invoice(),invoice({id:'f2',numero:'FT-2'})]});
  expect(within(screen.getByRole('list',{name:'Rate e fatture del cliente'})).getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByText('Documento senza rata collegata')).toBeInTheDocument();
 });
 it('ricerca rata e fattura nello stesso elenco e conserva i totali quando filtra',()=>{
  show({documents:[invoice(),invoice({id:'ann',numero:'ANN-1',stato:'annullata',importo_pagato:0})]});
  fireEvent.change(screen.getByRole('textbox',{name:'Cerca rata o fattura'}),{target:{value:'Acconto'}});
  expect(screen.getByRole('link',{name:'Fattura FT-1'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Cancella ricerca incassi'}));
  fireEvent.click(screen.getByRole('button',{name:/^Annullate e stornate/}));
  expect(screen.queryByRole('link',{name:'Fattura FT-1'})).toBeNull();
  expect(screen.getByRole('link',{name:'Fattura ANN-1'})).toBeInTheDocument();
  expect(screen.getByLabelText('Riepilogo fatture e incassi')).toHaveTextContent('Fatturato emesso122,00');
 });
 it('mantiene gli stessi comandi di incasso, senza registrazioni automatiche',()=>{
  const toggle=vi.fn();show({rates:[rate({is_paid:false,documento_fiscale_id:null,fattura:null})],documents:[],toggle});
  expect(toggle).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('radio',{name:'Incassata'}));
  expect(toggle).toHaveBeenCalledWith(expect.objectContaining({id:'r1'}),true);
 });
 it('in caso di errore non mostra un elenco parziale come se fosse completo',()=>{
  show({error:true});expect(screen.getByRole('alert')).toHaveTextContent('non disponibili');
  expect(screen.queryByRole('list',{name:'Rate e fatture del cliente'})).toBeNull();
 });
 it('la fattura resta unica anche quando la rata punta alla copia importata',()=>{
  const rows=vociIncassi([rate({documento_fiscale_id:'importata'})],[invoice({copie_importate:[{id:'importata',numero:'FT-1'}]})]);
  expect(rows).toHaveLength(1);expect(rows[0].documento?.id).toBe('f1');
 });
});

it('il selettore mostra le rate senza fattura senza duplicare quelle già collegate',async()=>{
 show({rates:[rate({amount:61,fattura:{id:'f1',numero:'FT-1',stato:'pagata',importo_pagato:61}}),rate({id:'r2',position:1,label:'Saldo 70%',type:'balance',amount:61,is_paid:false,documento_fiscale_id:null,fattura:null})],documents:[invoice({totale_documento:61,totale_da_pagare:61,importo_pagato:61})]});
 await scegliNelMenu('Mostra rate e documenti','Rate senza fattura');
 const list=screen.getByRole('list',{name:'Rate e fatture del cliente'});
 expect(within(list).getAllByRole('listitem')).toHaveLength(1);
 expect(list).toHaveTextContent('Saldo 70%');expect(within(list).queryByText('Acconto 30%')).toBeNull();
});
it('DDT, proforma e note di credito mantengono il proprio tipo e il segno corretto',()=>{
 show({rates:[],documents:[invoice({id:'p',tipo:'proforma',numero:'PRO-1',stato:'bozza'}),invoice({id:'nc',tipo:'nota_credito',numero:'NC-1',stato:'emessa',totale_documento:22})]});
 expect(screen.getByRole('link',{name:'Proforma PRO-1'})).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'Nota di credito NC-1'})).toBeInTheDocument();
 expect(screen.getByLabelText('Incassi fattura NC-1')).toHaveTextContent(/-22,00/);
});

it('una fattura aggiornata mostra subito parziale e residuo anche prima della query della rata',()=>{
 const r=rate({amount:122,is_paid:true,expected_date:'2020-01-01'});
 show({rates:[r],documents:[invoice({stato:'parzialmente_pagata',importo_pagato:50})]});
 expect(screen.getByText('Incassata in parte')).toBeInTheDocument();
 expect(screen.getByRole('radio',{name:'Incassata'})).toHaveAttribute('aria-checked','false');
 expect(screen.getByLabelText('Incassi fattura FT-1')).toHaveTextContent('Incassato50,00');
 expect(screen.getByLabelText('Incassi fattura FT-1')).toHaveTextContent('Residuo72,00');
 expect(screen.getByRole('link',{name:'Registra incasso'})).toHaveAttribute('href','/azienda/documenti/f1/dettaglio');
 expect(r.is_paid).toBe(true); // solo visualizzazione: nessuna modifica della scheda
});
it('una fattura saldata aggiorna lo stato della riga senza moltiplicare i documenti',()=>{
 show({rates:[rate({is_paid:false})],documents:[invoice()]});
 expect(screen.getByRole('radio',{name:'Incassata'})).toHaveAttribute('aria-checked','true');
 expect(screen.getByRole('link',{name:'Vedi incassi'})).toBeInTheDocument();
 expect(within(screen.getByRole('list',{name:'Rate e fatture del cliente'})).getAllByRole('listitem')).toHaveLength(1);
});

it('mostra una fattura con tre scadenze e aggiorna il residuo dopo il primo incasso', () => {
 const fattura = invoice({
  numero: 'FT-DEMO',
  stato: 'bozza',
  totale_documento: 10000,
  totale_da_pagare: 10000,
  importo_pagato: 0,
  scadenze_pagamento: scadenze30_30_40(10000, new Date(2026, 10, 18), 'MP05'),
 });
 const vista = (documento: FatturaCommessa) => (
  <MemoryRouter>
   <FinancialSummaryReadOnly totalAmount={10000} vatRate={0} paymentType="standard" installments={[]}
    totaliIncassi={{ incassato: documento.importo_pagato ?? 0, daIncassare: 10000 - (documento.importo_pagato ?? 0) }}
    elencoUnificato={piano => (
     <FattureIncassiElenco piano={piano} documents={[documento]} onRetry={() => {}} onDownload={() => {}} />
    )}
   />
  </MemoryRouter>
 );
 const { rerender } = render(vista(fattura));
 const scadenze = () => within(screen.getByRole('list', { name: 'Scadenze fattura FT-DEMO' })).getAllByRole('listitem');
 expect(scadenze().map(riga => riga.textContent)).toEqual([
  expect.stringMatching(/18\/12\/2026 · 3\.000,00/),
  expect.stringMatching(/17\/01\/2027 · 3\.000,00/),
  expect.stringMatching(/16\/02\/2027 · 4\.000,00/),
 ]);
 expect(screen.queryByRole('link', { name: 'Registra incasso' })).not.toBeInTheDocument();
 rerender(vista({ ...fattura, stato: 'parzialmente_pagata', importo_pagato: 3000 }));
 expect(screen.getAllByRole('link', { name: 'Fattura FT-DEMO' })).toHaveLength(1);
 expect(scadenze()).toHaveLength(3);
 const importi = screen.getByLabelText('Incassi fattura FT-DEMO');
 expect(importi).toHaveTextContent('Importo fattura10.000,00');
 expect(importi).toHaveTextContent('Incassato3.000,00');
 expect(importi).toHaveTextContent('Residuo7.000,00');
 expect(screen.getByLabelText('Riepilogo fatture e incassi')).toHaveTextContent('Incassato3.000,00');
});
