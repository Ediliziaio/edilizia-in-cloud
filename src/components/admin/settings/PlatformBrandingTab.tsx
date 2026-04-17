import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Palette, Globe, Search } from "lucide-react";
import { toast } from "sonner";

interface PlatformSettings {
  app_name?: string;
  app_logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  favicon_url?: string;
  support_email?: string;
}

function ColorSwatch({ color }: { color: string }) {
  const isValid = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
  return (
    <div
      className="w-8 h-8 rounded border shrink-0"
      style={{ backgroundColor: isValid ? color : "#e5e7eb" }}
      title={color}
    />
  );
}

function SEOPreview({
  title,
  description,
  url,
}: {
  title: string;
  description: string;
  url: string;
}) {
  return (
    <div className="border rounded-lg p-4 bg-white dark:bg-card max-w-xl space-y-0.5">
      <p className="text-xs text-muted-foreground">{url}</p>
      <p className="text-blue-600 dark:text-blue-400 text-base font-medium leading-tight">
        {title || "Titolo pagina"}
      </p>
      <p className="text-sm text-muted-foreground leading-snug">
        {description
          ? description.slice(0, 160)
          : "Descrizione della pagina..."}
      </p>
    </div>
  );
}

export function PlatformBrandingTab() {
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin", "platform-settings-branding"],
    queryFn: async (): Promise<PlatformSettings> => {
      const keys = [
        "app_name",
        "app_logo_url",
        "primary_color",
        "secondary_color",
        "favicon_url",
        "support_email",
      ];
      const { data, error } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", keys);
      if (error) throw new Error(error.message);
      const result: PlatformSettings = {};
      for (const row of data ?? []) {
        const r = row as { key: string; value: string };
        (result as Record<string, string>)[r.key] = r.value;
      }
      return result;
    },
    staleTime: 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      // Schema platform_settings: key TEXT PK, value TEXT NOT NULL, updated_at, updated_by
      // Le colonne `label` e `category` NON esistono.
      const rows = Object.entries(updates).map(([key, value]) => ({
        key,
        value,
        updated_at: new Date().toISOString(),
      }));
      const { data, error } = await supabase
        .from("platform_settings")
        .upsert(rows, { onConflict: "key" })
        .select("key");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error("Salvataggio bloccato (0 righe). Verifica di essere super_admin.");
      }
    },
    onSuccess: () => {
      toast.success("Impostazioni branding salvate");
      void qc.invalidateQueries({ queryKey: ["admin", "platform-settings-branding"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const { data: seoSettings, isLoading: seoLoading } = useQuery({
    queryKey: ["admin", "platform-settings-seo"],
    queryFn: async (): Promise<PlatformSettings> => {
      const keys = ["seo_title", "seo_description", "seo_keywords", "app_name"];
      const { data, error } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", keys);
      if (error) throw new Error(error.message);
      const result: PlatformSettings = {};
      for (const row of data ?? []) {
        const r = row as { key: string; value: string };
        (result as Record<string, string>)[r.key] = r.value;
      }
      return result;
    },
    staleTime: 60 * 1000,
  });

  const saveSeoMutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const rows = Object.entries(updates).map(([key, value]) => ({
        key,
        value,
        updated_at: new Date().toISOString(),
      }));
      const { data, error } = await supabase
        .from("platform_settings")
        .upsert(rows, { onConflict: "key" })
        .select("key");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error("Salvataggio bloccato (0 righe). Verifica di essere super_admin.");
      }
    },
    onSuccess: () => {
      toast.success("Impostazioni SEO salvate");
      void qc.invalidateQueries({ queryKey: ["admin", "platform-settings-seo"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Local form state
  const [brandingForm, setBrandingForm] = useState<PlatformSettings>({});
  const [seoForm, setSeoForm] = useState<PlatformSettings>({});

  const brandingValues = { ...settings, ...brandingForm };
  const seoValues = { ...seoSettings, ...seoForm };

  if (isLoading || seoLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4" />
            Identità Visiva
          </CardTitle>
          <CardDescription>Nome app, logo e colori della piattaforma</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome Applicazione</Label>
              <Input
                value={brandingValues.app_name ?? ""}
                onChange={(e) => setBrandingForm((p) => ({ ...p, app_name: e.target.value }))}
                placeholder="Edilizia in Cloud"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email Supporto</Label>
              <Input
                type="email"
                value={brandingValues.support_email ?? ""}
                onChange={(e) =>
                  setBrandingForm((p) => ({ ...p, support_email: e.target.value }))
                }
                placeholder="supporto@example.com"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>URL Logo</Label>
              <div className="flex gap-2">
                <Input
                  value={brandingValues.app_logo_url ?? ""}
                  onChange={(e) =>
                    setBrandingForm((p) => ({ ...p, app_logo_url: e.target.value }))
                  }
                  placeholder="https://cdn.example.com/logo.png"
                />
                {brandingValues.app_logo_url && (
                  <img
                    src={brandingValues.app_logo_url}
                    alt="Logo preview"
                    className="h-9 w-9 rounded border object-contain"
                    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  />
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>URL Favicon</Label>
              <div className="flex gap-2">
                <Input
                  value={brandingValues.favicon_url ?? ""}
                  onChange={(e) =>
                    setBrandingForm((p) => ({ ...p, favicon_url: e.target.value }))
                  }
                  placeholder="https://cdn.example.com/favicon.ico"
                />
                {brandingValues.favicon_url && (
                  <img
                    src={brandingValues.favicon_url}
                    alt="Favicon preview"
                    className="h-9 w-9 rounded border object-contain"
                    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Colore Primario</Label>
              <div className="flex gap-2 items-center">
                <Input
                  value={brandingValues.primary_color ?? ""}
                  onChange={(e) =>
                    setBrandingForm((p) => ({ ...p, primary_color: e.target.value }))
                  }
                  placeholder="#3B82F6"
                  className="font-mono"
                />
                <input
                  type="color"
                  value={brandingValues.primary_color || "#3B82F6"}
                  onChange={(e) =>
                    setBrandingForm((p) => ({ ...p, primary_color: e.target.value }))
                  }
                  className="h-9 w-9 rounded border cursor-pointer p-0.5"
                />
                <ColorSwatch color={brandingValues.primary_color ?? "#e5e7eb"} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Colore Secondario</Label>
              <div className="flex gap-2 items-center">
                <Input
                  value={brandingValues.secondary_color ?? ""}
                  onChange={(e) =>
                    setBrandingForm((p) => ({ ...p, secondary_color: e.target.value }))
                  }
                  placeholder="#10B981"
                  className="font-mono"
                />
                <input
                  type="color"
                  value={brandingValues.secondary_color || "#10B981"}
                  onChange={(e) =>
                    setBrandingForm((p) => ({ ...p, secondary_color: e.target.value }))
                  }
                  className="h-9 w-9 rounded border cursor-pointer p-0.5"
                />
                <ColorSwatch color={brandingValues.secondary_color ?? "#e5e7eb"} />
              </div>
            </div>
          </div>

          <Button
            onClick={() => {
              const changed: Record<string, string> = {};
              for (const [k, v] of Object.entries(brandingForm)) {
                if (v !== undefined) changed[k] = v;
              }
              if (Object.keys(changed).length === 0) return;
              saveMutation.mutate(changed);
              setBrandingForm({});
            }}
            disabled={saveMutation.isPending || Object.keys(brandingForm).length === 0}
          >
            {saveMutation.isPending ? "Salvataggio..." : "Salva Branding"}
          </Button>
        </CardContent>
      </Card>

      {/* SEO */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" />
            SEO & Metadati
          </CardTitle>
          <CardDescription>
            Configura come la piattaforma appare sui motori di ricerca
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Titolo SEO</Label>
            <Input
              value={seoValues.seo_title ?? ""}
              onChange={(e) => setSeoForm((p) => ({ ...p, seo_title: e.target.value }))}
              placeholder="Edilizia in Cloud — Gestionale per PMI"
              maxLength={70}
            />
            <p className="text-xs text-muted-foreground text-right">
              {(seoValues.seo_title ?? "").length}/70 caratteri
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Descrizione SEO</Label>
            <Input
              value={seoValues.seo_description ?? ""}
              onChange={(e) =>
                setSeoForm((p) => ({ ...p, seo_description: e.target.value }))
              }
              placeholder="Il gestionale SaaS per le PMI del settore edilizia"
              maxLength={160}
            />
            <p className="text-xs text-muted-foreground text-right">
              {(seoValues.seo_description ?? "").length}/160 caratteri
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Parole chiave (separate da virgola)</Label>
            <Input
              value={seoValues.seo_keywords ?? ""}
              onChange={(e) => setSeoForm((p) => ({ ...p, seo_keywords: e.target.value }))}
              placeholder="edilizia, gestionale, PMI, cantieri, fatturazione"
            />
          </div>

          {/* SEO Preview */}
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Anteprima Google
            </p>
            <SEOPreview
              title={seoValues.seo_title ?? seoValues.app_name ?? ""}
              description={seoValues.seo_description ?? ""}
              url="https://app.ediliziancloud.it"
            />
          </div>

          <Button
            onClick={() => {
              const changed: Record<string, string> = {};
              for (const [k, v] of Object.entries(seoForm)) {
                if (v !== undefined) changed[k] = v;
              }
              if (Object.keys(changed).length === 0) return;
              saveSeoMutation.mutate(changed);
              setSeoForm({});
            }}
            disabled={saveSeoMutation.isPending || Object.keys(seoForm).length === 0}
          >
            {saveSeoMutation.isPending ? "Salvataggio..." : "Salva SEO"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
