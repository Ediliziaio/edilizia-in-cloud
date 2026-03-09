import { memo } from "react";
import type { InternalAutomationNode } from "@/types/internalAutomationBuilder";
import { findTriggerLabel, findActionLabel, INTERNAL_NODE_TYPE_LABELS } from "@/types/internalAutomationBuilder";
import {
  Zap, Settings, MessageSquare, GitBranch, Globe, CheckSquare, RefreshCw,
  Headphones, CalendarDays, Bell, Mail, Clock, Plus, Trash2, Copy,
  ClipboardList, Receipt, UserCheck, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACTION_ICONS: Record<string, typeof Zap> = {
  create_task: CheckSquare, update_order_status: RefreshCw, create_ticket: Headphones,
  create_calendar_event: CalendarDays, assign_employee: UserCheck, add_cost_record: Receipt,
  send_notification: Bell, send_email: Mail,
  if_condition: GitBranch, wait_delay: Clock,
  webhook: Globe,
};

const TRIGGER_ICONS: Record<string, typeof Zap> = {
  order_created: ClipboardList, order_updated: ClipboardList, order_status_changed: RefreshCw,
  order_overdue: AlertTriangle, order_completed: CheckSquare,
  ticket_created: Headphones, ticket_updated: Headphones, ticket_status_changed: RefreshCw,
  ticket_assigned: UserCheck,
  task_created: CheckSquare, task_completed: CheckSquare, task_updated: CheckSquare,
  task_overdue: AlertTriangle,
  stock_below_minimum: AlertTriangle, stock_updated: RefreshCw,
  cost_created: Receipt, cost_due: CalendarDays,
  appointment_created: CalendarDays, appointment_updated: CalendarDays, appointment_reminder: Bell,
};

function getNodeIcon(node: InternalAutomationNode) {
  if (node.node_type === "trigger") return TRIGGER_ICONS[node.config_json?.trigger_type] || Zap;
  if (node.node_type === "condition") return GitBranch;
  if (node.node_type === "delay") return Clock;
  return ACTION_ICONS[node.config_json?.action_type] || Settings;
}

function getNodeLabel(node: InternalAutomationNode): string {
  const config = node.config_json || {};
  if (node.label) return node.label;
  if (node.node_type === "trigger") return findTriggerLabel(config.trigger_type || "");
  if (node.node_type === "action") return findActionLabel(config.action_type || "");
  if (node.node_type === "condition") return "Condizione";
  if (node.node_type === "delay") {
    const d = Number(config.delay_days || 0);
    const h = Number(config.delay_hours || 0);
    const m = Number(config.delay_minutes || 0);
    const parts: string[] = [];
    if (d) parts.push(`${d}g`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    return parts.length ? `Attendi ${parts.join(" ")}` : "Attesa";
  }
  return INTERNAL_NODE_TYPE_LABELS[node.node_type] || node.node_type;
}

const NODE_COLORS: Record<string, string> = {
  trigger: "border-emerald-500 bg-emerald-500/5",
  action: "border-blue-500 bg-blue-500/5",
  condition: "border-amber-500 bg-amber-500/5",
  delay: "border-violet-500 bg-violet-500/5",
};

/** Check if a node type supports multiple output branches */
export function isBranchingNode(nodeType: string): boolean {
  return nodeType === "condition";
}

/** Get branch definitions for a node type */
export function getNodeBranches(nodeType: string): { key: string; label: string; side: "left" | "right" }[] {
  if (nodeType === "condition") {
    return [
      { key: "true", label: "Sì", side: "left" },
      { key: "false", label: "No", side: "right" },
    ];
  }
  return [];
}

interface Props {
  node: InternalAutomationNode;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAddAfter: (id: string, branch?: string) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
}

export const InternalAutomationNodeComponent = memo(function InternalAutomationNodeComponent({
  node, isSelected, onSelect, onDelete, onDuplicate, onAddAfter, onDragStart,
}: Props) {
  const Icon = getNodeIcon(node);
  const colorClass = NODE_COLORS[node.node_type] || "border-border bg-card";
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
              {INTERNAL_NODE_TYPE_LABELS[node.node_type]}
            </span>
          </div>
          <p className="text-sm font-medium mt-1 truncate">{getNodeLabel(node)}</p>
        </div>

        {/* Hover actions */}
        <div className="absolute -right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={e => { e.stopPropagation(); onDuplicate(node.id); }} className="p-1 rounded bg-background border shadow-sm hover:bg-accent">
            <Copy className="h-3 w-3" />
          </button>
          {node.node_type !== "trigger" && (
            <button onClick={e => { e.stopPropagation(); onDelete(node.id); }} className="p-1 rounded bg-background border shadow-sm hover:bg-destructive/10">
              <Trash2 className="h-3 w-3 text-destructive" />
            </button>
          )}
        </div>
      </div>

      {branching ? (
        <>
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
