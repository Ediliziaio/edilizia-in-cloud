import { Settings2, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UniformSelect } from "@/components/ui/uniform-select";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OrdersPipelineView } from "./OrdersPipelineView";
import { PRINCIPALE, usePipelineLocali } from "@/lib/orders/pipelineLocali";
import type { OrderWithDetails, OrderStatus } from "@/lib/orderUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  filtri?: React.ReactNode;
  azienda: string;
  orders: OrderWithDetails[];
  statuses: OrderStatus[];
  onStatusChange?: (id: string, fase: string) => Promise<void>;
}
export function PipelineCommesseBoard({ azienda, orders, statuses, onStatusChange, filtri }: Props) {
  const archivio = usePipelineLocali(azienda);
  const [params, setParams] = useSearchParams();
  const pipeline = archivio.pipeline.find(p => p.id === params.get("pipeline"));
  const [aperto, setAperto] = useState(false);
  const [ordine, setOrdine] = useState("");
  const [fase, setFase] = useState("");
  const [spostamento, setSpostamento] = useState<{ order: OrderWithDetails; origine: string | null; pipelineId: string; faseId: string } | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const ricevente = archivio.pipeline.find(p => p.id === spostamento?.pipelineId);
  async function sposta(id: string, nuova: string | null, origine: string | null, nome: string) {
    await archivio.assegnaFase(id, nuova, origine);
    toast.success(`Commessa spostata in ${nome}`, { action: { label: "Annulla", onClick: async () => {
      try { await archivio.assegnaFase(id, origine, nuova); toast.success("Spostamento annullato"); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Impossibile annullare"); }
    } } });
  }
  const destinazione = pipeline?.fasi.find(f => f.id === fase) ?? pipeline?.fasi[0];
  const fasi = new Map(pipeline?.fasi.map(f => [f.id, f]));
  const visibili = orders.flatMap(o => {
    const assegnata = archivio.fasiPerCommessa[o.id];
    if (!pipeline) return assegnata ? [] : [o];
    const stato = fasi.get(assegnata);
    return stato ? [{...o, current_status_id:stato.id, status:stato}] : [];
  });
  if (!import.meta.env.DEV) return <OrdersPipelineView controls={filtri} orders={orders} statuses={statuses} onStatusChange={onStatusChange} />;
  if (archivio.caricamento) return <p role="status">Caricamento pipeline…</p>;
  if (archivio.errore) return <p role="alert">{archivio.errore} <Button variant="link" onClick={() => void archivio.riprova()}>Riprova</Button></p>;
  const controls = <>
      <label htmlFor="pipeline-commesse" className="sr-only">Pipeline</label>
      <UniformSelect className="h-8 max-w-[180px] font-semibold" id="pipeline-commesse" value={pipeline?.id ?? PRINCIPALE} onChange={e => {
        const next = new URLSearchParams(params); next.set("pipeline",e.target.value); setParams(next);
        setAperto(false); setOrdine(""); setFase("");
      }}><option value={PRINCIPALE}>Principale</option>{archivio.pipeline.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</UniformSelect>
      {filtri}
      {onStatusChange && archivio.pipeline.length > 0 && <Popover open={aperto} onOpenChange={v => {setAperto(v); setOrdine(""); setFase("");}}>
        <PopoverTrigger asChild><Button size="sm" className="h-8 gap-1"><Plus className="size-3.5" />Assegna commessa</Button></PopoverTrigger>
        <PopoverContent className="space-y-3" align="start"><p className="text-sm font-semibold">Sposta in {pipeline?.nome ?? "Principale"}</p>
          <OrderSelectCombobox companyId={azienda} filtroIniziale="all" value={ordine || undefined} onChange={setOrdine} placeholder="Cerca una commessa"/>
          {pipeline && <UniformSelect aria-label="Fase di destinazione" value={destinazione?.id} onChange={e => setFase(e.target.value)}>{pipeline.fasi.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</UniformSelect>}
          <Button disabled={!ordine} size="sm" onClick={async () => {
            try { await sposta(ordine, destinazione?.id ?? null, archivio.fasiPerCommessa[ordine] ?? null, destinazione?.name ?? "Principale"); setAperto(false); }
            catch(e) { toast.error(e instanceof Error ? e.message : "Impossibile salvare la destinazione"); }
          }}>Conferma assegnazione</Button>
        </PopoverContent>
      </Popover>}
      <Link aria-label="Gestisci pipeline" title="Gestisci pipeline" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted" to="/azienda/impostazioni/stati-ordine"><Settings2 className="size-4" /></Link>
    </>;
  return <>
    <OrdersPipelineView controls={controls} onMove={onStatusChange && archivio.pipeline.length ? order => {
      const origine = archivio.fasiPerCommessa[order.id] ?? null;
      setSpostamento({order, origine, pipelineId:pipeline?.id ?? PRINCIPALE, faseId:origine ?? ""});
    } : undefined} key={pipeline?.id ?? PRINCIPALE} orders={visibili} statuses={pipeline?.fasi ?? statuses}
      onStatusChange={onStatusChange && (pipeline ? async (id, nuova) => {
        try { await sposta(id, nuova, archivio.fasiPerCommessa[id] ?? null, fasi.get(nuova)?.name ?? pipeline.nome); } catch(e) { toast.error(e instanceof Error ? e.message : "Impossibile aggiornare la fase"); }
      } : onStatusChange)} />
    <Dialog open={!!spostamento} onOpenChange={open => { if (!open && !salvataggio) setSpostamento(null); }}>
      {spostamento && <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Sposta {spostamento.order.order_code || "commessa"}</DialogTitle></DialogHeader>
        <label className="grid gap-1 text-sm">Pipeline di destinazione
          <UniformSelect value={spostamento.pipelineId} onChange={e => {
            const id = e.target.value;
            setSpostamento({...spostamento, pipelineId:id, faseId:archivio.pipeline.find(p => p.id === id)?.fasi[0]?.id ?? ""});
          }}><option value={PRINCIPALE}>Principale</option>{archivio.pipeline.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</UniformSelect>
        </label>
        {ricevente ? <label className="grid gap-1 text-sm">Fase di destinazione
          <UniformSelect value={spostamento.faseId} onChange={e => setSpostamento({...spostamento, faseId:e.target.value})}>
            {ricevente.fasi.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </UniformSelect></label> : <p className="text-sm text-muted-foreground">La pipeline principale usa lo stato della commessa.</p>}
        <Button disabled={salvataggio || (spostamento.faseId || null) === spostamento.origine}
          onClick={async () => {
            setSalvataggio(true);
            try {
              await sposta(spostamento.order.id, spostamento.faseId || null, spostamento.origine,
                ricevente?.fasi.find(f => f.id === spostamento.faseId)?.name ?? "Principale");
              setSpostamento(null);
            } catch(e) { toast.error(e instanceof Error ? e.message : "Spostamento non riuscito"); }
            finally { setSalvataggio(false); }
          }}>Conferma spostamento</Button>
      </DialogContent>}
    </Dialog>
  </>;
}
