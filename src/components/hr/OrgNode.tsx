import type { OrgTreeNode } from "@/types/hr";
import { MapPin } from "lucide-react";

export function OrgNode({
  node,
  isRoot,
  onClick,
  siteName,
}: {
  node: OrgTreeNode;
  isRoot?: boolean;
  onClick: (node: OrgTreeNode) => void;
  siteName?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(node)}
      title={`${node.nome} ${node.cognome} · ${node.mansione || "Ruolo da definire"}`}
      className={`h-full w-full rounded-xl border bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 ${isRoot ? "border-blue-300 border-t-[3px]" : "border-slate-200"}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
          {node.nome?.[0]}
          {node.cognome?.[0]}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {node.nome} {node.cognome}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {node.mansione || "Ruolo da definire"}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
          {node.reparto || "Reparto da definire"}
        </span>
      </div>
      <p className="mt-1 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
        <MapPin className="h-3 w-3 shrink-0" />
        {siteName || (node.sede_id ? "Sede assegnata" : "Sede da assegnare")}
      </p>
    </button>
  );
}
