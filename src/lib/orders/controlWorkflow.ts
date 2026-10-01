export const ORDER_CONTROL_TASK_PREFIX = "Controllo commessa · ";

export type OrderControlKey = "revenue" | "costs" | "dates" | "vehicles" | "mileage";

export interface OrderControlCheck {
  key: OrderControlKey;
  label: string;
  taskLabel: string;
  done: boolean;
  priority: "normale" | "alta";
  fixTo: string;
}

export interface OrderControlTask {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
}

export type OrderControlState = "automatic" | "scheduled" | "verified" | "missing";

export interface ResolvedOrderControl extends OrderControlCheck {
  taskTitle: string;
  task: OrderControlTask | null;
  state: OrderControlState;
  resolved: boolean;
}

export function orderControlTaskTitle(check: Pick<OrderControlCheck, "taskLabel">): string {
  return `${ORDER_CONTROL_TASK_PREFIX}${check.taskLabel}`;
}

export function resolveOrderControls(
  checks: OrderControlCheck[],
  tasks: OrderControlTask[],
): ResolvedOrderControl[] {
  const taskByTitle = new Map(tasks.map((task) => [task.title.trim().toLowerCase(), task]));

  return checks.map((check) => {
    const taskTitle = orderControlTaskTitle(check);
    const task = taskByTitle.get(taskTitle.toLowerCase()) ?? null;
    const taskCompleted = task?.status === "completata";
    const state: OrderControlState = check.done
      ? "automatic"
      : taskCompleted
        ? "verified"
        : task
          ? "scheduled"
          : "missing";

    return {
      ...check,
      taskTitle,
      task,
      state,
      resolved: state === "automatic" || state === "verified",
    };
  });
}

export function orderControlsToCreate(controls: ResolvedOrderControl[]): ResolvedOrderControl[] {
  return controls.filter((control) => !control.resolved && !control.task);
}

export function orderControlTasksToAutoComplete(controls: ResolvedOrderControl[]): string[] {
  return controls
    .filter((control) => control.done && control.task && control.task.status !== "completata")
    .map((control) => control.task!.id);
}
