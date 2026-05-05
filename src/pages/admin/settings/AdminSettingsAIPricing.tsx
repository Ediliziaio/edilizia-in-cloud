/**
 * AdminSettingsAIPricing — Editor SuperAdmin per economia AI:
 *  • Listino base tier (cost wholesale + retail con markup)
 *  • Offerte speciali / sconti per singola azienda
 *  • Dashboard margini real-time
 *
 * Solo super_admin (RLS protegge le tabelle).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  TrendingUp, DollarSign, Tag, Pencil, Plus, Trash2,
  Building2, Percent, Calendar, Sparkles,
} from "lucide-react";

interface PricingTier {
  id: string;
  tier_key: string;
  tier_label: string;
  tier_description: string | null;
  customer_label: string;
  cost_per_1m_input_eur: number;
  cost_per_1m_output_eur: number;
  markup_pct: number;
  retail_per_1m_input_eur: number;
  retail_per_1m_output_eur: number;
  enabled: boolean;
  sort_order: number;
}

interface PricingOverride {
  id: string;
  company_id: string;
  tier_key: string | null;
  custom_markup_pct: number | null;
  discount_pct: number | null;
  valid_from: string | null;
  valid_until: string | null;
  reason: string;
  promo_code: string | null;
  enabled: boolean;
  created_at: string;
}

interface CompanyMini {
  id: string;
  name: string;
}

interface RevenueDay {
  day: string;
  calls: number;
  cost_real_eur: number;
  revenue_eur: number;
  margin_eur: number;
  markup_real_pct: number | null;
}

const fmtEur = (n: number | null | undefined, decimals = 4) =>
  n == null ? "—" : `€ ${Number(n).toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

export default function AdminSettingsAIPricing() {
  const qc = useQueryClient();
  const [editTier, setEditTier] = useState<PricingTier | null>(null);
  const [newOverrideOpen, setNewOverrideOpen] = useState(false);

  // ─── DATA: tiers ──────────────────────────────────────────────────────
  const { data: tiers, isLoading: tiersLoading } = useQuery({
    queryKey: ["ai_pricing_tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_pricing_tiers" as never)
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as PricingTier[];
    },
  });

  // ─── DATA: overrides + company name lookup ────────────────────────────
  const { data: overrides, isLoading: overridesLoading } = useQuery({
    queryKey: ["ai_pricing_overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_pricing_overrides" as never)
        .select("*, companies:company_id(id, name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<PricingOverride & { companies: CompanyMini }>;
    },
  });

  // ─── DATA: revenue summary (last 30 days) ─────────────────────────────
  const { data: revenue } = useQuery({
    queryKey: ["ai_revenue_summary_30d"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from("ai_revenue_summary" as never)
        .select("*")
        .gte("day", since.toISOString().slice(0, 10))
        .order("day", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RevenueDay[];
    },
  });

  // ─── DATA: task count per tier (per analitica adoption) ───────────────
  const { data: tierTaskCount } = useQuery({
    queryKey: ["ai_tier_task_count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_router_config" as never)
        .select("tier_key, enabled")
        .eq("enabled", true);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of (data ?? []) as unknown as Array<{ tier_key: string }>) {
        if (!row.tier_key) continue;
        counts.set(row.tier_key, (counts.get(row.tier_key) ?? 0) + 1);
      }
      return counts;
    },
  });

  // ─── MUTATION: update tier ────────────────────────────────────────────
  const updateTierMut = useMutation({
    mutationFn: async (input: {
      id: string;
      cost_per_1m_input_eur: number;
      cost_per_1m_output_eur: number;
      markup_pct: number;
      customer_label: string;
      enabled: boolean;
    }) => {
      const { error } = await supabase
        .from("ai_pricing_tiers" as never)
        .update({
          cost_per_1m_input_eur: input.cost_per_1m_input_eur,
          cost_per_1m_output_eur: input.cost_per_1m_output_eur,
          markup_pct: input.markup_pct,
          customer_label: input.customer_label,
          enabled: input.enabled,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tier aggiornato");
      qc.invalidateQueries({ queryKey: ["ai_pricing_tiers"] });
      setEditTier(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ─── REVENUE STATS ────────────────────────────────────────────────────
  const stats = (revenue ?? []).reduce(
    (acc, d) => ({
      calls: acc.calls + Number(d.calls),
      cost: acc.cost + Number(d.cost_real_eur ?? 0),
      revenue: acc.revenue + Number(d.revenue_eur ?? 0),
      margin: acc.margin + Number(d.margin_eur ?? 0),
    }),
    { calls: 0, cost: 0, revenue: 0, margin: 0 },
  );
  const marginPct = stats.cost > 0 ? (stats.margin / stats.cost) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* HEADER STATS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5" /> Revenue 30gg
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtEur(stats.revenue, 2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.calls.toLocaleString("it-IT")} chiamate
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Costo reale 30gg</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{fmtEur(stats.cost, 2)}</div>
            <p className="text-xs text-muted-foreground mt-1">OpenRouter wholesale</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> Margine 30gg
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700">{fmtEur(stats.margin, 2)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              +{marginPct.toFixed(1)}% sul costo
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tier configurati</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tiers?.length ?? "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {(overrides ?? []).filter(o => o.enabled).length} offerte attive
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tiers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tiers" className="gap-2">
            <Tag className="h-4 w-4" />
            Listino base
          </TabsTrigger>
          <TabsTrigger value="overrides" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Offerte speciali
          </TabsTrigger>
        </TabsList>

        {/* TIERS TAB */}
        <TabsContent value="tiers">
          <Card>
            <CardHeader>
              <CardTitle>Listino base tier</CardTitle>
              <CardDescription>
                Costi wholesale (OpenRouter) + retail (con markup) per fascia modello.
                Modificabile in autonomia. <strong>Default markup 350% (3.5x)</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tiersLoading ? (
                <Skeleton className="h-64" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tier</TableHead>
                        <TableHead>Cliente vede</TableHead>
                        <TableHead className="text-center">Task</TableHead>
                        <TableHead className="text-right">Cost in / 1M</TableHead>
                        <TableHead className="text-right">Cost out / 1M</TableHead>
                        <TableHead className="text-right">Markup</TableHead>
                        <TableHead className="text-right">Retail in / 1M</TableHead>
                        <TableHead className="text-right">Retail out / 1M</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(tiers ?? []).map((t) => (
                        <TableRow key={t.id} className={!t.enabled ? "opacity-50" : ""}>
                          <TableCell>
                            <div className="font-medium">{t.tier_label}</div>
                            <div className="text-xs text-muted-foreground">{t.tier_key}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{t.customer_label}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-mono text-xs">
                              {tierTaskCount?.get(t.tier_key) ?? 0}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {fmtEur(t.cost_per_1m_input_eur, 4)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {fmtEur(t.cost_per_1m_output_eur, 4)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={t.markup_pct >= 300 ? "default" : "outline"}>
                              {Number(t.markup_pct).toFixed(0)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-emerald-700">
                            {fmtEur(t.retail_per_1m_input_eur, 4)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-emerald-700">
                            {fmtEur(t.retail_per_1m_output_eur, 4)}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditTier(t)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <Alert className="mt-4">
                <AlertDescription className="text-xs">
                  <strong>Formula:</strong> retail = cost × markup_pct / 100. <br />
                  <strong>Esempio T1:</strong> €0,25/1M (cost) × 350% = €0,875/1M (retail) → margine €0,625/1M (250%).
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* OVERRIDES TAB */}
        <TabsContent value="overrides">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Offerte speciali per cliente</CardTitle>
                <CardDescription>
                  Sconti, contratti speciali, partner gold. Una sola override attiva per company+tier.
                </CardDescription>
              </div>
              <Button onClick={() => setNewOverrideOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> Nuova offerta
              </Button>
            </CardHeader>
            <CardContent>
              {overridesLoading ? (
                <Skeleton className="h-64" />
              ) : (overrides ?? []).length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Nessuna offerta speciale attiva</p>
                  <p className="text-xs mt-1">Tutte le aziende usano il listino base</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Azienda</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="text-right">Markup custom</TableHead>
                      <TableHead className="text-right">Sconto</TableHead>
                      <TableHead>Validità</TableHead>
                      <TableHead>Motivazione</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(overrides ?? []).map((o) => (
                      <TableRow key={o.id} className={!o.enabled ? "opacity-50" : ""}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {o.companies?.name ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {o.tier_key
                            ? <Badge variant="outline">{o.tier_key}</Badge>
                            : <Badge>tutti</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          {o.custom_markup_pct
                            ? <Badge variant="secondary">{Number(o.custom_markup_pct).toFixed(0)}%</Badge>
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {o.discount_pct
                            ? <Badge variant="secondary" className="bg-rose-50 text-rose-700">
                                -{Number(o.discount_pct).toFixed(0)}%
                              </Badge>
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {o.valid_from ? new Date(o.valid_from).toLocaleDateString("it-IT") : "sempre"}
                          {" → "}
                          {o.valid_until ? new Date(o.valid_until).toLocaleDateString("it-IT") : "∞"}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate" title={o.reason}>
                          {o.reason}
                          {o.promo_code && <Badge variant="outline" className="ml-2 text-xs">{o.promo_code}</Badge>}
                        </TableCell>
                        <TableCell>
                          <DeleteOverrideButton id={o.id} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* EDIT TIER DIALOG */}
      {editTier && (
        <EditTierDialog
          tier={editTier}
          onClose={() => setEditTier(null)}
          onSave={(payload) => updateTierMut.mutate({ id: editTier.id, ...payload })}
          saving={updateTierMut.isPending}
        />
      )}

      {/* NEW OVERRIDE DIALOG */}
      <NewOverrideDialog
        open={newOverrideOpen}
        tiers={tiers ?? []}
        onClose={() => setNewOverrideOpen(false)}
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

function EditTierDialog({
  tier, onClose, onSave, saving,
}: {
  tier: PricingTier;
  onClose: () => void;
  onSave: (payload: {
    cost_per_1m_input_eur: number;
    cost_per_1m_output_eur: number;
    markup_pct: number;
    customer_label: string;
    enabled: boolean;
  }) => void;
  saving: boolean;
}) {
  const [costIn, setCostIn] = useState(String(tier.cost_per_1m_input_eur));
  const [costOut, setCostOut] = useState(String(tier.cost_per_1m_output_eur));
  const [markup, setMarkup] = useState(String(tier.markup_pct));
  const [label, setLabel] = useState(tier.customer_label);
  const [enabled, setEnabled] = useState(tier.enabled);

  const previewIn  = (Number(costIn)  || 0) * (Number(markup) || 0) / 100;
  const previewOut = (Number(costOut) || 0) * (Number(markup) || 0) / 100;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifica {tier.tier_label}</DialogTitle>
          <DialogDescription>
            Aggiorna costi wholesale e markup. I retail sono calcolati automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Etichetta visibile cliente</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cost input €/1M</Label>
              <Input type="number" step="0.001" value={costIn} onChange={(e) => setCostIn(e.target.value)} />
            </div>
            <div>
              <Label>Cost output €/1M</Label>
              <Input type="number" step="0.001" value={costOut} onChange={(e) => setCostOut(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="flex items-center gap-1.5">
              <Percent className="h-3.5 w-3.5" /> Markup % <span className="text-xs text-muted-foreground">(min 100%)</span>
            </Label>
            <Input type="number" step="1" min="100" value={markup} onChange={(e) => setMarkup(e.target.value)} />
          </div>
          <Alert>
            <AlertDescription className="text-xs space-y-1">
              <div><strong>Anteprima retail:</strong></div>
              <div>Input: {fmtEur(previewIn, 4)} / 1M token</div>
              <div>Output: {fmtEur(previewOut, 4)} / 1M token</div>
            </AlertDescription>
          </Alert>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Tier abilitato
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={() => onSave({
              cost_per_1m_input_eur: Number(costIn),
              cost_per_1m_output_eur: Number(costOut),
              markup_pct: Number(markup),
              customer_label: label,
              enabled,
            })}
            disabled={saving}
          >
            {saving ? "Salvataggio…" : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewOverrideDialog({
  open, tiers, onClose,
}: {
  open: boolean;
  tiers: PricingTier[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string>("");
  const [tierKey, setTierKey] = useState<string>("__all__");
  const [markupPct, setMarkupPct] = useState<string>("");
  const [discountPct, setDiscountPct] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [validUntil, setValidUntil] = useState<string>("");
  const [promoCode, setPromoCode] = useState<string>("");

  const { data: companies } = useQuery({
    queryKey: ["companies_for_override"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies" as never)
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as CompanyMini[];
    },
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Seleziona azienda");
      if (!reason.trim()) throw new Error("Motivazione obbligatoria");
      if (!markupPct && !discountPct) throw new Error("Specifica markup custom o sconto");

      const { error } = await supabase.from("ai_pricing_overrides" as never).insert({
        company_id: companyId,
        tier_key: tierKey === "__all__" ? null : tierKey,
        custom_markup_pct: markupPct ? Number(markupPct) : null,
        discount_pct: discountPct ? Number(discountPct) : null,
        valid_until: validUntil || null,
        reason: reason.trim(),
        promo_code: promoCode || null,
        enabled: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Offerta creata");
      qc.invalidateQueries({ queryKey: ["ai_pricing_overrides"] });
      onClose();
      setCompanyId(""); setTierKey("__all__"); setMarkupPct(""); setDiscountPct("");
      setReason(""); setValidUntil(""); setPromoCode("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuova offerta speciale</DialogTitle>
          <DialogDescription>
            Sconto / contratto speciale per una specifica azienda. Una sola attiva per company+tier.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Azienda</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue placeholder="Seleziona azienda…" /></SelectTrigger>
              <SelectContent>
                {(companies ?? []).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tier interessato</Label>
            <Select value={tierKey} onValueChange={setTierKey}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tutti i tier</SelectItem>
                {tiers.map(t => (
                  <SelectItem key={t.tier_key} value={t.tier_key}>{t.tier_label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Markup custom %</Label>
              <Input type="number" placeholder="es. 200" value={markupPct} onChange={(e) => setMarkupPct(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Sostituisce il markup di default</p>
            </div>
            <div>
              <Label>Sconto % aggiuntivo</Label>
              <Input type="number" placeholder="es. 20" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Applicato sul retail finale</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Valida fino a</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
            <div>
              <Label>Codice promo</Label>
              <Input placeholder="es. PARTNER_GOLD" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Motivazione *</Label>
            <Textarea
              rows={2}
              placeholder="es. Cliente partner gold, primo mese omaggio, contratto enterprise…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? "Salvataggio…" : "Crea offerta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteOverrideButton({ id }: { id: string }) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ai_pricing_overrides" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Offerta rimossa");
      qc.invalidateQueries({ queryKey: ["ai_pricing_overrides"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => { if (confirm("Eliminare questa offerta?")) mut.mutate(); }}
      disabled={mut.isPending}
    >
      <Trash2 className="h-4 w-4 text-rose-600" />
    </Button>
  );
}
