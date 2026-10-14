import { useEffect, useRef } from "react";

/** Apre solo attività già lette con i permessi correnti, una volta per collegamento. */
export function useTaskLink<T extends { id: string }>(tasks: T[], requestedId: string | null, onOpen: (task: T) => void) {
  const handled = useRef<string | null>(null);
  const task = requestedId ? tasks.find(row => row.id === requestedId) : undefined;
  useEffect(() => {
    if (!requestedId) { handled.current = null; return; }
    if (!task || handled.current === requestedId) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      handled.current = requestedId;
      onOpen(task);
    });
    return () => { cancelled = true; };
  }, [task, requestedId, onOpen]);
  return task;
}
