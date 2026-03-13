import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export function TaskQuickAdd() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");

  const createMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!companyId || !user) throw new Error("Missing context");
      const { error } = await supabase.from("tasks").insert({
        company_id: companyId,
        title: title.trim(),
        status: "da_fare",
        priority: "normale",
        category: "generale",
        created_by: user.id,
        assigned_to: user.id,
      } as any);
      if (error) throw error;
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
    <div className="relative">
      <Plus className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
        placeholder="Aggiungi attività rapida... (Enter per creare)"
        className="pl-9 h-10"
        disabled={createMutation.isPending}
        maxLength={200}
      />
    </div>
  );
}
