/**
 * ProviderChoiceDialog — Step 0 del wizard "Crea Campagna".
 *
 * Si apre PRIMA che l'utente entri nel wizard vero e proprio. Mostra
 * un confronto Meta vs Google con i punti chiave per ciascuno e obbliga
 * una scelta esplicita. In base alla scelta:
 *   • Meta → flusso lead-gen con targeting Facebook/Instagram
 *   • Google → sotto-selettore canale (Search / Display / Video / PMax)
 *
 * Dopo la conferma, lo step viene salvato in BuilderState.platform.
 */
import { useState } from "react";
import { Check, Facebook, Globe, Megaphone, Search, Sparkles, Target, Tv, Wand2, Youtube, Zap } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type AdProvider = "meta" | "google";
export type GoogleAdsChannel = "SEARCH" | "DISPLAY" | "VIDEO" | "PERFORMANCE_MAX";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (provider: AdProvider, googleChannel?: GoogleAdsChannel, mode?: "quick" | "advanced") => void;
}

const GOOGLE_CHANNELS: Array<{
  value: GoogleAdsChannel;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    value: "SEARCH",
    label: "Search",
    icon: Search,
    description: "Annunci testuali quando l'utente cerca su Google (es. \"ristrutturazione bagno Milano\").",
  },
  {
    value: "DISPLAY",
    label: "Display",
    icon: Tv,
    description: "Banner grafici su 2M+ siti partner Google Display Network.",
  },
  {
    value: "VIDEO",
    label: "YouTube Video",
    icon: Youtube,
    description: "Annunci video preroll, in-feed e Shorts.",
  },
  {
    value: "PERFORMANCE_MAX",
    label: "Performance Max",
    icon: Sparkles,
    description: "AI Google ottimizza automaticamente su tutti i canali (Search+Display+YouTube+Maps+Gmail).",
  },
];

