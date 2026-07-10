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
import { Loader2, Mail, MessageCircle, Smartphone, Phone, Clock, GitBranch, Flag, Save, X, AlertTriangle, Network, Sparkles, LayoutGrid, Route, Plus } from "lucide-react";
import { NodeMeasureFix } from "@/components/flow-builder/NodeMeasureFix";
import { computeAutoLayout } from "@/components/flow-builder/autoLayout";
import { outreachNodeTypes, outreachEdgeTypes } from "./flow";
import { NodeEditorPanel } from "./flow/NodeEditorPanel";
import { PathPreviewPanel } from "./flow/PathPreviewPanel";
import { AiFlowDialog } from "./flow/AiFlowDialog";
import {
  stepsToFlow, flowToSteps, validateFlow, aiFlowToReactFlow, insertNodeOnEdge,
  type StepRow, type FlowNodeData, type OutreachNodeType,
} from "./flow/graph";
import { simulatePath, type PreviewActivity } from "./flow/preview";

const T_STEP = "outreach_sequence_steps";

type PaletteKind = Exclude<OutreachNodeType, never>;

// Palette nodi: gruppo "Messaggi" (invianti) + gruppo "Logica" (controllo flusso).
// Ogni voce porta colore icona + hover accent coerenti con i nodi sul canvas.
const PALETTE: { kind: PaletteKind; label: string; icon: typeof Mail; color: string; hover: string; group: "msg" | "logic" }[] = [
  { kind: "email", label: "Email", icon: Mail, color: "text-orange-600", hover: "hover:bg-orange-50 dark:hover:bg-orange-950/40", group: "msg" },
  { kind: "whatsapp", label: "WhatsApp", icon: MessageCircle, color: "text-emerald-600", hover: "hover:bg-emerald-50 dark:hover:bg-emerald-950/40", group: "msg" },
  { kind: "sms", label: "SMS", icon: Smartphone, color: "text-sky-600", hover: "hover:bg-sky-50 dark:hover:bg-sky-950/40", group: "msg" },
  { kind: "call", label: "Chiamata", icon: Phone, color: "text-indigo-600", hover: "hover:bg-indigo-50 dark:hover:bg-indigo-950/40", group: "msg" },
  { kind: "wait", label: "Attesa", icon: Clock, color: "text-purple-600", hover: "hover:bg-purple-50 dark:hover:bg-purple-950/40", group: "logic" },
  { kind: "condition", label: "Condizione", icon: GitBranch, color: "text-amber-600", hover: "hover:bg-amber-50 dark:hover:bg-amber-950/40", group: "logic" },
  { kind: "end", label: "Fine", icon: Flag, color: "text-muted-foreground", hover: "hover:bg-muted", group: "logic" },
];

