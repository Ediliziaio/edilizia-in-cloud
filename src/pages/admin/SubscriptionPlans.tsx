import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Loader2, Package, Users, HardDrive, ClipboardList, Euro, RefreshCw, AlertCircle, Building2, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { ALL_MODULES } from "@/lib/adminConstants";

interface PlanForm {
  name: string;
  slug: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  max_orders: number;
  max_users: number;
  max_storage_mb: number;
  features: string[];
  is_active: boolean;
  position: number;
  included_modules: string[];
  stripe_product_id: string;
  stripe_price_monthly_id: string;
  stripe_price_yearly_id: string;
}

const emptyForm: PlanForm = {
  name: "",
  slug: "",
  description: "",
  price_monthly: 0,
  price_yearly: 0,
  max_orders: -1,
  max_users: -1,
  max_storage_mb: 500,
  features: [],
  is_active: true,
  position: 0,
  included_modules: ALL_MODULES.map(m => m.key),
  stripe_product_id: "",
  stripe_price_monthly_id: "",
  stripe_price_yearly_id: "",
};

export default function SubscriptionPlans() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [featuresText, setFeaturesText] = useState("");

  const { data: plans, isLoading, isError, refetch } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: companyCounts } = useQuery({
    queryKey: ["admin-plan-usage"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("subscription_plan_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data?.forEach((c) => {
        if (c.subscription_plan_id) {
          counts[c.subscription_plan_id] = (counts[c.subscription_plan_id] || 0) + 1;
        }
      });
      return counts;
    },
    staleTime: 5 * 60 * 1000,
  });

  const stats = useMemo(() => {
    if (!plans) return { activePlans: 0, subscribedCompanies: 0, estimatedMrr: 0 };
    const activePlans = plans.filter((p) => p.is_active).length;
    const counts = companyCounts || {};
    const subscribedCompanies = Object.values(counts).reduce((s, n) => s + n, 0);
    const estimatedMrr = plans.reduce((sum, p) => sum + p.price_monthly * (counts[p.id] || 0), 0);
    return { activePlans, subscribedCompanies, estimatedMrr };
  }, [plans, companyCounts]);

  const saveMutation = useMutation({
    mutationFn: async (plan: PlanForm & { id?: string }) => {
      const payload: Record<string, any> = {
        name: plan.name,
        slug: plan.slug,
        description: plan.description || null,
        price_monthly: plan.price_monthly,
        price_yearly: plan.price_yearly,
        max_orders: plan.max_orders,
        max_users: plan.max_users,
        max_storage_mb: plan.max_storage_mb,
        features: plan.features,
        is_active: plan.is_active,
        position: plan.position,
        included_modules: plan.included_modules,
        stripe_product_id: plan.stripe_product_id || null,
        stripe_price_monthly_id: plan.stripe_price_monthly_id || null,
        stripe_price_yearly_id: plan.stripe_price_yearly_id || null,
      };

      if (plan.id) {
        const { error } = await supabase.from("subscription_plans").update(payload as any).eq("id", plan.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subscription_plans").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      setDialogOpen(false);
      toast({ title: editingId ? "Piano aggiornato" : "Piano creato" });
    },
    onError: (error) => {
      toast({ title: "Errore", description: error.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("subscription_plans").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
      toast({ title: "Stato aggiornato" });
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, position: (plans?.length || 0) + 1 });
    setFeaturesText("");
    setDialogOpen(true);
  };

  const openEdit = (plan: NonNullable<typeof plans>[0]) => {
    setEditingId(plan.id);
    const features = Array.isArray(plan.features) ? (plan.features as string[]) : [];
    setForm({
      name: plan.name,
      slug: plan.slug,
      description: plan.description || "",
      price_monthly: plan.price_monthly,
      price_yearly: plan.price_yearly,
      max_orders: plan.max_orders,
      max_users: plan.max_users,
      max_storage_mb: plan.max_storage_mb,
      features,
      is_active: plan.is_active,
      position: plan.position,
      included_modules: Array.isArray((plan as any).included_modules) ? (plan as any).included_modules : ALL_MODULES.map(m => m.key),
      stripe_product_id: plan.stripe_product_id || "",
      stripe_price_monthly_id: plan.stripe_price_monthly_id || "",
      stripe_price_yearly_id: plan.stripe_price_yearly_id || "",
    });
    setFeaturesText(features.join("\n"));
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.slug) {
      toast({ title: "Compila nome e slug", variant: "destructive" });
      return;
    }
    const features = featuresText.split("\n").map((f) => f.trim()).filter(Boolean);
    saveMutation.mutate({ ...form, features, id: editingId || undefined });
  };

  const formatLimit = (value: number) => (value === -1 ? "Illimitati" : value.toString());

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">Piani Tariffari</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Errore nel caricamento dei piani tariffari.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3 w-3 mr-1" />
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Piani Tariffari</h1>
          <p className="text-muted-foreground">Gestisci i piani di abbonamento della piattaforma</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Piano
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Piani Attivi</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activePlans}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Aziende Abbonate</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.subscribedCompanies}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">MRR Stimato</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.estimatedMrr)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {plans?.map((plan) => {
          const features = Array.isArray(plan.features) ? (plan.features as string[]) : [];
          return (
            <Card key={plan.id} className={`relative ${!plan.is_active ? "opacity-60" : ""}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <Badge variant={plan.is_active ? "default" : "secondary"}>
                    {plan.is_active ? "Attivo" : "Disattivo"}
                  </Badge>
                </div>
                <CardDescription>{plan.description || plan.slug}</CardDescription>
                {(companyCounts?.[plan.id] ?? 0) > 0 && (
                  <Badge variant="secondary" className="mt-1 w-fit gap-1">
                    <Building2 className="h-3 w-3" />
                    {companyCounts![plan.id]} aziende
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Prices */}
                <div className="flex items-baseline gap-1">
                  <Euro className="h-4 w-4 text-muted-foreground" />
                  <span className="text-3xl font-bold">{formatCurrency(plan.price_monthly)}</span>
                  <span className="text-muted-foreground">/mese</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(plan.price_yearly)}/anno
                </p>

                {/* Limits */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center gap-2 text-sm">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    <span>{formatLimit(plan.max_orders)} ordini</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>{formatLimit(plan.max_users)} utenti</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <span>{plan.max_storage_mb} MB storage</span>
                  </div>
                </div>

                {/* Included Modules */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t">
                  {ALL_MODULES.map((mod) => {
                    const included = Array.isArray((plan as any).included_modules) && (plan as any).included_modules.includes(mod.key);
                    return (
                      <Badge key={mod.key} variant={included ? "default" : "outline"} className="text-xs gap-1">
                        <mod.icon className="h-3 w-3" />
                        {mod.label}
                      </Badge>
                    );
                  })}
                </div>

                {/* Features */}
                {features.length > 0 && (
                  <div className="space-y-1 pt-2 border-t">
                    {features.map((f, i) => (
                      <p key={i} className="text-sm flex items-center gap-2">
                        <span className="text-primary">✓</span> {f}
                      </p>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(plan)}>
                    <Edit className="h-3 w-3 mr-1" />
                    Modifica
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => toggleActiveMutation.mutate({ id: plan.id, is_active: !plan.is_active })}
                  >
                    {plan.is_active ? "Disattiva" : "Attiva"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dialog Create/Edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifica Piano" : "Nuovo Piano"}</DialogTitle>
            <DialogDescription>Configura i dettagli del piano tariffario</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Es. Pro" />
              </div>
              <div className="space-y-2">
                <Label>Slug *</Label>
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Es. pro" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrizione</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrizione del piano" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prezzo Mensile (€)</Label>
                <Input type="number" min="0" step="0.01" value={form.price_monthly} onChange={(e) => setForm({ ...form, price_monthly: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Prezzo Annuale (€)</Label>
                <Input type="number" min="0" step="0.01" value={form.price_yearly} onChange={(e) => setForm({ ...form, price_yearly: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Max Ordini (-1 = illimitati)</Label>
                <Input type="number" value={form.max_orders} onChange={(e) => setForm({ ...form, max_orders: parseInt(e.target.value) || -1 })} />
              </div>
              <div className="space-y-2">
                <Label>Max Utenti (-1 = illimitati)</Label>
                <Input type="number" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: parseInt(e.target.value) || -1 })} />
              </div>
              <div className="space-y-2">
                <Label>Max Storage (MB)</Label>
                <Input type="number" value={form.max_storage_mb} onChange={(e) => setForm({ ...form, max_storage_mb: parseInt(e.target.value) || 500 })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Features (una per riga)</Label>
              <Textarea value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} placeholder={"Gestione ordini\nSupporto prioritario\nReport avanzati"} rows={4} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Posizione</Label>
                <Input type="number" min="0" value={form.position} onChange={(e) => setForm({ ...form, position: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
                <Label>Piano attivo</Label>
              </div>
            </div>

            {/* Moduli inclusi */}
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-base font-semibold">Moduli inclusi nel piano</Label>
              <div className="grid grid-cols-2 gap-3">
                {ALL_MODULES.map((mod) => (
                  <div key={mod.key} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <mod.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{mod.label}</span>
                    </div>
                    <Switch
                      checked={form.included_modules.includes(mod.key)}
                      onCheckedChange={(checked) => {
                        setForm({
                          ...form,
                          included_modules: checked
                            ? [...form.included_modules, mod.key]
                            : form.included_modules.filter((k) => k !== mod.key),
                        });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Stripe IDs - hidden for now but editable */}
            <details className="pt-2">
              <summary className="text-sm text-muted-foreground cursor-pointer">Configurazione Stripe (opzionale)</summary>
              <div className="grid gap-4 mt-3">
                <div className="space-y-2">
                  <Label>Stripe Product ID</Label>
                  <Input value={form.stripe_product_id} onChange={(e) => setForm({ ...form, stripe_product_id: e.target.value })} placeholder="prod_..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Stripe Price Monthly ID</Label>
                    <Input value={form.stripe_price_monthly_id} onChange={(e) => setForm({ ...form, stripe_price_monthly_id: e.target.value })} placeholder="price_..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Stripe Price Yearly ID</Label>
                    <Input value={form.stripe_price_yearly_id} onChange={(e) => setForm({ ...form, stripe_price_yearly_id: e.target.value })} placeholder="price_..." />
                  </div>
                </div>
              </div>
            </details>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Salva Modifiche" : "Crea Piano"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
