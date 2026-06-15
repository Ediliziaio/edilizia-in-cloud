import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Node,
  type Edge,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Mail, Clock, GitBranch, Flag, Save, X, AlertTriangle, Network } from "lucide-react";
import { NodeMeasureFix } from "@/components/flow-builder/NodeMeasureFix";
import { outreachNodeTypes } from "./flow";
import { NodeEditorPanel } from "./flow/NodeEditorPanel";
import {
  stepsToFlow, flowToSteps, validateFlow,
  type StepRow, type FlowNodeData, type OutreachNodeType,
} from "./flow/graph";

const T_STEP = "outreach_sequence_steps";

type PaletteKind = Exclude<OutreachNodeType, never>;

const PALETTE: { kind: PaletteKind; label: string; icon: typeof Mail; color: string }[] = [
  { kind: "email", label: "Email", icon: Mail, color: "text-orange-600" },
  { kind: "wait", label: "Attesa", icon: Clock, color: "text-purple-600" },
  { kind: "condition", label: "Condizione", icon: GitBranch, color: "text-amber-600" },
  { kind: "end", label: "Fine", icon: Flag, color: "text-muted-foreground" },
];

function defaultData(kind: OutreachNodeType): FlowNodeData {
  switch (kind) {
    case "email": return { subject: "", body: "", delay_days: 0, delay_hours: 0 };
    case "wait": return { delay_days: 1, delay_hours: 0 };
    case "condition": return { condition_type: null };
    case "end": return {};
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  sequenceId: string;
  sequenceName: string;
  trackOpens: boolean;
}

function FlowCanvas({ sequenceId, sequenceName, trackOpens, onClose }: Omit<Props, "open">) {
  const qc = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const rf = useReactFlow<Node<FlowNodeData>, Edge>();

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedRows, setLoadedRows] = useState<StepRow[]>([]);
  const initializedRef = useRef(false);
  const fitRef = useRef(false);

  // ── Carica gli step della sequenza ──
  const stepsQ = useQuery({
    queryKey: ["outreach-seq-steps-flow", sequenceId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.from(T_STEP).select("*").eq("sequence_id", sequenceId).order("step_order");
      if (error) throw error;
      return (data ?? []) as StepRow[];
    },
  });

  // Sync DB → React Flow (una sola volta per apertura, su dati grezzi caricati).
  // Il seeding dello stato controllato di React Flow è uno scenario di
  // sincronizzazione con un sistema esterno (dati async da Supabase): lo si
  // applica in un rAF (non sincrono nel corpo dell'effetto) per non innescare
  // render a cascata, come fa l'auto-layout del builder Automazioni.
  useEffect(() => {
    if (initializedRef.current) return;
    if (stepsQ.isLoading || stepsQ.isError) return;
    initializedRef.current = true;
    const rows = stepsQ.data ?? [];
    const raf = requestAnimationFrame(() => {
      setLoadedRows(rows);
      const { nodes, edges } = stepsToFlow(rows);
      if (nodes.length === 0) {
        // Sequenza vuota: parti con una Email + una Fine collegate.
        const emailId = crypto.randomUUID();
        const endId = crypto.randomUUID();
        setRfNodes([
          { id: emailId, type: "email", position: { x: 320, y: 60 }, data: defaultData("email") },
          { id: endId, type: "end", position: { x: 320, y: 260 }, data: {} },
        ]);
        setRfEdges([{ id: `e-${emailId}-${endId}`, source: emailId, target: endId, type: "smoothstep", animated: true, style: { strokeWidth: 2 } }]);
      } else {
        setRfNodes(nodes);
        setRfEdges(edges);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [stepsQ.isLoading, stepsQ.isError, stepsQ.data, setRfNodes, setRfEdges]);

  // fitView una volta che i nodi sono presenti.
  useEffect(() => {
    if (fitRef.current || rfNodes.length === 0) return;
    fitRef.current = true;
    const t = window.setTimeout(() => { try { rf.fitView({ padding: 0.2, duration: 300 }); } catch { /* noop */ } }, 200);
    return () => window.clearTimeout(t);
  }, [rfNodes.length, rf]);

  // ── Validazione soft (warning su nodi) ──
  const issues = useMemo(() => validateFlow(rfNodes, rfEdges), [rfNodes, rfEdges]);
  const warningNodeIds = useMemo(() => new Set(issues.filter((i) => i.nodeId).map((i) => i.nodeId!)), [issues]);

  // Propaga il flag hasWarning ai nodi (senza loop: aggiorna solo se cambia).
  useEffect(() => {
    setRfNodes((nds) => {
      let changed = false;
      const next = nds.map((n) => {
        const hasWarning = warningNodeIds.has(n.id);
        if ((n.data as FlowNodeData)?.hasWarning === hasWarning) return n;
        changed = true;
        return { ...n, data: { ...n.data, hasWarning } };
      });
      return changed ? next : nds;
    });
  }, [warningNodeIds, setRfNodes]);

  // ── Connessioni ──
  const onConnect: OnConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target || params.source === params.target) return;
    const source = rfNodes.find((n) => n.id === params.source);
    const target = rfNodes.find((n) => n.id === params.target);
    if (!source || !target) return;
    if (target.type === "end" && source.type === "end") return;
    // 1 sola uscita per handle: rimuovi edge esistenti dallo stesso source+handle.
    const handle = params.sourceHandle ?? undefined;
    const label = handle === "yes" ? "SÌ" : handle === "no" ? "NO" : undefined;
    const newEdge: Edge = {
      id: crypto.randomUUID(),
      source: params.source,
      target: params.target,
      sourceHandle: handle,
      type: "smoothstep",
      animated: true,
      style: { strokeWidth: 2 },
      label,
    };
    setRfEdges((eds) =>
      addEdge(
        newEdge,
        eds.filter((e) => !(e.source === params.source && (e.sourceHandle ?? undefined) === handle)),
      ),
    );
  }, [rfNodes, setRfEdges]);

  const addPaletteNode = useCallback((kind: OutreachNodeType) => {
    const id = crypto.randomUUID();
    // Posiziona al centro della vista corrente.
    let pos = { x: 360, y: 120 + rfNodes.length * 40 };
    try {
      const c = rf.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      });
      pos = { x: Math.round(c.x), y: Math.round(c.y) };
    } catch { /* noop */ }
    const node: Node<FlowNodeData> = { id, type: kind, position: pos, data: defaultData(kind) };
    setRfNodes((nds) => [...nds, node]);
    if (kind !== "end") setSelectedId(id);
  }, [rfNodes.length, rf, setRfNodes]);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    setSelectedId((prev) => (deleted.some((n) => n.id === prev) ? null : prev));
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setRfNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setRfEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedId(null);
  }, [setRfNodes, setRfEdges]);

  const updateNodeData = useCallback((nodeId: string, patch: Partial<FlowNodeData>) => {
    setRfNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, [setRfNodes]);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    if (node.type === "end") { setSelectedId(null); return; }
    setSelectedId(node.id);
  }, []);

  // ── Salvataggio: upsert nodi, set next_*, elimina step rimossi ──
  const save = useMutation({
    mutationFn: async () => {
      const rows = flowToSteps(rfNodes, rfEdges, sequenceId);
      const keepIds = new Set(rows.map((r) => r.id));
      const removed = loadedRows.filter((r) => !keepIds.has(r.id)).map((r) => r.id);

      // 1) Azzera prima i puntatori next_* su tutto per evitare violazioni di FK
      //    durante l'upsert/delete (ordine di scrittura non garantito).
      if (loadedRows.length) {
        const { error } = await db.from(T_STEP).update({ next_default: null, next_alt: null }).eq("sequence_id", sequenceId);
        if (error) throw error;
      }
      // 2) Elimina gli step rimossi (le FK auto-referenziali sono ON DELETE SET NULL,
      //    quindi enrollment.current_node_id e altri puntatori ricadono a NULL).
      if (removed.length) {
        const { error } = await db.from(T_STEP).delete().in("id", removed);
        if (error) throw error;
      }
      // 3) Sposta TUTTI gli step_order superstiti in un range alto non collidente
      //    PRIMA di riassegnarli: c'è un UNIQUE su (sequence_id, step_order) e una
      //    semplice permutazione degli ordini tra righe esistenti lo violerebbe
      //    durante l'upsert. Bumpando prima a +100000 si libera l'intervallo basso.
      if (loadedRows.length) {
        for (const r of loadedRows) {
          if (removed.includes(r.id)) continue;
          await db.from(T_STEP).update({ step_order: r.step_order + 100000 }).eq("id", r.id);
        }
      }
      // 4) Upsert dei nodi SENZA i next_* (così tutte le righe esistono prima dei link).
      const baseRows = rows.map(({ next_default: _nd, next_alt: _na, ...rest }) => rest);
      if (baseRows.length) {
        const { error } = await db.from(T_STEP).upsert(baseRows, { onConflict: "id" });
        if (error) throw error;
      }
      // 5) Applica i puntatori next_default / next_alt ora che tutti gli id esistono.
      for (const r of rows) {
        if (r.next_default || r.next_alt) {
          const { error } = await db.from(T_STEP)
            .update({ next_default: r.next_default, next_alt: r.next_alt })
            .eq("id", r.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success("Flusso salvato");
      setLoadedRows(flowToSteps(rfNodes, rfEdges, sequenceId).map((r) => ({
        ...r, created_at: "",
      } as unknown as StepRow)));
      qc.invalidateQueries({ queryKey: ["outreach-seq-steps-flow", sequenceId] });
      qc.invalidateQueries({ queryKey: ["outreach-sequences"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore nel salvataggio"),
  });

  const selectedNode = useMemo(() => rfNodes.find((n) => n.id === selectedId) ?? null, [rfNodes, selectedId]);
  const globalIssues = issues.filter((i) => !i.nodeId);

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Network className="h-4 w-4 shrink-0 text-orange-500" />
          <span className="truncate text-sm font-semibold">{sequenceName}</span>
          <Badge variant="outline" className="shrink-0 text-[10px]">Builder visuale</Badge>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {issues.length > 0 && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" /> {issues.length}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[280px] space-y-1 text-[11px]">
                  {issues.slice(0, 8).map((i, idx) => <div key={idx}>• {i.message}</div>)}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button size="sm" className="h-8 gap-1" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {save.isPending ? "Salvo…" : "Salva flusso"}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </div>

      {globalIssues.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" />
          {globalIssues.map((i, idx) => <span key={idx}>{i.message}</span>)}
        </div>
      )}

      {/* Body: canvas + panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          {stepsQ.isLoading ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodesDelete={onNodesDelete}
              onNodeClick={onNodeClick}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={outreachNodeTypes}
              defaultEdgeOptions={{
                type: "smoothstep",
                style: { stroke: "#64748b", strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#64748b" },
              }}
              deleteKeyCode={["Backspace", "Delete"]}
              fitView
              className="bg-muted/30"
            >
              {/* Fix archi invisibili (React 18 + RF v12): forza la misurazione dei nodi. */}
              <NodeMeasureFix />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
              <Controls />
              <MiniMap nodeStrokeWidth={3} className="!bg-background !border-border" maskColor="hsl(var(--muted) / 0.5)" />
              {/* Palette */}
              <Panel position="top-left">
                <div className="flex flex-col gap-1 rounded-lg border bg-background/95 p-1.5 shadow-sm backdrop-blur">
                  <span className="px-1 pb-0.5 text-[10px] font-semibold uppercase text-muted-foreground">Aggiungi</span>
                  {PALETTE.map((p) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.kind}
                        type="button"
                        onClick={() => addPaletteNode(p.kind)}
                        className="flex items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted"
                      >
                        <Icon className={`h-3.5 w-3.5 ${p.color}`} /> {p.label}
                      </button>
                    );
                  })}
                </div>
              </Panel>
            </ReactFlow>
          )}
        </div>

        {selectedNode && (
          <NodeEditorPanel
            node={selectedNode}
            trackOpens={trackOpens}
            onChange={(patch) => updateNodeData(selectedNode.id, patch)}
            onDelete={() => deleteNode(selectedNode.id)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Builder visuale a NODI (React Flow) per una sequenza condizionale outreach.
 * Dialog fullscreen. Riusa il setup React Flow delle Automazioni (stessa versione
 * @xyflow/react, NodeMeasureFix per il bug archi invisibili). Mappa il canvas su
 * outreach_sequence_steps (Fase 1) e supporta sia grafi che sequenze lineari legacy.
 */
export function OutreachSequenceFlowBuilder({ open, onClose, sequenceId, sequenceName, trackOpens }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="flex h-[92vh] max-h-[92vh] w-[96vw] max-w-[1400px] flex-col gap-0 overflow-hidden p-0"
        // Evita la chiusura accidentale durante drag/connect sul canvas.
        onInteractOutside={(e) => e.preventDefault()}
      >
        {open && (
          <ReactFlowProvider>
            <FlowCanvas
              sequenceId={sequenceId}
              sequenceName={sequenceName}
              trackOpens={trackOpens}
              onClose={onClose}
            />
          </ReactFlowProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}