function defaultData(kind: OutreachNodeType): FlowNodeData {
  switch (kind) {
    case "email": return { subject: "", body: "", delay_days: 0, delay_hours: 0 };
    // nodi messaggio non-email: solo corpo + ritardo (niente oggetto).
    case "whatsapp": return { body: "", delay_days: 1, delay_hours: 0 };
    case "sms": return { body: "", delay_days: 1, delay_hours: 0 };
    // chiamata: lo script/nota per il commerciale + ritardo (niente oggetto).
    case "call": return { body: "", delay_days: 1, delay_hours: 0 };
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
  // Pannello laterale destro: editor del nodo selezionato oppure anteprima percorso.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activity, setActivity] = useState<PreviewActivity>({ opened: true, replied: false });
  const [aiOpen, setAiOpen] = useState(false);
  // Hint onboarding del canvas (dismiss manuale, UI-only).
  const [hintDismissed, setHintDismissed] = useState(false);
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

  // ── Inserimento nodo SU un arco ("+"): default Attesa (il caso più comune tra
  //    due email). Riusa insertNodeOnEdge (puro), poi seleziona il nuovo nodo. ──
  const insertOnEdge = useCallback((edgeId: string) => {
    const id = crypto.randomUUID();
    const newNode: Node<FlowNodeData> = {
      id, type: "wait", position: { x: 0, y: 0 }, data: defaultData("wait"),
    };
    // insertNodeOnEdge è puro: calcola nodi+archi coerenti dallo stato corrente e
    // applicali con due set separati (niente effetto dentro un updater di stato).
    const res = insertNodeOnEdge(rfNodes, rfEdges, edgeId, newNode);
    setRfNodes(res.nodes);
    setRfEdges(res.edges);
    setPreviewOpen(false);
    setSelectedId(id);
  }, [rfNodes, rfEdges, setRfEdges, setRfNodes]);

  // ── Riordina: auto-layout topologico (riusa computeAutoLayout delle Automazioni,
  //    che gestisce già il bias dei rami yes/no). Aggiorna pos_x/pos_y. ──
  const reorder = useCallback(() => {
    const { positions, movedCount } = computeAutoLayout(rfNodes, rfEdges);
    if (movedCount === 0) { toast.info("Layout già ordinato"); return; }
    setRfNodes((nds) => nds.map((n) => (positions[n.id] ? { ...n, position: positions[n.id] } : n)));
    requestAnimationFrame(() => { try { rf.fitView({ padding: 0.2, duration: 300 }); } catch { /* noop */ } });
  }, [rfNodes, rfEdges, setRfNodes, rf]);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    setSelectedId((prev) => (deleted.some((n) => n.id === prev) ? null : prev));
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setRfNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setRfEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedId(null);
  }, [setRfNodes, setRfEdges]);

  // Duplica il nodo selezionato: stessa data (deep-copy), nuovo id, posizionato
  // accanto; NON copia gli archi (i collegamenti si decidono a mano). Utile per
  // varianti dello stesso messaggio su rami diversi.
  const duplicateNode = useCallback((nodeId: string) => {
    const src = rfNodes.find((n) => n.id === nodeId);
    if (!src) return;
    const id = crypto.randomUUID();
    const copy: Node<FlowNodeData> = {
      id,
      type: src.type,
      position: { x: src.position.x + 60, y: src.position.y + 60 },
      data: JSON.parse(JSON.stringify(src.data ?? {})),
    };
    setRfNodes((nds) => [...nds, copy]);
    setSelectedId(id);
  }, [rfNodes, setRfNodes]);

  const updateNodeData = useCallback((nodeId: string, patch: Partial<FlowNodeData>) => {
    setRfNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, [setRfNodes]);

  const onNodeClick = useCallback((_: unknown, node: Node) => {
    if (node.type === "end") { setSelectedId(null); return; }
    setSelectedId(node.id);
  }, []);

  // ── Genera il GRAFO con l'AI (edge outreach-ai-flow): brief → { nodes, edges }
  //    → mappa key→uuid + branch→handle (aiFlowToReactFlow) → auto-layout → sul
  //    canvas (non ancora salvato). Degrada con toast se l'edge non è deployata
  //    o ritorna un grafo vuoto (best-effort lato edge). ──
  const aiGenerate = useMutation({
    mutationFn: async (brief: string) => {
      const { data, error } = await supabase.functions.invoke("outreach-ai-flow", {
        body: { brief },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
      const edges = Array.isArray(data?.edges) ? data.edges : [];
      if (nodes.length === 0) {
        throw new Error(data?.reason || "L'AI non ha prodotto un flusso, riprova con un brief più dettagliato");
      }
      return aiFlowToReactFlow({ name: data.name, nodes, edges });
    },
    onSuccess: ({ nodes, edges }) => {
      // Auto-layout immediato sul grafo generato, poi sul canvas.
      const { positions } = computeAutoLayout(nodes, edges);
      const laid = nodes.map((n) => (positions[n.id] ? { ...n, position: positions[n.id] } : n));
      setRfNodes(laid);
      setRfEdges(edges);
      setSelectedId(null);
      setPreviewOpen(false);
      setAiOpen(false);
      toast.success("Flusso generato: rivedilo e salva");
      requestAnimationFrame(() => { try { rf.fitView({ padding: 0.2, duration: 300 }); } catch { /* noop */ } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore AI (l'edge potrebbe non essere deployata)"),
  });

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

  // Flusso "vuoto/minimale": solo i nodi seed Email→Fine senza contenuto. In tal
  // caso mostriamo l'hint onboarding (finché non viene chiuso o si edita qualcosa).
  const isPristineFlow = useMemo(() => {
    if (rfNodes.length > 2) return false;
    return rfNodes.every((n) => {
      const d = (n.data ?? {}) as FlowNodeData;
      return !d.subject?.trim() && !d.body?.trim() && !d.condition_type && !d.template_name?.trim();
    });
  }, [rfNodes]);
  const showHint = isPristineFlow && !hintDismissed && !previewOpen && !selectedNode;

  // ── Anteprima percorso: simula il cammino del lead dalle ipotesi correnti.
  //    Calcolata solo quando il pannello è aperto (traversata pura, no effetti). ──
  const preview = useMemo(
    () => simulatePath(rfNodes, rfEdges, activity),
    [rfNodes, rfEdges, activity],
  );
  const activeNodeIds = useMemo(
    () => (previewOpen ? new Set(preview.pathNodeIds) : null),
    [previewOpen, preview.pathNodeIds],
  );
  const activeEdgeIds = useMemo(
    () => (previewOpen ? new Set(preview.pathEdgeIds) : null),
    [previewOpen, preview.pathEdgeIds],
  );

  // Decoro gli archi per il render SENZA toccare lo stato salvato: ogni arco è di
  // tipo "addStep" (mostra il "+") e porta onAddNode; in anteprima, gli archi del
  // cammino sono marcati __active per l'evidenziazione. Tenere il callback fuori
  // dallo stato evita churn/closure stantii (niente setState-in-effect).
  const renderEdges = useMemo(
    () =>
      rfEdges.map((e) => ({
        ...e,
        type: "addStep",
        data: {
          ...e.data,
          onAddNode: previewOpen ? undefined : insertOnEdge,
          __active: activeEdgeIds ? activeEdgeIds.has(e.id) : false,
        },
      })),
    [rfEdges, previewOpen, insertOnEdge, activeEdgeIds],
  );

  // Nodi decorati con il flag di evidenziazione anteprima (opacità nodi fuori cammino).
  const renderNodes = useMemo(
    () =>
      activeNodeIds
        ? rfNodes.map((n) => ({
            ...n,
            style: { ...n.style, opacity: activeNodeIds.has(n.id) ? 1 : 0.35 },
          }))
        : rfNodes,
    [rfNodes, activeNodeIds],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 border-b bg-background px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Network className="h-4 w-4" />
          </div>
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
          <Button size="sm" variant="outline" className="h-8 gap-1" title="Genera un flusso condizionale con l'AI da un brief" onClick={() => setAiOpen(true)}>
            <Sparkles className="h-3.5 w-3.5" /> Genera con AI
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1" title="Riordina i nodi in un layout leggibile" onClick={reorder}>
            <LayoutGrid className="h-3.5 w-3.5" /> Riordina
          </Button>
          <Button
            size="sm"
            variant={previewOpen ? "default" : "outline"}
            className="h-8 gap-1"
            title="Simula il percorso del contatto"
            onClick={() => { setPreviewOpen((v) => !v); if (!previewOpen) setSelectedId(null); }}
          >
            <Route className="h-3.5 w-3.5" /> Anteprima
          </Button>
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
              nodes={renderNodes}
              edges={renderEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodesDelete={onNodesDelete}
              onNodeClick={previewOpen ? undefined : onNodeClick}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={outreachNodeTypes}
              edgeTypes={outreachEdgeTypes}
              defaultEdgeOptions={{
                type: "addStep",
                style: { stroke: "hsl(var(--border))", strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "hsl(var(--border))" },
              }}
              deleteKeyCode={["Backspace", "Delete"]}
              fitView
              proOptions={{ hideAttribution: true }}
              className="bg-muted/30"
            >
              {/* Fix archi invisibili (React 18 + RF v12): forza la misurazione dei nodi. */}
              <NodeMeasureFix />
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} className="!opacity-60" />
              <Controls className="!rounded-lg !border !border-border !bg-background/95 !shadow-md [&>button]:!border-border [&>button]:!bg-background [&>button:hover]:!bg-muted" showInteractive={false} />
              <MiniMap nodeStrokeWidth={3} pannable zoomable className="!rounded-lg !border !border-border !bg-background/95 !shadow-md" maskColor="hsl(var(--muted) / 0.55)" />
              {/* Palette: gruppi Messaggi / Logica con accent per tipo */}
              <Panel position="top-left">
                <div className="flex w-[156px] flex-col gap-0.5 rounded-xl border border-border bg-background/95 p-2.5 shadow-lg backdrop-blur">
                  <span className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Aggiungi nodo</span>
                  {(["msg", "logic"] as const).map((group) => (
                    <div key={group} className="space-y-0.5">
                      <span className="block px-1 pt-1.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/60">
                        {group === "msg" ? "Messaggi" : "Logica"}
                      </span>
                      {PALETTE.filter((p) => p.group === group).map((p) => {
                        const Icon = p.icon;
                        return (
                          <button
                            key={p.kind}
                            type="button"
                            onClick={() => addPaletteNode(p.kind)}
                            className={`flex w-full items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-xs font-medium transition-colors hover:border-border ${p.hover}`}
                          >
                            <Icon className={`h-3.5 w-3.5 shrink-0 ${p.color}`} /> {p.label}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  <div className="mt-1.5 flex items-start gap-1 border-t pt-2 text-[9px] leading-tight text-muted-foreground/70">
                    <Plus className="mt-px h-2.5 w-2.5 shrink-0" />
                    <span>Usa il + su un arco per inserire tra due nodi</span>
                  </div>
                </div>
              </Panel>

              {/* Hint onboarding: mostrato finché il flusso è minimale (solo i 2 nodi
                  seed Email→Fine, senza contenuto). Guida verso palette / AI / +. */}
              {showHint && (
                <Panel position="bottom-center">
                  <div className="mb-2 flex items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-[11px] shadow-md backdrop-blur">
                    <Network className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                    <span className="text-muted-foreground">
                      Costruisci il flusso: aggiungi nodi dalla palette, collega gli handle o premi <span className="font-medium text-foreground">Genera con AI</span>.
                    </span>
                    <button type="button" onClick={() => setHintDismissed(true)} className="ml-1 shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Nascondi suggerimento">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </Panel>
              )}
            </ReactFlow>
          )}
        </div>

        {previewOpen ? (
          <PathPreviewPanel
            activity={activity}
            onActivityChange={setActivity}
            result={preview}
            trackOpens={trackOpens}
            onClose={() => setPreviewOpen(false)}
          />
        ) : selectedNode ? (
          <NodeEditorPanel
            node={selectedNode}
            trackOpens={trackOpens}
            onChange={(patch) => updateNodeData(selectedNode.id, patch)}
            onDelete={() => deleteNode(selectedNode.id)}
            onDuplicate={() => duplicateNode(selectedNode.id)}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>

      <AiFlowDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        pending={aiGenerate.isPending}
        hasExistingNodes={rfNodes.length > 0}
        onGenerate={(brief) => aiGenerate.mutate(brief)}
      />
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
