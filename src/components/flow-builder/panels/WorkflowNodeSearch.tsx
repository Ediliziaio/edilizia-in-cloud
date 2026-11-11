import { useState } from "react";
import type { Node } from "@xyflow/react";
import { Input } from "@/components/ui/input";
import { getCatalogItem } from "@/lib/flow-node-catalog";

export function WorkflowNodeSearch({ nodes, onFocusNode }: { nodes: Node[]; onFocusNode: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it").trim();
  const query = normalize(search);
  const matches = nodes.filter(n => n.type !== "end" && !n.data?.isEmpty).filter(n => {
    const item = getCatalogItem(String(n.data?.itemId ?? ""));
    return normalize([n.data?.label, item?.label, item?.description, n.id].filter(Boolean).join(" ")).includes(query);
  });
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="p-3"><Input autoFocus aria-label="Cerca un passo nel flusso" placeholder="Nome, tipo o ID del passo…" value={search} onChange={e => setSearch(e.target.value)} />
      <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">{matches.length} passi trovati</p></div>
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      {matches.map(n => <button key={n.id} className="w-full rounded-lg border p-3 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary" onClick={() => onFocusNode(n.id)}>
        <span className="block text-sm font-medium break-words">{String(n.data?.label || getCatalogItem(String(n.data?.itemId ?? ""))?.label || "Nota")}</span>
        <span className="block text-xs text-muted-foreground">{getCatalogItem(String(n.data?.itemId ?? ""))?.label || (n.type === "note" ? "Nota sul canvas" : "Passo importato")}</span>
      </button>)}
      {!matches.length && <p className="p-3 text-xs text-muted-foreground">Nessun passo corrisponde alla ricerca.</p>}
    </div>
  </div>;
}
