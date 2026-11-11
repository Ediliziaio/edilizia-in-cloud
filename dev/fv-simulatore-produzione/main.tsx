import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Step5Configurazione} from '../../src/pages/azienda/fotovoltaico/FotovoltaicoWizard';
import {INITIAL} from '../../src/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants';
import type {WizardData} from '../../src/pages/azienda/fotovoltaico/FotovoltaicoWizard/types';
import '../../src/index.css';
const listino={pannelli:[{id:'p1',descrizione:'Modulo 450 W · test locale',potenza_w:450,prezzo_vendita:180,prezzo_acquisto:100}],inverter:[{id:'i1',descrizione:'Inverter 6 kW · test locale',potenza_kw:6,prezzo_vendita:1500,prezzo_acquisto:900}],accumuli:[]};
function App(){const[data,setData]=useState<WizardData>(()=>{try{const raw=localStorage.getItem('fv-tetto-prod-test');if(raw)return{...INITIAL,...JSON.parse(raw)};}catch{}return{...INITIAL,cliente_nome:'Cliente',cliente_cognome:'di collaudo',indirizzo:'Indirizzo dimostrativo',comune:'Roma',latitudine:41.9,longitudine:12.5,ore_sole_annue:1400,consumo_annuo_kwh:6000,costo_kwh_attuale:.3,pannello_id:new URLSearchParams(location.search).has('senza_pannello')?null:'p1',inverter_id:'i1',numero_pannelli_scelti:12,potenza_kwp:new URLSearchParams(location.search).has('senza_pannello')?0:5.4,layout_overlay:{modalita:'senza_mappa'}};});
 const update=<K extends keyof WizardData>(k:K,v:WizardData[K])=>setData(d=>{const next={...d,[k]:v};localStorage.setItem('fv-tetto-prod-test',JSON.stringify(next));return next;});
 return <main className="mx-auto max-w-6xl p-5"><h1 className="mb-4 text-2xl font-bold">Collaudo locale · editor usato in produzione</h1><p className="mb-4 text-sm">Dati sintetici. Il componente non riceve un editor alternativo e non usa il prototipo.</p><Step5Configurazione data={data} update={update} readOnlyMode={false} pannelli={listino.pannelli} inverter={listino.inverter} accumuli={listino.accumuli} tariffeFv={[]} kitFv={[]} serviziCatalogo={[]} serviziCatalogoCount={0} catalogoFvVuoto={false} scenario={null} calcolando={false} onRicalcola={()=>{}}/></main>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><App/></MemoryRouter></QueryClientProvider>);
