/**
 * OfferBuilderPanel — sostituisce il vecchio TemplateSelector statico.
 *
 * Quando l'utente apre il wizard, questo pannello:
 *   1. Mostra i dati azienda estratti automaticamente (nome, città, anni,
 *      dimensione, sito web) — l'utente vede che il sistema "conosce"
 *      l'impresa
 *   2. Spiega i 7 parametri di un'offerta vincente (educativo)
 *   3. Permette di cliccare "Costruisci offerte forti con AI"
 *   4. Mostra 3 offerte candidate (starter / medium / strong) con
 *      breakdown dei 7 parametri per ciascuna
 *   5. L'utente sceglie un'offerta → applica state.offer + suggested hook + CTA
 *   6. Avvisi su dati azienda mancanti (per offerte ancora più forti)
 */

import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  Loader2,
  MapPin,
  Phone,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════

interface CompanySignals {
  name: string;
  business_name: string | null;
  sector: string | null;
  vertical: string | null;
  city: string | null;
  province: string | null;
  region: string | null;
  anni_attivita: number | null;
  employee_count: number | null;
  company_size: string | null;
  phone: string | null;
  website: string | null;
  annual_revenue_range: string | null;
  monthly_orders_target: number | null;
  has_website: boolean;
  has_phone: boolean;
}

export interface OfferCandidate {
  tier: "strong" | "medium" | "starter";
  headline: string;
  pitch: string;
  parameters: {
    promise: string;
    advantage: string;
    risk_reversal: string;
    urgency: string;
    proof: string;
    cta: string;
    locality: string;
  };
  suggested_hook: string;
  suggested_cta: string;
  daily_budget_suggested: number;
  missing_data: string[];
  confidence: number;
}

interface BuilderResponse {
  ok: boolean;
  company_signals: CompanySignals;
  offers: OfferCandidate[];
  missing_company_fields: string[];
  advice: string;
}

interface Props {
  companyId: string | undefined;
  /** Settore prevalente (dal vertical_key) — usato per segment hint */
  segmentHint?: string;
  /** Callback quando l'utente sceglie un'offerta */
  onChooseOffer: (offer: OfferCandidate) => void;
  /** Eventuale offer corrente, per evidenziare "scelta" */
  currentOffer?: string;
}

// ════════════════════════════════════════════════════════════════════
// 7 PARAMETRI — educational
// ════════════════════════════════════════════════════════════════════

const SEVEN_PARAMS: Array<{ icon: string; title: string; desc: string }> = [
  { icon: "🎯", title: "Promessa specifica", desc: "In 48h, entro 7gg, +30% — mai 'veloce'" },
  { icon: "💎", title: "Vantaggio quantificabile", desc: "-30% bolletta, +15 anni durata — numeri reali" },
  { icon: "🛡️", title: "Riduzione rischio", desc: "Gratuito · senza impegno · soddisfatto o..." },
  { icon: "⏰", title: "Urgenza reale", desc: "Bonus fiscale fino al X · stagione · agenda" },
  { icon: "⭐", title: "Prova sociale verificabile", desc: "200+ cantieri dal 2010 · 4.8/5 Google" },
  { icon: "👆", title: "CTA a basso attrito", desc: "Preventivo in 2 min · Calcola detrazione" },
  { icon: "📍", title: "Localizzazione esplicita", desc: "Per chi vive a [zona] · [città] e provincia" },
];

const FIELD_LABELS: Record<string, string> = {
  anno_fondazione: "Anno di fondazione",
  recensioni: "Recensioni / rating",
  cantieri_anno: "Numero cantieri all'anno",
  tagline: "Tagline / slogan",
  certificazioni: "Certificazioni / partner",
  website: "Sito web",
  phone: "Telefono diretto",
  employee_count: "Numero dipendenti",
  description: "Descrizione azienda",
  zona_operativa: "Zona operativa precisa",
  servizi_specifici: "Lista servizi specifici",
  prezzi_orientativi: "Prezzi orientativi",
};

// ════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════

