// Mappa nodeTypes/edgeTypes per React Flow, isolata dai componenti (come
// src/components/flow-builder/nodes/index.ts) per non rompere il fast-refresh.
import { EmailNode, WaitNode, ConditionNode, EndNode } from "./nodes";
import { OutreachAddEdge } from "./OutreachAddEdge";

export const outreachNodeTypes = {
  email: EmailNode,
  wait: WaitNode,
  condition: ConditionNode,
  end: EndNode,
};

export const outreachEdgeTypes = {
  addStep: OutreachAddEdge,
};
