import { useEffect } from "react";
import { useStoreApi } from "@xyflow/react";

/**
 * Fix archi/linee invisibili nel flow-builder.
 *
 * CONTESTO: con lo stack React 19 + @xyflow/react v12, il `ResizeObserver`
 * interno di React Flow non sempre scatta in tempo: i nodi restano "non
 * misurati" (`node.measured = {}`, `visibility: hidden`) e React Flow — che
 * disegna un arco SOLO quando sia il nodo sorgente sia il target hanno
 * dimensioni misurate — non disegna nessun path SVG. Risultato: i nodi si
 * vedono ma le linee di collegamento spariscono finché non si interagisce con
 * un nodo (drag), che forza la misurazione.
 *
 * Nel builder reale la cosa è peggiorata da: nodi caricati in async da Supabase
 * (vuoto → setRfNodes) e dall'auto-layout (un secondo setRfNodes) — qualunque
 * di questi può lasciare nodi non misurati in momenti diversi.
 *
 * FIX (robusto, copre ogni timing): ci si iscrive allo store di React Flow e,
 * ad ogni cambiamento (più una rete di sicurezza a tempo nei primi secondi),
 * si cercano i nodi NON misurati presenti nel DOM e si forza la loro
 * misurazione via `updateNodeInternals` (API ufficiale di React Flow pensata
 * esattamente per questo). Idempotente: se sono già tutti misurati, non fa
 * nulla → nessun loop, nessun impatto su drag/zoom.
 *
 * Va montato come figlio di `<ReactFlow>` (eredita il contesto dello store,
 * come Background/Controls). Non renderizza nulla.
 */

type NodeInternalsUpdate = { id: string; nodeElement: HTMLElement; force: boolean };
type RFStoreLike = {
  nodeLookup: Map<string, { measured?: { width?: number; height?: number } | null }>;
  updateNodeInternals: (u: Map<string, NodeInternalsUpdate>) => void;
};

export function NodeMeasureFix() {
  const store = useStoreApi();

  useEffect(() => {
    let raf = 0;
    let stopped = false;

    // Flag diagnostico (verificabile da console: window.__nodeMeasureFix)
    const w = window as unknown as { __nodeMeasureFix?: { runs: number; lastSize: number } };
    if (!w.__nodeMeasureFix) w.__nodeMeasureFix = { runs: 0, lastSize: 0 };
    const diag = w.__nodeMeasureFix;

    const measureUnmeasured = () => {
      if (stopped) return;
      const state = store.getState() as unknown as RFStoreLike;
      // 1) Quali nodi non sono misurati?
      const unmeasured = new Set<string>();
      state.nodeLookup.forEach((n, id) => {
        const m = n.measured;
        if (!m || !m.width || !m.height) unmeasured.add(id);
      });
      if (unmeasured.size === 0) return;
      // 2) Per ognuno, se è nel DOM, forza la misurazione
      const updates = new Map<string, NodeInternalsUpdate>();
      document.querySelectorAll<HTMLElement>(".react-flow__node").forEach((el) => {
        const id = el.getAttribute("data-id");
        if (id && unmeasured.has(id)) updates.set(id, { id, nodeElement: el, force: true });
      });
      if (updates.size > 0) {
        state.updateNodeInternals(updates);
        diag.runs += 1;
        diag.lastSize = updates.size;
      }
    };

    const schedule = () => {
      if (stopped) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measureUnmeasured);
    };

    // (a) reagisci a OGNI cambiamento dello store (load async, auto-layout, ecc.)
    const unsub = store.subscribe(schedule);
    // (b) rete di sicurezza a tempo: copre il caso in cui il ResizeObserver non
    //     scatti affatto e non ci siano altri cambiamenti di store nei primi secondi.
    const timers = [0, 60, 150, 300, 500, 800, 1200, 1800, 2500].map((d) =>
      window.setTimeout(measureUnmeasured, d),
    );

    return () => {
      stopped = true;
      unsub();
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [store]);

  return null;
}

export default NodeMeasureFix;
