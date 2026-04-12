import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AssignedToSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function AssignedToSelect({ value, onChange, disabled }: AssignedToSelectProps) {
  const { effectiveCompany } = useAuth();

  const { data: users = [] } = useQuery({
    queryKey: ["company-assignable-users", effectiveCompany?.id],
    queryFn: async () => {
      // Use staff_permissions (company-level RLS) instead of user_roles (user-level RLS)
      const { data: perms, error: permsErr } = await supabase
        .from("staff_permissions")
        .select("user_id")
        .eq("company_id", effectiveCompany!.id);
      if (permsErr) throw permsErr;
      const validIds = (perms || []).map((p) => p.user_id);
      if (!validIds.length) return [];

      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", validIds);
      if (error) throw error;

      return (profiles || [])
        .filter((p) => p.first_name || p.last_name)
        .map((p) => ({
          id: p.id,
          name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        }));
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-2">
      <Label>Assegnato a</Label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Nessuna assegnazione" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Nessuna assegnazione</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
