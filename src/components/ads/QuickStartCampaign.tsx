/**
 * QuickStartCampaign — il flusso "60 secondi → campagna pronta".
 *
 * Single page (NO wizard 5-step). L'utente:
 *   1. Scrive UN brief libero in italiano ("Voglio lead per bagni a Milano, 30€/giorno")
 *   2. Click "Genera" → AI compila TUTTO in ~3s (zone, interests, copy, budget, età, CTA)
 *   3. Vede preview live: ad mockup + audience meter + performance forecast
 *   4. Click "Salva bozza" → campagna salvata in PAUSED, pronta per revisione
 *
 * Pensata per chi NON sa fare ads. Esempi cliccabili per spunto.
 * Smart defaults da company profile (city, settore).
 *
 * Bypass del wizard 5-step quando l'utente vuole velocità.
 * Comunque l'utente può poi rifinire in modalità avanzata cliccando
 * "Personalizza prima di salvare" che apre il wizard pieno.
 */

import { useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Eye,
  Facebook,
  Instagram,
  Loader2,
  MapPin,
  Megaphone,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ParsedBrief {
  name: string;
  objective: string;
  offer: string;
  dailyBudget: number;
  ageMin: number;
  ageMax: number;
  gender: "all" | "men" | "women";
  suggestedCities: string[];
  suggestedInterests: string[];
  copy: string;
  hooks: string[];
  cta: string;
  reasoning: string;
}

interface Props {
  companyId: string | undefined;
  companyName: string | undefined;
  companyCity?: string | null;
  onConfirm: (parsed: ParsedBrief) => void;
  /** Apri il wizard pieno con i campi precompilati */
  onCustomize: (parsed: ParsedBrief) => void;
  onCancel: () => void;
}

const EXAMPLE_BRIEFS = [
  {
    title: "Serramenti Milano",
    text: "Voglio nuovi clienti per la sostituzione infissi nella zona di Milano e provincia, budget 25€ al giorno, target famiglie con casa di proprietà sopra i 35 anni",
  },
  {
    title: "Bagni Brianza",
    text: "Lead per ristrutturazione bagno chiavi in mano in Brianza, raggio 30km da Monza, offerta sopralluogo gratuito + preventivo entro 48h",
  },
  {
    title: "Fotovoltaico Veneto",
    text: "Generare richieste preventivo impianto fotovoltaico residenziale in Veneto, target proprietari di casa indipendente con bolletta sopra 100€/mese",
  },
];

const CTA_LABEL: Record<string, string> = {
  GET_QUOTE: "Richiedi preventivo",
  LEARN_MORE: "Scopri di più",
  CONTACT_US: "Contattaci",
  MESSAGE_PAGE: "Scrivici",
  WHATSAPP_MESSAGE: "WhatsApp",
};

export function QuickStartCampaign({
  companyId,
  companyName,
  companyCity,
  onConfirm,
  onCustomize,
  onCancel,
}: Props) {
  const [brief, setBrief] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedBrief | null>(null);
  const [preview, setPreview] = useState<"facebook" | "instagram">("facebook");

  const placeholder = useMemo(() => {
    if (companyCity) {
      return `Es. Voglio nuovi clienti per [tuo servizio] a ${companyCity}, budget 25€/giorno, target [profilo cliente]`;
    }
    return "Es. Voglio lead per ristrutturazione bagni a Milano, budget 30€/giorno, target famiglie con casa di proprietà";
  }, [companyCity]);

  const handleParse = async () => {
    if (!companyId) {
      toast.error("Azienda non selezionata");
      return;
    }
    if (brief.trim().length < 10) {
      toast.error("Scrivi un brief più dettagliato (almeno 10 caratteri)");
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-ads-brief-parser", {
        body: { company_id: companyId, brief },
      });
      if (error) throw new Error(error.message);
      const result = (data as { result?: ParsedBrief } | null)?.result;
      if (!result) throw new Error("AI parsing fallito");
      setParsed(result);
      toast.success("Campagna generata!", {
        description: result.reasoning?.slice(0, 100),
      });
    } catch (e) {
      toast.error("Errore AI", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setParsing(false);
    }
  };

  // Audience size stima (semplice, basata su città + età)
  const audienceEstimate = useMemo(() => {
    if (!parsed) return null;
    const baseCity = 800_000; // popolazione media città IT
    const cityFactor = Math.max(1, parsed.suggestedCities.length);
    const ageFactor = Math.max(0.3, (parsed.ageMax - parsed.ageMin) / 47);
    const genderFactor = parsed.gender === "all" ? 1 : 0.55;
    const interestFactor = parsed.suggestedInterests.length > 0 ? 0.15 : 1;
    const lower = Math.round(baseCity * cityFactor * ageFactor * genderFactor * interestFactor * 0.6);
    const upper = Math.round(baseCity * cityFactor * ageFactor * genderFactor * interestFactor * 1.4);
    return { lower, upper };
  }, [parsed]);

  // Performance forecast (statistiche edilizia IT 2024-2025)
  const forecast = useMemo(() => {
    if (!parsed) return null;
    const dailyBudgetCents = parsed.dailyBudget * 100;
    // CPL medio edilizia IT con setup standard
    const cplCents = parsed.objective === "OUTCOME_LEADS" ? 1500 : 800;
    const leadsPerDay = dailyBudgetCents / cplCents;
    const leadsPerWeek = leadsPerDay * 7;
    const ctr = 1.4; // % medio Italia edilizia
    const impressionsPerDay = Math.round((dailyBudgetCents * 100) / 250); // ~CPM 25€
    return {
      leadsPerWeek: Math.round(leadsPerWeek),
      cplCents,
      impressionsPerDay,
      ctr,
    };
  }, [parsed]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      {/* HEADER */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-950">
            <Zap className="h-6 w-6 text-yellow-500" />
            Quick Start — campagna pronta in 60 secondi
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Scrivi cosa vuoi ottenere in italiano normale. L'AI prepara tutto: pubblico, copy, budget.
          </p>
        </div>
        <Button variant="ghost" onClick={onCancel}>Annulla</Button>
      </div>

      {/* BRIEF INPUT */}
      <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-5">
        <label className="mb-2 block text-sm font-semibold text-slate-950">
          📝 Descrivi la tua campagna
        </label>
        <Textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder={placeholder}
          className="min-h-28 bg-white text-base"
          disabled={parsing}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {companyName && <>📍 Azienda: <strong>{companyName}</strong>{companyCity && <> · {companyCity}</>}</>}
          </p>
          <Button
            size="lg"
            onClick={handleParse}
            disabled={parsing || brief.trim().length < 10}
            className="bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg hover:from-blue-700 hover:to-violet-700"
          >
            {parsing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI sta preparando…</>
            ) : (
              <><Sparkles className="mr-2 h-4 w-4" /> Genera campagna con AI</>
            )}
          </Button>
        </div>

        {/* EXAMPLES */}
        {!parsed && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-slate-600">💡 Esempi cliccabili:</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {EXAMPLE_BRIEFS.map((ex) => (
                <button
                  key={ex.title}
                  type="button"
                  onClick={() => setBrief(ex.text)}
                  className="rounded-lg border border-blue-200 bg-white p-3 text-left hover:bg-blue-50"
                >
                  <p className="text-xs font-semibold text-slate-950">{ex.title}</p>
                  <p className="mt-1 line-clamp-2 text-[10px] text-slate-500">{ex.text}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* RESULT — Preview compilato */}
      {parsed && (
        <>
          {/* AI Summary */}
          <Alert className="border-emerald-300 bg-emerald-50">
            <Bot className="h-4 w-4 text-emerald-700" />
            <AlertDescription className="text-sm">
              <strong>Logica AI:</strong> {parsed.reasoning}
            </AlertDescription>
          </Alert>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* LEFT: campi compilati */}
            <div className="space-y-3 lg:col-span-2">
              <SettingCard
                icon={<Megaphone className="h-4 w-4 text-blue-600" />}
                title="Nome campagna"
                value={parsed.name}
              />
              <SettingCard
                icon={<Target className="h-4 w-4 text-violet-600" />}
                title="Obiettivo"
                value={parsed.objective === "OUTCOME_LEADS" ? "🎯 Generare contatti" : parsed.objective}
                detail={`CTA: ${CTA_LABEL[parsed.cta] ?? parsed.cta}`}
              />
              <SettingCard
                icon={<MapPin className="h-4 w-4 text-emerald-600" />}
                title="Dove mostrare"
                value={`${parsed.suggestedCities.length} città`}
                detail={parsed.suggestedCities.join(" · ")}
              />
              <SettingCard
                icon={<Users className="h-4 w-4 text-amber-600" />}
                title="Pubblico"
                value={`${parsed.ageMin}–${parsed.ageMax} anni · ${parsed.gender === "all" ? "tutti" : parsed.gender === "men" ? "uomini" : "donne"}`}
                detail={`Interessi: ${parsed.suggestedInterests.slice(0, 3).join(", ")}${parsed.suggestedInterests.length > 3 ? ` +${parsed.suggestedInterests.length - 3}` : ""}`}
              />
              <SettingCard
                icon={<TrendingUp className="h-4 w-4 text-rose-600" />}
                title="Budget giornaliero"
                value={`${parsed.dailyBudget} €/giorno`}
                detail={`${parsed.dailyBudget * 30} €/mese stimato`}
              />

              <div className="rounded-xl border bg-white p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-fuchsia-600" />
                  <p className="text-sm font-semibold text-slate-950">Offerta principale</p>
                </div>
                <p className="text-sm text-slate-700">{parsed.offer}</p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-semibold text-slate-950">Testo dell'annuncio (copy)</p>
                </div>
                <p className="text-sm leading-relaxed text-slate-700">{parsed.copy}</p>
                {parsed.hooks.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-2">
                    <p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">Hook alternativi</p>
                    <ul className="space-y-1 text-xs text-slate-600">
                      {parsed.hooks.map((h, i) => <li key={i}>• {h}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Audience meter + Preview + Forecast */}
            <div className="space-y-3">
              {/* Audience size meter */}
              {audienceEstimate && (
                <div className="rounded-xl border bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-slate-500">Audience stimato</p>
                    <Users className="h-4 w-4 text-blue-600" />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-slate-950">
                    {formatN(audienceEstimate.lower)}–{formatN(audienceEstimate.upper)}
                  </p>
                  <p className="text-[11px] text-slate-500">persone raggiungibili</p>
                  <AudienceMeter value={audienceEstimate.upper} />
                </div>
              )}

              {/* Performance forecast */}
              {forecast && (
                <div className="rounded-xl border bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-slate-500">Previsione 7 giorni</p>
                    <TrendingUp className="h-4 w-4 text-emerald-600" />
                  </div>
                  <ul className="space-y-1.5 text-xs">
                    <li className="flex items-center justify-between">
                      <span className="text-slate-600">Lead attesi</span>
                      <strong className="text-slate-950">~{forecast.leadsPerWeek}</strong>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-slate-600">CPL stimato</span>
                      <strong className="text-slate-950">~{(forecast.cplCents / 100).toFixed(2)} €</strong>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-slate-600">Visualizzazioni/giorno</span>
                      <strong className="text-slate-950">~{formatN(forecast.impressionsPerDay)}</strong>
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="text-slate-600">CTR atteso</span>
                      <strong className="text-slate-950">{forecast.ctr}%</strong>
                    </li>
                  </ul>
                  <p className="mt-2 text-[10px] leading-snug text-slate-500">
                    Stime conservative basate su medie edilizia IT. Reali variano con qualità creativa e stagione.
                  </p>
                </div>
              )}

              {/* Ad preview */}
              <div className="rounded-xl border bg-white p-3">
                <div className="mb-2 flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5 text-slate-500" />
                  <p className="text-xs font-semibold text-slate-700">Anteprima ad</p>
                  <div className="ml-auto flex gap-1">
                    <button
                      onClick={() => setPreview("facebook")}
                      className={cn("rounded px-2 py-1 text-[10px]", preview === "facebook" ? "bg-blue-100 text-blue-700" : "text-slate-500")}
                    >
                      <Facebook className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => setPreview("instagram")}
                      className={cn("rounded px-2 py-1 text-[10px]", preview === "instagram" ? "bg-fuchsia-100 text-fuchsia-700" : "text-slate-500")}
                    >
                      <Instagram className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <AdPreview platform={preview} companyName={companyName} copy={parsed.copy} hook={parsed.hooks[0]} cta={CTA_LABEL[parsed.cta] ?? "Scopri"} />
              </div>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-emerald-200 bg-white p-4 shadow-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold text-slate-950">Pronta da rivedere</p>
                <p className="text-[11px] text-slate-500">
                  Salvi una bozza in PAUSED. Niente parte finché non clicchi "Pubblica" nel dettaglio.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onCustomize(parsed)}>
                Personalizza prima
              </Button>
              <Button onClick={() => onConfirm(parsed)} className="bg-emerald-600 text-white hover:bg-emerald-700">
                <Send className="mr-2 h-4 w-4" /> Salva bozza
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function SettingCard({
  icon,
  title,
  value,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-50">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase text-slate-500">{title}</p>
          <p className="text-sm font-semibold text-slate-950">{value}</p>
          {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
        </div>
      </div>
    </div>
  );
}

function AudienceMeter({ value }: { value: number }) {
  // Scala: <50k = troppo restretto, 50k-500k = bene, 500k-5M = molto largo, >5M = troppo
  const sweetSpot = value >= 50_000 && value <= 2_000_000;
  const tooSmall = value < 50_000;
  const tooBig = value > 5_000_000;
  const pct = Math.min(100, Math.max(5, Math.log10(Math.max(1, value)) * 14));
  return (
    <div className="mt-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "h-full transition-all",
            tooSmall ? "bg-amber-500" : tooBig ? "bg-rose-500" : "bg-emerald-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-[10px]">
        {tooSmall && <Badge variant="outline" className="border-amber-300 text-[9px] text-amber-700">Troppo restretto · Meta non imparerà bene</Badge>}
        {tooBig && <Badge variant="outline" className="border-rose-300 text-[9px] text-rose-700">Troppo largo · costi alti</Badge>}
        {sweetSpot && <Badge variant="outline" className="border-emerald-300 text-[9px] text-emerald-700">✓ Sweet spot</Badge>}
      </p>
    </div>
  );
}

function AdPreview({
  platform,
  companyName,
  copy,
  hook,
  cta,
}: {
  platform: "facebook" | "instagram";
  companyName: string | undefined;
  copy: string;
  hook?: string;
  cta: string;
}) {
  const pageName = companyName ?? "La Tua Azienda";
  if (platform === "facebook") {
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white text-xs">
        {/* Header */}
        <div className="flex items-center gap-2 p-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-500 text-[10px] font-bold text-white">
            {pageName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-slate-900">{pageName}</p>
            <p className="text-[9px] text-slate-500">Sponsorizzato · 🌐</p>
          </div>
        </div>
        {/* Copy text */}
        <div className="px-2 pb-2">
          {hook && <p className="mb-1 text-[11px] font-semibold text-slate-900">{hook}</p>}
          <p className="text-[10px] leading-snug text-slate-700 line-clamp-3">{copy}</p>
        </div>
        {/* Image placeholder */}
        <div className="aspect-video bg-gradient-to-br from-blue-100 via-violet-50 to-amber-50 flex items-center justify-center">
          <p className="text-[10px] text-slate-400">🖼️ Immagine annuncio</p>
        </div>
        {/* CTA bar */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-2">
          <div>
            <p className="text-[9px] uppercase text-slate-500">{pageName.slice(0, 12).toUpperCase()}.IT</p>
            <p className="text-[10px] font-semibold text-slate-900">Inizia ora</p>
          </div>
          <button className="rounded bg-slate-200 px-3 py-1 text-[10px] font-semibold text-slate-900">{cta}</button>
        </div>
      </div>
    );
  }
  // Instagram Story
  return (
    <div className="relative mx-auto aspect-[9/16] w-44 overflow-hidden rounded-xl border-2 border-fuchsia-200 bg-gradient-to-b from-fuchsia-100 via-purple-50 to-amber-50">
      {/* Top bar */}
      <div className="absolute left-2 right-2 top-2 z-10">
        <div className="mb-1 flex gap-0.5">
          <div className="h-0.5 flex-1 rounded-full bg-white" />
          <div className="h-0.5 flex-1 rounded-full bg-white/40" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-amber-400 text-[9px] font-bold text-white">
            {pageName.slice(0, 1).toUpperCase()}
          </div>
          <p className="text-[10px] font-semibold text-white drop-shadow">{pageName}</p>
          <span className="text-[9px] text-white/80">Sponsorizzato</span>
        </div>
      </div>
      {/* Center copy */}
      <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 text-center">
        {hook && <p className="mb-2 text-[11px] font-semibold text-slate-900">{hook}</p>}
        <p className="text-[10px] leading-snug text-slate-800 line-clamp-4">{copy}</p>
      </div>
      {/* CTA bottom */}
      <div className="absolute inset-x-3 bottom-3 text-center">
        <div className="mx-auto inline-block rounded-full bg-white/90 px-4 py-1.5 text-[10px] font-bold text-slate-900 shadow">
          {cta} →
        </div>
      </div>
    </div>
  );
}

function formatN(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export default QuickStartCampaign;
