import { memo } from "react";

const NODE_WIDTH = 224; // w-56
const NODE_HEIGHT = 64;

/** Minimal node shape needed by the connection line */
export interface ConnectionNode {
  id: string;
  node_type: string;
  position_x: number;
  position_y: number;
}

export interface ConnectionData {
  id: string;
  from_node_id: string;
  to_node_id: string;
  label: string | null;
}

export interface BranchDef {
  key: string;
  label: string;
  side: "left" | "right";
}

interface Props {
  connection: ConnectionData;
  nodes: ConnectionNode[];
  /** Returns branch definitions for branching node types */
  getNodeBranches: (nodeType: string) => BranchDef[];
  /** Returns true if the node type has multiple output branches */
  isBranchingNode: (nodeType: string) => boolean;
  /** Maps connection labels to display strings */
  labelMap?: Record<string, string>;
}

export const SharedConnectionLine = memo(function SharedConnectionLine({
  connection, nodes, getNodeBranches, isBranchingNode, labelMap,
}: Props) {
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

  // Determine line color — green for "positive" branch, red for "negative"
  let strokeColor = "hsl(var(--border))";
  const label = connection.label;
  if (label === "true" || label === "yes" || label === "a") {
    strokeColor = "hsl(142, 71%, 45%)";
  } else if (label === "false" || label === "no" || label === "b") {
    strokeColor = "hsl(0, 84%, 60%)";
  }

  const displayLabel = label && labelMap ? (labelMap[label] || label) : null;

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
