import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { UserCheck } from "lucide-react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface Salesperson {
  id: string;
  first_name: string;
  last_name: string;
  commission_type: string;
  commission_value: number;
}

interface SalespersonSelectProps {
  value: string;
  onChange: (value: string, salesperson: Salesperson | null) => void;
  disabled?: boolean;
}

export const SalespersonSelect = React.forwardRef<HTMLDivElement, SalespersonSelectProps>(
  function SalespersonSelect({ value, onChange, disabled }, ref) {
    const { effectiveCompany } = useAuth();

    const { data: salespeople = [] } = useQuery({
      queryKey: ["salespeople-active", effectiveCompany?.id],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("salespeople")
          .select("id, first_name, last_name, commission_type, commission_value")
          .eq("company_id", effectiveCompany!.id)
          .eq("is_active", true)
          .order("last_name");

        if (error) throw error;
        return data as Salesperson[];
      },
      enabled: !!effectiveCompany?.id,
    });

    const handleChange = (selectedId: string) => {
      if (selectedId === "none") {
        onChange("", null);
      } else {
        const selected = salespeople.find(s => s.id === selectedId) || null;
        onChange(selectedId, selected);
      }
    };

    return (
      <div className="space-y-2" ref={ref}>
        <Label className="flex items-center gap-2">
          <UserCheck className="h-4 w-4" />
          Venditore
        </Label>
        <Select value={value || "none"} onValueChange={handleChange} disabled={disabled}>
          <SelectTrigger>
            <SelectValue placeholder="Seleziona venditore (opzionale)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nessun venditore</SelectItem>
            {salespeople.map((sp) => (
              <SelectItem key={sp.id} value={sp.id}>
                {sp.first_name} {sp.last_name}
                <span className="text-muted-foreground ml-2 text-xs">
                  ({sp.commission_type === "fixed" 
                    ? `€${sp.commission_value}` 
                    : `${sp.commission_value}%`})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
);
