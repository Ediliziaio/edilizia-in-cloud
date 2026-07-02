/**
 * OrderOperationalPanel — assegnazione del responsabile commessa
 * (orders.assigned_to) tra lo staff aziendale.
 *
 * Ridotto al solo responsabile: la "prossima azione" è superata dalle Attività
 * (task con scadenza) e la checklist generica a 5 step dalle fasi di
 * Lavorazioni/Manodopera — erano la stessa cosa in due posti. Le colonne
 * orders.next_action/operational_checklist restano nel DB (nessuna perdita).
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Loader2 } from "lucide-react";

interface Props {
  orderId: string;
  companyId: string;
  initialAssignedTo?: string | null;
  canEdit?: boolean;
  /** Se false renderizza il solo contenuto (senza Card) — per uso dentro un Dialog. */
  asCard?: boolean;
}

export function OrderOperationalPanel({
  orderId, companyId, initialAssignedTo, canEdit = true, asCard = true,
}: Props) {
  const queryClient = useQueryClient();
  const { data: staff = [] } = useCompanyStaffUsers(companyId, "all");

  const [assignedTo, setAssignedTo] = useState(initialAssignedTo ?? "");
  const [savingAssign, setSavingAssign] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(orderId) });

  const changeAssignee = async (value: string) => {
    const v = value === "none" ? "" : value;
    setAssignedTo(v);
    setSavingAssign(true);
    const { error } = await supabase.from("orders").update({ assigned_to: v || null } as never).eq("id", orderId);
    if (error) toast.error("Salvataggio non riuscito", { description: error.message });
    else refresh();
    setSavingAssign(false);
  };

  const staffName = (id: string) => {
    const u = staff.find((s) => s.id === id);
    return u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Utente" : "";
  };

  const body = (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        <User className="h-3.5 w-3.5" /> Responsabile commessa
        {savingAssign && <Loader2 className="h-3 w-3 animate-spin" />}
      </Label>
      <Select value={assignedTo || "none"} onValueChange={changeAssignee} disabled={!canEdit}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Nessun responsabile">{assignedTo ? staffName(assignedTo) : "Nessun responsabile"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Nessun responsabile</SelectItem>
          {staff.map((u) => (
            <SelectItem key={u.id} value={u.id}>{`${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || "Utente"}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">
        Le cose da fare si pianificano con le Attività; l&apos;avanzamento del cantiere vive nelle Lavorazioni.
      </p>
    </div>
  );

  if (!asCard) return body;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <User className="h-4 w-4 text-primary" /> Responsabile commessa
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

export default OrderOperationalPanel;
