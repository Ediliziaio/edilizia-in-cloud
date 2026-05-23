export type TaskStatusStage = "todo" | "active" | "review" | "done";
export type TaskStatusTone = "slate" | "blue" | "amber" | "emerald" | "violet" | "rose";

export interface TaskStatusDefinition {
  value: string;
  label: string;
  shortLabel?: string;
  description?: string;
  stage: TaskStatusStage;
  tone: TaskStatusTone;
  order: number;
  locked?: boolean;
}

export const TASK_STATUS_STORAGE_EVENT = "edilizia-task-statuses-updated";

export const TASK_STATUS_TONE_CLASSES: Record<TaskStatusTone, {
  badge: string;
  dot: string;
  column: string;
  panel: string;
  text: string;
  chart: string;
}> = {
  slate: {
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    dot: "bg-slate-400",
    column: "border-t-slate-300",
    panel: "bg-slate-50/70",
    text: "text-slate-700",
    chart: "#64748b",
  },
  blue: {
    badge: "border-blue-200 bg-blue-50 text-blue-700",
    dot: "bg-blue-500",
    column: "border-t-blue-500",
    panel: "bg-blue-50/70",
    text: "text-blue-700",
    chart: "#3b82f6",
  },
  amber: {
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
    column: "border-t-amber-500",
    panel: "bg-amber-50/70",
    text: "text-amber-800",
    chart: "#f59e0b",
  },
  emerald: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
    column: "border-t-emerald-500",
    panel: "bg-emerald-50/70",
    text: "text-emerald-700",
    chart: "#10b981",
  },
  violet: {
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
    column: "border-t-violet-500",
    panel: "bg-violet-50/70",
    text: "text-violet-700",
    chart: "#8b5cf6",
  },
  rose: {
    badge: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
    column: "border-t-rose-500",
    panel: "bg-rose-50/70",
    text: "text-rose-700",
    chart: "#f43f5e",
  },
};

export const DEFAULT_TASK_STATUS_DEFINITIONS: TaskStatusDefinition[] = [
  {
    value: "da_fare",
    label: "Da fare",
    shortLabel: "Da fare",
    description: "Attivita ancora da iniziare.",
    stage: "todo",
    tone: "slate",
    order: 10,
    locked: true,
  },
  {
    value: "in_corso",
    label: "In corso",
    shortLabel: "In corso",
    description: "Attivita presa in carico.",
    stage: "active",
    tone: "blue",
    order: 20,
    locked: true,
  },
  {
    value: "in_revisione",
    label: "In revisione",
    shortLabel: "Revisione",
    description: "Pronta per il controllo del responsabile prima della chiusura.",
    stage: "review",
    tone: "amber",
    order: 30,
    locked: true,
  },
  {
    value: "completata",
    label: "Fatta",
    shortLabel: "Fatto",
    description: "Attivita chiusa.",
    stage: "done",
    tone: "emerald",
    order: 40,
    locked: true,
  },
];

const DEFAULT_STATUS_VALUES = new Set(DEFAULT_TASK_STATUS_DEFINITIONS.map((status) => status.value));

function storageKey(companyId?: string | null) {
  return `edilizia.task-statuses.${companyId || "global"}`;
}

export function slugifyTaskStatus(label: string) {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function makeTaskStatusValue(label: string, existingValues: string[]) {
  const base = slugifyTaskStatus(label) || "stato";
  let value = `custom_${base}`;
  let index = 2;
  while (existingValues.includes(value) || DEFAULT_STATUS_VALUES.has(value)) {
    value = `custom_${base}_${index}`;
    index += 1;
  }
  return value;
}

export function humanizeTaskStatus(value: string) {
  return value
    .replace(/^custom_/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || value;
}

export function normalizeTaskStatusDefinition(
  status: Partial<TaskStatusDefinition> & { value: string; label?: string },
  index = 0,
): TaskStatusDefinition {
  const fallback = DEFAULT_TASK_STATUS_DEFINITIONS.find((item) => item.value === status.value);
  const stage = status.stage || fallback?.stage || (status.value === "completata" ? "done" : "active");
  return {
    value: status.value,
    label: status.label?.trim() || fallback?.label || humanizeTaskStatus(status.value),
    shortLabel: status.shortLabel?.trim() || status.label?.trim() || fallback?.shortLabel || fallback?.label || humanizeTaskStatus(status.value),
    description: status.description ?? fallback?.description,
    stage,
    tone: status.tone || fallback?.tone || toneForStage(stage),
    order: Number.isFinite(status.order) ? Number(status.order) : fallback?.order ?? 1000 + index,
    locked: fallback?.locked || status.locked,
  };
}

export function toneForStage(stage: TaskStatusStage): TaskStatusTone {
  if (stage === "todo") return "slate";
  if (stage === "review") return "amber";
  if (stage === "done") return "emerald";
  return "blue";
}

export function loadStoredTaskStatuses(companyId?: string | null): TaskStatusDefinition[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((status) => status && typeof status.value === "string")
      .map((status, index) => normalizeTaskStatusDefinition(status, index));
  } catch {
    return [];
  }
}

export function saveStoredTaskStatuses(companyId: string | null | undefined, statuses: TaskStatusDefinition[]) {
  if (typeof window === "undefined") return;
  const normalized = statuses
    .filter((status) => status.value && status.label)
    .map((status, index) => normalizeTaskStatusDefinition({ ...status, order: (index + 1) * 10 }, index));

  window.localStorage.setItem(storageKey(companyId), JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(TASK_STATUS_STORAGE_EVENT, { detail: { companyId } }));
}

export function resetStoredTaskStatuses(companyId?: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(companyId));
  window.dispatchEvent(new CustomEvent(TASK_STATUS_STORAGE_EVENT, { detail: { companyId } }));
}

