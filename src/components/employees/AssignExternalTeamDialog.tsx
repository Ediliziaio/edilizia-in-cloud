import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface ExternalTeam {
  id: string;
  name: string;
}

interface AssignExternalTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  existingTeamIds: string[];
}

export function AssignExternalTeamDialog({
  open,
  onOpenChange,
  orderId,
  existingTeamIds,
}: AssignExternalTeamDialogProps) {
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const effectiveCompanyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [totalCost, setTotalCost] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date | undefined>();
  const [notes, setNotes] = useState("");

  // Fetch available teams
  const { data: teams = [] } = useQuery({
    queryKey: ["external-teams", effectiveCompanyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_teams")
        .select("id, name")
        .eq("company_id", effectiveCompanyId!)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data as ExternalTeam[];
    },
    enabled: !!effectiveCompanyId && open,
  });

  // Filter out already assigned teams
  const availableTeams = teams.filter((t) => !existingTeamIds.includes(t.id));

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedTeamId("");
      setTotalCost("");
      setPaymentDate(undefined);
      setNotes("");
    }
  }, [open]);

  const assignMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("order_external_teams").insert({
        order_id: orderId,
        external_team_id: selectedTeamId,
        total_cost: parseFloat(totalCost),
        payment_date: paymentDate ? format(paymentDate, "yyyy-MM-dd") : null,
        is_paid: false,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order-external-teams", orderId] });
      toast({ title: "Squadra aggiunta" });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiungere la squadra.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!selectedTeamId || !totalCost || parseFloat(totalCost) <= 0) {
      toast({
        title: "Dati mancanti",
        description: "Seleziona una squadra e inserisci il costo totale.",
        variant: "destructive",
      });
      return;
    }
    assignMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Aggiungi Squadra Esterna</DialogTitle>
          <DialogDescription>
            Assegna una squadra esterna a questo ordine
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Squadra *</Label>
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona squadra" />
              </SelectTrigger>
              <SelectContent>
                {availableTeams.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    Nessuna squadra disponibile
                  </SelectItem>
                ) : (
                  availableTeams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Costo Totale (€) *</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="2500"
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Data Pagamento Prevista</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !paymentDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {paymentDate ? format(paymentDate, "dd/MM/yyyy") : "Seleziona data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={paymentDate}
                  onSelect={setPaymentDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

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
            {assignMutation.isPending ? "Aggiunta..." : "Aggiungi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
