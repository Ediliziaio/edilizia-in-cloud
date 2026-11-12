// src/components/orders/generali/unita/PagamentiUnita.tsx
// I pagamenti di un'unità: caparra, acconti, saldo e permuta, con quanto resta.
// La permuta paga il prezzo senza incasso e vale anche come costo del terreno.
import { useState } from "react";
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DialogContentGenerale as DialogContent } from "@/components/orders/generali/design/DialogGenerale";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BottoneFattura } from "@/components/orders/generali/fatture/BottoneFattura";
import { dataBreve, euro, leggiCampo, oggi } from "@/components/orders/generali/unita/aspetto";
import { messaggioGenerale } from "@/hooks/useCommesseGenerali";
import { useAggiungiMovimento, useEliminaMovimento, useContabilizzaIncassoUnita } from "@/hooks/useGeneraleUnita";
import { errorePagamentoUnita, NOMI_MOVIMENTO, prezzoConVarianti, tipiMovimentoAmmessi, type TipoMovimento, type UnitaGenerale } from "@/lib/orders/generali/unita";
import { pagamentiUnita } from "@/lib/orders/generali/unitaConti";

interface Props {
  generaleId: string;
  unita: UnitaGenerale;
  /** Si possono aggiungere e togliere pagamenti (computer o tablet, con il permesso). */
  gestisci: boolean;
}

