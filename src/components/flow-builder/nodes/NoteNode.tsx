import { memo } from "react";
import { type NodeProps } from "@xyflow/react";
import { NODE_KIND_STYLES } from "@/lib/flow-node-catalog";
import { StickyNote } from "lucide-react";

function NoteNodeComponent({ data, selected }: NodeProps) {
  const style = NODE_KIND_STYLES.note;

  return (
    <div
      className={`min-w-[160px] max-w-[240px] rounded-lg border-2 border-dashed px-3 py-2 shadow-sm ${style.bg} ${style.border} ${selected ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <StickyNote className={`h-3.5 w-3.5 ${style.accent}`} />
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Nota</span>
      </div>
      <p className="text-xs whitespace-pre-wrap">
        {(data.note_text as string) || (data.label as string) || "Nota vuota"}
      </p>
    </div>
  );
}

export const NoteNode = memo(NoteNodeComponent);
