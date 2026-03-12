import type { OrgTreeNode } from "@/types/hr";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

interface Props {
  node: OrgTreeNode;
  isRoot?: boolean;
  onClick: (node: OrgTreeNode) => void;
}

const REPARTO_COLORS: Record<string, string> = {
  Direzione: "border-slate-500",
  Tecnico: "border-blue-500",
  Cantiere: "border-amber-500",
  Commerciale: "border-green-500",
  Amministrazione: "border-purple-500",
};

function getRepartoBorder(reparto: string | null) {
  if (!reparto) return "border-border";
  return REPARTO_COLORS[reparto] || "border-sky-500";
}

export function OrgNode({ node, isRoot, onClick }: Props) {
  const borderClass = isRoot
    ? "border-primary border-2 shadow-md"
    : `border-l-4 ${getRepartoBorder(node.reparto)} shadow-sm`;

  return (
    <button
      onClick={() => onClick(node)}
      className={`
        bg-card rounded-lg p-3 min-w-[180px] max-w-[220px]
        ${borderClass}
        hover:shadow-md transition-shadow text-left
        ${!node.attivo ? "opacity-50 grayscale" : ""}
      `}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ backgroundColor: node.colore_avatar || "#0EA5E9" }}
        >
          {node.nome?.[0]}{node.cognome?.[0]}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            {node.nome} {node.cognome}
          </p>
          {node.mansione && (
            <p className="text-xs text-muted-foreground truncate">{node.mansione}</p>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {node.reparto && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {node.reparto}
          </Badge>
        )}
        {node.children.length > 0 && (
          <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
            <Users className="h-3 w-3" />
            {node.children.length}
          </span>
        )}
      </div>
    </button>
  );
}
