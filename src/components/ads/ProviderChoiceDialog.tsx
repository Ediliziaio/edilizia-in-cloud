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
import { Check, Facebook, Globe, Megaphone, Search, Sparkles, Target, Tv, Youtube } from "lucide-react";

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
  onConfirm: (provider: AdProvider, googleChannel?: GoogleAdsChannel) => void;
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

  const handleConfirm = () => {
    if (!selected) return;
    if (selected === "google") {
      onConfirm("google", googleChannel);
    } else {
      onConfirm("meta");
    }
    onOpenChange(false);
    setSelected(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Su quale piattaforma vuoi pubblicare?</DialogTitle>
          <DialogDescription>
            Meta e Google hanno gestioni completamente diverse. Scegli adesso così il
            wizard si adatta automaticamente.
          </DialogDescription>
        </DialogHeader>

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
              Pubblico per <strong>interessi</strong>, <strong>comportamento</strong> e <strong>zona</strong>.
              Ideale per <strong>lead generation locale</strong> (preventivi, sopralluoghi)
              quando il cliente non ti conosce ancora.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Lead form nativo integrato</li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Geo + audience reale (Meta API)</li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> CPL tipico 8–25 € (edilizia/serramenti IT)</li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Custom + Lookalike audiences</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-1">
              <Badge variant="outline" className="border-blue-200 bg-white text-[10px] text-blue-700">Pronto live</Badge>
              <Badge variant="outline" className="border-emerald-200 bg-white text-[10px] text-emerald-700">AI completo</Badge>
            </div>
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
              Pubblico per <strong>parole chiave</strong> (cosa la gente cerca su Google).
              Intent <strong>alto</strong>: utenti che già sanno cosa vogliono.
              CPC variabile, ROI eccellente quando il brand è riconoscibile.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Search intenta (alto intent)</li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Display reach massimo</li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> YouTube video targeting</li>
              <li className="flex items-start gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" /> Performance Max AI cross-canale</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-1">
              <Badge variant="outline" className="border-amber-200 bg-white text-[10px] text-amber-700">Beta</Badge>
              <Badge variant="outline" className="border-slate-200 bg-white text-[10px] text-slate-500">OAuth richiesto</Badge>
            </div>
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
