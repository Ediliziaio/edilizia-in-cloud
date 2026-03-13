import { TriggerNode } from "./TriggerNode";
import { ActionNode } from "./ActionNode";
import { ConditionNode } from "./ConditionNode";
import { NoteNode } from "./NoteNode";

export const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: ActionNode, // reuse ActionNode with different styling via data.nodeType
  goal: ActionNode,
  split: ActionNode,
  note: NoteNode,
};
