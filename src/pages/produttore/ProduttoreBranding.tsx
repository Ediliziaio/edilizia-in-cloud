import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Palette, Globe, Image as ImageIcon, Loader2, Save, ShieldCheck, AlertTriangle, Info, Building2,
  Link2, RefreshCw, Trash2, Copy,
} from "lucide-react";

const DEFAULT_HEX = "#1e293b";

/** "#rrggbb" → "H S% L%" (formato triplet usato dalle CSS variables dell'app). */
function hexToHslTriplet(hex: string): string {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return "222 47% 11%";
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lig = (max + min) / 2;
  let hue = 0;
  let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = lig > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      default: hue = (r - g) / d + 4; break;
    }
    hue /= 6;
  }
  return `${Math.round(hue * 360)} ${Math.round(sat * 100)}% ${Math.round(lig * 100)}%`;
}

/** "H S% L%" → "#rrggbb" (per inizializzare l'input color). */
function hslTripletToHex(triplet: string): string {
  const m = triplet.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!m) return DEFAULT_HEX;
  const h = parseFloat(m[1]) / 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (s === 0) {
    r = l;
    g = l;
    b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function copyText(text: string, label: string) {
  navigator.clipboard?.writeText(text).then(
    () => toast.success(`${label} copiato`),
    () => toast.error("Copia non riuscita"),
  );
}

interface BrandingRow {
  company_id: string;
  logo_url: string | null;
  primary_color: string | null;
  custom_domain: string | null;
  custom_domain_cname: string | null;
  custom_domain_verified: boolean;
  is_active: boolean;
  whitelabel_tier: string;
}

/**
 * Brand & dominio del PRODUTTORE — il white-label che i suoi rivenditori
 * erediteranno (create-reseller copia company_branding). Niente "Edilizia in
 * Cloud" per i rivenditori: vedono logo, colore e dominio impostati qui.
 */
export default function ProduttoreBranding() {
  const { profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id ?? null;

  const { data: branding, isLoading } = useQuery({
    queryKey: ["produttore-branding", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<BrandingRow | null> => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("company_branding")
        .select("company_id, logo_url, primary_color, custom_domain, custom_domain_cname, custom_domain_verified, is_active, whitelabel_tier")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as BrandingRow | null) ?? null;
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-9 w-64" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Palette className="h-6 w-6" /> Brand &amp; dominio
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Il marchio bianco dei tuoi rivenditori. Logo, colore e dominio impostati qui vengono
            ereditati da ogni rivenditore che crei.
          </p>
        </div>
        {branding?.whitelabel_tier && (
          <Badge variant="outline" className="shrink-0 gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> Tier {branding.whitelabel_tier}
          </Badge>
        )}
      </div>

      <div className="mb-5 flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Questo è il brand che i tuoi rivenditori vedranno al posto di &ldquo;Edilizia in Cloud&rdquo;.
          Le modifiche al logo/colore valgono per i <strong>nuovi</strong> rivenditori; quelli esistenti
          mantengono la copia già ricevuta finché non la re-sincronizzi.
        </span>
      </div>

      <div className="space-y-4">
        {/* key={companyId}: rimonta l'editor (re-inizializza lo stato dai dati) se cambia
            azienda → niente setState-in-effect per idratare il form. */}
        <BrandingEditor key={companyId ?? "none"} companyId={companyId} initial={branding ?? null} />
        <DomainCard companyId={companyId} branding={branding ?? null} />
      </div>
    </div>
  );
}

/** Logo, colore e attivazione white-label (campi idratati una volta al mount via key). */
function BrandingEditor({ companyId, initial }: { companyId: string | null; initial: BrandingRow | null }) {
  const qc = useQueryClient();
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url ?? "");
  const [hex, setHex] = useState(initial?.primary_color ? hslTripletToHex(initial.primary_color) : DEFAULT_HEX);
  const [active, setActive] = useState(initial?.is_active ?? false);

  const save = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non trovata");
      // NB: il dominio NON è qui — ha un suo flusso (provision/verify) in DomainCard.
      const { error } = await supabase.from("company_branding").upsert(
        {
          company_id: companyId,
          logo_url: logoUrl.trim() || null,
          primary_color: hexToHslTriplet(hex),
          is_active: active,
        },
        { onConflict: "company_id" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Brand aggiornato", {
        description: "I tuoi rivenditori erediteranno automaticamente questo brand.",
      });
      qc.invalidateQueries({ queryKey: ["produttore-branding", companyId] });
    },
    onError: (e) => toast.error("Salvataggio fallito", { description: (e as Error).message }),
  });

  return (
    <>
      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4" /> Logo
          </CardTitle>
          <CardDescription>URL dell&apos;immagine del logo (PNG/SVG su sfondo trasparente consigliato).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {logoUrl.trim() ? (
                <img
                  src={logoUrl.trim()}
                  alt="Anteprima logo"
                  className="max-h-full max-w-full object-contain"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.2"; }}
                />
              ) : (
                <Building2 className="h-6 w-6 text-muted-foreground opacity-40" />
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="logo">URL logo</Label>
              <Input
                id="logo"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://.../logo.png"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Colore */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4" /> Colore primario
          </CardTitle>
          <CardDescription>Il colore principale dell&apos;interfaccia dei tuoi rivenditori.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <input
              aria-label="Scegli colore primario"
              type="color"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              className="h-12 w-12 shrink-0 cursor-pointer rounded-lg border bg-transparent p-0.5"
            />
            <div className="space-y-1.5">
              <Label htmlFor="hex">Colore (HEX)</Label>
              <Input
                id="hex"
                value={hex}
                onChange={(e) => setHex(e.target.value)}
                className="w-40 font-mono"
                placeholder="#1e293b"
              />
              <p className="text-xs text-muted-foreground">HSL salvato: <code>{hexToHslTriplet(hex)}</code></p>
            </div>
            <div className="ml-auto hidden flex-col items-center gap-1 sm:flex">
              <div className="h-12 w-24 rounded-lg border" style={{ backgroundColor: hex }} />
              <span className="text-xs text-muted-foreground">Anteprima</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* White-label attivo */}
      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="font-medium">White-label attivo</p>
            <p className="text-sm text-muted-foreground">
              Se disattivato, i rivenditori vedono il branding di default invece del tuo.
            </p>
          </div>
          <Switch checked={active} onCheckedChange={setActive} aria-label="White-label attivo" />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salva brand
        </Button>
      </div>
    </>
  );
}

