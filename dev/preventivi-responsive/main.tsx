import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FvTabBar,FvFooter,FvPageHeader} from '@/lib/fotovoltaico/wizardUI';
import {BarraFasi} from '@/components/preventivatore/BarraFasi';
import {PiedePreventivatore,StatoDelSalvataggio} from '@/components/preventivatore/PiedePreventivatore';
import {BottoneTotale} from '@/components/preventivatore/BottoneTotale';
import {AnteprimaMobile} from '@/components/preventivatore/AnteprimaMobile';
import {FvAnteprimaDocumento} from '@/components/fotovoltaico/FvAnteprimaDocumento';
import {STICKY_ALTO,STICKY_BASSO} from '@/components/preventivatore/posizione';
import '@/index.css';
const names=['Cliente','Immobile','Consumi','Tetto','Impianto','Finanza','Impresa','Genera'];
function Qa(){
 const [modulo,setModulo]=useState('Fotovoltaico'),[fase,setFase]=useState(3),[aperta,setAperta]=useState(false),[pdf,setPdf]=useState<string|null>(null),[salvato,setSalvato]=useState(false);
 const nomi=modulo==='Fotovoltaico'?names:modulo==='Serramenti'?['Cliente','Immobile','Offerta','Foto','Economia','PDF']:['Cliente','Immobile','Computo','Foto','Economia','PDF'];
 const dati={valore:'€ 12.345,67'};
 return <div className="flex h-dvh flex-col bg-slate-100">
  <header className="flex shrink-0 items-center justify-between gap-2 border-b bg-white px-3 py-2"><span className="text-sm font-semibold">Collaudo locale</span><select aria-label="Modulo" className="h-11 rounded border px-2" value={modulo} onChange={e=>{setModulo(e.target.value);setFase(3)}}>{['Fotovoltaico','Serramenti','Bagni','Tetti','Climatizzazione','Elettrico','Termoidraulico','Pavimenti','Piscine','Ristrutturazione'].map(n=><option key={n}>{n}</option>)}</select></header>
  <main id="main-content" className="min-h-0 flex-1 overflow-auto p-3 pb-28 md:p-6">
  <div className="preventivo-touch -m-3 min-h-full bg-slate-50 md:-m-6">
   <FvPageHeader title={`Preventivo ${modulo}`} subtitle="Cliente dimostrativo · cantiere Via Esempio" numero="QA-2026-001" stato="Bozza" actions={<button className="min-h-11 rounded border px-3" onClick={()=>setSalvato(true)}>Salva bozza</button>} />
   {modulo==='Fotovoltaico'?<FvTabBar tabs={nomi.map((label,i)=>({num:i+1,label,small:`Fase ${i+1}`}))} current={fase} completed={new Set([1,2,3,4])} onSelect={setFase} className={STICKY_ALTO} totale={dati}/>:<BarraFasi passi={nomi.map((label,i)=>({key:String(i+1),label}))} corrente={String(fase)} completati={new Set(['1','2'])} bloccati={new Set(['6'])} onSelect={key=>setFase(Number(key))} className={`sticky z-30 ${STICKY_ALTO}`} totale={dati} />}
   <section className="space-y-4 p-3 sm:p-6">
    <h2 className="text-xl font-semibold">{nomi[fase-1]}</h2>
    <div className="grid gap-4 rounded-2xl border bg-white p-4 sm:grid-cols-2"><label>Nome cliente<input className="mt-1 h-10 w-full rounded border px-3 text-sm" defaultValue="Cliente dimostrativo"/></label><label>Importo (€)<input type="number" inputMode="decimal" className="mt-1 h-10 w-full rounded border px-3 text-sm" defaultValue="12345.67"/></label><label className="sm:col-span-2">Note<textarea className="mt-1 w-full rounded border p-3 text-sm" defaultValue="Bozza locale: nessun invio e nessuna scrittura nel gestionale."/></label></div>
    <button className="min-h-11 rounded border bg-white px-4" onClick={async()=>{const r=await fetch('/documento.html');setPdf(await r.text())}}>Controlla PDF</button>
    {Array.from({length:7},(_,i)=><section key={i} className="rounded-xl border bg-white p-4"><h3 className="font-semibold">Voce {i+1} · lavorazione dimostrativa</h3><p className="mt-2 text-sm text-slate-500">Descrizione del lavoro, misure e prezzo.</p><label className="mt-3 block">Quantità<input type="number" className="ml-3 w-24 rounded border px-2" defaultValue="2"/></label></section>)}
   </section>
   {modulo==='Fotovoltaico'?<FvFooter autoSaveState={salvato?'saved':'idle'} numero="QA-2026-001" lastSaveText="Ultima modifica adesso" onPrev={()=>setFase(x=>Math.max(1,x-1))} onNext={()=>setFase(x=>Math.min(nomi.length,x+1))} onSaveDraft={()=>setSalvato(true)} className={STICKY_BASSO} telefono={<BottoneTotale {...dati} onClick={()=>setAperta(true)}/>}/>:<PiedePreventivatore stato={<StatoDelSalvataggio stato={salvato?'salvato':'locale'}/>} telefono={<BottoneTotale {...dati} onClick={()=>setAperta(true)}/>}><button className="min-h-11 rounded border px-3" onClick={()=>setFase(x=>Math.max(1,x-1))}>Indietro</button><button className="min-h-11 rounded bg-orange-500 px-3 font-semibold text-white" onClick={()=>setFase(x=>Math.min(nomi.length,x+1))}>Salva e continua</button></PiedePreventivatore>}
  </div></main>
  <nav aria-label="Navigazione principale" className="fixed inset-x-2 bottom-2 flex h-16 items-center justify-around rounded-2xl border bg-white/95 text-sm shadow md:hidden">{['Home','Opportunità','Silvio','Calendario','App'].map(n=><span key={n}>{n}</span>)}</nav>
  <AnteprimaMobile aperta={aperta} onApertaChange={setAperta}><p>Cliente dimostrativo</p><p className="text-2xl font-bold">{dati.valore}</p></AnteprimaMobile>
  <FvAnteprimaDocumento html={pdf} numero="QA-2026-001" onClose={()=>setPdf(null)} onPrint={()=>{}} loading={false}/>
 </div>
}
if(import.meta.env.DEV)createRoot(document.getElementById('root')!).render(<Qa/>);
