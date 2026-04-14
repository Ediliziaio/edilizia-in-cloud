import { useState, useEffect } from "react";
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

import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Mail, Bot, MessageSquare, Phone, CreditCard, Plus, Minus, Loader2, Settings2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";

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
  custom_max_orders: number | null;
  updated_at: string;
}

interface AdjustDialog {
  open: boolean;
  service: string;
  direction: "add" | "deduct";
}

const PAGE_SIZE = 50;

export function CompanyBillingTab({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { permissions } = useSuperAdminPermissions();
  const [adjustDialog, setAdjustDialog] = useState<AdjustDialog>({ open: false, service: "", direction: "add" });
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustmentsPage, setAdjustmentsPage] = useState(0);
  const [customMaxOrders, setCustomMaxOrders] = useState<string>("");

  // Plan pricing override
  const { data: planOverride, refetch: refetchOverride } = useQuery({
    queryKey: ['company-plan-override', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_billing_overrides' as never)
        .select('*')
        .eq('company_id' as never, companyId as never)
        .eq('service' as never, 'plan' as never)
        .maybeSingle();
      if (error) throw error;
      return data as {
        custom_plan_price_eur: number | null;
        override_notes: string | null;
        override_expires_at: string | null;
      } | null;
    },
    enabled: !!companyId && permissions.pricing_override,
  });

  const [overridePrice, setOverridePrice] = useState('');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [overrideExpiry, setOverrideExpiry] = useState('');

  const saveOverrideMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('company_billing_overrides' as never)
        .upsert({
          company_id: companyId,
          service: 'plan',
          custom_plan_price_eur: overridePrice ? Number(overridePrice) : null,
          override_notes: overrideNotes || null,
          override_expires_at: overrideExpiry || null,
          is_enabled: true,
          updated_at: new Date().toISOString(),
        } as never, { onConflict: 'company_id,service' } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Override prezzo salvato');
      void refetchOverride();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Fetch overrides
  const { data: overrides, isLoading: overridesLoading } = useQuery({
    queryKey: queryKeys.billingOverrides.byCompany(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_billing_overrides" as never)
        .select("*")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as unknown as BillingOverride[];
    },
  });

  // Fetch global limits override row (service = '_limits')
  const { data: limitsOverride } = useQuery({
    queryKey: [...queryKeys.billingOverrides.byCompany(companyId), "_limits"],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_billing_overrides" as never)
        .select("custom_max_orders")
        .eq("company_id", companyId)
        .eq("service" as never, "_limits")
        .maybeSingle();
      return data as { custom_max_orders: number | null } | null;
    },
  });

  // Sync state from fetched data on first load
  useEffect(() => {
    if (limitsOverride?.custom_max_orders != null) {
      setCustomMaxOrders(String(limitsOverride.custom_max_orders));
    }
  }, [limitsOverride]);

  // Save custom_max_orders limit override
  const saveLimitsOverride = useMutation({
    mutationFn: async (maxOrders: number | null) => {
      const { error } = await supabase
        .from("company_billing_overrides" as never)
        .upsert(
          { company_id: companyId, service: "_limits", custom_max_orders: maxOrders, updated_at: new Date().toISOString(), updated_by: user?.id } as never,
          { onConflict: "company_id,service" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.billingOverrides.byCompany(companyId), "_limits"] });
      toast.success("Limite ordini personalizzato salvato");
    },
    onError: (e) => toast.error("Errore: " + e.message),
  });

  // Fetch credit balances
  const { data: emailCredits } = useQuery({
    queryKey: queryKeys.admin.emailCredits(companyId),
    queryFn: async () => {
      const { data } = await supabase.from("email_credits").select("balance_eur").eq("company_id", companyId).maybeSingle();
      return data;
    },
  });

  const { data: aiCredits } = useQuery({
    queryKey: queryKeys.admin.aiCreditsAdmin(companyId),
    queryFn: async () => {
      const { data } = await supabase.from("ai_credits" as never).select("balance_eur").eq("company_id", companyId).maybeSingle();
      return data as { balance_eur: number } | null;
    },
  });

  const { data: waCredits } = useQuery({
    queryKey: queryKeys.admin.waCredits(companyId),
    queryFn: async () => {
      const { data } = await supabase.from("whatsapp_credits" as never).select("balance_eur").eq("company_id", companyId).maybeSingle();
      return data as { balance_eur: number } | null;
    },
  });

  // Fetch adjustments history with pagination
  const { data: adjustments, isLoading: adjustmentsLoading } = useQuery({
    queryKey: [...queryKeys.admin.creditAdjustments(companyId), adjustmentsPage],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_credit_adjustments" as never)
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .range(adjustmentsPage * PAGE_SIZE, (adjustmentsPage + 1) * PAGE_SIZE - 1);
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
      queryClient.invalidateQueries({ queryKey: queryKeys.billingOverrides.byCompany(companyId) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.emailCredits(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.aiCreditsAdmin(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.waCredits(companyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.creditAdjustments(companyId) });
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
                    {!isEnabled && <Badge variant="destructive" className="text-xs">Disabilitato</Badge>}
                    {isFree && <Badge className="text-xs bg-emerald-100 text-emerald-700">Gratuito</Badge>}
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
                    <Label className="text-xs text-muted-foreground">Prezzo unitario (€)</Label>
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
                    <Label className="text-xs text-muted-foreground">Markup (×)</Label>
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
                    <Label className="text-xs text-muted-foreground">Fee mensile (€)</Label>
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
                    <Label className="text-xs text-muted-foreground">Note interne</Label>
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

      {/* Plan Limits Override */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Override Limiti di Piano
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 max-w-sm">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Limite ordini personalizzato
                <span className="ml-1 text-xs text-muted-foreground/60">(vuoto = usa il limite del piano)</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="Es: 500"
                value={customMaxOrders}
                onChange={(e) => setCustomMaxOrders(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <Button
              size="sm"
              disabled={saveLimitsOverride.isPending}
              onClick={() => {
                const val = customMaxOrders.trim() ? parseInt(customMaxOrders) : null;
                saveLimitsOverride.mutate(val);
              }}
              className="h-9"
            >
              {saveLimitsOverride.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
              Salva
            </Button>
            {customMaxOrders && (
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                disabled={saveLimitsOverride.isPending}
                onClick={() => { setCustomMaxOrders(""); saveLimitsOverride.mutate(null); }}
              >
                Rimuovi
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Sovrascrive il limite ordini del piano per questa azienda. Impostare a -1 per illimitato.
          </p>
        </CardContent>
      </Card>

      {/* Plan Pricing Override */}
      {permissions.pricing_override && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Override Prezzo Piano
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {planOverride?.custom_plan_price_eur != null && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-amber-700 border-amber-400">
                  Override attivo: €{planOverride.custom_plan_price_eur}/mese
                </Badge>
                {planOverride.override_expires_at && (
                  <span className="text-xs text-muted-foreground">
                    Scade: {format(new Date(planOverride.override_expires_at), 'dd/MM/yyyy', { locale: it })}
                  </span>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Prezzo mensile personalizzato (€)</Label>
                <Input
                  type="number"
                  value={overridePrice}
                  onChange={(e) => setOverridePrice(e.target.value)}
                  placeholder={String(planOverride?.custom_plan_price_eur ?? '')}
                />
              </div>
              <div>
                <Label className="text-xs">Scadenza override</Label>
                <Input
                  type="date"
                  value={overrideExpiry}
                  onChange={(e) => setOverrideExpiry(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Note interne</Label>
              <Textarea
                value={overrideNotes}
                onChange={(e) => setOverrideNotes(e.target.value)}
                placeholder="Es: Deal commerciale Q1 2025 — accordo con CEO"
                rows={2}
              />
            </div>
            <Button
              size="sm"
              onClick={() => saveOverrideMutation.mutate()}
              disabled={saveOverrideMutation.isPending}
            >
              {saveOverrideMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Salva Override'
              )}
            </Button>
          </CardContent>
        </Card>
      )}

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
                        <Badge variant="secondary" className="text-xs">{adj.service}</Badge>
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
          {adjustments?.length === PAGE_SIZE && (
            <div className="flex justify-center pt-3">
              <Button variant="outline" size="sm" onClick={() => setAdjustmentsPage((p) => p + 1)}>
                Carica altri
              </Button>
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
