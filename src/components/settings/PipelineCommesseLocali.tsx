import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, X, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UniformSelect } from "@/components/ui/uniform-select";
import { usePermissions } from "@/hooks/usePermissions";
import { OrderStatusConfig } from "./OrderStatusConfig";
import { PRINCIPALE, usePipelineLocali, type PipelineLocale } from "@/lib/orders/pipelineLocali";

const nuovaFase = (name = "") => ({ id: crypto.randomUUID(), name, color: "#2563eb" });

export function PipelineCommesseLocali({ azienda }: { azienda: string }) {
  const { pipeline, salvaPipeline, errore:erroreLettura, riprova, importa, daImportare } = usePipelineLocali(azienda);
  const { canEditSettingsOrders, solaLettura } = usePermissions();
  const modifica = canEditSettingsOrders && !solaLettura;
  const [id, scegli] = useState(PRINCIPALE);
  const [bozza, scrivi] = useState<PipelineLocale | null>(null);
  const [errore, setErrore] = useState("");
  const [occupato, setOccupato] = useState(false);
  const corrente = pipeline.find(p => p.id === id);
  function apri(p: PipelineLocale) { scrivi(p); setErrore(""); }
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
      <label className="text-sm font-medium" htmlFor="pipeline-impostazioni">Pipeline commesse</label>
      <UniformSelect id="pipeline-impostazioni" value={corrente?.id ?? PRINCIPALE} onChange={e => {scegli(e.target.value); scrivi(null);}}>
        <option value={PRINCIPALE}>Principale</option>{pipeline.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </UniformSelect>
      {modifica && <Button size="sm" variant="outline" onClick={() => apri({ id: crypto.randomUUID(), nome:"", fasi:[nuovaFase("Da avviare"), nuovaFase("In corso"), nuovaFase("Completata")] })}><Plus className="mr-1 h-4 w-4"/>Nuova pipeline</Button>}
      <Link className="text-sm text-primary hover:underline" to={`/azienda/ordini?view=pipeline&pipeline=${corrente?.id ?? PRINCIPALE}`}>Apri nelle commesse</Link>
    </div>
    {erroreLettura && <p role="alert">{erroreLettura} <Button variant="link" onClick={() => void riprova()}>Riprova</Button></p>}
    {modifica && daImportare && <Button disabled={occupato} variant="outline" size="sm" onClick={async () => {
      setOccupato(true); setErrore(""); try { await importa(); } catch(e) {setErrore(e instanceof Error ? e.message : "Importazione non riuscita.");} finally {setOccupato(false);}
    }}>Importa le pipeline di questo browser</Button>}
    {!bozza && errore && <p role="alert">{errore}</p>}
    {bozza && modifica ? <form className="max-w-xl space-y-3 rounded-xl border bg-card p-4" onSubmit={async e => {
      e.preventDefault(); if (occupato) return; setOccupato(true); try { await salvaPipeline(bozza); scegli(bozza.id); scrivi(null); } catch (err) {setErrore(err instanceof Error ? err.message : "Salvataggio non riuscito.");} finally {setOccupato(false);}
    }}>
      <label className="block text-sm font-medium">Nome pipeline<Input required autoFocus value={bozza.nome} onChange={e => scrivi({...bozza,nome:e.target.value})} placeholder="Es. Serramenti" /></label>
      <div className="space-y-2"><p className="text-sm font-medium">Fasi in ordine di lavorazione</p>
        {bozza.fasi.map((f,i) => <div className="flex items-center gap-2" key={f.id}>
          <input type="color" aria-label={`Colore fase ${i+1}`} value={f.color} onChange={e => scrivi({...bozza, fasi:bozza.fasi.map(x => x.id===f.id ? {...x,color:e.target.value} : x)})}/>
          <Input required aria-label={`Nome fase ${i+1}`} value={f.name} onChange={e => scrivi({...bozza, fasi:bozza.fasi.map(x => x.id===f.id ? {...x,name:e.target.value} : x)})}/>
          <Button type="button" size="icon" variant="ghost" disabled={!i} aria-label={`Anticipa fase ${i+1}`} onClick={() => {const fasi=[...bozza.fasi]; [fasi[i-1], fasi[i]]=[fasi[i],fasi[i-1]]; scrivi({...bozza,fasi});}}><ArrowUp className="h-4 w-4"/></Button>
          <Button type="button" size="icon" variant="ghost" disabled={bozza.fasi.length===1} aria-label={`Rimuovi fase ${i+1}`} onClick={() => scrivi({...bozza,fasi:bozza.fasi.filter(x=>x.id!==f.id)})}><X className="h-4 w-4"/></Button>
        </div>)}</div>
      <Button type="button" size="sm" variant="outline" onClick={() => scrivi({...bozza,fasi:[...bozza.fasi,nuovaFase()]})}>Aggiungi fase</Button>
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => scrivi(null)}>Annulla</Button><Button disabled={occupato} type="submit">Salva pipeline</Button></div>
    </form> : corrente ? <section className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">{corrente.nome}</h2>{modifica && <Button variant="outline" size="sm" onClick={() => apri(corrente)}>Modifica fasi</Button>}</div>
      <ol className="mt-2 divide-y">{corrente.fasi.map(f => <li className="flex items-center gap-2 py-2 text-sm" key={f.id}><span className="h-3 w-3 rounded-full" style={{backgroundColor:f.color}}/>{f.name}</li>)}</ol>
    </section> : <OrderStatusConfig/>}
  </div>;
}
