import {
  getSmoothStepPath,
  EdgeLabelRenderer,
  BaseEdge,
  type EdgeProps,
} from "@xyflow/react";
import { Plus } from "lucide-react";

export function AddStepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
  label,
}: EdgeProps) {
  // Tratti ortogonali: prima si scende, poi si raggiunge il ramo e si
  // riprende verso il basso. Solo gli angoli sono leggermente arrotondati.
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 6,
    offset: 32,
  });
  const edgeData = data as { onAddStep?: (id: string) => void; __flow?: boolean } | undefined;

  // Durante il test: la linea da un nodo completato "trasporta" un pacchetto di
  // dati (pallino che scorre lungo il path). Solo sulle linee verdi (success).
  const flowing =
    Boolean(edgeData?.__flow) &&
    (style as { stroke?: string } | undefined)?.stroke === "#22c55e";

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: "#64748b",
          strokeWidth: 2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          // Larghezza COSTANTE a ogni zoom: senza questo, con molti nodi il
          // fitView zooma out e il tratto da 2px diventa sub-pixel → linee invisibili.
          vectorEffect: "non-scaling-stroke",
          ...style,
        }}
      />
      {flowing && (
        <circle className="motion-reduce:hidden" r={4.5} fill="#22c55e" style={{ filter: "drop-shadow(0 0 5px rgba(34,197,94,0.9))" }}>
          <animateMotion dur="1.4s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
      <EdgeLabelRenderer>
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
            aria-label={label ? `Aggiungi un passo nel ramo ${String(label)}` : "Aggiungi un passo"}
            title={label ? `Ramo ${String(label)} · Aggiungi un passo` : "Aggiungi un passo"}
            onClick={() => edgeData?.onAddStep?.(id)}
            className="flex h-7 min-w-7 items-center justify-center gap-1 rounded-md border border-border bg-background px-1.5 text-muted-foreground shadow-sm transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {label != null && <span className="text-[10px] font-semibold">{label}</span>}
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
