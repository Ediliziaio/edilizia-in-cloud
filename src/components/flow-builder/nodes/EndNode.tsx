import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Flag } from "lucide-react";

function EndNodeComponent({ selected }: NodeProps) {
  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-3 !h-3 !border-2 !border-background" />
      <div
        className={`flex items-center gap-1.5 rounded-full border-2 px-4 py-2 shadow-sm bg-muted border-border transition-all ${selected ? "ring-2 ring-primary ring-offset-1" : ""}`}
      >
        <Flag className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Fine</span>
      </div>
    </div>
  );
}

export const EndNode = memo(EndNodeComponent);
