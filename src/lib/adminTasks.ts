import { supabase } from "@/integrations/supabase/client";
import { normalizeAdminTaskStatus } from "@/lib/adminTaskState";
export interface AdminTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  assigned_to: string | null;
  company_id: string | null;
  completed_at: string | null;
  created_at: string;
  task_type: string | null;
}
export const adminTasksQueryKey = ["cs-tasks", "admin-overview-v2"] as const;
/** Paginazione stabile: dashboard e gestione completa leggono lo stesso insieme. */
export async function fetchAdminTasks(): Promise<AdminTask[]> {
  const tasks: AdminTask[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("cs_tasks" as never)
      .select("id, title, description, status, priority, due_date, assigned_to, company_id, completed_at, created_at, task_type")
      .order("due_date", { ascending: true, nullsFirst: false }).order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as AdminTask[];
    tasks.push(...page.map(task => ({ ...task, status: normalizeAdminTaskStatus(task.status) })));
    if (page.length < pageSize) return tasks;
  }
}
