/**
 * /admin/companies/:id/pacchetto-custom — v8.6.55
 *
 * Pagina super_admin per creare/applicare un pacchetto custom di feature
 * a una singola company. UX:
 *  - Preset rapidi (FeatureBundle) in alto: 1 click applica
 *  - Catalogo feature raggruppato per categoria con switch + prezzo
 *  - Footer fisso con totale mensile e bottone "Applica"
 *  - Salva configurazione come nuovo bundle riutilizzabile
 *
 * Persistenza: upsert batch su company_feature_overrides.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Sparkles, Save, Package, AlertCircle, Search, Calendar, Loader2, Image as ImageIcon, Layers, Download, ShieldAlert,
} from "lucide-react";
import {
  useFeatureBundles,
  useApplyFeatureBundle,
  useApplyCustomFeatures,
  useCreateFeatureBundle,
  type FeatureBundle,
} from "@/hooks/useFeatureBundles";
import { exportOfferPdf, type OfferFeature } from "@/lib/pacchetto-custom/exportOfferPdf";
import { toast } from "sonner";

interface FlagRow {
  id: string;
  key: string;
  name: string;
  category: string | null;
  description: string | null;
  is_beta: boolean | null;
  default_value: boolean | null;
  plans_included: string[] | null;
  price_per_month: number | null;
  sort_order: number | null;
}

interface OverrideRow {
  feature_key: string;
  is_enabled: boolean | null;
  expires_at: string | null;
  price_override: number | null;
  notes: string | null;
}

interface CompanyRow {
  id: string;
  name: string;
  email: string;
}

const CATEGORY_LABELS: Record<string, { label: string; icon: typeof ImageIcon; color: string }> = {
  addon: { label: "Add-on AI", icon: Sparkles, color: "bg-violet-50 text-violet-700 border-violet-200" },
  modulo_vendita: { label: "Moduli Vendita", icon: Layers, color: "bg-orange-50 text-orange-700 border-orange-200" },
  core: { label: "Funzionalità Core", icon: Package, color: "bg-sky-50 text-sky-700 border-sky-200" },
  marketing: { label: "Marketing", icon: Sparkles, color: "bg-rose-50 text-rose-700 border-rose-200" },
  other: { label: "Altro", icon: Package, color: "bg-slate-50 text-slate-700 border-slate-200" },
};

export default function CompanyPacchettoCustom() {
  const { id: companyId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState<Record<string, { enabled: boolean; price?: number | null }>>({});
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [saveBundleOpen, setSaveBundleOpen] = useState(false);
  const [bundleName, setBundleName] = useState("");
  const [bundleDescription, setBundleDescription] = useState("");
  // v8.6.56 — Toggle modalità esclusiva: disabilita TUTTE le altre feature
  // non incluse nella selezione, oltre ad abilitare quelle scelte.
  const [exclusiveMode, setExclusiveMode] = useState(false);
  const [confirmExclusiveOpen, setConfirmExclusiveOpen] = useState(false);

  // ── Company info ──
  const { data: company } = useQuery<CompanyRow | null>({
    queryKey: ["admin-company-detail-pacchetto", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, email")
        .eq("id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return (data as CompanyRow) ?? null;
    },
  });

  // ── Feature catalog ──
  const { data: flags = [], isLoading: flagsLoading } = useQuery<FlagRow[]>({
    queryKey: ["pacchetto-custom-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_feature_flags")
        .select("id, key, name, category, description, is_beta, default_value, plans_included, price_per_month, sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as FlagRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // ── Override correnti per questa company ──
  const { data: currentOverrides = [] } = useQuery<OverrideRow[]>({
    queryKey: ["pacchetto-custom-overrides", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("company_feature_overrides")
        .select("feature_key, is_enabled, expires_at, price_override, notes")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []) as OverrideRow[];
    },
  });

  // ── Bundle presets ──
  const { data: bundles = [] } = useFeatureBundles({ onlyTemplates: true });
  const applyBundle = useApplyFeatureBundle();
  const applyCustom = useApplyCustomFeatures();
  const createBundle = useCreateFeatureBundle();

  // Hydrate selectedFeatures dagli override esistenti
  useEffect(() => {
    if (currentOverrides.length === 0) return;
    setSelectedFeatures((prev) => {
      const next = { ...prev };
      for (const o of currentOverrides) {
        if (next[o.feature_key] === undefined) {
          next[o.feature_key] = {
            enabled: o.is_enabled === true,
            price: o.price_override,
          };
        }
      }
      return next;
    });
  }, [currentOverrides]);

  // Raggruppa flags per categoria
  const flagsByCategory = useMemo(() => {
    const groups: Record<string, FlagRow[]> = {};
    const q = search.trim().toLowerCase();
    for (const f of flags) {
      if (q && !f.name.toLowerCase().includes(q) && !f.key.toLowerCase().includes(q)) continue;
      const cat = f.category ?? "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(f);
    }
    return groups;
  }, [flags, search]);

  // Totale mensile
  const totals = useMemo(() => {
    let monthly = 0;
    let enabledCount = 0;
    for (const f of flags) {
      const sel = selectedFeatures[f.key];
      if (sel?.enabled) {
        enabledCount++;
        const p = sel.price ?? f.price_per_month ?? 0;
        monthly += Number(p) || 0;
      }
    }
    return { monthly, yearly: monthly * 12, enabledCount };
  }, [selectedFeatures, flags]);

  const toggleFeature = (key: string, enabled: boolean) => {
    setSelectedFeatures((prev) => ({
      ...prev,
      [key]: { enabled, price: prev[key]?.price },
    }));
  };

  const setFeaturePrice = (key: string, price: number | null) => {
    setSelectedFeatures((prev) => ({
      ...prev,
      [key]: { enabled: prev[key]?.enabled ?? false, price },
    }));
  };

  const handleApplyBundle = (bundle: FeatureBundle) => {
    if (!companyId) return;
    // Aggiorna anche local state per riflettere subito
    setSelectedFeatures((prev) => {
      const next = { ...prev };
      for (const fk of bundle.feature_keys) {
        next[fk] = { enabled: true, price: prev[fk]?.price };
      }
      return next;
    });
    applyBundle.mutate({
      companyId,
      bundle,
      userEmail: user?.email,
    });
  };

  const handleApplyCustom = (force = false) => {
    if (!companyId) return;

    // v8.6.56 — Modalità esclusiva: disabilita TUTTE le feature non incluse
    // nella selezione (oltre ad abilitare quelle scelte). Confirm distruttivo
    // tramite dialog dedicato.
    if (exclusiveMode && !force) {
      setConfirmExclusiveOpen(true);
      return;
    }

    const enabledKeys = new Set(
      Object.entries(selectedFeatures).filter(([, v]) => v.enabled).map(([k]) => k),
    );

    // Lista finale: include selezionate esplicite + tutte le altre come disable
    // (se modalità esclusiva) o solo le selezionate (se modalità normale).
    const featureKeys = exclusiveMode
      ? flags.map((f) => ({
          key: f.key,
          enabled: enabledKeys.has(f.key),
          price: selectedFeatures[f.key]?.price ?? null,
        }))
      : Object.entries(selectedFeatures).map(([key, val]) => ({
          key,
          enabled: val.enabled,
          price: val.price ?? null,
        }));

    if (featureKeys.length === 0) {
      toast.error("Nessuna feature configurata");
      return;
    }
    applyCustom.mutate({
      companyId,
      featureKeys,
      userEmail: user?.email,
      notes: exclusiveMode ? "Pacchetto custom (modalità esclusiva)" : "Pacchetto custom",
      expiresAt: expiresAt || null,
    }, {
      onSuccess: () => setConfirmExclusiveOpen(false),
    });
  };

  // v8.6.56 — Export PDF offerta commerciale
  const handleExportPdf = () => {
    if (!company) {
      toast.error("Dati azienda non disponibili");
      return;
    }
    const offerFeatures: OfferFeature[] = flags
      .filter((f) => selectedFeatures[f.key]?.enabled)
      .map((f) => ({
        key: f.key,
        name: f.name,
        price: selectedFeatures[f.key]?.price ?? f.price_per_month ?? null,
        description: f.description,
        category: f.category,
      }));
    if (offerFeatures.length === 0) {
      toast.error("Seleziona almeno una feature per generare l'offerta");
      return;
    }
    try {
      exportOfferPdf({
        companyName: company.name,
        companyEmail: company.email,
        features: offerFeatures,
        totals,
        expiresAt: expiresAt || null,
      });
      toast.success("Offerta PDF generata");
    } catch (e) {
      toast.error("Errore generazione PDF", {
        description: e instanceof Error ? e.message : "Errore sconosciuto",
      });
    }
  };

  const handleSaveAsBundle = () => {
    const enabledKeys = Object.entries(selectedFeatures)
      .filter(([, v]) => v.enabled)
      .map(([k]) => k);
    if (enabledKeys.length === 0) {
      toast.error("Seleziona almeno 1 feature");
      return;
    }
    if (!bundleName.trim()) {
      toast.error("Nome bundle obbligatorio");
      return;
    }
    createBundle.mutate(
      {
        name: bundleName.trim(),
        description: bundleDescription.trim() || null,
        feature_keys: enabledKeys,
        price_monthly: totals.monthly,
        price_yearly: totals.yearly,
        category: "custom",
        is_template: true,
      },
      {
        onSuccess: () => {
          setSaveBundleOpen(false);
          setBundleName("");
          setBundleDescription("");
        },
      },
    );
  };

  const formatEuro = (n: number) =>
    new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

  if (!companyId) {
    return <div className="p-6">ID azienda mancante</div>;
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/admin/companies/${companyId}`}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Torna a {company?.name ?? "azienda"}
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight truncate">
                Pacchetto custom — {company?.name ?? "…"}
              </h1>
              <p className="text-xs text-muted-foreground">
                Seleziona le funzionalità abilitate per questo cliente. Override per-azienda persistito su <code className="text-[10px]">company_feature_overrides</code>.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* ── Preset rapidi ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-orange-500" />
                  Preset rapidi
                </CardTitle>
                <CardDescription className="text-xs">
                  Bundle preconfigurati: 1 click applica tutte le feature del bundle.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/feature-bundles">Gestisci bundle</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {bundles.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Nessun bundle preset. La migration <code>20270519100000_feature_bundles</code> include
                3 preset di default (Solo Render AI, Render + Preventivatore, Pacchetto Marketing AI).
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {bundles.map((b) => (
                  <div key={b.id} className="rounded-lg border bg-card p-4 hover:shadow-sm transition-shadow flex flex-col">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm truncate">{b.name}</h3>
                        <p className="text-[11px] text-muted-foreground">
                          {b.feature_keys.length} feature
                          {b.price_monthly ? ` · ${formatEuro(b.price_monthly)}/mese` : ""}
                        </p>
                      </div>
                      {b.category && (
                        <Badge variant="outline" className="text-[10px] shrink-0">{b.category}</Badge>
                      )}
                    </div>
                    {b.description && (
                      <p className="text-xs text-muted-foreground line-clamp-3 mb-3 flex-1">{b.description}</p>
                    )}
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleApplyBundle(b)}
                      disabled={applyBundle.isPending}
                    >
                      {applyBundle.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                      Applica
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Catalogo feature ──────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4" />
              Catalogo feature
            </CardTitle>
            <CardDescription className="text-xs">
              Seleziona singolarmente quali feature attivare per questo cliente.
              I prezzi sono indicativi; puoi sovrascrivere per ogni feature.
            </CardDescription>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca feature per nome o key..."
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {flagsLoading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Caricamento…</div>
            ) : Object.keys(flagsByCategory).length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                Nessuna feature corrispondente alla ricerca.
              </div>
            ) : (
              Object.entries(flagsByCategory).map(([cat, items]) => {
                const meta = CATEGORY_LABELS[cat] ?? CATEGORY_LABELS.other;
                const Icon = meta.icon;
                return (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-2.5 pb-1 border-b">
                      <div className={`h-6 w-6 rounded flex items-center justify-center ${meta.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide">
                        {meta.label} <span className="text-muted-foreground font-normal">({items.length})</span>
                      </h3>
                    </div>
                    <div className="grid gap-2">
                      {items.map((f) => {
                        const sel = selectedFeatures[f.key];
                        const isOn = sel?.enabled ?? false;
                        const price = sel?.price ?? f.price_per_month;
                        return (
                          <div
                            key={f.key}
                            className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${isOn ? "bg-primary/5 border-primary/30" : "bg-card"}`}
                          >
                            <Switch
                              checked={isOn}
                              onCheckedChange={(v) => toggleFeature(f.key, v)}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{f.name}</span>
                                <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{f.key}</code>
                                {f.is_beta && (
                                  <Badge variant="outline" className="text-[9px] h-4 bg-amber-50 text-amber-700">BETA</Badge>
                                )}
                              </div>
                              {f.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{f.description}</p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] text-muted-foreground">€</span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={price ?? ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setFeaturePrice(f.key, v === "" ? null : Number(v));
                                  }}
                                  disabled={!isOn}
                                  placeholder={f.price_per_month ? String(f.price_per_month) : "0"}
                                  className="h-7 w-20 text-xs"
                                />
                                <span className="text-[11px] text-muted-foreground">/mese</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* ── Opzioni avanzate ─────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Opzioni avanzate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5 max-w-sm">
              <Label htmlFor="expires-at" className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Scadenza (opzionale)
              </Label>
              <Input
                id="expires-at"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Se impostata, le feature attivate si disattivano automaticamente alla data.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Info */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Come funziona</AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            <p>
              Ogni feature attivata qui crea un <strong>override per-azienda</strong> che vince sul piano.
              Le feature non gestite restano sotto il piano.
            </p>
            <p>
              Puoi salvare la configurazione corrente come <strong>bundle riutilizzabile</strong> per applicarla
              ad altri clienti in 1 click dalla sezione "Preset rapidi" in alto.
            </p>
          </AlertDescription>
        </Alert>
      </div>

      {/* ── Footer fisso con totale + applica ─────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t shadow-lg z-30">
        <div className="max-w-6xl mx-auto px-6 py-3 space-y-2">
          {/* Toggle modalità esclusiva */}
          <div className="flex items-center gap-2 text-xs">
            <Switch
              checked={exclusiveMode}
              onCheckedChange={setExclusiveMode}
              id="exclusive-mode"
            />
            <Label htmlFor="exclusive-mode" className="cursor-pointer flex items-center gap-1.5">
              <ShieldAlert className={`h-3.5 w-3.5 ${exclusiveMode ? "text-amber-600" : "text-muted-foreground"}`} />
              Modalità esclusiva — disabilita anche tutte le altre feature non incluse
              {exclusiveMode && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold">ATTIVA</span>
              )}
            </Label>
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-5">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Totale mensile</div>
                <div className="text-xl font-bold tabular-nums">{formatEuro(totals.monthly)}</div>
              </div>
              <div className="hidden sm:block">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Annuale</div>
                <div className="text-sm font-semibold tabular-nums">{formatEuro(totals.yearly)}</div>
              </div>
              <div className="hidden md:block">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Feature</div>
                <div className="text-sm font-semibold">{totals.enabledCount} attive</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPdf}
                disabled={totals.enabledCount === 0}
                title="Genera PDF dell'offerta da inviare al cliente"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Esporta offerta PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSaveBundleOpen(true)}
                disabled={totals.enabledCount === 0}
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Salva come bundle
              </Button>
              <Button
                size="sm"
                onClick={() => handleApplyCustom()}
                disabled={applyCustom.isPending || Object.keys(selectedFeatures).length === 0}
              >
                {applyCustom.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Applica configurazione
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* AlertDialog conferma modalità esclusiva (distruttiva) */}
      <Dialog open={confirmExclusiveOpen} onOpenChange={setConfirmExclusiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <ShieldAlert className="h-5 w-5" />
              Conferma modalità esclusiva
            </DialogTitle>
            <DialogDescription className="space-y-2 text-sm">
              <span className="block">
                Stai per applicare una configurazione che <strong>disabilita esplicitamente tutte le altre feature</strong>
                non incluse nelle {totals.enabledCount} selezionate.
              </span>
              <span className="block text-amber-700 font-medium">
                Il cliente vedrà SOLO le feature che hai attivato qui. Operazione reversibile (puoi cambiare configurazione in qualsiasi momento).
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmExclusiveOpen(false)}>Annulla</Button>
            <Button
              variant="destructive"
              onClick={() => handleApplyCustom(true)}
              disabled={applyCustom.isPending}
            >
              {applyCustom.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Conferma modalità esclusiva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog "Salva come bundle" */}
      <Dialog open={saveBundleOpen} onOpenChange={setSaveBundleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salva come bundle riutilizzabile</DialogTitle>
            <DialogDescription>
              Crea un nuovo bundle preset con le {totals.enabledCount} feature attive ({formatEuro(totals.monthly)}/mese).
              Sarà disponibile per applicazione 1-click su altre company.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="b-name">Nome bundle *</Label>
              <Input
                id="b-name"
                value={bundleName}
                onChange={(e) => setBundleName(e.target.value)}
                placeholder="es. Pacchetto Serramentista Light"
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-desc">Descrizione (opzionale)</Label>
              <Textarea
                id="b-desc"
                value={bundleDescription}
                onChange={(e) => setBundleDescription(e.target.value)}
                placeholder="Cosa contiene questo bundle e per quale tipo di cliente è pensato"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveBundleOpen(false)}>Annulla</Button>
            <Button onClick={handleSaveAsBundle} disabled={createBundle.isPending || !bundleName.trim()}>
              {createBundle.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Crea bundle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