export function PagamentiUnita({ generaleId, unita: u, gestisci }: Props) {
  const elimina = useEliminaMovimento(generaleId);
  const pag = pagamentiUnita(u);
  const ammessi = tipiMovimentoAmmessi(u.stato);
  const togli = (id: string) => {
    elimina.mutate(id, {
      onSuccess: () => toast.success("Pagamento stornato; prima nota aggiornata"),
      onError: (e) => toast.error(messaggioGenerale(e, "il pagamento")),
    });
  };
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-md border px-2.5 py-1.5">
          <dt className="text-xs text-muted-foreground">{u.variantiAccettate ? "Prezzo con varianti" : "Prezzo"}</dt>
          <dd className="font-medium tabular-nums">{u.stato === "libera" ? "—" : euro(prezzoConVarianti(u))}</dd>
        </div>
        <div className="rounded-md border px-2.5 py-1.5">
          <dt className="text-xs text-muted-foreground">Pagato</dt>
          <dd className="font-medium tabular-nums">{euro(pag.pagato)}</dd>
        </div>
        <div className="rounded-md border px-2.5 py-1.5">
          <dt className="text-xs text-muted-foreground">Da incassare</dt>
          <dd className="font-medium tabular-nums">{euro(pag.residuo)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">Prezzo e quote coperte senza IVA. L’entrata effettiva è registrata una sola volta in prima nota, con IVA se dovuta.</p>

      {u.movimenti.length > 0 ? (
        <ul className="divide-y rounded-md border text-sm">
          {u.movimenti.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{dataBreve(m.data)}</span>
              <span className="min-w-0 flex-1 basis-64 whitespace-normal break-words">
                {NOMI_MOVIMENTO[m.tipo]}
                {m.descrizione && <span className="text-muted-foreground"> · {m.descrizione}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{euro(m.importo)}</span>
              {m.tipo!=='permuta' && <span className="text-xs text-muted-foreground">{m.primaNotaId ? <Link className="text-emerald-700 underline" to="/azienda/prima-nota">In prima nota · {euro(m.importoCassa ?? null)}</Link> : gestisci ? <AllineaIncasso generaleId={generaleId} orderId={u.orderId} movimentoId={m.id} /> : 'Da collegare alla prima nota'}</span>}
              {m.tipo !== "permuta" && <BottoneFattura generaleId={generaleId} origine="movimento" id={m.id} crea={gestisci} compatto />}
              {gestisci && (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Storna ${NOMI_MOVIMENTO[m.tipo].toLowerCase()} del ${dataBreve(m.data)}`}
                  disabled={elimina.isPending} onClick={() => togli(m.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {u.stato === "libera" ? "I pagamenti si registrano dopo la prenotazione." : "Nessun pagamento registrato."}
        </p>
      )}
      {(pag.permute ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">La permuta paga il prezzo senza incasso e conta come costo del terreno, ripartito su tutte le unità: non registrarla anche come costo.</p>
      )}

      {gestisci && ammessi.length > 0 && <NuovoPagamento generaleId={generaleId} u={u} ammessi={ammessi} residuo={pag.residuo} />}
    </div>
  );
}

function NuovoPagamento({ generaleId, u, ammessi, residuo }: { generaleId: string; u: UnitaGenerale; ammessi: TipoMovimento[]; residuo: number | null }) {
  const aggiungi = useAggiungiMovimento(generaleId);
  const [tipo, setTipo] = useState<TipoMovimento>(ammessi.includes("acconto") ? "acconto" : ammessi[0]);
  const [importoTesto, setImportoTesto] = useState("");
  const [cassaTesto,setCassaTesto]=useState('');
  const [data, setData] = useState(oggi());
  const [descrizione, setDescrizione] = useState("");
  const importo = leggiCampo(importoTesto);
  const errore = errorePagamentoUnita(importo, residuo, data, oggi());
  const cassa=tipo==='permuta'?0:leggiCampo(cassaTesto);
  const valido = !errore && cassa!=null && Number.isFinite(cassa) && (tipo==='permuta' || cassa>0);
  const id = (n: string) => `pagamento-${u.orderId}-${n}`;

  const salva = () => {
    if (!valido || aggiungi.isPending) return;
    aggiungi.mutate(
      { orderId: u.orderId, tipo, importo: importo!, importoCassa:cassa!,data: data || null, descrizione: descrizione.trim() || null },
      {
        onSuccess: () => {
          toast.success("Pagamento registrato");
          setImportoTesto("");
          setCassaTesto('');
          setDescrizione("");
        },
        onError: (e) => toast.error(messaggioGenerale(e, "il pagamento")),
      },
    );
  };

  return (
    <form className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-3 sm:items-end" onSubmit={(ev) => { ev.preventDefault(); salva(); }}>
      <div className="space-y-1">
        <Label htmlFor={id("tipo")}>Tipo</Label>
        <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMovimento)}>
          <SelectTrigger id={id("tipo")} className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ammessi.map((t) => <SelectItem key={t} value={t}>{NOMI_MOVIMENTO[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={id("importo")}>Quota prezzo (senza IVA)</Label>
        <Input id={id("importo")} inputMode="decimal" value={importoTesto} onChange={(ev) => setImportoTesto(ev.target.value)}
          placeholder={residuo ? String(Math.round(residuo)) : "es. 20.000"} aria-invalid={(importoTesto !== "" && !valido) || undefined} />
      </div>
      {tipo!=='permuta' && <div className="space-y-1"><Label htmlFor={id('cassa')}>Entrata effettiva in cassa</Label><Input id={id('cassa')} inputMode="decimal" value={cassaTesto} onChange={ev=>setCassaTesto(ev.target.value)} placeholder="IVA inclusa, se dovuta" required /></div>}
      <div className="space-y-1">
        <Label htmlFor={id("data")}>Data</Label>
        <Input id={id("data")} type="date" max={oggi()} value={data} onChange={(ev) => setData(ev.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={id("descrizione")}>{tipo === "permuta" ? "Cosa viene dato in permuta" : "Nota"} <span className="font-normal text-muted-foreground">(facolt.)</span></Label>
        <Input id={id("descrizione")} value={descrizione} onChange={(ev) => setDescrizione(ev.target.value)} placeholder={tipo === "permuta" ? "es. terreno foglio 12" : "es. bonifico"} />
      </div>
      <Button type="submit" size="sm" className="col-span-2 h-9 sm:col-span-1" disabled={!valido || aggiungi.isPending}>
        {aggiungi.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
        Registra
      </Button>
      {importoTesto && errore && <p role="alert" className="col-span-full text-xs text-destructive">{errore}</p>}
    </form>
  );
}

function AllineaIncasso({generaleId,orderId,movimentoId}:{generaleId:string;orderId:string;movimentoId:string}) {
  const [open,setOpen]=useState(false),[cassa,setCassa]=useState(''),[scelta,setScelta]=useState('');
  const salva=useContabilizzaIncassoUnita(generaleId);
  const candidati=useQuery({queryKey:['prima-nota','candidati-unita',orderId],enabled:open,queryFn:async()=>{
    const {data,error}=await supabase.from('prima_nota_entries').select('id,amount,entry_date,description').eq('order_id',orderId).eq('direction','entrata').is('reversal_of',null).is('unita_movimento_id' as never,null).order('entry_date',{ascending:false}).limit(500);
    if(error) throw error;
    return data??[];
  }});
  const n=leggiCampo(cassa);
  return <><Button type="button" size="sm" variant="outline" onClick={()=>setOpen(true)}>Collega prima nota</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Allinea l’incasso storico</DialogTitle><DialogDescription>Conferma quanto è entrato realmente. Se esiste già una prima nota, selezionala per riutilizzarla.</DialogDescription></DialogHeader>
    <Label htmlFor={`allinea-cassa-${movimentoId}`}>Entrata effettiva (IVA inclusa, se dovuta)</Label><Input id={`allinea-cassa-${movimentoId}`} inputMode="decimal" value={cassa} onChange={e=>setCassa(e.target.value)} />
    <Label htmlFor={`allinea-pn-${movimentoId}`}>Prima nota</Label><select className="w-full rounded border p-2" id={`allinea-pn-${movimentoId}`} value={scelta} onChange={e=>setScelta(e.target.value)}><option value="">Scegli come collegare…</option><option value="nuova">Crea una nuova entrata</option>{(candidati.data??[]).map(p=><option key={p.id} value={p.id}>{dataBreve(p.entry_date)} · {euro(Number(p.amount))} · {p.description}</option>)}</select>
    {candidati.isError && <p role="alert" className="text-sm text-destructive">Prima nota non disponibile. <button onClick={()=>void candidati.refetch()}>Riprova</button></p>}
    <Button disabled={salva.isPending || candidati.isLoading || candidati.isError || !scelta || !n || !Number.isFinite(n) || n<=0} onClick={()=>salva.mutate({movimentoId,importoCassa:n!,primaNotaId:scelta==='nuova'?null:scelta},{onSuccess:()=>{toast.success('Incasso collegato alla prima nota');setOpen(false);},onError:e=>toast.error(messaggioGenerale(e,'il collegamento alla prima nota'))})}>Conferma collegamento</Button>
  </DialogContent></Dialog></>;
}
