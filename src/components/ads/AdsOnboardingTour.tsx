/**
 * AdsOnboardingTour — tour guidato prima volta apertura modulo.
 *
 * Persistito in localStorage: `eic_ads_tour_seen_${companyId}` = "1"
 * 5 step con highlight + descrizione + bottoni navigation.
 */
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Sparkles, Plus, Settings, Megaphone, Wand2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY_PREFIX = "eic_ads_tour_seen_";

interface TourStep {
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
  tip?: string;
}

const STEPS: TourStep[] = [
  {
    title: "Benvenuto nel modulo Pubblicità",
    body: "Crei e gestisci campagne Meta (Facebook/Instagram) e Google Ads da un unico posto, con l'AI che ti guida.",
    icon: Megaphone,
    tip: "È una BETA: tutto in bozza finché non confermi la pubblicazione live.",
  },
  {
    title: "Nuova campagna in 5 step",
    body: "Il wizard ti guida da Offerta → Pubblico → Modulo lead → Creatività → Revisione. L'AI suggerisce copy e immagini.",
    icon: Plus,
    tip: "Inizia da un template edile (Serramenti, Bagni, etc.) per partire più veloce.",
  },
  {
    title: "Creative Studio AI",
    body: "Genera testi e immagini reali per le tue campagne. Salvati in libreria per riusarli.",
    icon: Wand2,
    tip: "L'AI rispetta le policy Meta: niente claim esagerati, niente promesse di prezzo.",
  },
  {
    title: "Performance sotto controllo",
    body: "Grafici reali su spend, lead, CPL trend. Spend Guard ti pausa le campagne se sforano il cap.",
    icon: TrendingUp,
    tip: "Configura cap e regole di automazione in Impostazioni → Spend Guard / Automazioni.",
  },
  {
    title: "Collega Meta + Pixel",
    body: "In Impostazioni colleghi Business Manager, Ad Account, Pixel + CAPI. Solo dopo puoi pubblicare live.",
    icon: Settings,
    tip: "Il CAPI permette di tracciare le commesse chiuse, non solo i click.",
  },
];

interface Props {
  companyId: string | undefined;
}

export function AdsOnboardingTour({ companyId }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY_PREFIX + companyId);
      if (seen !== "1") setIsOpen(true);
    } catch {
      // ignore
    }
  }, [companyId]);

  const close = (markSeen = true) => {
    setIsOpen(false);
    if (companyId && markSeen) {
      try {
        window.localStorage.setItem(STORAGE_KEY_PREFIX + companyId, "1");
      } catch {
        // ignore
      }
    }
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? setIsOpen(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg">
            <Icon className="h-7 w-7" />
          </div>
          <DialogTitle className="text-xl">{current.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-600">{current.body}</p>
          {current.tip && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              <Sparkles className="mr-1 inline h-3 w-3" />
              <strong>Tip:</strong> {current.tip}
            </div>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 py-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-6 rounded-full transition-colors",
                i === step
                  ? "bg-orange-500"
                  : i < step
                  ? "bg-orange-300"
                  : "bg-slate-200",
              )}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => close(false)}
            className="text-xs text-slate-500"
          >
            Salta tour
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                <ArrowLeft className="h-3 w-3" />
                Indietro
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={() => close(true)}>
                Inizia
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep(step + 1)}>
                Avanti
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
