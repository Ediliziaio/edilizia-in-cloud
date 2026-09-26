/**
 * OfferBuilderPanel — AI Copywriter Pro
 *
 * Cambio di paradigma:
 *   L'UTENTE scrive la sua offerta (sconti, detrazioni, garanzie, materiali,
 *   tempi). L'AI agisce da Senior Copywriter (Dan Kennedy / Jay Abraham /
 *   Eugene Schwartz / Gary Halbert / David Ogilvy) e genera 5 varianti di
 *   annuncio Meta Ads usando framework provati (PAS, AIDA, HSO, AWARENESS,
 *   RISK_REVERSAL) + swipe file di annunci edilizia performanti.
 */

import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Quote,
  Sparkles,
  Target,
  Wand2,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════

export interface AdVariant {
  framework: "PAS" | "AIDA" | "HSO" | "AWARENESS" | "RISK_REVERSAL";
  framework_explain: string;
  title: string;
  primary_text: string;
  hook: string;
  cta: string;
  angle: string;
  image_prompt: string;
}

interface CopywriterResponse {
  ok: boolean;
  company_context: {
    name: string;
    city: string | null;
    province: string | null;
    region: string | null;
    sector: string | null;
    anni_attivita: number | null;
    employee_count: number | null;
  };
  user_offer: string;
  ads: AdVariant[];
  coaching: string;
}

interface Props {
  companyId: string | undefined;
  segmentHint?: string;
  /** Callback: l'utente sceglie una variante → aggiorna BuilderState */
  onChooseOffer: (ad: AdVariant) => void;
  /** Offer corrente, per evidenziare la selezione */
  currentOffer?: string;
}

// ════════════════════════════════════════════════════════════════════
// FRAMEWORK INFO (educational)
// ════════════════════════════════════════════════════════════════════

const FRAMEWORK_INFO: Record<AdVariant["framework"], {
  label: string;
  master: string;
  color: string;
  emoji: string;
  description: string;
}> = {
  PAS: {
    label: "PAS",
    master: "Dan Kennedy",
    color: "border-rose-300 bg-rose-50",
    emoji: "🔥",
    description: "Problem → Agitation → Solution. Diretto, no-nonsense. Per chi vuole vendere subito.",
  },
  AIDA: {
    label: "AIDA",
    master: "Classico",
    color: "border-blue-300 bg-blue-50",
    emoji: "🎯",
    description: "Attention → Interest → Desire → Action. Costruisce desiderio. Bilanciato.",
  },
  HSO: {
    label: "Hook-Story-Offer",
    master: "Russell Brunson",
    color: "border-violet-300 bg-violet-50",
    emoji: "📖",
    description: "Hook → microstoria cliente reale → Offerta. Molto Meta-friendly, mima il passaparola.",
  },
  AWARENESS: {
    label: "Awareness",
    master: "Eugene Schwartz",
    color: "border-amber-300 bg-amber-50",
    emoji: "💡",
    description: "Educational + acquisitivo. Adatta il messaggio al livello di consapevolezza del cliente.",
  },
  RISK_REVERSAL: {
    label: "Risk Reversal",
    master: "Jay Abraham / Halbert",
    color: "border-emerald-300 bg-emerald-50",
    emoji: "🛡️",
    description: "Promessa forte + inversione rischio + urgenza reale. Assertivo ma onesto.",
  },
};

// ════════════════════════════════════════════════════════════════════
// PARAMETRI EDUCATIONAL
// ════════════════════════════════════════════════════════════════════

const OFFER_PARAMS: Array<{ icon: string; title: string; example: string }> = [
  { icon: "💰", title: "Sconto / promozione", example: "Sconto web 30% fino al 31 ottobre" },
  { icon: "🧾", title: "Detrazione fiscale", example: "50% bonus ristrutturazione · 65% serramenti" },
  { icon: "🛠️", title: "Qualità del lavoro", example: "Posa certificata · made in Italy · garanzia 10 anni" },
  { icon: "⏱️", title: "Tempistica concreta", example: "Sopralluogo in 48h · cantiere in 12 giorni" },
  { icon: "🛡️", title: "Riduzione rischio", example: "Preventivo gratuito · senza impegno · niente acconto" },
  { icon: "🏆", title: "Prova sociale", example: "200+ cantieri dal 2010 · 4.8/5 Google" },
];

const EXAMPLE_OFFERS: Array<{ title: string; text: string }> = [
  {
    title: "Serramenti — Bonus + Sconto",
    text: "Sconto web 30% valido fino al 31 ottobre. Bonus serramenti 65% in detrazione fiscale (ultimo anno). Posa qualificata con installatori certificati. Materiali Made in Italy con garanzia 10 anni. Sopralluogo gratuito in 48h, preventivo senza impegno.",
  },
  {
    title: "Bagni — Chiavi in mano",
    text: "Ristrutturazione bagno chiavi in mano in 12 giorni lavorativi. Preventivo trasparente con bonus ristrutturazione 50% incluso nel calcolo. Direttore lavori dedicato, niente subappaltatori a caso. Sopralluogo + render 3D gratuiti.",
  },
  {
    title: "Fotovoltaico — Risparmio",
    text: "Impianto fotovoltaico con accumulo da 6 kWh. Calcolo personalizzato del risparmio reale sulla TUA bolletta. Detrazione 50% in 10 anni. Posa in 1 giorno, monitoraggio bolletta inclusi 24 mesi. Preventivo gratuito + simulazione fattibilità.",
  },
];

