import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  gross_salary: number;
  monthly_hours: number;
}

interface AssignEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  existingEmployeeIds: string[];
}

export function AssignEmployeeDialog({
  open,
  onOpenChange,
  orderId,
  existingEmployeeIds,
}: AssignEmployeeDialogProps) {
  const { effectiveCompany } = useAuth();
  const effectiveCompanyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [hoursWorked, setHoursWorked] = useState("");
  const [notes, setNotes] = useState("");

  // Fetch available employees
  const { data: employees = [] } = useQuery({
    queryKey: ["employees", effectiveCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, gross_salary, monthly_hours")
        .eq("company_id", effectiveCompanyId!)
        .eq("is_active", true)
        .order("last_name");

      if (error) throw error;
      return data as Employee[];
    },
    enabled: !!effectiveCompanyId && open,
  });

  // Filter out already assigned employees
  const availableEmployees = employees.filter(
    (e) => !existingEmployeeIds.includes(e.id)
  );

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);
  const hourlyRate = selectedEmployee && selectedEmployee.monthly_hours > 0
    ? selectedEmployee.gross_salary / selectedEmployee.monthly_hours
    : 0;
  const totalCost = hourlyRate * (parseFloat(hoursWorked) || 0);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedEmployeeId("");
      setHoursWorked("");
      setNotes("");
    }
  }, [open]);

  const assignMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("order_employees").insert({
        order_id: orderId,
        employee_id: selectedEmployeeId,
        hours_worked: parseFloat(hoursWorked),
        hourly_rate: hourlyRate,
        total_cost: totalCost,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-employees", orderId] });
      toast.success("Dipendente assegnato");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile assegnare il dipendente." });
    },
  });

  const handleSubmit = () => {
    if (!selectedEmployeeId || !hoursWorked || parseFloat(hoursWorked) <= 0) {
      toast.error("Dati mancanti", { description: "Seleziona un dipendente e inserisci le ore lavorate." });
      return;
    }
    assignMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assegna Dipendente</DialogTitle>
          <DialogDescription>
            Assegna un dipendente interno a questo ordine
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Dipendente *</Label>
            <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona dipendente" />
              </SelectTrigger>
              <SelectContent>
                {availableEmployees.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    Nessun dipendente disponibile
                  </SelectItem>
                ) : (
                  availableEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.first_name} {employee.last_name} (
                      {formatCurrency(
                        employee.monthly_hours > 0 ? employee.gross_salary / employee.monthly_hours : 0
                      )}
                      /h)
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Ore Lavorate *</Label>
            <Input
              type="number"
              min="0.5"
              step="0.5"
              placeholder="24"
              value={hoursWorked}
              onChange={(e) => setHoursWorked(e.target.value)}
            />
          </div>

          {selectedEmployee && hoursWorked && parseFloat(hoursWorked) > 0 && (
            <div className="p-3 rounded-lg bg-muted space-y-1">
              <div className="flex justify-between text-sm">
                <span>Costo Orario</span>
                <span>{formatCurrency(hourlyRate)}/h</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Totale</span>
                <span>{formatCurrency(totalCost)}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              placeholder="Note aggiuntive..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={assignMutation.isPending}>
            {assignMutation.isPending ? "Assegnazione..." : "Assegna"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
