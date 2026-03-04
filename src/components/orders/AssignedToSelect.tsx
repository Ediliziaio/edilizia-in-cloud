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
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", effectiveCompany!.id);

      if (error) throw error;

      // Get roles
      const userIds = profiles.map((p) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      // Only include admin and staff
      const validUserIds = roles
        ?.filter((r) => ["company_admin", "company_staff", "salesperson", "call_center"].includes(r.role))
        .map((r) => r.user_id) || [];

      return profiles
        .filter((p) => validUserIds.includes(p.id))
        .map((p) => ({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`,
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
