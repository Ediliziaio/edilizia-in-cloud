import { TriggerNode } from "./TriggerNode";
import { ActionNode } from "./ActionNode";
import { ConditionNode } from "./ConditionNode";
import { DelayNode } from "./DelayNode";
import { EndNode } from "./EndNode";
import { NoteNode } from "./NoteNode";
import { AddStepEdge } from "./AddStepEdge";

export const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode,
  goal: ActionNode,
  split: ActionNode,
  note: NoteNode,
  end: EndNode,
};

export const edgeTypes = {
  addStep: AddStepEdge,
};
