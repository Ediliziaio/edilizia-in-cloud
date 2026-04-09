/**
 * TabWhiteLabel — SuperAdmin tab per gestire il tier white-label
 * e visualizzare/modificare le impostazioni branding di un'azienda.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2, Palette, Globe, Crown, Eye, Shield, Clock } from "lucide-react";

interface Props {
  companyId: string;
}

const TIER_COLORS: Record<string, string> = {
  none: "bg-gray-100 text-gray-700",
  basic: "bg-blue-100 text-blue-700",
  full: "bg-purple-100 text-purple-700",
  agency: "bg-amber-100 text-amber-700",
};

const TIER_LABELS: Record<string, string> = {
  none: "Nessuno",
  basic: "Basic",
  full: "Full",
  agency: "Agency",
};

export function TabWhiteLabel({ companyId }: Props) {
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);

  // Fetch branding data
  const { data: branding, isLoading } = useQuery({
    queryKey: ["admin", "whitelabel", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_branding")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch tier capabilities
  const { data: tiers } = useQuery({
    queryKey: ["whitelabel-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whitelabel_tiers")
        .select("*")
        .order("price_monthly");
      if (error) throw error;
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });

  // Fetch audit log
  const { data: auditLog } = useQuery({
    queryKey: ["admin", "whitelabel-audit", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whitelabel_audit_log")
        .select("*, actor:profiles!whitelabel_audit_log_actor_id_fkey(first_name, last_name, email)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  // Form state
  const [form, setForm] = useState({
    whitelabel_tier: "none",
    platform_name: "",
    primary_color: "",
    secondary_color: "",
    accent_color: "",
    custom_domain: "",
    custom_domain_verified: false,
    hide_platform_branding: false,
    powered_by_text: "",
    custom_css: "",
    email_from_name: "",
    pwa_name: "",
    pwa_short_name: "",
    pwa_theme_color: "",
  });

  useEffect(() => {
    if (branding) {
      setForm({
        whitelabel_tier: (branding as any).whitelabel_tier || "none",
        platform_name: (branding as any).platform_name || "",
        primary_color: (branding as any).primary_color || "",
        secondary_color: (branding as any).secondary_color || "",
        accent_color: (branding as any).accent_color || "",
        custom_domain: (branding as any).custom_domain || "",
        custom_domain_verified: (branding as any).custom_domain_verified || false,
        hide_platform_branding: (branding as any).hide_platform_branding || false,
        powered_by_text: (branding as any).powered_by_text || "",
        custom_css: (branding as any).custom_css || "",
        email_from_name: (branding as any).email_from_name || "",
        pwa_name: (branding as any).pwa_name || "",
        pwa_short_name: (branding as any).pwa_short_name || "",
        pwa_theme_color: (branding as any).pwa_theme_color || "",
      });
    }
  }, [branding]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = {
        whitelabel_tier: form.whitelabel_tier,
        platform_name: form.platform_name || null,
        primary_color: form.primary_color || null,
        secondary_color: form.secondary_color || null,
        accent_color: form.accent_color || null,
        hide_platform_branding: form.hide_platform_branding,
        powered_by_text: form.powered_by_text || null,
        custom_css: form.custom_css || null,
        email_from_name: form.email_from_name || null,
        pwa_name: form.pwa_name || null,
        pwa_short_name: form.pwa_short_name || null,
        pwa_theme_color: form.pwa_theme_color || null,
        updated_at: new Date().toISOString(),
      };

      if (branding) {
        const { error } = await supabase
          .from("company_branding")
          .update(updates as never)
          .eq("company_id", companyId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_branding")
          .insert({ ...updates, company_id: companyId } as never);
        if (error) throw error;
      }

      // Audit log
      await supabase.from("whitelabel_audit_log").insert({
        company_id: companyId,
        action: "tier_changed",
        new_value: { tier: form.whitelabel_tier },
      } as never);
    },
    onSuccess: () => {
      toast.success("Impostazioni white-label salvate");
      queryClient.invalidateQueries({ queryKey: ["admin", "whitelabel", companyId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "whitelabel-audit", companyId] });
      setEditMode(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Errore nel salvataggio");
    },
  });

  const currentTier = tiers?.find(t => (t as any).slug === form.whitelabel_tier);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tier Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            Piano White-Label
          </CardTitle>
          <CardDescription>
            Gestisci il livello di personalizzazione disponibile per questa azienda.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Label className="min-w-24">Tier attuale</Label>
            <Badge className={TIER_COLORS[form.whitelabel_tier] || TIER_COLORS.none}>
              {TIER_LABELS[form.whitelabel_tier] || form.whitelabel_tier}
            </Badge>
            {!editMode && (
              <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                Modifica
              </Button>
            )}
          </div>

          {editMode && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {tiers?.map((tier: any) => (
                  <button
                    key={tier.slug}
                    onClick={() => setForm(f => ({ ...f, whitelabel_tier: tier.slug }))}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      form.whitelabel_tier === tier.slug
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="font-semibold text-sm">{TIER_LABELS[tier.slug] || tier.slug}</div>
                    <div className="text-xs text-muted-foreground mt-1">€{tier.price_monthly}/mese</div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tier.can_change_logo && <Badge variant="outline" className="text-[10px]">Logo</Badge>}
                      {tier.can_change_colors && <Badge variant="outline" className="text-[10px]">Colori</Badge>}
                      {tier.can_custom_domain && <Badge variant="outline" className="text-[10px]">Dominio</Badge>}
                      {tier.can_hide_powered_by && <Badge variant="outline" className="text-[10px]">No badge</Badge>}
                      {tier.can_resell && <Badge variant="outline" className="text-[10px]">Resell</Badge>}
                    </div>
                  </button>
                ))}
              </div>

              <Separator />

              {/* Branding Fields */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Palette className="h-4 w-4" /> Branding Override
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Nome piattaforma</Label>
                    <Input
                      value={form.platform_name}
                      onChange={e => setForm(f => ({ ...f, platform_name: e.target.value }))}
                      placeholder="Es. GestEdil Pro"
                    />
                  </div>
                  <div>
                    <Label>Email from name</Label>
                    <Input
                      value={form.email_from_name}
                      onChange={e => setForm(f => ({ ...f, email_from_name: e.target.value }))}
                      placeholder="Es. GestEdil"
                    />
                  </div>
                  <div>
                    <Label>Colore primario</Label>
                    <div className="flex gap-2">
                      <Input
                        value={form.primary_color}
                        onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))}
                        placeholder="#1E40AF"
                      />
                      {form.primary_color && (
                        <div className="w-10 h-10 rounded border" style={{ backgroundColor: form.primary_color }} />
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>Colore secondario</Label>
                    <Input
                      value={form.secondary_color}
                      onChange={e => setForm(f => ({ ...f, secondary_color: e.target.value }))}
                      placeholder="#3B82F6"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>PWA Name</Label>
                    <Input
                      value={form.pwa_name}
                      onChange={e => setForm(f => ({ ...f, pwa_name: e.target.value }))}
                      placeholder="Area Campo"
                    />
                  </div>
                  <div>
                    <Label>PWA Short Name</Label>
                    <Input
                      value={form.pwa_short_name}
                      onChange={e => setForm(f => ({ ...f, pwa_short_name: e.target.value }))}
                      placeholder="Campo"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.hide_platform_branding}
                    onCheckedChange={v => setForm(f => ({ ...f, hide_platform_branding: v }))}
                  />
                  <Label>Nascondi "Powered by" badge</Label>
                </div>

                {!form.hide_platform_branding && (
                  <div>
                    <Label>Testo "Powered by" personalizzato</Label>
                    <Input
                      value={form.powered_by_text}
                      onChange={e => setForm(f => ({ ...f, powered_by_text: e.target.value }))}
                      placeholder="Powered by EdiliziaInCloud"
                    />
                  </div>
                )}
              </div>

              <Separator />

              {/* Custom Domain Status */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Custom Domain
                </h4>
                {form.custom_domain ? (
                  <div className="flex items-center gap-3">
                    <code className="text-sm bg-muted px-2 py-1 rounded">{form.custom_domain}</code>
                    <Badge variant={form.custom_domain_verified ? "default" : "secondary"}>
                      {form.custom_domain_verified ? "✓ Verificato" : "⏳ In attesa DNS"}
                    </Badge>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nessun dominio personalizzato configurato.</p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Salva modifiche
                </Button>
                <Button variant="outline" onClick={() => setEditMode(false)}>
                  Annulla
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tier Capabilities Overview */}
      {currentTier && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" /> Funzionalità incluse nel piano {TIER_LABELS[form.whitelabel_tier]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
              {[
                [(currentTier as any).can_change_logo, "Cambio logo"],
                [(currentTier as any).can_change_colors, "Cambio colori"],
                [(currentTier as any).can_custom_domain, "Dominio custom"],
                [(currentTier as any).can_hide_powered_by, "Nascondi badge"],
                [(currentTier as any).can_custom_email_branding, "Email branded"],
                [(currentTier as any).can_custom_pdf_branding, "PDF branded"],
                [(currentTier as any).can_custom_pwa, "PWA branded"],
                [(currentTier as any).can_custom_css, "CSS custom"],
                [(currentTier as any).can_resell, "Rivendita"],
              ].map(([enabled, label]) => (
                <div key={label as string} className="flex items-center gap-2">
                  <span className={enabled ? "text-green-600" : "text-muted-foreground/40"}>
                    {enabled ? "✓" : "✗"}
                  </span>
                  <span className={enabled ? "" : "text-muted-foreground/60"}>{label as string}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit Log */}
      {auditLog && auditLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Audit Log White-Label
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {auditLog.map((entry: any) => (
                <div key={entry.id} className="flex items-center gap-3 text-sm py-1.5 border-b last:border-0">
                  <Badge variant="outline" className="text-[10px] shrink-0">{entry.action}</Badge>
                  <span className="text-muted-foreground">
                    {(entry.actor as any)?.first_name} {(entry.actor as any)?.last_name}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {new Date(entry.created_at).toLocaleDateString("it-IT", {
                      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
