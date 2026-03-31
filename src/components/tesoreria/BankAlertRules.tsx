import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Bell, Plus, Trash2, AlertTriangle, Wallet, CreditCard, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ruleTypeLabels: Record<string, { label: string; icon: any; unit: string }> = {
  balance_below: { label: "Saldo sotto soglia", icon: Wallet, unit: "€" },
  large_debit: { label: "Addebito superiore a", icon: CreditCard, unit: "€" },
  unreconciled_days: { label: "Transazioni non riconciliate da", icon: AlertTriangle, unit: "giorni" },
  connection_expiring: { label: "Connessione in scadenza entro", icon: Clock, unit: "giorni" },
};

interface Props {
  companyId: string;
}

export default function BankAlertRules({ companyId }: Props) {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newRule, setNewRule] = useState({
    rule_type: "balance_below",
    threshold: "",
    days_threshold: "",
    notify_email: false,
    notify_inapp: true,
  });

  useEffect(() => {
    if (companyId) loadRules();
  }, [companyId]);

  async function loadRules() {
    setLoading(true);
    const { data } = await supabase
      .from("bank_alert_rules")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    setRules(data || []);
    setLoading(false);
  }

  async function handleAdd() {
    const isDateBased = ["unreconciled_days", "connection_expiring"].includes(newRule.rule_type);
    const payload: any = {
      company_id: companyId,
      rule_type: newRule.rule_type,
      notify_email: false, // disabilitato: funzionalità email non ancora attiva
      notify_inapp: newRule.notify_inapp,
      is_active: true,
    };

    if (isDateBased) {
      payload.days_threshold = parseInt(newRule.days_threshold) || 7;
    } else {
      payload.threshold = parseFloat(newRule.threshold) || 0;
    }

    const { error } = await supabase.from("bank_alert_rules").insert(payload);
    if (error) {
      toast.error("Errore: " + error.message);
    } else {
      toast.success("Alert creato");
      setShowAdd(false);
      setNewRule({ rule_type: "balance_below", threshold: "", days_threshold: "", notify_email: false, notify_inapp: true });
      loadRules();
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    await supabase.from("bank_alert_rules").update({ is_active: !isActive }).eq("id", id);
    loadRules();
  }

  async function handleDelete() {
    if (!deleteId) return;
    await supabase.from("bank_alert_rules").delete().eq("id", deleteId);
    setDeleteId(null);
    loadRules();
  }

  if (loading) {
    return <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4" /> Alert Finanziari
        </h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nuovo Alert
        </Button>
      </div>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nessun alert configurato. Crea un alert per ricevere notifiche automatiche.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => {
            const info = ruleTypeLabels[rule.rule_type] || { label: rule.rule_type, icon: Bell, unit: "" };
            const Icon = info.icon;
            const isDateBased = ["unreconciled_days", "connection_expiring"].includes(rule.rule_type);
            const value = isDateBased ? rule.days_threshold : rule.threshold;
            return (
              <Card key={rule.id} className={!rule.is_active ? "opacity-50" : ""}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{info.label}: {value} {info.unit}</p>
                      <div className="flex gap-2 mt-1">
                        {rule.notify_email && <Badge variant="outline" className="text-xs">Email</Badge>}
                        {rule.notify_inapp && <Badge variant="outline" className="text-xs">In-app</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={rule.is_active} onCheckedChange={() => handleToggle(rule.id, rule.is_active)} />
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(rule.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo Alert Finanziario</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Tipo di alert</Label>
              <Select value={newRule.rule_type} onValueChange={(v) => setNewRule({ ...newRule, rule_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ruleTypeLabels).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>
                Soglia ({ruleTypeLabels[newRule.rule_type]?.unit || ""})
              </Label>
              {["unreconciled_days", "connection_expiring"].includes(newRule.rule_type) ? (
                <Input
                  type="number"
                  placeholder="Es: 7"
                  value={newRule.days_threshold}
                  onChange={(e) => setNewRule({ ...newRule, days_threshold: e.target.value })}
                />
              ) : (
                <Input
                  type="number"
                  placeholder="Es: 5000"
                  value={newRule.threshold}
                  onChange={(e) => setNewRule({ ...newRule, threshold: e.target.value })}
                />
              )}
            </div>
            <div className="flex items-center gap-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 opacity-50 cursor-not-allowed">
                      <Switch disabled={true} checked={false} />
                      <span className="text-sm text-muted-foreground">Notifica via email (prossimamente)</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>L&apos;invio email sarà disponibile nei prossimi aggiornamenti.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex items-center gap-2">
                <Switch checked={newRule.notify_inapp} onCheckedChange={(v) => setNewRule({ ...newRule, notify_inapp: v })} />
                <Label>In-app</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Annulla</Button>
            <Button onClick={handleAdd}>Crea Alert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina alert</AlertDialogTitle>
            <AlertDialogDescription>L'alert verrà eliminato definitivamente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
