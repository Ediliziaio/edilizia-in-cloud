import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";

type TierForm = {
  name: string;
  slug: string;
  icon: string;
  min_active_companies: number;
  commission_plan_pct: number;
  commission_addon_pct: number;
  commission_on_usage: boolean;
  usage_commission_pct: number;
  commission_multiplier: number;
  position: number;
};

const EMPTY_TIER: TierForm = {
  name: "",
  slug: "",
  icon: "⭐",
  min_active_companies: 0,
  commission_plan_pct: 20,
  commission_addon_pct: 5,
  commission_on_usage: false,
  usage_commission_pct: 5,
  commission_multiplier: 1,
  position: 0,
};

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const num = (v: string, fallback = 0) => {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};

export function TierMaterialsTab() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [materialDialog, setMaterialDialog] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", type: "banner", file_url: "", thumbnail_url: "", min_tier: "bronze", sort_order: 0 });

  const [tierDialog, setTierDialog] = useState(false);
  const [editingTier, setEditingTier] = useState<any>(null);
  const [tierForm, setTierForm] = useState<TierForm>(EMPTY_TIER);

  const { data: tiers = [] } = useQuery({
    queryKey: queryKeys.admin.referralTiers,
    queryFn: async () => {
      const { data, error } = await supabase.from("referral_tiers").select("*").order("position");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: materials = [], isLoading } = useQuery({
    queryKey: queryKeys.admin.partnerMaterials,
    queryFn: async () => {
      const { data } = await supabase.from("partner_materials").select("*").order("sort_order");
      return data || [];
    },
  });

  // ── Tier CRUD ──────────────────────────────────────────────────────────────
  const saveTier = useMutation({
    mutationFn: async () => {
      const name = tierForm.name.trim();
      if (!name) throw new Error("Il nome del tier è obbligatorio");
      const payload = {
        name,
        icon: tierForm.icon.trim() || "⭐",
        min_active_companies: Math.max(0, Math.trunc(tierForm.min_active_companies)),
        commission_plan_pct: Math.max(0, tierForm.commission_plan_pct),
        commission_addon_pct: Math.max(0, tierForm.commission_addon_pct),
        commission_on_usage: tierForm.commission_on_usage,
        usage_commission_pct: Math.max(0, tierForm.usage_commission_pct),
        commission_multiplier: Math.max(0, tierForm.commission_multiplier),
        position: Math.max(0, Math.trunc(tierForm.position)),
      };
      if (editingTier) {
        // Lo slug NON si modifica in update: è referenziato da partner_materials.min_tier.
        const { error } = await supabase.from("referral_tiers").update(payload).eq("id", editingTier.id);
        if (error) throw error;
      } else {
        const slug = (tierForm.slug.trim() ? slugify(tierForm.slug) : slugify(name)) || "tier";
        const { error } = await supabase.from("referral_tiers").insert({ ...payload, slug });
        if (error) {
          if (error.code === "23505") throw new Error("Esiste già un tier con questo slug — scegline uno diverso");
          throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.referralTiers });
      setTierDialog(false);
      setEditingTier(null);
      toast.success(editingTier ? "Tier aggiornato" : "Tier creato");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteTier = useMutation({
    mutationFn: async (tier: any) => {
      // Guard: non eliminare un tier assegnato a dei partner (FK senza ON DELETE).
      const { count, error: cntErr } = await supabase
        .from("referrers")
        .select("id", { count: "exact", head: true })
        .eq("tier_id", tier.id);
      if (cntErr) throw cntErr;
      if ((count ?? 0) > 0) {
        throw new Error(`Impossibile eliminare: ${count} partner sono su questo tier. Spostali prima su un altro tier.`);
      }
      const { error } = await supabase.from("referral_tiers").delete().eq("id", tier.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.referralTiers });
      toast.success("Tier eliminato");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openNewTier = () => {
    setEditingTier(null);
    setTierForm({ ...EMPTY_TIER, position: (tiers.length || 0) + 1 });
    setTierDialog(true);
  };

  const openEditTier = (t: any) => {
    setEditingTier(t);
    setTierForm({
      name: t.name ?? "",
      slug: t.slug ?? "",
      icon: t.icon ?? "⭐",
      min_active_companies: Number(t.min_active_companies ?? 0),
      commission_plan_pct: Number(t.commission_plan_pct ?? 20),
      commission_addon_pct: Number(t.commission_addon_pct ?? 5),
      commission_on_usage: Boolean(t.commission_on_usage),
      usage_commission_pct: Number(t.usage_commission_pct ?? 5),
      commission_multiplier: Number(t.commission_multiplier ?? 1),
      position: Number(t.position ?? 0),
    });
    setTierDialog(true);
  };

  // ── Materials CRUD (invariato) ───────────────────────────────────────────────
  const saveMaterial = useMutation({
    mutationFn: async () => {
      if (editingMaterial) {
        const { error } = await supabase.from("partner_materials").update(form).eq("id", editingMaterial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("partner_materials").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.partnerMaterials });
      setMaterialDialog(false);
      setEditingMaterial(null);
      toast.success(editingMaterial ? "Materiale aggiornato" : "Materiale creato");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMaterial = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_materials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.partnerMaterials });
      toast.success("Materiale eliminato");
    },
  });

  const openNew = () => {
    setEditingMaterial(null);
    setForm({ name: "", description: "", type: "banner", file_url: "", thumbnail_url: "", min_tier: "bronze", sort_order: 0 });
    setMaterialDialog(true);
  };

  const openEdit = (m: any) => {
    setEditingMaterial(m);
    setForm({
      name: m.name, description: m.description || "", type: m.type,
      file_url: m.file_url, thumbnail_url: m.thumbnail_url || "",
      min_tier: m.min_tier || "bronze", sort_order: m.sort_order || 0,
    });
    setMaterialDialog(true);
  };

  return (
    <div className="space-y-6">
      {/* Tier — commissioni standard a scaglioni */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Tier &amp; Commissioni Standard</CardTitle>
            <CardDescription className="mt-1">
              I partner salgono di tier in base al numero di aziende attive che portano. Ogni tier
              definisce le percentuali di commissione applicate automaticamente dal ciclo mensile.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openNewTier}>
            <Plus className="h-4 w-4 mr-1.5" /> Nuovo Tier
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {tiers.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Nessun tier configurato.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Da N° aziende</TableHead>
                  <TableHead className="text-right">% Canone</TableHead>
                  <TableHead className="text-right">% Add-on</TableHead>
                  <TableHead className="text-right">% Consumo</TableHead>
                  <TableHead className="text-right">Moltiplicatore</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiers.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">
                      <span className="mr-1.5">{t.icon}</span>{t.name}
                    </TableCell>
                    <TableCell className="text-right">≥ {t.min_active_companies}</TableCell>
                    <TableCell className="text-right">{Number(t.commission_plan_pct ?? 0)}%</TableCell>
                    <TableCell className="text-right">{Number(t.commission_addon_pct ?? 0)}%</TableCell>
                    <TableCell className="text-right">
                      {t.commission_on_usage
                        ? `${Number(t.usage_commission_pct ?? 0)}%`
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">×{Number(t.commission_multiplier ?? 1)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditTier(t)} aria-label="Modifica tier">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" aria-label="Elimina tier" onClick={async () => {
                          if (await confirm({ title: `Eliminare il tier "${t.name}"?`, confirmLabel: "Elimina", variant: "destructive" })) deleteTier.mutate(t);
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Materials */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Materiali Marketing</h3>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1.5" /> Nuovo Materiale
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : materials.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nessun materiale caricato
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Tier Minimo</TableHead>
                  <TableHead>Attivo</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell><Badge variant="outline">{m.type}</Badge></TableCell>
                    <TableCell>{m.min_tier}</TableCell>
                    <TableCell>
                      <Badge variant={m.is_active ? "default" : "secondary"}>
                        {m.is_active ? "Attivo" : "Inattivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(m)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={async () => {
                          if (await confirm({ title: "Eliminare questo materiale?", confirmLabel: "Elimina", variant: "destructive" })) deleteMaterial.mutate(m.id);
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tier dialog */}
      <Dialog open={tierDialog} onOpenChange={setTierDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTier ? "Modifica Tier" : "Nuovo Tier"}</DialogTitle>
            <DialogDescription>
              Le percentuali si applicano automaticamente al calcolo commissioni mensile per i partner di questo tier.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div className="space-y-1.5">
                <Label>Icona</Label>
                <Input value={tierForm.icon} onChange={(e) => setTierForm({ ...tierForm, icon: e.target.value })} placeholder="🥇" />
              </div>
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={tierForm.name} onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} placeholder="Gold" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Soglia minima (N° aziende attive)</Label>
                <Input type="number" min={0} step={1} inputMode="numeric"
                  value={tierForm.min_active_companies}
                  onChange={(e) => setTierForm({ ...tierForm, min_active_companies: num(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Posizione (ordine)</Label>
                <Input type="number" min={0} step={1} inputMode="numeric"
                  value={tierForm.position}
                  onChange={(e) => setTierForm({ ...tierForm, position: num(e.target.value) })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>% sul canone (piano)</Label>
                <Input type="number" min={0} step="0.5" inputMode="decimal"
                  value={tierForm.commission_plan_pct}
                  onChange={(e) => setTierForm({ ...tierForm, commission_plan_pct: num(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>% sugli add-on</Label>
                <Input type="number" min={0} step="0.5" inputMode="decimal"
                  value={tierForm.commission_addon_pct}
                  onChange={(e) => setTierForm({ ...tierForm, commission_addon_pct: num(e.target.value) })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Moltiplicatore commissione</Label>
              <Input type="number" min={0} step="0.05" inputMode="decimal"
                value={tierForm.commission_multiplier}
                onChange={(e) => setTierForm({ ...tierForm, commission_multiplier: num(e.target.value) })} />
              <p className="text-xs text-muted-foreground">Applicato a canone + add-on (es. 1.25 = +25%).</p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label className="cursor-pointer">Commissione sul consumo</Label>
                <p className="text-xs text-muted-foreground">Email, WhatsApp e AI consumati dalle aziende portate.</p>
              </div>
              <Switch
                checked={tierForm.commission_on_usage}
                onCheckedChange={(v) => setTierForm({ ...tierForm, commission_on_usage: v })}
              />
            </div>
            {tierForm.commission_on_usage && (
              <div className="space-y-1.5">
                <Label>% sul consumo</Label>
                <Input type="number" min={0} step="0.5" inputMode="decimal"
                  value={tierForm.usage_commission_pct}
                  onChange={(e) => setTierForm({ ...tierForm, usage_commission_pct: num(e.target.value) })} />
              </div>
            )}

            <Button className="w-full" onClick={() => saveTier.mutate()} disabled={!tierForm.name.trim() || saveTier.isPending}>
              {saveTier.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingTier ? "Salva Modifiche" : "Crea Tier"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Material dialog */}
      <Dialog open={materialDialog} onOpenChange={setMaterialDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMaterial ? "Modifica Materiale" : "Nuovo Materiale"}</DialogTitle>
            <DialogDescription>I materiali saranno accessibili ai partner del tier selezionato e superiore.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Descrizione</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="logo">Logo</SelectItem>
                    <SelectItem value="banner">Banner</SelectItem>
                    <SelectItem value="email_template">Email Template</SelectItem>
                    <SelectItem value="social_post">Post Social</SelectItem>
                    <SelectItem value="pdf_brochure">PDF Brochure</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tier Minimo</Label>
                <Select value={form.min_tier} onValueChange={(v) => setForm({ ...form, min_tier: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tiers.map((t: any) => (
                      <SelectItem key={t.slug} value={t.slug}>{t.icon} {t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>URL File *</Label>
              <Input value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label>URL Thumbnail</Label>
              <Input value={form.thumbnail_url} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} placeholder="https://..." />
            </div>
            <Button className="w-full" onClick={() => saveMaterial.mutate()} disabled={!form.name || !form.file_url || saveMaterial.isPending}>
              {editingMaterial ? "Salva Modifiche" : "Crea Materiale"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
