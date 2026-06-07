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
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Durante il test: la linea da un nodo completato "trasporta" un pacchetto di
  // dati (pallino che scorre lungo il path). Solo sulle linee verdi (success).
  const flowing =
    Boolean((data as { __flow?: boolean } | undefined)?.__flow) &&
    (style as { stroke?: string } | undefined)?.stroke === "#22c55e";

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: "#64748b",
          strokeWidth: 2,
          // Larghezza COSTANTE a ogni zoom: senza questo, con molti nodi il
          // fitView zooma out e il tratto da 2px diventa sub-pixel → linee invisibili.
          vectorEffect: "non-scaling-stroke",
          ...style,
        }}
      />
      {flowing && (
        <circle r={4.5} fill="#22c55e" style={{ filter: "drop-shadow(0 0 5px rgba(34,197,94,0.9))" }}>
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
            onClick={() => (data as any)?.onAddStep?.(id)}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-border bg-background text-muted-foreground shadow-sm transition-all hover:border-primary hover:bg-primary/10 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