export function ProviderChoiceDialog({ open, onOpenChange, onConfirm }: Props) {
  const [selected, setSelected] = useState<AdProvider | null>(null);
  const [googleChannel, setGoogleChannel] = useState<GoogleAdsChannel>("SEARCH");
  const [mode, setMode] = useState<"quick" | "advanced">("quick");

  const handleConfirm = () => {
    if (!selected) return;
    if (selected === "google") {
      onConfirm("google", googleChannel, mode);
    } else {
      onConfirm("meta", undefined, mode);
    }
    onOpenChange(false);
    setSelected(null);
    setMode("quick");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crea una nuova campagna pubblicitaria</DialogTitle>
          <DialogDescription>
            1) Scegli la modalità · 2) Scegli la piattaforma · Click Continua.
          </DialogDescription>
        </DialogHeader>

        {/* MODE SELECTOR — Quick Start vs Avanzato */}
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase text-slate-600">
            ⚡ Modalità di setup
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("quick")}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-left",
                mode === "quick"
                  ? "border-yellow-400 bg-yellow-50 ring-2 ring-yellow-200"
                  : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <div className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                mode === "quick" ? "bg-yellow-500 text-white" : "bg-slate-100 text-slate-600",
              )}>
                <Zap className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-slate-950">Quick Start AI</p>
                  <Badge className="bg-emerald-500 text-[9px] text-white">~60s</Badge>
                </div>
                <p className="text-[11px] leading-tight text-slate-600">
                  Scrivi cosa vuoi in italiano normale, l'AI prepara tutto: pubblico, copy, budget.
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode("advanced")}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 text-left",
                mode === "advanced"
                  ? "border-slate-400 bg-white ring-2 ring-slate-200"
                  : "border-slate-200 bg-white hover:border-slate-300",
              )}
            >
              <div className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                mode === "advanced" ? "bg-slate-700 text-white" : "bg-slate-100 text-slate-600",
              )}>
                <Wand2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">Wizard avanzato</p>
                <p className="text-[11px] leading-tight text-slate-600">
                  5 step guidati: targeting fine, A/B test, automazioni. Per chi sa già cosa fare.
                </p>
              </div>
            </button>
          </div>
        </div>

        <p className="mt-2 text-xs font-semibold uppercase text-slate-600">
          📣 Piattaforma
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* META CARD */}
          <button
            type="button"
            onClick={() => setSelected("meta")}
            className={cn(
              "rounded-2xl border p-5 text-left transition",
              selected === "meta"
                ? "border-blue-300 bg-blue-50 ring-2 ring-blue-200"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Facebook className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-950">Meta Ads</p>
                  <p className="text-xs text-slate-500">Facebook · Instagram · Messenger · WhatsApp</p>
                </div>
              </div>
              {selected === "meta" && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <p className="text-sm text-slate-700">
              Mostra gli annunci per <strong>interessi</strong>, <strong>abitudini</strong> e <strong>zona</strong>.
              È la scelta giusta per farsi trovare da chi non ti conosce ancora e chiede
              un preventivo o un sopralluogo.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Il modulo si compila dentro Facebook</li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Scegli comuni e raggio di lavoro</li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> In edilizia una richiesta costa di solito 8–25 €</li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Puoi ripartire dai tuoi clienti già acquisiti</li>
            </ul>
            <p className="mt-3 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800">
              Va online direttamente da qui.
            </p>
          </button>

          {/* GOOGLE CARD */}
          <button
            type="button"
            onClick={() => setSelected("google")}
            className={cn(
              "rounded-2xl border p-5 text-left transition",
              selected === "google"
                ? "border-amber-300 bg-amber-50 ring-2 ring-amber-200"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <Globe className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-950">Google Ads</p>
                  <p className="text-xs text-slate-500">Search · Display · YouTube · Performance Max</p>
                </div>
              </div>
              {selected === "google" && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <p className="text-sm text-slate-700">
              Mostra gli annunci a chi <strong>cerca</strong> quel lavoro su Google.
              Sono persone che sanno già cosa vogliono: costano di più per clic,
              ma rendono molto quando il tuo nome è già conosciuto.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Ricerca: chi sta già cercando il lavoro</li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Banner: massima visibilità sui siti</li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Video su YouTube</li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Performance Max: tutti i canali insieme</li>
            </ul>
            {/*
              Detto chiaro prima di cominciare: la campagna Google si prepara
              qui ma la pubblicazione automatica non c'è ancora (manca il
              Developer Token di Google). Scoprirlo dopo un'ora di lavoro nel
              wizard è il modo più sicuro per far arrabbiare qualcuno.
            */}
            <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-900">
              Per ora la prepari qui e la carichi a mano su Google: la pubblicazione automatica non è ancora attiva.
            </p>
          </button>
        </div>

        {/* Sotto-selettore canale Google (visibile solo se Google scelto) */}
        {selected === "google" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <p className="mb-3 text-sm font-semibold text-amber-900">Quale canale Google vuoi usare?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {GOOGLE_CHANNELS.map((channel) => {
                const Icon = channel.icon;
                const active = googleChannel === channel.value;
                return (
                  <button
                    key={channel.value}
                    type="button"
                    onClick={() => setGoogleChannel(channel.value)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 text-left transition",
                      active ? "border-amber-400 bg-white shadow-sm" : "border-slate-200 bg-white/60 hover:bg-white",
                    )}
                  >
                    <div className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                      active ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600",
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">{channel.label}</p>
                      <p className="text-[11px] leading-snug text-slate-500">{channel.description}</p>
                    </div>
                    {active && (
                      <span className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleConfirm} disabled={!selected}>
            {selected === "google" ? (
              <>
                <Target className="mr-2 h-4 w-4" /> Continua con Google {googleChannel === "SEARCH" ? "Search" : googleChannel === "DISPLAY" ? "Display" : googleChannel === "VIDEO" ? "Video" : "PMax"}
              </>
            ) : selected === "meta" ? (
              <>
                <Megaphone className="mr-2 h-4 w-4" /> Continua con Meta
              </>
            ) : (
              <>Seleziona una piattaforma</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ProviderChoiceDialog;