export function mergeTaskStatusDefinitions({
  customStatuses = [],
  observedStatuses = [],
}: {
  customStatuses?: TaskStatusDefinition[];
  observedStatuses?: string[];
} = {}) {
  const map = new Map<string, TaskStatusDefinition>();
  DEFAULT_TASK_STATUS_DEFINITIONS.forEach((status) => map.set(status.value, status));

  customStatuses.forEach((status, index) => {
    if (!status.value) return;
    const current = map.get(status.value);
    map.set(status.value, normalizeTaskStatusDefinition({ ...current, ...status }, index));
  });

  observedStatuses.filter(Boolean).forEach((value, index) => {
    if (!map.has(value)) {
      map.set(value, normalizeTaskStatusDefinition({ value, order: 1000 + index }, index));
    }
  });

  return Array.from(map.values()).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function getTaskStatusDefinition(status: string | null | undefined, statuses = DEFAULT_TASK_STATUS_DEFINITIONS) {
  if (!status) return DEFAULT_TASK_STATUS_DEFINITIONS[0];
  return statuses.find((item) => item.value === status) || normalizeTaskStatusDefinition({ value: status });
}

export function getTaskStatusLabel(status: string | null | undefined, statuses = DEFAULT_TASK_STATUS_DEFINITIONS) {
  return getTaskStatusDefinition(status, statuses).label;
}

export function isTaskDoneStatus(status: string | null | undefined, statuses = DEFAULT_TASK_STATUS_DEFINITIONS) {
  return getTaskStatusDefinition(status, statuses).stage === "done";
}

export function isTaskReviewStatus(status: string | null | undefined, statuses = DEFAULT_TASK_STATUS_DEFINITIONS) {
  return getTaskStatusDefinition(status, statuses).stage === "review";
}

export function buildTaskStatusUpdate(status: string, statuses = DEFAULT_TASK_STATUS_DEFINITIONS) {
  return {
    status,
    completed_at: isTaskDoneStatus(status, statuses) ? new Date().toISOString() : null,
  };
}

export function getNextTaskStatusForQuickAction(currentStatus: string | null | undefined, statuses = DEFAULT_TASK_STATUS_DEFINITIONS) {
  const current = getTaskStatusDefinition(currentStatus, statuses);
  const todo = statuses.find((status) => status.stage === "todo") || DEFAULT_TASK_STATUS_DEFINITIONS[0];
  const review = statuses.find((status) => status.stage === "review");
  const done = statuses.find((status) => status.stage === "done") || DEFAULT_TASK_STATUS_DEFINITIONS[3];

  if (current.stage === "done") return todo;
  if (current.stage === "review") return done;
  return review || done;
}

export function getTaskStatusEventType(beforeStatus: string | null | undefined, afterStatus: string, statuses = DEFAULT_TASK_STATUS_DEFINITIONS) {
  if (isTaskDoneStatus(afterStatus, statuses)) return "task_completed";
  if (isTaskDoneStatus(beforeStatus, statuses) && !isTaskDoneStatus(afterStatus, statuses)) return "task_reopened";
  if (isTaskReviewStatus(afterStatus, statuses)) return "task_review_requested";
  return "task_status_changed";
}

export function getTaskStatusTransitionDescription(beforeStatus: string | null | undefined, afterStatus: string, statuses = DEFAULT_TASK_STATUS_DEFINITIONS) {
  const before = getTaskStatusDefinition(beforeStatus, statuses);
  const after = getTaskStatusDefinition(afterStatus, statuses);
  if (after.stage === "done") return "ha chiuso l'attivita";
  if (before.stage === "done" && after.stage !== "done") return "ha riaperto l'attivita";
  if (after.stage === "review") return "ha mandato l'attivita in revisione";
  return `ha spostato l'attivita da ${before.label} a ${after.label}`;
}
