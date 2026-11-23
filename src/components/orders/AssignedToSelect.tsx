import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
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
  const t = useT();
  const { effectiveCompany } = useAuth();

  // FIX: usa useCompanyStaffUsers che esclude customer/referrer/platform_*
  // (prima i clienti con record orfani in staff_permissions apparivano qui)
  const { data: staffUsers = [] } = useCompanyStaffUsers(effectiveCompany?.id);
  const users = useMemo(
    () =>
      staffUsers.map((p) => ({
        id: p.id,
        name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      })),
    [staffUsers]
  );

  return (
    <div className="space-y-2">
      <Label>{t("Assegnato a")}</Label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder={t("Nessuna assegnazione")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("Nessuna assegnazione")}</SelectItem>
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
