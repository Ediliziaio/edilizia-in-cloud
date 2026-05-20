import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { VAT_RATES, calculateNetFromGross } from "@/lib/vatUtils";
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
  vat_rate: number;
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
  const [vatRate, setVatRate] = useState<number>(22);
  const [paymentDate, setPaymentDate] = useState<Date | undefined>();
  const [notes, setNotes] = useState("");

  // Fetch available teams — UNIONE di external_teams + subappaltatori
  // Per coerenza con /azienda/subappaltatori, mostriamo anche i subappaltatori
  // del registro. Quando l'utente seleziona un sub creiamo un record shadow
  // in external_teams (idempotente per nome) per soddisfare la FK.
  const { data: teams = [] } = useQuery({
    queryKey: ["external-teams-and-subs", effectiveCompanyId],
    queryFn: async () => {
      const [externalRes, subRes] = await Promise.all([
        supabase
          .from("external_teams")
          .select("id, name, vat_rate")
          .eq("company_id", effectiveCompanyId!)
          .eq("is_active", true)
          .order("name"),
        (supabase as unknown as { from: (n: string) => { select: (s: string) => { eq: (k: string, v: string) => Promise<{ data: Array<{ id: string; ragione_sociale: string }> | null }> } } })
          .from("v_subappaltatori_dashboard")
          .select("id, ragione_sociale")
          .eq("company_id", effectiveCompanyId!),
      ]);
      const external: ExternalTeam[] = (externalRes.data ?? []) as ExternalTeam[];
      const externalNames = new Set(external.map((t) => t.name.toLowerCase()));
      const seen = new Set<string>();
      const subs: ExternalTeam[] = [];
      for (const s of subRes.data ?? []) {
        const key = s.id;
        if (seen.has(key)) continue;
        seen.add(key);
        // Non aggiungere se già esiste un external_teams con stesso nome
        if (externalNames.has(s.ragione_sociale.toLowerCase())) continue;
        subs.push({ id: `sub:${s.id}`, name: s.ragione_sociale, vat_rate: 22 } as ExternalTeam);
      }
      return [...external, ...subs.sort((a, b) => a.name.localeCompare(b.name))];
    },
    enabled: !!effectiveCompanyId && open,
    staleTime: 5 * 60 * 1000,
  });

  // Filter out already assigned teams
  const availableTeams = teams.filter((t) => !existingTeamIds.includes(t.id));

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedTeamId("");
      setTotalCost("");
      setVatRate(22);
      setPaymentDate(undefined);
      setNotes("");
    }
  }, [open]);

  // Handle team selection - inherit VAT rate
  const handleTeamChange = (teamId: string) => {
    setSelectedTeamId(teamId);
    const team = teams.find(t => t.id === teamId);
    if (team) {
      setVatRate(team.vat_rate ?? 22);
    }
  };

  const assignMutation = useMutation({
    mutationFn: async () => {
      // Se l'utente ha selezionato un subappaltatore (prefix "sub:"),
      // creiamo (o riusiamo per nome) un record shadow in external_teams
      // per soddisfare la FK su order_external_teams.external_team_id.
      let effectiveTeamId = selectedTeamId;
      if (selectedTeamId.startsWith("sub:")) {
        const subId = selectedTeamId.slice(4);
        const team = teams.find((t) => t.id === selectedTeamId);
        const name = team?.name ?? "Subappaltatore";
        // Idempotent: cerca un external_teams con stesso nome+company
        const { data: existing } = await supabase
          .from("external_teams")
          .select("id")
          .eq("company_id", effectiveCompanyId!)
          .eq("name", name)
          .maybeSingle();
        if (existing?.id) {
          effectiveTeamId = existing.id;
        } else {
          const { data: created, error: cErr } = await supabase
            .from("external_teams")
            .insert({
              company_id: effectiveCompanyId!,
              name,
              notes: `Collegato a subappaltatore (${subId})`,
              is_active: true,
            })
            .select("id")
            .single();
          if (cErr) throw cErr;
          effectiveTeamId = created.id;
        }
      }
      const { error } = await supabase.from("order_external_teams").insert({
        order_id: orderId,
        external_team_id: effectiveTeamId,
        total_cost: parseFloat(totalCost),
        vat_rate: vatRate,
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
            <Select value={selectedTeamId} onValueChange={handleTeamChange}>
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
                      {team.name} ({team.vat_rate}%)
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              <Label>IVA</Label>
              <Select
                value={vatRate.toString()}
                onValueChange={(v) => setVatRate(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VAT_RATES.map((rate) => (
                    <SelectItem key={rate.value} value={rate.value.toString()}>
                      {rate.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {totalCost && parseFloat(totalCost) > 0 && (
            <p className="text-xs text-muted-foreground -mt-2">
              Netto: {formatCurrency(calculateNetFromGross(parseFloat(totalCost), vatRate).netAmount)} + IVA {formatCurrency(calculateNetFromGross(parseFloat(totalCost), vatRate).vatAmount)}
            </p>
          )}

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
