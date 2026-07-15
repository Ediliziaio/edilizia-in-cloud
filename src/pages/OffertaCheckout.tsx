/**
 * OffertaCheckout — pagina PUBBLICA di checkout per le offerte in trattativa.
 *
 * URL: /offerta/:slug (es. /offerta/clienti-marketing)
 * Il prospect vede i dettagli del piano, compila i suoi dati, e viene reindirizzato
 * a Stripe Checkout (carta inserita solo sulla pagina sicura di Stripe).
 * L'account viene creato dall'edge `public-checkout`; il piano si attiva al pagamento
 * via `stripe-webhook`.
 */
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, Loader2, ShieldCheck, Lock, AlertCircle, Zap, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import logoEic from "@/assets/edilizia-in-cloud-logo-small.webp";

interface OfferConfig {
  planSlug: string;
  name: string;
  tagline: string;
  priceMonthly: number;
  compareAt?: number;
  features: string[];
}

// Config di presentazione delle offerte. La chiave è lo slug in URL.
const OFFERS: Record<string, OfferConfig> = {
  "clienti-marketing": {
    planSlug: "offerta-clienti-marketing",
    name: "Piano Pro",
    tagline: "Il gestionale completo per imprese edili strutturate — a un prezzo dedicato.",
    priceMonthly: 127,
    compareAt: 247,
    features: [
      "Commesse illimitate + SAL + marginalità",
      "Giornale dei Lavori + ODA fornitori + Sicurezza D.Lgs 81",
      "Subappalti + Gantt multi-cantiere + Ritenute di garanzia",
      "Preventivi e Fatture personalizzabili (SDI, DDT, note credito)",
      "Scadenzario + Tesoreria + Registro IVA + Banca PSD2",
      "CRM illimitato + Pipeline + Automazioni (Flow Builder)",
      "Email marketing 5.000/mese + WhatsApp + SMS + Lead Ads",
      "Computo Metrico AI + Render AI + HR completo con cedolini",
      "Magazzino con barcode + Timbrature GPS + Portale cliente",
      "Onboarding dedicato + call mensile con consulente EiC",
    ],
  },
};
// Alias: il cancel_url di Stripe torna su /offerta/<plan-slug>.
OFFERS["offerta-clienti-marketing"] = OFFERS["clienti-marketing"];

const SECTORS = [
  { value: "serramenti", label: "Serramenti / Infissi" },
  { value: "bagni", label: "Bagni" },
  { value: "tetti", label: "Tetti" },
  { value: "fotovoltaico", label: "Fotovoltaico" },
  { value: "pittura", label: "Pittura / Cartongesso" },
  { value: "ristrutturazioni", label: "Ristrutturazioni" },
  { value: "altro", label: "Altro" },
];

const fmtEur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(n);

