import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  TASK_STATUS_TONE_CLASSES,
  type TaskStatusDefinition,
  getTaskStatusDefinition,
} from "@/lib/taskStatuses";

interface TaskStatusBadgeProps {
  status: string | null | undefined;
  statuses?: TaskStatusDefinition[];
  className?: string;
  compact?: boolean;
}

export function TaskStatusBadge({ status, statuses, className, compact = false }: TaskStatusBadgeProps) {
  const definition = getTaskStatusDefinition(status, statuses);
  const tone = TASK_STATUS_TONE_CLASSES[definition.tone] || TASK_STATUS_TONE_CLASSES.slate;

  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium",
        tone.badge,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {compact ? (definition.shortLabel || definition.label) : definition.label}
    </Badge>
  );
}
