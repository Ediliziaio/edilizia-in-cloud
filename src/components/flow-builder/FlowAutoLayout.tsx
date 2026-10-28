import { useEffect, useRef } from "react";
import { useNodesInitialized, useReactFlow, useStore } from "@xyflow/react";
import { computeAutoLayout, type AutoLayoutResult } from "./autoLayout";

/** Solo presentazione: nessun salvataggio o modifica alla logica del flusso.
 * Si riordina quando cambia il grafo, NON quando l'utente trascina una card,
 * seleziona un nodo o modifica la configurazione a dimensioni invariate.
 * Aspetta le misure reali e riallinea anche quando una card cambia dimensioni.
 */
export function FlowAutoLayout({ topologyKey, onLayout }: {
  topologyKey: string;
  onLayout: (positions: AutoLayoutResult["positions"]) => void;
}): null {
  const ready = useNodesInitialized();
  const { getNodes, getInternalNode, getEdges, fitView } = useReactFlow();
  const dimensionsKey = useStore((state) => JSON.stringify(
    [...state.nodeLookup.values()].filter((n) => n.type !== "note")
      .map((n) => [n.id, n.measured?.width, n.measured?.height]).sort(),
  ));
  const applied = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    const key = topologyKey + dimensionsKey;
    if (applied.current !== key) {
      // Le dimensioni interne possono precedere di un render quelle dei nodi
      // controllati: usare solo getNodes() produceva un asse sfalsato di 20px.
      const measured = getNodes().map((n) => ({ ...n, measured: getInternalNode(n.id)?.measured ?? n.measured }));
      const { positions, movedCount } = computeAutoLayout(measured, getEdges());
      applied.current = key;
      if (movedCount) onLayout(positions);
    }
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.22, maxZoom: 1, duration: reducedMotion ? 0 : 240 });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [ready, topologyKey, dimensionsKey, getNodes, getInternalNode, getEdges, fitView, onLayout]);

  return null;
}
