/**
 * /admin/feature-bundles — v8.6.55
 *
 * CRUD bundle riutilizzabili lato super_admin. Lista + dialog create/edit
 * + delete (soft via is_active).
 */
import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Package, Pencil, Trash2, Search, Sparkles } from "lucide-react";
import {
  useFeatureBundles,
  useCreateFeatureBundle,
  useUpdateFeatureBundle,
  useDeleteFeatureBundle,
  type FeatureBundle,
  type FeatureBundleInput,
} from "@/hooks/useFeatureBundles";

interface FlagRow {
  key: string;
  name: string;
  category: string | null;
  price_per_month: number | null;
}

export default function FeatureBundles() {
  const { data: bundles = [], isLoading } = useFeatureBundles();
  const createBundle = useCreateFeatureBundle();
  const updateBundle = useUpdateFeatureBundle();
  const deleteBundle = useDeleteFeatureBundle();

  const { data: flags = [] } = useQuery<FlagRow[]>({
    queryKey: ["feature-bundles-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_feature_flags")
        .select("key, name, category, price_per_month")
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as FlagRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FeatureBundle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeatureBundle | null>(null);
  const [form, setForm] = useState<FeatureBundleInput>({
    name: "",
    description: "",
    feature_keys: [],
    price_monthly: null,
    category: "",
    is_template: true,
  });
  const [searchFlag, setSearchFlag] = useState("");

  const openCreate = () => {
    setEditTarget(null);
    setForm({ name: "", description: "", feature_keys: [], price_monthly: null, category: "", is_template: true });
    setDialogOpen(true);
  };

  const openEdit = (b: FeatureBundle) => {
    setEditTarget(b);
    setForm({
      name: b.name,
      description: b.description ?? "",
      feature_keys: [...b.feature_keys],
      price_monthly: b.price_monthly,
      price_yearly: b.price_yearly,
      category: b.category ?? "",
      icon: b.icon,
      is_template: b.is_template,
    });
    setDialogOpen(true);
  };

  const toggleFlag = (key: string) => {
    setForm((p) => ({
      ...p,
      feature_keys: p.feature_keys.includes(key)
        ? p.feature_keys.filter((k) => k !== key)
        : [...p.feature_keys, key],
    }));
  };

  const handleSubmit = () => {
    if (editTarget) {
      updateBundle.mutate({ id: editTarget.id, ...form }, {
        onSuccess: () => setDialogOpen(false),
      });
    } else {
      createBundle.mutate(form, {
        onSuccess: () => setDialogOpen(false),
      });
    }
  };

  const filteredFlags = useMemo(() => {
    const q = searchFlag.trim().toLowerCase();
    if (!q) return flags;
    return flags.filter(
      (f) => f.name.toLowerCase().includes(q) || f.key.toLowerCase().includes(q),
    );
  }, [flags, searchFlag]);

  const flagsByCategory = useMemo(() => {
    const groups: Record<string, FlagRow[]> = {};
    for (const f of filteredFlags) {
      const cat = f.category ?? "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(f);
    }
    return groups;
  }, [filteredFlags]);

  const formatEuro = (n: number | null | undefined) =>
    n == null ? "—" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1.5" />Admin</Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Package className="h-6 w-6 text-orange-500" />
                Feature Bundles
              </h1>
              <p className="text-sm text-muted-foreground">
                Bundle riutilizzabili di feature da applicare in 1 click a una company.
              </p>
            </div>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuovo bundle
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground py-12 text-center">Caricamento…</div>
        ) : bundles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-base font-medium mb-1">Nessun bundle creato</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                Crea il tuo primo bundle riutilizzabile. Potrai applicarlo a qualsiasi company
                con un click dalla pagina "Pacchetto custom" del cliente.
              </p>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                Crea primo bundle
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bundles.map((b) => (
              <Card key={b.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2 min-w-0">
                      <Sparkles className="h-4 w-4 text-orange-500 shrink-0" />
                      <span className="truncate">{b.name}</span>
                    </CardTitle>
                    {b.category && <Badge variant="outline" className="text-[10px] shrink-0">{b.category}</Badge>}
                  </div>
                  {b.description && (
                    <CardDescription className="text-xs line-clamp-2">{b.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="space-y-3 flex-1 flex flex-col">
                  <div className="text-xs text-muted-foreground">
                    <strong className="text-foreground">{b.feature_keys.length}</strong> feature ·
                    <strong className="text-foreground ml-1">{formatEuro(b.price_monthly)}/mese</strong>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-hidden">
                    {b.feature_keys.slice(0, 6).map((k) => (
                      <Badge key={k} variant="secondary" className="text-[10px] font-mono">
                        {k}
                      </Badge>
                    ))}
                    {b.feature_keys.length > 6 && (
                      <Badge variant="outline" className="text-[10px]">+{b.feature_keys.length - 6}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-3 mt-auto border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => openEdit(b)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Modifica
                    </Button>
                    <Button
                      size="icon" aria-label={`Elimina bundle ${b.name}`}
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteTarget(b)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialog create/edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Modifica bundle" : "Nuovo bundle"}</DialogTitle>
            <DialogDescription>
              Configura nome, descrizione e set di feature_keys da abilitare in batch.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="b-name">Nome *</Label>
                <Input
                  id="b-name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="es. Pacchetto Solo Render"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="b-desc">Descrizione</Label>
                <Textarea
                  id="b-desc"
                  value={form.description ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Per quale cliente tipo è questo bundle"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-cat">Categoria</Label>
                <Input
                  id="b-cat"
                  value={form.category ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  placeholder="es. serramentista, marketing"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-price">Prezzo mensile (€)</Label>
                <Input
                  id="b-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price_monthly ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, price_monthly: e.target.value === "" ? null : Number(e.target.value) }))}
                  placeholder="49.00"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold mb-2 block">
                Feature incluse ({form.feature_keys.length} selezionate)
              </Label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchFlag}
                  onChange={(e) => setSearchFlag(e.target.value)}
                  placeholder="Cerca feature..."
                  className="pl-9 h-9 text-sm"
                />
              </div>
              <div className="border rounded-md max-h-72 overflow-y-auto p-2 space-y-3">
                {Object.entries(flagsByCategory).map(([cat, items]) => (
                  <div key={cat}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      {cat}
                    </p>
                    {items.map((f) => (
                      <label key={f.key} className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm">
                        <Checkbox
                          checked={form.feature_keys.includes(f.key)}
                          onCheckedChange={() => toggleFlag(f.key)}
                        />
                        <span className="flex-1 truncate">{f.name}</span>
                        <code className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded">{f.key}</code>
                        {f.price_per_month != null && (
                          <span className="text-[10px] text-muted-foreground shrink-0">€{f.price_per_month}/m</span>
                        )}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !form.name.trim() ||
                form.feature_keys.length === 0 ||
                createBundle.isPending ||
                updateBundle.isPending
              }
            >
              {editTarget ? "Salva modifiche" : "Crea bundle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il bundle "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Il bundle non sarà più disponibile nei preset. Le aziende che lo hanno già applicato
              mantengono le feature attive (gli override per-azienda non vengono toccati).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteBundle.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
