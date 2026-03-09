import { memo } from "react";
import type { InternalAutomationNode, InternalAutomationConnection } from "@/types/internalAutomationBuilder";
import { isBranchingNode, getNodeBranches } from "./InternalAutomationNode";

const NODE_WIDTH = 224; // w-56
const NODE_HEIGHT = 64;

interface Props {
  connection: InternalAutomationConnection;
  nodes: InternalAutomationNode[];
}

export const InternalConnectionLine = memo(function InternalConnectionLine({ connection, nodes }: Props) {
  const fromNode = nodes.find(n => n.id === connection.from_node_id);
  const toNode = nodes.find(n => n.id === connection.to_node_id);
  if (!fromNode || !toNode) return null;

  let x1 = fromNode.position_x + NODE_WIDTH / 2;
  const y1 = fromNode.position_y + NODE_HEIGHT;

  if (isBranchingNode(fromNode.node_type) && connection.label) {
    const branches = getNodeBranches(fromNode.node_type);
    const branch = branches.find(b => b.key === connection.label);
    if (branch) {
      x1 = fromNode.position_x + (branch.side === "left" ? NODE_WIDTH * 0.25 : NODE_WIDTH * 0.75);
    }
  }

  const x2 = toNode.position_x + NODE_WIDTH / 2;
  const y2 = toNode.position_y;

  const midY = (y1 + y2) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

  let strokeColor = "hsl(var(--border))";
  if (connection.label === "true") {
    strokeColor = "hsl(142, 71%, 45%)";
  } else if (connection.label === "false") {
    strokeColor = "hsl(0, 84%, 60%)";
  }

  const displayLabel = getDisplayLabel(connection.label);

  return (
    <g>
      <path d={d} fill="none" stroke={strokeColor} strokeWidth={2} />
      {displayLabel && (
        <text
          x={(x1 + x2) / 2}
          y={midY - 6}
          textAnchor="middle"
          className="text-[10px] font-semibold"
          fill={strokeColor}
        >
          {displayLabel}
        </text>
      )}
    </g>
  );
});

function getDisplayLabel(label: string | null): string | null {
  if (!label) return null;
  const map: Record<string, string> = { true: "Sì", false: "No" };
  return map[label] || label;
}