// ════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════

export function OfferBuilderPanel({ companyId, segmentHint, onChooseOffer, currentOffer }: Props) {
  const [offer, setOffer] = useState("");
  const [extraHint, setExtraHint] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<CopywriterResponse | null>(null);
  const [showParams, setShowParams] = useState(false);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState<number | null>(null);

  const handleGenerate = async () => {
    if (!companyId) {
      toast.error("Azienda non selezionata");
      return;
    }
    if (offer.trim().length < 15) {
      toast.error("Offerta troppo corta", {
        description: "Almeno 15 caratteri. Scrivi sconti, garanzie, tempi, materiali.",
      });
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-ads-offer-builder", {
        body: {
          company_id: companyId,
          user_offer: offer.trim(),
          extra_hint: extraHint.trim() || undefined,
          segment_hint: segmentHint,
        },
      });
      if (error) throw new Error(error.message);
      const resp = data as CopywriterResponse;
      if (!resp?.ads?.length) {
        toast.error("L'AI non ha generato annunci validi", {
          description: "Riprova o riscrivi l'offerta in modo più chiaro.",
        });
        return;
      }
      setResult(resp);
      setSelectedVariantIdx(null);
      toast.success(`${resp.ads.length} annunci pro generati`, {
        description: resp.coaching?.slice(0, 100) ?? "",
      });
    } catch (e) {
      toast.error("Errore generazione", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* === INPUT OFFERTA === */}
      <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/40 p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
              <Wand2 className="h-4 w-4 text-blue-600" />
              AI Copywriter Pro — annunci stile Dan Kennedy / Jay Abraham
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Scrivi la <strong>tua offerta</strong> (sconti, detrazioni, garanzie, tempi, materiali).
              L'AI scrive <strong>5 varianti di annuncio</strong> usando framework di copywriting provati.
            </p>
          </div>
        </div>

        <Label className="mb-1 block text-xs font-semibold text-slate-700">
          La tua offerta (sconto, promozione, garanzia, caratteristiche premium):
        </Label>
        <Textarea
          value={offer}
          onChange={(e) => setOffer(e.target.value.slice(0, 1500))}
          placeholder="Es. Sconto web 30% valido fino al 31 ottobre. Bonus serramenti 65% in detrazione fiscale. Posa qualificata con installatori certificati. Made in Italy con garanzia 10 anni. Sopralluogo gratuito in 48h."
          className="min-h-28 bg-white text-sm"
          maxLength={1500}
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 max-md:text-[11px]">
          <span>{offer.length}/1500 caratteri</span>
          <button
            type="button"
            onClick={() => setShowParams((v) => !v)}
            className="inline-flex items-center gap-1 text-blue-700 hover:underline"
          >
            {showParams ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Cosa includere nell'offerta?
          </button>
        </div>

        {/* Elementi educational */}
        {showParams && (
          <div className="mt-3 rounded-xl border border-blue-200 bg-white p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-blue-900">Elementi forti da inserire</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {OFFER_PARAMS.map((p) => (
                <div key={p.title} className="flex items-start gap-2 rounded-lg bg-blue-50/40 p-2">
                  <span className="text-base">{p.icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-slate-950">{p.title}</p>
                    <p className="text-[10px] italic text-slate-600 max-md:text-[11px]">{p.example}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Esempi cliccabili */}
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-semibold text-slate-700">💡 Esempi cliccabili (parti da uno e personalizzalo):</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {EXAMPLE_OFFERS.map((ex) => (
              <button
                key={ex.title}
                type="button"
                onClick={() => setOffer(ex.text)}
                className="rounded-lg border border-slate-200 bg-white p-2 text-left text-xs hover:border-blue-300 hover:bg-blue-50"
              >
                <p className="font-semibold text-slate-950">{ex.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500 max-md:text-[11px]">{ex.text}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Hint extra opzionale */}
        <button
          type="button"
          onClick={() => setShowHint((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900"
        >
          {showHint ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {showHint ? "Nascondi" : "Aggiungi hint extra (stile, tono, focus)"}
        </button>
        {showHint && (
          <Input
            value={extraHint}
            onChange={(e) => setExtraHint(e.target.value.slice(0, 200))}
            placeholder="Es. tono lusso premium / molto diretto / parla a clienti senza budget"
            className="mt-2 bg-white"
            maxLength={200}
          />
        )}

        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={generating || offer.trim().length < 15 || !companyId}
          className="mt-4 w-full bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg hover:from-blue-700 hover:to-violet-700"
        >
          {generating ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> AI Copywriter Pro sta scrivendo…</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" /> Genera 5 annunci pubblicitari pro</>
          )}
        </Button>
      </div>

      {/* === RISULTATI === */}
      {result && (
        <>
          {/* Coaching */}
          {result.coaching && (
            <Alert className="border-violet-200 bg-violet-50">
              <Quote className="h-4 w-4 text-violet-700" />
              <AlertTitle>Coaching del Copywriter</AlertTitle>
              <AlertDescription className="text-xs">{result.coaching}</AlertDescription>
            </Alert>
          )}

          {/* Framework legend */}
          <div className="rounded-xl border bg-white p-3">
            <div className="mb-2 flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5 text-slate-500" />
              <p className="text-xs font-semibold text-slate-700">5 Framework usati</p>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
              {(Object.keys(FRAMEWORK_INFO) as Array<keyof typeof FRAMEWORK_INFO>).map((f) => {
                const info = FRAMEWORK_INFO[f];
                return (
                  <div key={f} className={cn("rounded-md border p-1.5", info.color)}>
                    <p className="text-[10px] font-bold text-slate-900 max-md:text-[11px]">
                      {info.emoji} {info.label}
                    </p>
                    <p className="text-[9px] text-slate-600 max-md:text-[11px]">{info.master}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Ad variants */}
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {result.ads.map((ad, idx) => (
              <AdVariantCard
                key={idx}
                ad={ad}
                selected={selectedVariantIdx === idx || ad.primary_text === currentOffer}
                onSelect={() => {
                  setSelectedVariantIdx(idx);
                  onChooseOffer(ad);
                }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Annunci personalizzati per <strong>{result.company_context.name}</strong>
              {result.company_context.city && <> · {result.company_context.city}</>}
              {result.company_context.anni_attivita !== null && <> · {result.company_context.anni_attivita} anni</>}
            </p>
            <Button variant="ghost" size="sm" onClick={() => { setResult(null); setSelectedVariantIdx(null); }}>
              Riscrivi con offerta diversa
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// AD VARIANT CARD
// ════════════════════════════════════════════════════════════════════

function AdVariantCard({
  ad,
  selected,
  onSelect,
}: {
  ad: AdVariant;
  selected: boolean;
  onSelect: () => void;
}) {
  const info = FRAMEWORK_INFO[ad.framework];
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border-2 bg-white p-4 transition",
        selected ? "border-emerald-500 ring-2 ring-emerald-200" : info.color.replace("bg-", "border-").split(" ")[0],
      )}
    >
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{info.emoji}</span>
          <div>
            <Badge variant="outline" className={cn("text-[10px]", info.color)}>
              {info.label}
            </Badge>
            <p className="mt-0.5 text-[9px] text-slate-500 max-md:text-[11px]">stile {info.master}</p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] max-md:text-[11px]">
          {ad.cta === "GET_QUOTE" ? "Preventivo" : ad.cta === "MESSAGE_PAGE" ? "Messaggio" : ad.cta === "WHATSAPP_MESSAGE" ? "WhatsApp" : "Scopri"}
        </Badge>
      </header>

      {/* Hook in evidenza */}
      <div className="mb-2 rounded-md border border-fuchsia-200 bg-fuchsia-50 p-2">
        <p className="text-[9px] font-semibold uppercase text-fuchsia-700 max-md:text-[11px]">Hook (stop-scroll)</p>
        <p className="text-xs font-semibold text-fuchsia-950">{ad.hook}</p>
      </div>

      {/* Title */}
      <p className="mb-1 text-[9px] font-semibold uppercase text-slate-500 max-md:text-[11px]">Titolo (headline)</p>
      <p className="mb-3 text-sm font-bold text-slate-950">{ad.title}</p>

      {/* Primary text */}
      <p className="mb-1 text-[9px] font-semibold uppercase text-slate-500 max-md:text-[11px]">Corpo annuncio</p>
      <p className="mb-3 text-sm leading-relaxed text-slate-700">{ad.primary_text}</p>

      {/* Expanded: angle + framework explain + image prompt */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mb-2 inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "Nascondi dettagli" : "Vedi angolo + framework + visuale"}
      </button>

      {expanded && (
        <div className="mb-3 space-y-2 rounded-lg border bg-slate-50 p-2">
          <div className="text-[10px] max-md:text-[11px]">
            <p className="font-semibold text-slate-700">🎯 Angolo di vendita</p>
            <p className="text-slate-600">{ad.angle}</p>
          </div>
          <div className="text-[10px] max-md:text-[11px]">
            <p className="font-semibold text-slate-700">📚 Perché funziona</p>
            <p className="text-slate-600">{ad.framework_explain}</p>
          </div>
          <div className="text-[10px] max-md:text-[11px]">
            <p className="font-semibold text-slate-700">🎨 Prompt immagine</p>
            <p className="italic text-slate-600">{ad.image_prompt}</p>
          </div>
        </div>
      )}

      <Button
        onClick={onSelect}
        className={cn(
          "mt-auto w-full",
          selected ? "bg-emerald-600 hover:bg-emerald-700" : "",
        )}
      >
        {selected ? (
          <><CheckCircle2 className="mr-2 h-4 w-4" /> Selezionato</>
        ) : (
          <><Target className="mr-2 h-4 w-4" /> Usa questo annuncio</>
        )}
      </Button>
    </div>
  );
}

export default OfferBuilderPanel;
