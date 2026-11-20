import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UniformSelect } from "@/components/ui/uniform-select";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { usePermissions } from "@/hooks/usePermissions";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { applyPipelineWorkflow, orderWorkflowModel, ORDER_WORKFLOW_MODELS } from "@/lib/orders/workflowModels";
import { OrderStatusConfig } from "./OrderStatusConfig";
import { StatusItem } from "./StatusItem";
import { usePipelineLocali, type PipelineLocale } from "@/lib/orders/pipelineLocali";
import { mostraPipelinePrincipale, PIPELINE_PRINCIPALE } from "@/lib/orders/pipelinePrincipale";

const nuovaFase = (name = "") => ({ id: crypto.randomUUID(), name, color: "#2563eb" });

export function PipelineCommesseLocali({ azienda }: { azienda: string }) {
  const archivio = usePipelineLocali(azienda);
  const { pipeline, fasiPerCommessa, salvaPipeline, importa, riprova, daImportare } = archivio;
  const permessi = usePermissions();
  const modifica = permessi.canEditSettingsOrders && !permessi.solaLettura;
  const principale = mostraPipelinePrincipale(azienda);
  const [id, scegli] = useState<string | null>(null);
  const [bozza, scrivi] = useState<PipelineLocale | null>(null);
  const [errore, setErrore] = useState("");
  const [occupato, setOccupato] = useState(false);
  const corrente = pipeline.find(p => p.id === id) ?? (principale ? undefined : pipeline[0]);
  const visibile = bozza ?? corrente;
  const modificabile = modifica && !occupato && !archivio.errore;
  const confermaUscita = useSettingsDraftGuard(!!bozza);
  const uso = useMemo(() => {
    const conteggi = new Map<string, number>();
    for (const fase of Object.values(fasiPerCommessa ?? {})) conteggi.set(fase, (conteggi.get(fase) ?? 0) + 1);
    return conteggi;
  }, [fasiPerCommessa]);
  const mostraConteggio = (permessi.canViewOrders || permessi.isAdmin) && !archivio.errore;
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function apri(p: PipelineLocale | null) {
    scrivi(p);
    setErrore("");
  }
  function riordina(da: number, a: number) {
    if (!visibile || !modificabile || da < 0 || a < 0 || a >= visibile.fasi.length || da === a) return;
    scrivi({ ...visibile, fasi: arrayMove(visibile.fasi, da, a) });
  }

  async function salva() {
    if (!bozza || !modificabile) return;
    const nomi = bozza.fasi.map(f => f.name.trim().toLowerCase());
    if (!bozza.nome.trim() || nomi.some(n => !n)) {
      setErrore("Inserisci il nome della pipeline e di ogni stato.");
      return;
    }
    if (new Set(nomi).size !== nomi.length) {
      setErrore("Usa un nome diverso per ogni stato.");
      return;
    }
    setOccupato(true);
    setErrore("");
    try {
      await salvaPipeline(bozza);
      scegli(bozza.id);
      scrivi(null);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Salvataggio non riuscito.");
    } finally {
      setOccupato(false);
    }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
      <label className="text-sm font-medium" htmlFor="pipeline-impostazioni">Pipeline commesse</label>
      <UniformSelect id="pipeline-impostazioni" value={corrente?.id ?? (principale ? PIPELINE_PRINCIPALE : "")}
        disabled={occupato || archivio.caricamento} onChange={e => { if (confermaUscita()) { scegli(e.target.value); apri(null); } }}>
        {principale && <option value={PIPELINE_PRINCIPALE}>Principale</option>}
        {!principale && !pipeline.length && <option value="">Seleziona una pipeline</option>}
        {pipeline.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </UniformSelect>
      {modifica && <Button size="sm" variant="outline" disabled={!modificabile} onClick={() => {
        if (confermaUscita()) apri({ id: crypto.randomUUID(), nome: "", fasi: [nuovaFase("Contratto Firmato"), nuovaFase("In corso"), nuovaFase("Completata")] });
      }}><Plus className="mr-1 size-4" />Nuova pipeline</Button>}
      {(corrente || principale) && <Link className="text-sm text-primary hover:underline"
        to={`/azienda/ordini?view=pipeline&pipeline=${corrente?.id ?? PIPELINE_PRINCIPALE}`}>Apri nelle commesse</Link>}
    </div>
    {(archivio.errore || archivio.aggiornamentoFallito) && (
      <p role="alert">
        {archivio.errore ?? "Aggiornamento non riuscito. Sono visibili le ultime pipeline caricate."}
        <Button variant="link" disabled={archivio.aggiornamentoInCorso} onClick={() => void riprova()}>Riprova</Button>
      </p>
    )}
    {modifica && daImportare && <Button disabled={occupato || !!bozza} variant="outline" size="sm" onClick={async () => {
      setOccupato(true);
      setErrore("");
      try { await importa(); }
      catch (e) { setErrore(e instanceof Error ? e.message : "Importazione non riuscita."); }
      finally { setOccupato(false); }
    }}>Importa le pipeline di questo browser</Button>}
    {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
    {visibile ? <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 shadow-sm">
        <span className="text-sm font-semibold">{visibile.nome || "Nuova pipeline"}</span>
        {modifica && <div className="flex gap-2">
          {bozza && <Button variant="ghost" size="sm" disabled={occupato} onClick={() => apri(null)}>Annulla</Button>}
          <Button size="sm" disabled={!bozza || !modificabile} onClick={() => void salva()}>
            <Save className="mr-2 size-4" />{occupato ? "Salvataggio…" : "Salva modifiche"}
          </Button>
        </div>}
      </div>
      <SezioneImpostazione id="stati" titolo="I tuoi stati"
        descrizione={modifica ? "Trascina gli stati o usa le frecce per riordinarli." : undefined}>
        <div className="space-y-3 px-4 py-4">
          {modifica && <fieldset disabled={!modificabile} className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">Nome pipeline
              <Input maxLength={120} value={visibile.nome} onChange={e => scrivi({ ...visibile, nome: e.target.value })} placeholder="Es. Serramenti" />
            </label>
            <div className="grid gap-1.5">
              <label className="text-sm font-medium" htmlFor="modello-pipeline-commessa">Usa un modello standard</label>
              <UniformSelect id="modello-pipeline-commessa" value="" onChange={e => {
                const modello = orderWorkflowModel(e.target.value);
                if (!modello) return;
                const fasi = visibile.versione ? visibile.fasi : [];
                apri({ ...visibile, nome: visibile.nome.trim() || modello.label, fasi: applyPipelineWorkflow(fasi, modello, () => crypto.randomUUID()) });
              }}>
                <option value="">Scegli il tipo di lavoro</option>
                {ORDER_WORKFLOW_MODELS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </UniformSelect>
            </div>
          </fieldset>}
          <p className="text-xs text-muted-foreground">Primo stato <strong className="text-foreground">{visibile.fasi[0]?.name || "da definire"}</strong></p>
          <fieldset disabled={!modificabile} className="min-w-0">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
              if (over) riordina(visibile.fasi.findIndex(f => f.id === active.id), visibile.fasi.findIndex(f => f.id === over.id));
            }}>
              <SortableContext items={visibile.fasi.map(f => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {visibile.fasi.map((fase, i) => (
                    <StatusItem key={fase.id} status={{ ...fase, position: i }}
                      disabled={!modificabile} canDelete={visibile.fasi.length > 1}
                      usedBy={mostraConteggio ? uso.get(fase.id) ?? 0 : undefined}
                      deletionBlocked={uso.has(fase.id) ? "Sposta prima le commesse che usano questo stato." : undefined}
                      mostraIcona={false} maxNameLength={120} isFirst={i === 0} isLast={i === visibile.fasi.length - 1}
                      onMove={modifica ? (_id, direzione) => riordina(i, i + direzione) : undefined}
                      onUpdate={(id, updates) => scrivi({ ...visibile, fasi: visibile.fasi.map(f => f.id === id ? { ...f, ...updates } : f) })}
                      onDelete={id => scrivi({ ...visibile, fasi: visibile.fasi.filter(f => f.id !== id) })} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {modifica && <Button variant="outline" size="sm" className="mt-3" onClick={() => scrivi({ ...visibile, fasi: [...visibile.fasi, nuovaFase()] })}>
              <Plus className="mr-2 size-4" />Aggiungi stato
            </Button>}
          </fieldset>
        </div>
      </SezioneImpostazione>
    </> : principale ? <OrderStatusConfig /> : !archivio.errore && (
      <p className="text-sm text-muted-foreground" role="status">{archivio.caricamento ? "Caricamento pipeline…" : "Nessuna pipeline configurata."}</p>
    )}
  </div>;
}
