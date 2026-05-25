/**
 * AdminFirstRunTour — tour 4-step per nuovo platform_manager o membro team.
 *
 * Trigger: appare automaticamente al PRIMO login di un nuovo membro team
 * (rilevato via `localStorage` flag scoped per user_id). Dopo che l'utente
 * lo chiude o completa, non riappare mai più.
 *
 * Step:
 *   1. Welcome — chi sei, cosa puoi fare
 *   2. Aziende — la lista clienti
 *   3. AI & Operate — come Silvio aiuta
 *   4. Cmd+K — la scorciatoia magica
 *
 * Niente librerie esterne (driver.js, shepherd) — implementazione minimale
 * con shadcn Dialog. Ridotto bundle + più controllo.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  Building,
  Bot,
  Command,
  ArrowRight,
  ArrowLeft,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const TOUR_STORAGE_KEY_PREFIX = "eic-admin-first-run-tour-done:";

function tourStorageKey(userId: string) {
  return `${TOUR_STORAGE_KEY_PREFIX}${userId}`;
}

interface TourStep {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: React.ReactNode;
  cta?: { label: string; onClick: () => void };
}

export function AdminFirstRunTour() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);

  // Mostra il tour solo a member team (admin/platform_*), non super_admin
  // (Florin lo conosce già). E solo se non l'ha già visto.
  useEffect(() => {
    if (!user?.id) return;
    const isPlatformMember =
      role === "platform_manager" ||
      role === "platform_sales" ||
      role === "platform_support" ||
      role === "platform_marketing" ||
      role === "platform_implementation";
    if (!isPlatformMember) return;
    try {
      const done = window.localStorage.getItem(tourStorageKey(user.id));
      if (done !== "1") {
        // Delay 800ms per non aprire subito sopra la dashboard ancora in load
        const t = window.setTimeout(() => setOpen(true), 800);
        return () => window.clearTimeout(t);
      }
    } catch {
      // localStorage non accessibile (modalità incognito strict, ecc.) →
      // skippa silenziosamente — tour resterà chiuso.
    }
  }, [user?.id, role]);

  const closeAndPersist = () => {
    if (user?.id) {
      try {
        window.localStorage.setItem(tourStorageKey(user.id), "1");
      } catch {
        // ignore
      }
    }
    setOpen(false);
    setStepIdx(0);
  };

  const goToStep = (idx: number) => setStepIdx(Math.max(0, Math.min(steps.length - 1, idx)));

  const steps: TourStep[] = [
    {
      icon: Sparkles,
      title: "Benvenuto nel team EdiliziaInCloud",
      description: (
        <>
          Stai per usare il pannello <strong>Superadmin</strong>: da qui gestisci
          aziende clienti, supporto, fatturazione e l&apos;AI del prodotto.
          Ti mostro i 3 luoghi più importanti.
        </>
      ),
    },
    {
      icon: Building,
      title: "Aziende — la tua lista clienti",
      description: (
        <>
          Vedi tutti i clienti registrati, il loro <strong>health score</strong>,
          piano, fatturato. Click su un&apos;azienda per accedere ai dettagli o
          impersonare per supporto.
        </>
      ),
      cta: {
        label: "Apri Aziende",
        onClick: () => {
          closeAndPersist();
          navigate("/admin/aziende");
        },
      },
    },
    {
      icon: Bot,
      title: "AI — il cervello operativo",
      description: (
        <>
          Silvio è l&apos;AI strategica della piattaforma. In{" "}
          <strong>AI · Operate</strong> vedi cosa sta facendo, approvi azioni
          rischiose, gestisci la coda outbound. <strong>AI · Monitor</strong>{" "}
          per i costi e la salute.
        </>
      ),
      cta: {
        label: "Apri AI Operate",
        onClick: () => {
          closeAndPersist();
          navigate("/admin/ai");
        },
      },
    },
    {
      icon: Command,
      title: "⌘K — la scorciatoia magica",
      description: (
        <>
          Premi <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd> (o{" "}
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">Ctrl+K</kbd>) in qualsiasi pagina
          per cercare aziende, andare a Revenue/Fatture, aprire l&apos;AI ecc.
          Provala adesso!
        </>
      ),
    },
  ];

  const step = steps[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === steps.length - 1;
  const StepIcon = step.icon;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(v) : closeAndPersist())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              aria-hidden="true"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-md"
            >
              <StepIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">{step.title}</DialogTitle>
              <DialogDescription className="mt-1.5 text-sm leading-6">
                {step.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Step indicator */}
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {steps.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => goToStep(idx)}
              aria-label={`Vai allo step ${idx + 1}`}
              className={`h-1.5 w-6 rounded-full transition-all ${
                idx === stepIdx
                  ? "bg-orange-500"
                  : idx < stepIdx
                  ? "bg-orange-300"
                  : "bg-slate-200"
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={closeAndPersist}
            className="gap-1.5 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Salta tour
          </Button>
          <div className="flex gap-2">
            {!isFirst && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => goToStep(stepIdx - 1)}
                className="gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Indietro
              </Button>
            )}
            {step.cta ? (
              <Button
                type="button"
                size="sm"
                onClick={step.cta.onClick}
                className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
              >
                {step.cta.label}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : !isLast ? (
              <Button
                type="button"
                size="sm"
                onClick={() => goToStep(stepIdx + 1)}
                className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
              >
                Avanti
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={closeAndPersist}
                className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
              >
                Inizia ad esplorare
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
