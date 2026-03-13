import type { AutomationNode, AutomationConnection } from "@/types/automationBuilder";
import { SharedAutomationCanvas } from "@/components/shared/automation/SharedAutomationCanvas";
import { SharedConnectionLine } from "@/components/shared/automation/SharedConnectionLine";
import { AutomationNodeComponent, isBranchingNode, getNodeBranches } from "./AutomationNode";

const MARKETING_LABEL_MAP: Record<string, string> = {
  yes: "Sì",
  no: "No",
  a: "Ramo A",
  b: "Ramo B",
};

interface Props {
  nodes: AutomationNode[];
  connections: AutomationConnection[];
  selectedNodeId: string | null;
  nodeExecutionCounts?: Record<string, number>;
  onSelectNode: (id: string | null) => void;
  onDeleteNode: (id: string) => void;
  onDuplicateNode: (id: string) => void;
  onAddAfterNode: (id: string, branch?: string) => void;
  onUpdateNode: (id: string, updates: Partial<AutomationNode>) => void;
  onOpenTriggerPicker: () => void;
  onOpenActionPicker: () => void;
}

export function AutomationCanvas({
  nodes, connections, selectedNodeId, nodeExecutionCounts,
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
      showSettingsButton
      renderConnections={(displayNodes) =>
        connections.map(conn => (
          <SharedConnectionLine
            key={conn.id}
            connection={conn}
            nodes={displayNodes}
            isBranchingNode={isBranchingNode}
            getNodeBranches={getNodeBranches}
            labelMap={MARKETING_LABEL_MAP}
          />
        ))
      }
      renderNode={(displayNode, { isSelected, onDragStart }) => (
        <AutomationNodeComponent
          key={displayNode.id}
          node={displayNode}
          isSelected={isSelected}
          executionCount={nodeExecutionCounts?.[displayNode.id]}
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
