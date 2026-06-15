import {
  getSmoothStepPath,
  EdgeLabelRenderer,
  BaseEdge,
  type EdgeProps,
} from "@xyflow/react";
import { Plus } from "lucide-react";

/**
 * Arco del builder di sequenze condizionali con un "+" a metà tratto per
 * INSERIRE un nodo tra i due estremi (ricablando gli archi, ramo yes/no
 * rispettato — vedi insertNodeOnEdge in graph.ts).
 *
 * Adattato da src/components/flow-builder/nodes/AddStepEdge.tsx (Automazioni):
 * stesso pattern EdgeLabelRenderer + BaseEdge + vectorEffect non-scaling-stroke
 * (linee sempre visibili a ogni zoom). Mantiene la label SÌ/NO dei rami e
 * l'evidenziazione del cammino nell'anteprima percorso (data.__active).
 */
export function OutreachAddEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Anteprima percorso: l'arco fa parte del cammino simulato del lead.
  const active = Boolean((data as { __active?: boolean } | undefined)?.__active);
  const onAdd = (data as { onAddNode?: (edgeId: string) => void } | undefined)?.onAddNode;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          // Token del tema (no hex hardcoded): grigio bordo a riposo, primary sul
          // cammino attivo dell'anteprima percorso.
          stroke: active ? "hsl(var(--primary))" : "hsl(var(--border))",
          strokeWidth: active ? 3 : 2,
          // Larghezza COSTANTE a ogni zoom (altrimenti il tratto da 2px diventa
          // sub-pixel col fitView su molti nodi → archi invisibili).
          vectorEffect: "non-scaling-stroke",
          ...style,
        }}
      />
      <EdgeLabelRenderer>
        {/* Etichetta ramo (SÌ/NO) leggermente sopra il punto medio. */}
        {label && (
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 16}px)`,
              pointerEvents: "none",
            }}
            className="nodrag nopan rounded bg-background/90 px-1 text-[9px] font-bold text-muted-foreground shadow-sm"
          >
            {label}
          </div>
        )}
        {onAdd && (
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
          >
            <button
              type="button"
              title="Inserisci un nodo qui"
              onClick={(ev) => { ev.stopPropagation(); onAdd(id); }}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-border bg-background text-muted-foreground shadow-sm transition-all hover:border-primary hover:bg-primary/10 hover:text-primary"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
