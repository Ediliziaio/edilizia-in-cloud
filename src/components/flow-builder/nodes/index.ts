import { TriggerNode } from "./TriggerNode";
import { ActionNode } from "./ActionNode";
import { ConditionNode } from "./ConditionNode";
import { DelayNode } from "./DelayNode";
import { EndNode } from "./EndNode";
import { NoteNode } from "./NoteNode";
import { GoalNode } from "./GoalNode";
import { SplitNode } from "./SplitNode";
import { AddStepEdge } from "./AddStepEdge";

export const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode,
  goal: GoalNode,
  split: SplitNode,
  note: NoteNode,
  end: EndNode,
};

export const edgeTypes = {
  addStep: AddStepEdge,
};
