import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {ConfrontoConfermaOrdineDialog} from '@/components/orders/ConfrontoConfermaOrdineDialog';
import type {ControlloDocumento} from '@/lib/acquisti/controlloDocumento';
import type {BaseConferma} from '../../../supabase/functions/_shared/revisioniConferma';
const m=vi.hoisted(()=>({c:{} as ControlloDocumento,base:{} as BaseConferma,solaLettura:false,avvia:vi.fn(),decidi:vi.fn(),accetta:vi.fn(),abbina:vi.fn(),prezzi:vi.fn(),ricarica:vi.fn()}));
vi.mock('@/hooks/usePermissions',()=>({usePermissions:()=>({solaLettura:m.solaLettura,canManagePurchasing:true,canEditOrders:false})}));
vi.mock('@/hooks/useControlloDocumento',()=>({
 useControlliDocumento:()=>({controlli:[m.c],allegati:[] as unknown[],ricarica:vi.fn(),caricamento:false,errore:false,avvia:{mutate:m.avvia,isPending:false}}),
 useBaseConferma:()=>({data:m.base,isError:false,isFetching:false,refetch:vi.fn()}),
 useControlloDocumento:()=>({controllo:m.c,caricamento:false,decidi:{mutate:m.decidi},accetta:{mutate:m.accetta},abbina:{mutate:m.abbina},applicaPrezzi:{mutate:m.prezzi},ricarica:m.ricarica}),
}));
vi.mock('@/components/fatturazione/OriginaliConfronto',()=>({OriginaliConfronto:({files}:{files:Array<{nome:string}>})=><div>{files.map(f=><p key={f.nome}>Originale {f.nome}</p>)}</div>}));
vi.mock('@/components/acquisti/OriginaliOrdineConfronto',()=>({OriginaliOrdineConfronto:()=> <div>Versione PDF richiesta</div>}));
vi.mock('@/pages/azienda/email/components/EmailComposeDialog',()=>({EmailComposeDialog:({open}:{open:boolean})=>open?<div>Messaggio da rivedere prima dell’invio</div>:null}));
beforeEach(()=>{
 vi.clearAllMocks();m.solaLettura=false;
 const frozen:BaseConferma={impronta:'rev1',fonte:'ordine_corrente',testata:{numero:'ODA-SIM'},righe:[{id:'p3',description:'Finestra P3',quantity:2,unit_of_measure:'pz',price_pending:true}]};
 m.base={...structuredClone(frozen),righe:[{id:'p3',description:'Finestra corrente',quantity:8}]};
 m.c={id:'c1',company_id:'az',purchase_order_id:'po',rfq_supplier_id:null,tipo:'conferma',file_path:'order-attachments/az/file.pdf',file_nome:'Conferma SIM.pdf',stato:'letto',esito:'rosso',accettato_motivo:null,accettato_il:null,created_at:'2026-11-11T12:00:00Z',versione:1,impronta_ordine:'rev1',base_ordine:frozen,
  lettura:{righe:[{riferimento:'P3',descrizione:'Finestra P3',quantita:1,unita:'pz',pagina:1}]},
  righe:[{chiave:'p3',riferimento:'P3',descrizione:'Finestra P3',categoria:'serramenti',stato:'abbinata',esito:'rosso',chiesto:'2 pz · 1200 × 1400',letto:'1 pz · 1200 × 1450',indici_fornitore:[0],quantita_richiesta:2,quantita_documento:1,campi:[{campo:'Altezza',chiesto:'1400 mm',letto:'1450 mm',esito:'rosso'}]}]};
});
const mostra=()=>render(<ConfrontoConfermaOrdineDialog companyId="az" obiettivo={{purchaseOrderId:'po'}} onClose={vi.fn()}/>);
it('mostra la base congelata e il residuo senza sostituirli con i dati correnti',()=>{
 mostra();const tables=screen.getAllByRole('table');expect(tables[0]).toHaveTextContent('2 pz');expect(tables[0]).not.toHaveTextContent('8 pz');expect(tables[1]).toHaveTextContent('1 ancora da confermare');
 expect(screen.getByRole('button',{name:'Controlla con AI'})).toBeEnabled();expect(m.avvia).not.toHaveBeenCalled();
});
it('una revisione obsoleta non è approvabile ma l’originale rimane consultabile',()=>{
 m.base.impronta='rev2';mostra();expect(screen.getByText(/L’ordine è cambiato/)).toBeInTheDocument();expect(screen.getByRole('button',{name:'Approva conferma'})).toBeDisabled();
 fireEvent.mouseDown(screen.getByRole('tab',{name:'PDF / foto originale'}),{button:0,ctrlKey:false});expect(screen.getByText('Originale Conferma SIM.pdf')).toBeInTheDocument();
});
it('l’utente in sola lettura consulta il confronto senza caricare o approvare',()=>{
 m.solaLettura=true;mostra();expect(screen.queryByRole('button',{name:'Approva conferma'})).toBeNull();expect(screen.getByRole('button',{name:'Controlla con AI'})).toBeDisabled();expect(screen.queryByRole('button',{name:'Carica conferma'})).toBeNull();
});
it('la lettura fallita conserva la revisione e permette di riprovare senza un nuovo caricamento',()=>{
 m.c.stato='errore';m.c.errore='Lettura interrotta';m.c.righe=[];mostra();
 expect(screen.getByText(/L’originale resta disponibile/)).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Approva conferma'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Controlla con AI'}));
 expect(m.avvia).toHaveBeenCalledWith({tipo:'conferma',controlloId:'c1'},expect.anything());
});
it('permette di chiudere un’analisi in background senza approvarla o avviarne una seconda',()=>{
 m.c.stato='in_lettura';m.c.updated_at=new Date().toISOString();m.c.righe=[];mostra();
 expect(screen.getByText(/Puoi chiudere il confronto e riaprirlo/)).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Lettura del documento…'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Approva conferma'})).toBeDisabled();
 expect(screen.getByRole('button',{name:'Chiudi confronto'})).toBeEnabled();
});
it('un abbinamento manuale richiede una motivazione e salva le posizioni selezionate',()=>{
 mostra();fireEvent.click(screen.getAllByRole('button',{name:/^P3$/})[0]);fireEvent.click(screen.getByRole('button',{name:'Scegli corrispondenza'}));
 const dialog=screen.getByRole('dialog',{name:'Scegli le posizioni del fornitore'});expect(within(dialog).getByRole('button',{name:'Salva abbinamento'})).toBeDisabled();
 fireEvent.change(within(dialog).getByLabelText('Motivo dell’abbinamento'),{target:{value:'Verificata posizione P3 sul PDF'}});fireEvent.click(within(dialog).getByRole('button',{name:'Salva abbinamento'}));
 expect(m.abbina).toHaveBeenCalledWith({chiave:'p3',indici:[0],nota:'Verificata posizione P3 sul PDF'},expect.anything());
});
it('la richiesta di correzione prepara un messaggio che resta da rivedere',()=>{
 mostra();expect(screen.queryByText('Messaggio da rivedere prima dell’invio')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Prepara correzioni'}));expect(screen.getByText('Messaggio da rivedere prima dell’invio')).toBeInTheDocument();expect(m.accetta).not.toHaveBeenCalled();
});

it('Aggiorna ricarica anche la decisione e gli originali della revisione aperta',()=>{mostra();fireEvent.click(screen.getByRole('button',{name:'Aggiorna'}));expect(m.ricarica).toHaveBeenCalledOnce();});
