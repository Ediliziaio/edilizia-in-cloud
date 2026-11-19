import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {BatchBarcodeScanner,type BatchScanEntry} from '../../src/components/warehouse/BatchBarcodeScanner';
import {Button} from '../../src/components/ui/button';
import {Toaster} from '../../src/components/ui/sonner';
import '../../src/index.css';
const client=new QueryClient({defaultOptions:{mutations:{retry:false}}});
const initial:BatchScanEntry[]=[{clientUuid:'demo-existing',rawCode:'DEMO-CAVO',stockItemId:'demo-cavo',itemName:'Cavo elettrico · esempio',trackingMode:'fungible',quantity:2,serialNumbers:[],scannedAt:1,odaItemId:'demo-line',unitOfMeasure:'m'}];
export function Preview(){
 const[open,setOpen]=useState(false);const[entries,setEntries]=useState(initial);const[review,setReview]=useState(false);
 return <main className="mx-auto min-h-screen max-w-xl bg-slate-50 p-5 space-y-5"><p className="text-xs font-semibold uppercase text-amber-700">Solo anteprima locale · dati simulati</p><h1 className="text-2xl font-semibold">Scanner del Magazzino</h1><p>Questa anteprima usa lo stesso scanner del gestionale. Nessun dato viene inviato al database e nessun carico viene registrato.</p><div className="rounded-xl border bg-white p-4 space-y-2"><p className="font-semibold">Prova una ricezione ODA</p><p className="text-sm">2 m già raccolti su 5 m previsti. Apri lo scanner, premi “Digita codice” e inserisci DEMO-CAVO. Puoi aggiungere fino a 3 m, anche usando la virgola decimale.</p></div><Button className="h-12 w-full" onClick={()=>setOpen(true)}>Apri scanner mobile</Button>{review&&<div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4" role="status"><p className="font-semibold">Riepilogo dimostrativo</p>{entries.map(entry=><p key={entry.clientUuid}>{entry.itemName}: {entry.quantity.toLocaleString('it-IT')} {entry.unitOfMeasure}</p>)}<p className="mt-2 text-sm">Nessun movimento registrato. Nel gestionale, seguirà la revisione prima del salvataggio.</p></div>}<BatchBarcodeScanner open={open} onOpenChange={setOpen} mode="oda_receive" contextLabel="ANTEPRIMA · dati simulati · nessun salvataggio" initialEntries={entries} onEntriesChange={setEntries} confirmEachScan allowedOdaItems={[{stockItemId:'demo-cavo',odaItemId:'demo-line',qtyPending:5}]} onConfirm={()=>{setOpen(false);setReview(true);}} confirmLabel="Controlla letture"/><Toaster/></main>;
}
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><Preview/></QueryClientProvider>);