/**
 * Dominio personalizzato — flusso reale: provision (Cloudflare) → record CNAME →
 * verify (DNS) → SSL automatico. Stato derivato dai dati branding (no effect).
 */
function DomainCard({ companyId, branding }: { companyId: string | null; branding: BrandingRow | null }) {
  const qc = useQueryClient();
  const [domainInput, setDomainInput] = useState("");

  const currentDomain = branding?.custom_domain ?? null;
  const cname = branding?.custom_domain_cname ?? null;
  const verified = !!branding?.custom_domain_verified;
  const refresh = () => qc.invalidateQueries({ queryKey: ["produttore-branding", companyId] });

  const provision = useMutation({
    mutationFn: async () => {
      const domain = domainInput.trim().toLowerCase();
      if (!domain || !domain.includes(".")) throw new Error("Inserisci un dominio valido (es. app.tuobrand.it)");
      const { data, error } = await supabase.functions.invoke("provision-custom-domain", {
        body: { company_id: companyId, custom_domain: domain },
      });
      if (error) throw new Error(error.message ?? "Errore durante il collegamento");
      const r = data as { success?: boolean; error?: string } | null;
      if (r && r.success === false) throw new Error(r.error ?? "Collegamento fallito");
    },
    onSuccess: () => {
      toast.success("Dominio collegato", { description: "Ora aggiungi il record CNAME indicato sotto." });
      setDomainInput("");
      refresh();
    },
    onError: (e) => toast.error("Collegamento fallito", { description: (e as Error).message }),
  });

  const verify = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("verify-custom-domain", {
        body: { company_id: companyId },
      });
      if (error) throw new Error(error.message ?? "Errore durante la verifica");
      const r = data as { verified?: boolean; error?: string } | null;
      if (!r?.verified) throw new Error(r?.error ?? "DNS non ancora propagato. Riprova tra qualche minuto.");
    },
    onSuccess: () => {
      toast.success("Dominio verificato", { description: "Il certificato SSL viene emesso automaticamente." });
      refresh();
    },
    onError: (e) => toast.error("Verifica non riuscita", { description: (e as Error).message }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("remove-custom-domain", {
        body: { company_id: companyId },
      });
      if (error) throw new Error(error.message ?? "Errore durante la rimozione");
      const r = data as { success?: boolean; error?: string } | null;
      if (r && r.success === false) throw new Error(r.error ?? "Rimozione fallita");
    },
    onSuccess: () => {
      toast.success("Dominio rimosso");
      refresh();
    },
    onError: (e) => toast.error("Rimozione fallita", { description: (e as Error).message }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4" /> Dominio personalizzato
        </CardTitle>
        <CardDescription>
          Il dominio su cui tu e i tuoi rivenditori accederete (es. app.tuobrand.it), con SSL automatico.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!currentDomain ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="domain">Dominio (consigliato un sottodominio)</Label>
              <Input
                id="domain"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="app.tuobrand.it"
                className="font-mono"
                onKeyDown={(e) => { if (e.key === "Enter" && !provision.isPending) provision.mutate(); }}
              />
            </div>
            <Button onClick={() => provision.mutate()} disabled={provision.isPending} className="gap-1.5">
              {provision.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Collega dominio
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-muted px-2 py-1 text-sm font-medium">{currentDomain}</code>
              {verified ? (
                <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
                  <ShieldCheck className="h-3.5 w-3.5" /> Verificato · SSL attivo
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> In attesa del DNS
                </Badge>
              )}
            </div>

            {!verified && cname && (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-medium text-amber-900">Aggiungi questo record DNS dal pannello del tuo provider:</p>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-amber-900">
                  <span className="text-amber-700">Tipo</span>
                  <code className="font-mono">CNAME</code>
                  <span className="text-amber-700">Nome / Host</span>
                  <button type="button" onClick={() => copyText(currentDomain, "Nome")} className="flex items-center gap-1.5 text-left font-mono hover:underline">
                    {currentDomain} <Copy className="h-3 w-3 opacity-60" />
                  </button>
                  <span className="text-amber-700">Valore / Target</span>
                  <button type="button" onClick={() => copyText(cname, "Valore")} className="flex items-center gap-1.5 text-left font-mono hover:underline">
                    {cname} <Copy className="h-3 w-3 opacity-60" />
                  </button>
                </div>
                <p className="text-xs text-amber-700">La propagazione DNS può richiedere da pochi minuti fino a 24 ore.</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {!verified && (
                <Button onClick={() => verify.mutate()} disabled={verify.isPending} className="gap-1.5">
                  {verify.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Verifica DNS
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => remove.mutate()}
                disabled={remove.isPending}
                className="gap-1.5 text-destructive hover:text-destructive"
              >
                {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Rimuovi dominio
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
