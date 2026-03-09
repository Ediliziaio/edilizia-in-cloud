import { memo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CompanyTargets } from "@/hooks/useCruscottoData";

interface Props {
  targets: CompanyTargets | null;
}

export const AlertThresholdsDialog = memo(function AlertThresholdsDialog({ targets }: Props) {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [lateOrders, setLateOrders] = useState(targets?.alert_late_orders_threshold ?? 1);
  const [openTickets, setOpenTickets] = useState(targets?.alert_open_tickets_threshold ?? 5);
  const [marginMin, setMarginMin] = useState(targets?.alert_margin_min_pct ?? 10);
  const [runwayDays, setRunwayDays] = useState(targets?.alert_runway_days_warning ?? 30);
  const [revenueTarget, setRevenueTarget] = useState(targets?.monthly_revenue_target ?? 0);
  const [ordersTarget, setOrdersTarget] = useState(targets?.monthly_orders_target ?? 0);

  const handleSave = async () => {
    if (!effectiveCompany?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("companies")
      .update({
        alert_late_orders_threshold: lateOrders,
        alert_open_tickets_threshold: openTickets,
        alert_margin_min_pct: marginMin,
        alert_runway_days_warning: runwayDays,
        monthly_revenue_target: revenueTarget > 0 ? revenueTarget : null,
        monthly_orders_target: ordersTarget > 0 ? ordersTarget : null,
      } as any)
      .eq("id", effectiveCompany.id);

    setSaving(false);
    if (error) {
      toast.error("Errore nel salvataggio");
    } else {
      toast.success("Soglie aggiornate");
      queryClient.invalidateQueries({ queryKey: ["cruscotto-targets"] });
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          Soglie
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configura Soglie Alert e Target</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Soglie Alert</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Ordini in ritardo</Label>
                <Input type="number" min={0} value={lateOrders} onChange={e => setLateOrders(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Ticket aperti</Label>
                <Input type="number" min={0} value={openTickets} onChange={e => setOpenTickets(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Margine minimo (%)</Label>
                <Input type="number" min={0} max={100} value={marginMin} onChange={e => setMarginMin(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Cash runway (giorni)</Label>
                <Input type="number" min={0} value={runwayDays} onChange={e => setRunwayDays(Number(e.target.value))} />
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t">
            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Target Mensili</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Target fatturato (€)</Label>
                <Input type="number" min={0} value={revenueTarget} onChange={e => setRevenueTarget(Number(e.target.value))} />
              </div>
              <div>
                <Label className="text-xs">Target ordini (#)</Label>
                <Input type="number" min={0} value={ordersTarget} onChange={e => setOrdersTarget(Number(e.target.value))} />
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});
