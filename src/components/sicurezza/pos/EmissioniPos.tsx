import { useState } from "react";
import { FileDown, Package, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { apriEmissionePos, useContenutiPerEmissione, useEmissioniPos, usePreparaEmissione } from "@/hooks/useEmissioniPos";

export function EmissioniPos({companyId,posId,approvato}:{companyId:string;posId:string;approvato:boolean}) {
  const p=usePermissions();
  const autorizzato=p.canViewSicurezzaCantiere||p.isAdmin;
  const [aperto,setAperto]=useState(approvato);
  const [snapshot,setSnapshot]=useState("");
  const [scaricando,setScaricando]=useState("");
  const q=useEmissioniPos(companyId,posId,aperto&&autorizzato);
  const fonti=useContenutiPerEmissione(companyId,posId,aperto&&autorizzato);
  const prepara=usePreparaEmissione(companyId,posId);
  if(!autorizzato) return null;
  const daPreparare=(fonti.data||[]).filter(s=>!(q.data||[]).some(e=>e.stato==="completa"&&e.snapshot_id===s.id));
  const selezionato=daPreparare.some(s=>s.id===snapshot)?snapshot:daPreparare.length===1?daPreparare[0].id:"";
  async function scarica(id:string,tipo:"pdf"|"zip") {
    setScaricando(`${id}-${tipo}`);
    try{await apriEmissionePos(companyId,id,tipo);}catch(e){toast.error(e instanceof Error?e.message:"Download non riuscito");}finally{setScaricando("");}
  }
  return <details open={aperto} onToggle={e=>setAperto(e.currentTarget.open)} className="rounded-xl border bg-card p-4">
    <summary className="cursor-pointer text-sm font-semibold">PDF approvati e allegati</summary>
    {aperto&&<div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">Ogni approvazione conserva il PDF, gli allegati e i dati da cui è nato, con un’impronta digitale (SHA-256) che ne garantisce l’integrità: ogni scaricamento viene verificato prima di aprirlo. Il PDF è quello da stampare e firmare; gli allegati restano file separati e non toccano le firme già presenti. L’archivio completo contiene anche i dati interni: controllalo prima di condividerlo fuori dall’azienda.</p>
      {q.isError||fonti.isError?<p role="alert" className="text-sm text-destructive">Emissioni o contenuti storici non disponibili. <Button variant="link" onClick={()=>{void q.refetch();void fonti.refetch();}}>Riprova</Button></p>:q.isLoading||fonti.isLoading?<p className="text-sm">Caricamento emissioni…</p>:<>
        {!q.data?.length&&<p className="text-sm text-muted-foreground">Nessuna emissione conservata. Il PDF si prepara quando approvi il POS.</p>}
        <ul className="divide-y">{(q.data||[]).map(e=><li key={e.id} className="py-3 first:pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">Revisione {e.revisione} · {e.stato==="completa"?"PDF pronto":e.stato==="errore"?"Da completare":"Preparazione in corso"}</p><p className="text-xs text-muted-foreground">{new Date(e.stato==="completa"?e.updated_at:e.emesso_il).toLocaleString("it-IT")}{e.origine==="ricostruzione_da_contenuto_archiviato"?" · copia preparata dal contenuto storico":" · approvazione interna"}</p></div>
            {e.stato==="completa"&&<div className="flex gap-2"><Button variant="outline" size="sm" disabled={!!scaricando} onClick={()=>void scarica(e.id,"pdf")}><FileDown className="mr-1 h-4 w-4"/>Scarica PDF</Button><Button variant="outline" size="sm" disabled={!!scaricando} onClick={()=>void scarica(e.id,"zip")}><Package className="mr-1 h-4 w-4"/>Archivio completo (ZIP)</Button></div>}
          </div>
          {e.errore&&<p role="alert" className="mt-2 text-xs text-amber-800">{e.errore} La preparazione non equivale a un’approvazione completata.</p>}
          {e.stato==="completa"&&<details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Dettagli tecnici ({e.manifest?.file.length||0} file)</summary><p className="my-2">{e.manifest?.avvertenza}</p><ul className="space-y-2">{e.manifest?.file.map(f=><li key={f.nome}><p>{f.nomeOriginale||f.nome} · {Math.ceil(f.dimensione/1024)} KB</p><code className="block break-all text-[10px] text-muted-foreground">{f.sha256}</code></li>)}</ul></details>}
        </li>)}</ul>
        {!!daPreparare.length&&!p.solaLettura&&<div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
          <p className="text-sm font-medium">Conserva una copia del contenuto storico</p>
          <p className="text-xs text-muted-foreground">La copia viene preparata oggi. Non ricostruisce i byte dei vecchi PDF o allegati non conservati all’epoca e non attesta firme precedenti. Gli allegati mancanti bloccano il pacchetto.</p>
          <div className="flex flex-wrap gap-2"><select aria-label="Contenuto approvato da conservare" className="min-w-0 max-w-full rounded-md border bg-background p-2 text-sm" value={selezionato} onChange={e=>setSnapshot(e.target.value)} disabled={prepara.isPending}><option value="">Scegli la revisione</option>{daPreparare.map(s=><option key={s.id} value={s.id}>Revisione {s.revisione}</option>)}</select><Button size="sm" disabled={!selezionato||prepara.isPending} onClick={()=>prepara.mutate(selezionato)}><ShieldCheck className="mr-1 h-4 w-4"/>{prepara.isPending?"Preparazione…":"Prepara copia"}</Button></div>
        </div>}
      </>}
    </div>}
  </details>;
}
