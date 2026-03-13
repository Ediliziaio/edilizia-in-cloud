import type { InternalAutomationNode, InternalAutomationConnection } from "@/types/internalAutomationBuilder";
import { SharedAutomationCanvas } from "@/components/shared/automation/SharedAutomationCanvas";
import { SharedConnectionLine } from "@/components/shared/automation/SharedConnectionLine";
import { InternalAutomationNodeComponent, isBranchingNode, getNodeBranches } from "./InternalAutomationNode";

const INTERNAL_LABEL_MAP: Record<string, string> = {
  true: "Sì",
  false: "No",
};

interface Props {
  nodes: InternalAutomationNode[];
  connections: InternalAutomationConnection[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (id: string) => void;
  onAddAfterNode: (id: string, branch?: string) => void;
  onUpdateNode: (id: string, updates: Partial<InternalAutomationNode>) => void;
  onOpenTriggerPicker: () => void;
  onOpenActionPicker: () => void;
}

export function InternalAutomationCanvas({
  nodes, connections, selectedNodeId,
  onSelectNode, onDeleteNode, onDuplicateNode, onAddAfterNode, onUpdateNode,
  onOpenTriggerPicker, onOpenActionPicker,
}: Props) {
  return (
    <SharedAutomationCanvas
      nodes={nodes}
      selectedNodeId={selectedNodeId}
      onSelectNode={onSelectNode}
      onUpdateNode={onUpdateNode}
      onOpenTriggerPicker={onOpenTriggerPicker}
      onOpenActionPicker={onOpenActionPicker}
      renderConnections={(displayNodes) =>
        connections.map(conn => (
          <SharedConnectionLine
            key={conn.id}
            connection={conn}
            nodes={displayNodes}
            isBranchingNode={isBranchingNode}
            getNodeBranches={getNodeBranches}
            labelMap={INTERNAL_LABEL_MAP}
          />
        ))
      }
      renderNode={(displayNode, { isSelected, onDragStart }) => (
        <InternalAutomationNodeComponent
          key={displayNode.id}
          node={displayNode}
          isSelected={isSelected}
          onSelect={onSelectNode}
          onDelete={onDeleteNode}
          onDuplicate={onDuplicateNode}
          onAddAfter={onAddAfterNode}
          onDragStart={onDragStart}
        />
      )}
    />
  );
}
