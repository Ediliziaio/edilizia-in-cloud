import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PianoAcquistiCommessa } from '@/components/orders/materiali/PianoAcquistiCommessa';
const mock = vi.hoisted(()=>({query:vi.fn()}));
vi.mock('@/hooks/usePianoAcquistiComputo',()=>({usePianoAcquistiComputo:mock.query}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const contesto=()=>({magazzino:[{id:'w',name:'Zanzariera 1000x1500',quantity_available:2,unita_misura:'pz'}],
 esistenti:[{id:'a',chiave_materiale:'documento:zanzariera',name:'Zanzariera 1000x1500',stock_item_id:null,quantity:13,quantita_calcolata:13,unita_misura:'pz',phase_id:'posa',supplier_id:'s',origini:[{tipo:'contratto',documento_ref:'documento',posizione_ref:'zanzariera',descrizione:'Zanzariera',quantita:13}]}],
 coperture:[{id:'po-item',order_item_id:'a',quantity:3,quantity_received:0,unit_of_measure:'pz',purchase_orders:{id:'po',oda_number:'ODA-1',status:'confermato'}}],
 fasi:[{id:'posa',start_date:'2027-03-20'}],fornitori:[{id:'s',lead_time_days:10}]});
describe('piano acquisti dopo la creazione',()=>{
 it('la riapertura conserva il blocco tecnico salvato nelle origini',()=>{
  const c=contesto();
  Object.assign(c.esistenti[0],{origini:[{tipo:'computo',voce_id:'v1',descrizione:'Zanzariera',quantita:13,quantita_voce:13,unita_voce:'mq',fonte:'fornitura',verifica_acquisto:{stato:'da_verificare',motivi:['Abaco dei vani da completare'],campi_mancanti:['abaco']}}]});
  mock.query.mockReturnValue({data:c,isPending:false,isError:false});
  render(<PianoAcquistiCommessa companyId="azienda" orderId="ordine" nomeFase={()=>'Posa'}/>);
  fireEvent.click(screen.getByRole('button',{name:'Piano acquisti aggiornato'}));
  expect(screen.queryByText('8 pz')).not.toBeInTheDocument();expect(screen.getByText(/Abaco dei vani da completare/)).toBeInTheDocument();
 });
 it('si aggiorna all’apertura e conserva il fabbisogno lordo separato da merce e ordini',()=>{
  mock.query.mockReturnValue({data:contesto(),isPending:false,isError:false});render(<PianoAcquistiCommessa companyId="azienda" orderId="ordine" nomeFase={()=>'Posa zanzariere'}/>);
  expect(mock.query).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Piano acquisti aggiornato'}));
  expect(screen.getByText('13 pz')).toBeInTheDocument();expect(screen.getByText('3 pz')).toBeInTheDocument();expect(screen.getByText('2 pz')).toBeInTheDocument();expect(screen.getByText('8 pz')).toBeInTheDocument();expect(screen.getByText(/10\/03\/2027/)).toBeInTheDocument();expect(screen.getByText(/dal fornitore/)).toBeInTheDocument();
  expect(contesto().esistenti[0].quantity).toBe(13);
 });
 it('se le disponibilità non sono verificabili non mostra un residuo da comprare',()=>{
  mock.query.mockReturnValue({data:contesto(),isPending:false,isError:true,refetch:vi.fn()});render(<PianoAcquistiCommessa companyId="azienda" orderId="ordine" nomeFase={()=>'Posa'}/>);fireEvent.click(screen.getByRole('button',{name:'Piano acquisti aggiornato'}));expect(screen.getByRole('alert')).toHaveTextContent('Non riesco a verificare');expect(screen.queryByRole('table')).not.toBeInTheDocument();
 });
});
