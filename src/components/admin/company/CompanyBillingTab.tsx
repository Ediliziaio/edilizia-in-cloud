import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Mail, Bot, MessageSquare, Phone, CreditCard, Plus, Minus, Loader2, Settings2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";

const SERVICES = [
  { key: "email", label: "Email Marketing", icon: Mail },
  { key: "ai_agents", label: "Agenti AI", icon: Bot },
  { key: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { key: "sms", label: "SMS", icon: MessageSquare },
  { key: "phone_numbers", label: "Numeri di Telefono", icon: Phone },
] as const;

const CREDIT_SERVICES = ["email", "ai_agents", "whatsapp"] as const;

interface BillingOverride {
  id: string;
  company_id: string;
  service: string;
  is_enabled: boolean;
  is_free: boolean;
  price_per_unit_eur: number | null;
  markup_multiplier: number | null;
  monthly_fee_eur: number | null;
  custom_notes: string | null;
  updated_at: string;
}

interface AdjustDialog {
  open: boolean;
  service: string;
  direction: "add" | "deduct";
}

export function CompanyBillingTab({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [adjustDialog, setAdjustDialog] = useState<AdjustDialog>({ open: false, service: "", direction: "add" });
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  // Fetch overrides
  const { data: overrides, isLoading: overridesLoading } = useQuery({
    queryKey: ["billing-overrides", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_billing_overrides" as never)
        .select("*")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as unknown as BillingOverride[];
    },
  });

  // Fetch credit balances
  const { data: emailCredits } = useQuery({
    queryKey: ["admin-email-credits", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("email_credits").select("balance_eur").eq("company_id", companyId).maybeSingle();
      return data;
    },
  });

  const { data: aiCredits } = useQuery({
    queryKey: ["admin-ai-credits", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("ai_credits" as never).select("balance_eur").eq("company_id", companyId).maybeSingle();
      return data as { balance_eur: number } | null;
    },
  });

  const { data: waCredits } = useQuery({
    queryKey: ["admin-wa-credits", companyId],
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_credits" as never).select("balance_eur").eq("company_id", companyId).maybeSingle();
      return data as { balance_eur: number } | null;
    },
  });

  // Fetch adjustments history
  const { data: adjustments, isLoading: adjustmentsLoading } = useQuery({
    queryKey: ["admin-credit-adjustments", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_credit_adjustments" as never)
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; service: string; amount_eur: number; reason: string; created_by: string; created_at: string;
      }>;
    },
  });

  // Upsert override
  const upsertOverride = useMutation({
    mutationFn: async (payload: Partial<BillingOverride> & { service: string }) => {
      const { error } = await supabase
        .from("company_billing_overrides" as never)
        .upsert(
          { company_id: companyId, ...payload, updated_at: new Date().toISOString(), updated_by: user?.id } as never,
          { onConflict: "company_id,service" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-overrides", companyId] });
      toast.success("Override salvato");
    },
    onError: (e) => toast.error("Errore: " + e.message),
  });

  // Adjust credits via edge function
  const adjustCredits = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(adjustAmount);
      if (!amount || amount <= 0) throw new Error("Importo non valido");
      if (!adjustReason.trim()) throw new Error("Motivazione obbligatoria");

      const finalAmount = adjustDialog.direction === "deduct" ? -amount : amount;

      const { data, error } = await supabase.functions.invoke("admin-adjust-credits", {
        body: {
          company_id: companyId,
          service: adjustDialog.service,
          amount_eur: finalAmount,
          reason: adjustReason.trim(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Crediti aggiornati: ${formatCurrency(data.balance_before)} → ${formatCurrency(data.balance_after)}`);
      setAdjustDialog({ open: false, service: "", direction: "add" });
      setAdjustAmount("");
      setAdjustReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-email-credits", companyId] });
      queryClient.invalidateQueries({ queryKey: ["admin-ai-credits", companyId] });
      queryClient.invalidateQueries({ queryKey: ["admin-wa-credits", companyId] });
      queryClient.invalidateQueries({ queryKey: ["admin-credit-adjustments", companyId] });
    },
    onError: (e) => toast.error(e.message),
  });

  const getOverride = (service: string) => overrides?.find((o) => o.service === service);

  const getBalance = (service: string) => {
    if (service === "email") return emailCredits?.balance_eur ?? 0;
    if (service === "ai_agents") return aiCredits?.balance_eur ?? 0;
    if (service === "whatsapp") return waCredits?.balance_eur ?? 0;
    return 0;
  };

  if (overridesLoading) {
    return <Skeleton className="h-[400px]" />;
  }

  return (
    <div className="space-y-6">
      {/* Service Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Controllo Servizi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {SERVICES.map(({ key, label, icon: Icon }) => {
            const override = getOverride(key);
            const isEnabled = override?.is_enabled ?? true;
            const isFree = override?.is_free ?? false;

            return (
              <div key={key} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{label}</span>
                    {!isEnabled && <Badge variant="destructive" className="text-[10px]">Disabilitato</Badge>}
                    {isFree && <Badge className="text-[10px] bg-emerald-100 text-emerald-700">Gratuito</Badge>}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Abilitato</Label>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(checked) => upsertOverride.mutate({ service: key, is_enabled: checked })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Gratuito</Label>
                      <Switch
                        checked={isFree}
                        onCheckedChange={(checked) => upsertOverride.mutate({ service: key, is_free: checked })}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Prezzo unitario (€)</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="Default"
                      defaultValue={override?.price_per_unit_eur ?? ""}
                      onBlur={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : null;
                        upsertOverride.mutate({ service: key, price_per_unit_eur: val });
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Markup (×)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Default"
                      defaultValue={override?.markup_multiplier ?? ""}
                      onBlur={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : null;
                        upsertOverride.mutate({ service: key, markup_multiplier: val });
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Fee mensile (€)</Label>
                    <Input
                      type="number"
                      step="1"
                      placeholder="Default"
                      defaultValue={override?.monthly_fee_eur ?? ""}
                      onBlur={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : null;
                        upsertOverride.mutate({ service: key, monthly_fee_eur: val });
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Note interne</Label>
                    <Input
                      placeholder="—"
                      defaultValue={override?.custom_notes ?? ""}
                      onBlur={(e) => {
                        upsertOverride.mutate({ service: key, custom_notes: e.target.value || null });
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Credit Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Gestione Crediti
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {CREDIT_SERVICES.map((svc) => {
              const labels: Record<string, string> = { email: "Email", ai_agents: "AI", whatsapp: "WhatsApp" };
              const balance = getBalance(svc);
              return (
                <div key={svc} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{labels[svc]}</span>
                    <span className="text-lg font-bold">{formatCurrency(balance)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="outline" className="flex-1"
                      onClick={() => setAdjustDialog({ open: true, service: svc, direction: "add" })}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Aggiungi
                    </Button>
                    <Button
                      size="sm" variant="outline" className="flex-1"
                      onClick={() => setAdjustDialog({ open: true, service: svc, direction: "deduct" })}
                    >
                      <Minus className="h-3 w-3 mr-1" /> Deduci
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Adjustments History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Storico Aggiustamenti</CardTitle>
        </CardHeader>
        <CardContent>
          {adjustmentsLoading ? (
            <Skeleton className="h-32" />
          ) : !adjustments || adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nessun aggiustamento registrato.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Servizio</TableHead>
                    <TableHead>Importo</TableHead>
                    <TableHead>Motivazione</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.map((adj) => (
                    <TableRow key={adj.id}>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(adj.created_at), "dd/MM/yy HH:mm", { locale: it })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{adj.service}</Badge>
                      </TableCell>
                      <TableCell className={`font-mono font-semibold ${adj.amount_eur >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {adj.amount_eur >= 0 ? "+" : ""}{formatCurrency(adj.amount_eur)}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{adj.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adjust Dialog */}
      <Dialog open={adjustDialog.open} onOpenChange={(open) => !open && setAdjustDialog({ open: false, service: "", direction: "add" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjustDialog.direction === "add" ? "Aggiungi" : "Deduci"} Crediti — {adjustDialog.service}
            </DialogTitle>
            <DialogDescription>
              Inserisci l'importo e una motivazione obbligatoria.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Importo (€)</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Motivazione *</Label>
              <Textarea
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Es: Bonus onboarding, Rimborso per disservizio..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialog({ open: false, service: "", direction: "add" })}>Annulla</Button>
            <Button
              onClick={() => adjustCredits.mutate()}
              disabled={adjustCredits.isPending || !adjustAmount || !adjustReason.trim()}
            >
              {adjustCredits.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
