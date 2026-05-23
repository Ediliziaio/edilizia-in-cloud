import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TASK_STATUS_STORAGE_EVENT,
  type TaskStatusDefinition,
  loadStoredTaskStatuses,
  mergeTaskStatusDefinitions,
  resetStoredTaskStatuses,
  saveStoredTaskStatuses,
} from "@/lib/taskStatuses";

export function useTaskStatuses(companyId?: string | null, observedStatuses: string[] = []) {
  const [customStatuses, setCustomStatuses] = useState<TaskStatusDefinition[]>(() => loadStoredTaskStatuses(companyId));

  const reload = useCallback(() => {
    setCustomStatuses(loadStoredTaskStatuses(companyId));
  }, [companyId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.includes("edilizia.task-statuses.")) reload();
    };
    const onLocalUpdate = () => reload();
    window.addEventListener("storage", onStorage);
    window.addEventListener(TASK_STATUS_STORAGE_EVENT, onLocalUpdate);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TASK_STATUS_STORAGE_EVENT, onLocalUpdate);
    };
  }, [reload]);

  const statuses = useMemo(
    () => mergeTaskStatusDefinitions({ customStatuses, observedStatuses }),
    [customStatuses, observedStatuses],
  );

  const saveStatuses = useCallback((nextStatuses: TaskStatusDefinition[]) => {
    saveStoredTaskStatuses(companyId, nextStatuses);
    setCustomStatuses(loadStoredTaskStatuses(companyId));
  }, [companyId]);

  const resetStatuses = useCallback(() => {
    resetStoredTaskStatuses(companyId);
    setCustomStatuses([]);
  }, [companyId]);

  return { statuses, customStatuses, saveStatuses, resetStatuses };
}
