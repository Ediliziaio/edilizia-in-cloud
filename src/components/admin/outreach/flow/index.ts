// Mappa nodeTypes per React Flow, isolata dai componenti (come
// src/components/flow-builder/nodes/index.ts) per non rompere il fast-refresh.
import { EmailNode, WaitNode, ConditionNode, EndNode } from "./nodes";

export const outreachNodeTypes = {
  email: EmailNode,
  wait: WaitNode,
  condition: ConditionNode,
  end: EndNode,
};
