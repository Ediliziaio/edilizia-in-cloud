import { memo } from "react";
import type { AutomationNode, AutomationConnection } from "@/types/automationBuilder";
import { isBranchingNode, getNodeBranches } from "./AutomationNode";

const NODE_WIDTH = 224; // w-56 = 14rem = 224px
const NODE_HEIGHT = 64;

interface Props {
  connection: AutomationConnection;
  nodes: AutomationNode[];
}

export const AutomationConnectionLine = memo(function AutomationConnectionLine({ connection, nodes }: Props) {
  const fromNode = nodes.find(n => n.id === connection.from_node_id);
  const toNode = nodes.find(n => n.id === connection.to_node_id);
  if (!fromNode || !toNode) return null;

  // Determine output position based on branch label for branching nodes
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

  // Determine line color for branches
  let strokeColor = "hsl(var(--border))";
  if (connection.label === "yes" || connection.label === "a") {
    strokeColor = "hsl(142, 71%, 45%)"; // green
  } else if (connection.label === "no" || connection.label === "b") {
    strokeColor = "hsl(0, 84%, 60%)"; // red
  }

  // Get display label
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
  const map: Record<string, string> = {
    yes: "Sì",
    no: "No",
    a: "Ramo A",
    b: "Ramo B",
  };
  return map[label] || label;
}
