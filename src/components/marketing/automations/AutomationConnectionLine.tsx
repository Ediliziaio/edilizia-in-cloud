import { memo } from "react";
import type { AutomationNode, AutomationConnection } from "@/types/automationBuilder";

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

  const x1 = fromNode.position_x + NODE_WIDTH / 2;
  const y1 = fromNode.position_y + NODE_HEIGHT;
  const x2 = toNode.position_x + NODE_WIDTH / 2;
  const y2 = toNode.position_y;

  const midY = (y1 + y2) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

  return (
    <g>
      <path d={d} fill="none" stroke="hsl(var(--border))" strokeWidth={2} />
      {connection.label && (
        <text
          x={(x1 + x2) / 2}
          y={midY - 6}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px]"
        >
          {connection.label}
        </text>
      )}
    </g>
  );
});
