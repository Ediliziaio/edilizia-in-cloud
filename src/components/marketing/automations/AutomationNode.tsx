import { memo } from "react";
import type { AutomationNode as NodeType } from "@/types/automationBuilder";
import { NODE_TYPE_COLORS, NODE_TYPE_LABELS } from "@/types/automationBuilder";
import {
  Zap, Mail, Clock, GitBranch, Target, Trash2, Copy, Plus, Bell, Tag,
  ArrowRightLeft, ListTodo, UserCheck, ExternalLink, StopCircle, MessageCircle,
  FileEdit, PlusCircle, Smartphone, Bot, Percent, CornerDownRight, Globe, RefreshCw,
  TrendingUp, UserMinus, Hourglass,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACTION_ICONS: Record<string, typeof Zap> = {
  send_email: Mail, send_whatsapp: MessageCircle, send_sms: Smartphone,
  send_notification: Bell, send_ai_message: Bot,
  create_opportunity: PlusCircle, move_opportunity: ArrowRightLeft, update_field: FileEdit,
  add_tag: Tag, remove_tag: Tag, assign_user: UserCheck, create_task: ListTodo,
  update_contact_score: TrendingUp, remove_from_automation: UserMinus,
  delay: Clock, if_else: GitBranch, end_automation: StopCircle,
  split_percentage: Percent, goal: Target, jump_to_step: CornerDownRight,
  webhook_out: ExternalLink, external_api: Globe, sync_google: RefreshCw, sync_meta_lead: RefreshCw,
  wait_for_event: Hourglass,
};

function getNodeIcon(node: NodeType) {
  if (node.node_type === "trigger") return Zap;
  if (node.node_type === "condition") return GitBranch;
  if (node.node_type === "delay") return Clock;
  if (node.node_type === "goal") return Target;
  if (node.node_type === "split") return Percent;
  const actionType = node.config_json?.action_type || node.config_json?.trigger_event;
  return ACTION_ICONS[actionType] || Zap;
}

function getNodeSummary(node: NodeType): string {
  const cfg = node.config_json;
  if (node.node_type === "delay") return `Attendi ${cfg?.delay_value || "?"} ${cfg?.delay_unit === "hours" ? "ore" : "giorni"}`;
  if (node.node_type === "condition") return "Se condizione...";
  if (node.node_type === "split") return `Split ${cfg?.split_a || 50}% / ${cfg?.split_b || 50}%`;
  return node.label || NODE_TYPE_LABELS[node.node_type] || "";
}

/** Check if a node type supports multiple output branches */
export function isBranchingNode(nodeType: string): boolean {
  return nodeType === "condition" || nodeType === "split";
}

/** Get branch definitions for a node type */
export function getNodeBranches(nodeType: string): { key: string; label: string; side: "left" | "right" }[] {
  if (nodeType === "condition") {
    return [
      { key: "yes", label: "Sì", side: "left" },
      { key: "no", label: "No", side: "right" },
    ];
  }
  if (nodeType === "split") {
    return [
      { key: "a", label: "A", side: "left" },
      { key: "b", label: "B", side: "right" },
    ];
  }
  return [];
}

interface Props {
  node: NodeType;
  isSelected: boolean;
  executionCount?: number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAddAfter: (id: string, branch?: string) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
}

export const AutomationNodeComponent = memo(function AutomationNodeComponent({
  node, isSelected, executionCount, onSelect, onDelete, onDuplicate, onAddAfter, onDragStart,
}: Props) {
  const Icon = getNodeIcon(node);
  const colorClass = NODE_TYPE_COLORS[node.node_type] || "border-border bg-card";
  const branching = isBranchingNode(node.node_type);
  const branches = getNodeBranches(node.node_type);

  return (
    <div
      className="absolute group"
      style={{ left: node.position_x, top: node.position_y, zIndex: isSelected ? 20 : 10 }}
      onMouseDown={e => { e.stopPropagation(); onDragStart(node.id, e); }}
    >
      {/* Input handle */}
      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-border border-2 border-background z-30" />

      <div
        onClick={e => { e.stopPropagation(); onSelect(node.id); }}
        className={cn(
          "w-56 rounded-lg border-2 shadow-sm cursor-pointer transition-all select-none",
          colorClass,
          isSelected && "ring-2 ring-primary ring-offset-2"
        )}
      >
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {NODE_TYPE_LABELS[node.node_type]}
            </span>
          </div>
          <p className="text-sm font-medium mt-1 truncate">{node.label || getNodeSummary(node)}</p>
        </div>

        {/* Hover actions */}
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={e => { e.stopPropagation(); onDuplicate(node.id); }} className="p-1 rounded bg-background border shadow-sm hover:bg-accent">
            <Copy className="h-3 w-3" />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(node.id); }} className="p-1 rounded bg-background border shadow-sm hover:bg-destructive/10">
            <Trash2 className="h-3 w-3 text-destructive" />
          </button>
        </div>
      </div>

      {branching ? (
        <>
          {/* Two output handles for branching nodes */}
          {branches.map((branch) => {
            const xOffset = branch.side === "left" ? "25%" : "75%";
            return (
              <div key={branch.key} className="absolute" style={{ bottom: -6, left: xOffset, transform: "translateX(-50%)" }}>
                <div className="w-3 h-3 rounded-full bg-border border-2 border-background z-30" />
                <span className={cn(
                  "absolute top-3.5 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase whitespace-nowrap",
                  branch.side === "left" ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
                )}>
                  {branch.label}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); onAddAfter(node.id, branch.key); }}
                  className="absolute top-7 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:scale-110"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </>
      ) : (
        <>
          {/* Single output handle */}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-border border-2 border-background z-30" />
          <button
            onClick={e => { e.stopPropagation(); onAddAfter(node.id); }}
            className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:scale-110"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
});