export function OfferBuilderPanel({ companyId, segmentHint, onChooseOffer, currentOffer }: Props) {
  const [generating, setGenerating] = useState(false);
  const [data, setData] = useState<BuilderResponse | null>(null);
  const [intent, setIntent] = useState("");
  const [showIntent, setShowIntent] = useState(false);
  const [showParams, setShowParams] = useState(false);

  const handleBuild = async () => {
    if (!companyId) {
      toast.error("Azienda non selezionata");
      return;
    }
    setGenerating(true);
    try {
      const { data: resp, error } = await supabase.functions.invoke("ai-ads-offer-builder", {
        body: {
          company_id: companyId,
          user_intent: intent.trim() || undefined,
          segment_hint: segmentHint,
        },
      });
      if (error) throw new Error(error.message);
      const result = resp as BuilderResponse;
      if (!result?.offers?.length) {
        toast.error("L'AI non è riuscita a generare offerte", {
          description: "Riprova o completa il profilo aziendale.",
        });
        return;
      }
      setData(result);
      toast.success(`${result.offers.length} offerte pronte`, {
        description: result.advice?.slice(0, 100) ?? "",
      });
    } catch (e) {
      toast.error("Errore generazione offerte", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* HEADER + DATI AZIENDA ESTRATTI */}
      {data?.company_signals ? (
        <CompanySnapshot signals={data.company_signals} />
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex-1">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
                <Sparkles className="h-4 w-4 text-blue-600" />
                Offerta pubblicitaria con AI
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                L'AI legge i dati della tua azienda (nome, città, anni, dimensione) e costruisce
                <strong> 3 offerte candidate </strong> seguendo i 7 parametri di un'offerta vincente.
              </p>
              <button
                type="button"
                onClick={() => setShowParams((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"
              >
                {showParams ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showParams ? "Nascondi" : "Cosa rende un'offerta forte?"}
              </button>
            </div>
            <Button
              size="lg"
              onClick={handleBuild}
              disabled={generating || !companyId}
              className="bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg hover:from-blue-700 hover:to-violet-700"
            >
              {generating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI sta lavorando…</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" /> Costruisci offerte forti</>
              )}
            </Button>
          </div>

          {/* 7 PARAMETRI educational */}
          {showParams && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-white p-4">
              <p className="mb-3 text-xs font-semibold uppercase text-blue-900">I 7 parametri di un'offerta forte</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SEVEN_PARAMS.map((p, i) => (
                  <div key={p.title} className="flex items-start gap-2 rounded-lg bg-blue-50/40 p-2">
                    <span className="text-base">{p.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-slate-950">
                        {i + 1}. {p.title}
                      </p>
                      <p className="text-[10px] leading-snug text-slate-600">{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OPZIONALE: brief extra */}
          <button
            type="button"
            onClick={() => setShowIntent((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
          >
            {showIntent ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {showIntent ? "Nascondi brief opzionale" : "Aggiungi brief extra (opzionale)"}
          </button>
          {showIntent && (
            <Textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value.slice(0, 400))}
              placeholder="Es. Voglio intercettare il Bonus Casa 2026 / Punto sul lusso premium / Solo lavori sopra 10k€"
              className="mt-2 min-h-16"
              maxLength={400}
            />
          )}
        </div>
      )}

      {/* RISULTATO: 3 OFFERTE CANDIDATE */}
      {data && (
        <>
          {/* Coaching */}
          {data.advice && (
            <Alert className="border-violet-200 bg-violet-50">
              <Sparkles className="h-4 w-4 text-violet-700" />
              <AlertTitle>Coaching AI</AlertTitle>
              <AlertDescription className="text-xs">{data.advice}</AlertDescription>
            </Alert>
          )}

          {/* Missing company fields warning */}
          {data.missing_company_fields.length > 0 && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <AlertTitle>Per offerte ancora più forti, completa il profilo</AlertTitle>
              <AlertDescription className="text-xs">
                Dati mancanti: <strong>{data.missing_company_fields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}</strong>. Aggiungerli in Impostazioni → Profilo azienda renderà le offerte più solide (prova sociale, urgenza reale).
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3 lg:grid-cols-3">
            {data.offers.map((offer, idx) => (
              <OfferCard
                key={idx}
                offer={offer}
                selected={offer.pitch === currentOffer}
                onSelect={() => onChooseOffer(offer)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {data.offers.length} offerte generate dal profilo aziendale di <strong>{data.company_signals.name}</strong>
            </p>
            <Button variant="ghost" size="sm" onClick={() => { setData(null); }}>
              Rigenera con brief diverso
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// COMPANY SNAPSHOT
// ════════════════════════════════════════════════════════════════════

function CompanySnapshot({ signals }: { signals: CompanySignals }) {
  const items: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; value: string | null; ok: boolean }> = [
    { icon: Building2, label: "Azienda", value: signals.business_name ?? signals.name, ok: true },
    { icon: MapPin, label: "Zona operativa", value: signals.city ? `${signals.city}${signals.province ? ` (${signals.province})` : ""}` : null, ok: !!signals.city },
    { icon: Calendar, label: "Anni di attività", value: signals.anni_attivita !== null ? String(signals.anni_attivita) : null, ok: signals.anni_attivita !== null },
    { icon: Users, label: "Team", value: signals.employee_count !== null ? `${signals.employee_count} persone` : signals.company_size, ok: !!(signals.employee_count || signals.company_size) },
    { icon: Globe, label: "Sito web", value: signals.has_website ? signals.website : null, ok: signals.has_website },
    { icon: Phone, label: "Telefono", value: signals.has_phone ? "configurato" : null, ok: signals.has_phone },
  ];
  return (
    <div className="rounded-xl border bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Dati azienda usati dall'AI</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <div
              key={i}
              className={cn(
                "rounded-lg border p-2 text-xs",
                it.ok ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-slate-50",
              )}
            >
              <Icon className={cn("mb-1 h-3.5 w-3.5", it.ok ? "text-emerald-600" : "text-slate-400")} />
              <p className="text-[9px] uppercase text-slate-500">{it.label}</p>
              <p className={cn("truncate font-medium", it.ok ? "text-slate-900" : "text-slate-400 italic")}>
                {it.value ?? "—"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// OFFER CARD
// ════════════════════════════════════════════════════════════════════

function OfferCard({
  offer,
  selected,
  onSelect,
}: {
  offer: OfferCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tierConfig = {
    starter: { color: "border-blue-300 bg-blue-50", label: "Starter", badge: "bg-blue-500", icon: "🌱" },
    medium: { color: "border-violet-300 bg-violet-50", label: "Bilanciato", badge: "bg-violet-500", icon: "⚖️" },
    strong: { color: "border-emerald-300 bg-emerald-50", label: "Forte", badge: "bg-emerald-500", icon: "🚀" },
  }[offer.tier];

  const params = [
    { key: "promise", label: "Promessa", icon: "🎯" },
    { key: "advantage", label: "Vantaggio", icon: "💎" },
    { key: "risk_reversal", label: "Rischio ridotto", icon: "🛡️" },
    { key: "urgency", label: "Urgenza", icon: "⏰" },
    { key: "proof", label: "Prova sociale", icon: "⭐" },
    { key: "cta", label: "CTA", icon: "👆" },
    { key: "locality", label: "Località", icon: "📍" },
  ] as const;

  const paramsCount = params.filter((p) => (offer.parameters[p.key as keyof typeof offer.parameters] ?? "").trim().length > 0).length;

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border-2 bg-white p-4 transition",
        selected ? "border-emerald-500 ring-2 ring-emerald-200" : tierConfig.color,
      )}
    >
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{tierConfig.icon}</span>
          <div>
            <Badge className={cn("text-[10px] text-white", tierConfig.badge)}>{tierConfig.label}</Badge>
            <p className="mt-0.5 text-[10px] text-slate-500">{paramsCount}/7 parametri</p>
          </div>
        </div>
        <div className="text-right">
          <Badge variant="outline" className="text-[10px]">
            Conf {offer.confidence}/100
          </Badge>
          <p className="mt-0.5 text-[10px] text-slate-500">{offer.daily_budget_suggested}€/giorno</p>
        </div>
      </header>

      <h4 className="mb-2 text-sm font-bold text-slate-950">{offer.headline}</h4>
      <p className="mb-3 text-sm leading-relaxed text-slate-700">{offer.pitch}</p>

      {offer.suggested_hook && (
        <div className="mb-2 rounded-md border border-fuchsia-200 bg-fuchsia-50 p-2">
          <p className="text-[9px] font-semibold uppercase text-fuchsia-700">Hook suggerito</p>
          <p className="text-xs text-fuchsia-900">{offer.suggested_hook}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Vedi i 7 parametri usati
      </button>

      {expanded && (
        <div className="mb-3 space-y-1 rounded-lg border bg-slate-50 p-2">
          {params.map((p) => {
            const val = offer.parameters[p.key as keyof typeof offer.parameters] ?? "";
            const has = val.trim().length > 0;
            return (
              <div key={p.key} className={cn("flex items-start gap-2 text-[10px]", has ? "text-slate-900" : "text-slate-400 italic")}>
                <span className="shrink-0">{p.icon}</span>
                <span className="shrink-0 font-semibold">{p.label}:</span>
                <span className="flex-1">{has ? val : "(non applicabile o dati mancanti)"}</span>
              </div>
            );
          })}
        </div>
      )}

      {offer.missing_data.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2">
          <p className="text-[9px] font-semibold uppercase text-amber-800">Per potenziarla, aggiungi</p>
          <p className="text-[10px] text-amber-900">
            {offer.missing_data.map((m) => FIELD_LABELS[m] ?? m).join(", ")}
          </p>
        </div>
      )}

      <Button
        onClick={onSelect}
        className={cn(
          "mt-auto w-full",
          selected ? "bg-emerald-600 hover:bg-emerald-700" : tierConfig.badge,
        )}
      >
        {selected ? (
          <><CheckCircle2 className="mr-2 h-4 w-4" /> Selezionata</>
        ) : (
          <><TrendingUp className="mr-2 h-4 w-4" /> Usa questa offerta</>
        )}
      </Button>
    </div>
  );
}

export default OfferBuilderPanel;
