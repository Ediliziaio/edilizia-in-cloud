import { Settings2, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UniformSelect } from "@/components/ui/uniform-select";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OrdersPipelineView } from "./OrdersPipelineView";
import { usePipelineLocali } from "@/lib/orders/pipelineLocali";
import { useConteggiPipeline } from "@/hooks/useConteggiPipeline";
import { mostraPipelinePrincipale, pipelineOperativa, PIPELINE_PRINCIPALE, SENZA_PIPELINE } from "@/lib/orders/pipelinePrincipale";
import type { OrderWithDetails, OrderStatus } from "@/lib/orderUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  filtri?: React.ReactNode;
  azienda: string;
  orders: OrderWithDetails[];
  statuses: OrderStatus[];
  onStatusChange?: (id: string, fase: string) => Promise<void>;
  showAmounts: boolean;
  mostraSelettore?: boolean;
  onDelete?: (order: OrderWithDetails) => void;
}
export function PipelineCommesseBoard({ azienda, orders, statuses, onStatusChange, filtri, showAmounts, mostraSelettore = true, onDelete }: Props) {
  const t = useT();
  const archivio = usePipelineLocali(azienda);
  const [params, setParams] = useSearchParams();
  const principale = mostraPipelinePrincipale(azienda);
  const pipeline = pipelineOperativa(azienda, archivio.pipeline, params.get("pipeline"));
  const vista = pipeline?.id ?? (principale ? PIPELINE_PRINCIPALE : SENZA_PIPELINE);
  const [aperto, setAperto] = useState(false);
  const [ordine, setOrdine] = useState("");
  const [fase, setFase] = useState("");
  const [spostamento, setSpostamento] = useState<{ order: OrderWithDetails; origine: string | null; pipelineId: string; faseId: string } | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);
  const ricevente = archivio.pipeline.find(p => p.id === spostamento?.pipelineId);
  const faseRicevente = ricevente?.fasi.find(f => f.id === spostamento?.faseId);
  async function sposta(id: string, nuova: string | null, origine: string | null, nome: string) {
    await archivio.assegnaFase(id, nuova, origine);
    toast.success(t("Commessa spostata in {nome}", { nome }), { action: { label: t("Annulla"), onClick: async () => {
      try { await archivio.assegnaFase(id, origine, nuova); toast.success(t("Spostamento annullato")); }
      catch (e) { toast.error(e instanceof Error ? e.message : t("Impossibile annullare")); }
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
  const conConteggi = useConteggiPipeline(azienda, visibili, !archivio.caricamento && !archivio.errore);
  if (archivio.caricamento) return <p role="status">{t("Caricamento pipeline…")}</p>;
  if (archivio.errore) return <p role="alert">{archivio.errore} <Button variant="link" onClick={() => void archivio.riprova()}>{t("Riprova")}</Button></p>;
  const controls = <>
      {mostraSelettore && <><label htmlFor="pipeline-commesse" className="sr-only">{t("Pipeline")}</label>
      <UniformSelect className="h-8 max-w-[180px] font-semibold" id="pipeline-commesse" value={vista} onChange={e => {
        const next = new URLSearchParams(params); next.set("pipeline",e.target.value); setParams(next);
        setAperto(false); setOrdine(""); setFase("");
      }}>
        {principale && <option value={PIPELINE_PRINCIPALE}>{t("Principale")}</option>}
        {archivio.pipeline.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        {!principale && <option value={SENZA_PIPELINE}>{t("Senza pipeline")}</option>}
      </UniformSelect></>}
      {filtri}
      {onStatusChange && pipeline && <Popover open={aperto} onOpenChange={v => {setAperto(v); setOrdine(""); setFase("");}}>
        <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-8 gap-1 text-xs"><Plus className="size-3.5" />{t("Aggiungi alla pipeline")}</Button></PopoverTrigger>
        <PopoverContent className="space-y-3" align="start"><p className="text-sm font-semibold">{t("Sposta in {nome}", { nome: pipeline?.nome ?? t("Principale") })}</p>
          <OrderSelectCombobox companyId={azienda} filtroIniziale="all" value={ordine || undefined} onChange={setOrdine} placeholder={t("Cerca una commessa")}/>
          {pipeline && <UniformSelect aria-label={t("Fase di destinazione")} value={destinazione?.id} onChange={e => setFase(e.target.value)}>{pipeline.fasi.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</UniformSelect>}
          <Button disabled={!ordine} size="sm" onClick={async () => {
            try { await sposta(ordine, destinazione?.id ?? null, archivio.fasiPerCommessa[ordine] ?? null, destinazione?.name ?? t("Principale")); setAperto(false); }
            catch(e) { toast.error(e instanceof Error ? e.message : t("Impossibile salvare la destinazione")); }
          }}>{t("Conferma assegnazione")}</Button>
        </PopoverContent>
      </Popover>}
      <Link aria-label={t("Gestisci pipeline")} title={t("Gestisci pipeline")} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted" to="/azienda/impostazioni/stati-ordine"><Settings2 className="size-4" /></Link>
    </>;
  return <>
    {archivio.aggiornamentoFallito && (
      <div role="alert" className="text-sm text-amber-800">
        {t("Aggiornamento di pipeline e stati non riuscito. Sono visibili gli ultimi dati caricati.")}
        <Button variant="link" size="sm" disabled={archivio.aggiornamentoInCorso} onClick={() => void archivio.riprova()}>{t("Riprova")}</Button>
      </div>
    )}
    {vista === SENZA_PIPELINE && <p className="text-sm text-muted-foreground">{t("Commesse senza percorso assegnato. Usa «Sposta» per inserirle in una pipeline.")}</p>}
    <OrdersPipelineView controls={controls} canEdit={!!onStatusChange} showAmounts={showAmounts} onDelete={onDelete} onMove={onStatusChange && archivio.pipeline.length ? order => {
      const origine = archivio.fasiPerCommessa[order.id] ?? null;
      const meta = pipeline ?? (principale ? undefined : archivio.pipeline[0]);
      setSpostamento({order, origine, pipelineId:meta?.id ?? PIPELINE_PRINCIPALE, faseId:origine ?? meta?.fasi[0]?.id ?? ""});
    } : undefined} key={vista} orders={conConteggi} statuses={pipeline?.fasi ?? statuses}
      onStatusChange={vista !== SENZA_PIPELINE && onStatusChange ? (pipeline ? async (id, nuova) => {
        try { await sposta(id, nuova, archivio.fasiPerCommessa[id] ?? null, fasi.get(nuova)?.name ?? pipeline.nome); } catch(e) { toast.error(e instanceof Error ? e.message : t("Impossibile aggiornare la fase")); }
      } : onStatusChange) : undefined} />
    <Dialog open={!!spostamento} onOpenChange={open => { if (!open && !salvataggio) setSpostamento(null); }}>
      {spostamento && <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{spostamento.order.order_code ? t("Sposta {codice}", { codice: spostamento.order.order_code }) : t("Sposta commessa")}</DialogTitle></DialogHeader>
        <label className="grid gap-1 text-sm">{t("Pipeline di destinazione")}
          <UniformSelect value={spostamento.pipelineId} onChange={e => {
            const id = e.target.value;
            setSpostamento({...spostamento, pipelineId:id, faseId:archivio.pipeline.find(p => p.id === id)?.fasi[0]?.id ?? ""});
          }}>
            {principale && <option value={PIPELINE_PRINCIPALE}>{t("Principale")}</option>}
            {archivio.pipeline.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </UniformSelect>
        </label>
        {ricevente ? <label className="grid gap-1 text-sm">{t("Fase di destinazione")}
          <UniformSelect value={spostamento.faseId} onChange={e => setSpostamento({...spostamento, faseId:e.target.value})}>
            {ricevente.fasi.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </UniformSelect></label> : <p className="text-sm text-muted-foreground">{t("La pipeline principale usa lo stato della commessa.")}</p>}
        <Button disabled={salvataggio || (!faseRicevente && (!principale || !!ricevente)) || (spostamento.faseId || null) === spostamento.origine}
          onClick={async () => {
            setSalvataggio(true);
            try {
              await sposta(spostamento.order.id, spostamento.faseId || null, spostamento.origine,
                faseRicevente?.name ?? t("Principale"));
              setSpostamento(null);
            } catch(e) { toast.error(e instanceof Error ? e.message : t("Spostamento non riuscito")); }
            finally { setSalvataggio(false); }
          }}>{t("Conferma spostamento")}</Button>
      </DialogContent>}
    </Dialog>
  </>;
}