export default function OffertaCheckout() {
  const { slug = "" } = useParams();
  const config = OFFERS[slug];

  const [form, setForm] = useState({
    company_name: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    sector: "altro",
    password: "",
  });
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <div className="text-center max-w-md">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Offerta non trovata</h1>
          <p className="text-sm text-muted-foreground mt-1">Il link potrebbe essere errato o scaduto. Contatta il tuo referente Edilizia in Cloud.</p>
        </div>
      </div>
    );
  }

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!form.company_name.trim()) return toast.error("Inserisci il nome dell'azienda");
    if (!form.first_name.trim()) return toast.error("Inserisci il tuo nome");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return toast.error("Email non valida");
    if (form.password.length < 8) return toast.error("La password deve avere almeno 8 caratteri");
    if (!accepted) return toast.error("Accetta i termini per procedere");

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ url?: string; error?: string; code?: string }>(
        "public-checkout",
        {
          body: {
            plan_slug: config.planSlug,
            company_name: form.company_name.trim(),
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            email: form.email.trim().toLowerCase(),
            phone: form.phone.trim(),
            sector: form.sector,
            password: form.password,
          },
        },
      );
      // Le edge non-2xx arrivano come `error` (FunctionsHttpError): prova a leggere il messaggio.
      const payloadErr = (data as any)?.error;
      if (error && !payloadErr) {
        // Prova a estrarre il messaggio dal corpo della risposta di errore.
        let msg = "Si è verificato un problema. Riprova.";
        try {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.json === "function") {
            const b = await ctx.json();
            if (b?.error) msg = b.error;
          }
        } catch { /* usa il messaggio di default */ }
        toast.error(msg);
        setLoading(false);
        return;
      }
      if (payloadErr) {
        toast.error(payloadErr);
        setLoading(false);
        return;
      }
      if (data?.url) {
        // Redirect alla pagina di pagamento sicura di Stripe.
        window.location.href = data.url;
        return;
      }
      toast.error("Impossibile avviare il pagamento. Riprova.");
      setLoading(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Errore imprevisto. Riprova.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/40 to-background">
      <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
        {/* Header brand — logo ufficiale */}
        <div className="mb-8">
          <img src={logoEic} alt="Edilizia in Cloud" width={160} height={40} className="h-9 w-auto" />
        </div>

        <div className="grid gap-6 md:grid-cols-[1.1fr_1fr] md:gap-8 items-start">
          {/* ── Colonna sinistra: dettagli piano ── */}
          <div className="relative overflow-hidden rounded-2xl border bg-card p-6 md:p-8 shadow-sm">
            {/* Barra accento arancione brand */}
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-eic-orange to-eic-orange-soft" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-eic-orange/10 text-eic-orange text-xs font-semibold px-2.5 py-1">
              <BadgeCheck className="h-3.5 w-3.5" /> Offerta riservata
            </span>
            <h1 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight">{config.name}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{config.tagline}</p>

            <div className="mt-5 flex items-end gap-2">
              <span className="text-5xl font-extrabold leading-none text-eic-orange">{fmtEur(config.priceMonthly)}</span>
              <span className="text-sm text-muted-foreground mb-1.5">/ mese</span>
              {config.compareAt && (
                <span className="mb-1.5 ml-1 text-sm text-muted-foreground line-through">{fmtEur(config.compareAt)}</span>
              )}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {config.compareAt && (
                <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-semibold px-2 py-0.5">
                  Risparmi {fmtEur(config.compareAt - config.priceMonthly)}/mese
                </span>
              )}
              <span className="text-xs text-muted-foreground">IVA esclusa · disdici quando vuoi</span>
            </div>

            <div className="my-5 h-px bg-border" />

            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">Tutto incluso</p>
            <ul className="space-y-2.5">
              {config.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm">
                  <Check className="h-4 w-4 mt-0.5 shrink-0 text-eic-orange" strokeWidth={3} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-eic-orange" /> Attivazione immediata</span>
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-eic-orange" /> Nessun vincolo</span>
            </div>
          </div>

          {/* ── Colonna destra: form ── */}
          <form onSubmit={handleSubmit} className="rounded-2xl border bg-card p-6 md:p-8 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Crea il tuo account</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Un minuto e sei operativo. Il pagamento è sulla pagina sicura di Stripe.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company_name">Nome azienda *</Label>
              <Input id="company_name" value={form.company_name} onChange={(e) => set("company_name")(e.target.value)} placeholder="Es. Rossi Costruzioni S.r.l." autoComplete="organization" required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">Nome *</Label>
                <Input id="first_name" value={form.first_name} onChange={(e) => set("first_name")(e.target.value)} autoComplete="given-name" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Cognome</Label>
                <Input id="last_name" value={form.last_name} onChange={(e) => set("last_name")(e.target.value)} autoComplete="family-name" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} autoComplete="email" inputMode="email" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefono</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={(e) => set("phone")(e.target.value)} autoComplete="tel" inputMode="tel" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sector">Settore</Label>
              <Select value={form.sector} onValueChange={set("sector")}>
                <SelectTrigger id="sector"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SECTORS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password *</Label>
              <Input id="password" type="password" value={form.password} onChange={(e) => set("password")(e.target.value)} autoComplete="new-password" placeholder="Almeno 8 caratteri" required />
            </div>

            <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" />
              <span>
                Accetto i <Link to="/termini" target="_blank" className="underline hover:text-foreground">Termini di Servizio</Link> e la{" "}
                <Link to="/privacy-policy" target="_blank" className="underline hover:text-foreground">Privacy Policy</Link>.
              </span>
            </label>

            <Button type="submit" className="w-full h-11 text-base bg-eic-orange hover:bg-eic-orange/90 text-white shadow-sm" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
              Vai al pagamento · {fmtEur(config.priceMonthly)}/mese
            </Button>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Pagamento sicuro con Stripe · nessun dato carta salvato da noi
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              Hai già un account? <Link to="/login" className="underline hover:text-foreground">Accedi</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
