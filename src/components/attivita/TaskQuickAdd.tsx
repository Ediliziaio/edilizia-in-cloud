import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { logTaskActivity } from "@/lib/taskActivityLog";

interface TaskQuickAddProps {
  defaultAssignedTo?: string | null;
  onAdvancedCreate?: () => void;
}

export function TaskQuickAdd({ defaultAssignedTo, onAdvancedCreate }: TaskQuickAddProps) {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const resolveAssignedTo = () => (
    defaultAssignedTo === null ? "none" : (defaultAssignedTo || user?.id || "none")
  );
  const [assignedTo, setAssignedTo] = useState(resolveAssignedTo);
  const { data: teamMembers = [] } = useCompanyStaffUsers(companyId);

  useEffect(() => {
    setAssignedTo(resolveAssignedTo());
  }, [defaultAssignedTo, user?.id]);

  const assignableUsers = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    if (user?.id) map.set(user.id, { id: user.id, name: "Me stesso" });
    teamMembers.forEach((member) => {
      map.set(member.id, {
        id: member.id,
        name: `${member.first_name} ${member.last_name}`.trim() || "Utente",
      });
    });
    return Array.from(map.values());
  }, [teamMembers, user?.id]);

  const createMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!companyId || !user) throw new Error("Missing context");
      const payload = {
        company_id: companyId,
        title: title.trim(),
        status: "da_fare",
        priority: "normale",
        category: "generale",
        created_by: user.id,
        assigned_to: assignedTo === "none" ? null : assignedTo,
      };
      const { data: createdTask, error } = await supabase
        .from("tasks")
        .insert(payload as any)
        .select("id, title")
        .single();
      if (error) throw error;
      await logTaskActivity({
        companyId,
        userId: user.id,
        taskId: createdTask?.id,
        taskTitle: createdTask?.title || title.trim(),
        eventType: "task_created",
        description: "ha creato l'attività con aggiunta rapida",
        afterSnapshot: payload,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: ["my-task-count"] });
      setValue("");
      toast.success("Attività creata");
    },
    onError: (e: any) => toast.error("Errore", { description: e.message }),
  });

  const handleSubmit = () => {
    if (!value.trim()) return;
    createMutation.mutate(value);
  };

  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Plus className="h-4 w-4 text-primary" />
          Aggiunta rapida
        </div>
        {onAdvancedCreate && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onAdvancedCreate}>
            Apri scheda completa
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="relative min-w-[220px] flex-1">
          <Plus className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="Scrivi il titolo e premi Invio..."
            className="h-10 pl-9"
            disabled={createMutation.isPending}
            maxLength={200}
          />
        </div>
        <Select value={assignedTo} onValueChange={setAssignedTo}>
          <SelectTrigger className="h-10 w-full lg:w-[210px]">
            <UserPlus className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Assegna a" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Da assegnare</SelectItem>
            {assignableUsers.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="h-10 gap-2 lg:w-[120px]" onClick={handleSubmit} disabled={!value.trim() || createMutation.isPending}>
          <Plus className="h-4 w-4" />
          Aggiungi
        </Button>
      </div>
    </div>
  );
}
