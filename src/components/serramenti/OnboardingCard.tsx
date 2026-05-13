/**
 * OnboardingCard — checklist setup azienda visualizzata sopra il listino
 * preventivi serramenti quando il setup è incompleto.
 *
 * Si nasconde automaticamente quando tutti i 4 step sono done (isComplete=true)
 * per non disturbare aziende già operative.
 *
 * Ogni step ha un CTA che porta alla pagina rilevante. Click "Salta tutorial"
 * dismissa la card via localStorage (riapparirà solo se l'utente azzera lo
 * storage o crea nuova azienda).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight, Sparkles, X } from "lucide-react";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";

const DISMISS_KEY = "sr-onboarding-card-dismissed";

interface Step {
  done: boolean;
  title: string;
  description: string;
  ctaLabel: string;
  ctaPath: string;
}

export function OnboardingCard() {
  const navigate = useNavigate();
  const { data: status, isLoading } = useOnboardingStatus();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Loading + setup completato + utente ha già dismissato → nessun render.
  if (isLoading || !status) return null;
  if (status.isComplete) return null;
  if (dismissed) return null;

  const steps: Step[] = [
    {
      done: status.hasMacroPrincipale,
      title: "Crea la prima macrocategoria di prodotti",
      description: "Es. \"Infissi\", \"Persiane\". È il livello principale del listino, sotto cui vivono i singoli articoli.",
      ctaLabel: "Vai a Macrocategorie",
      ctaPath: "/azienda/impostazioni/listino",
    },
    {
      done: status.hasMacroAccessorio,
      title: "Crea una macrocategoria 🔗 Accessorio",
      description: "Es. \"Tapparelle\", \"Cassonetti\". Appariranno automaticamente nella sezione Accessori del preventivo.",
      ctaLabel: "Crea accessorio",
      ctaPath: "/azienda/impostazioni/listino",
    },
    {
      done: status.hasTariffa,
      title: "Configura le tariffe servizi",
      description: "Trasporto, Tiro al piano, ENEA, Sopralluogo extra. I chip nel preventivo pescheranno i prezzi giusti automaticamente.",
      ctaLabel: "Configura tariffe",
      ctaPath: "/azienda/impostazioni/tariffe",
    },
    {
      done: status.hasArticolo,
      title: "Aggiungi il primo articolo al listino",
      description: "Importa da template (Finestra 1 anta, Porta finestra, …) oppure crea da zero con foto, variabili e griglia prezzi.",
      ctaLabel: "Apri listino articoli",
      ctaPath: "/azienda/impostazioni/listino",
    },
  ];

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignored
    }
    setDismissed(true);
  };

  const progressPct = Math.round((status.completedCount / status.totalCount) * 100);

  return (
    <Card className="border-orange-200 bg-gradient-to-br from-orange-50/40 to-amber-50/30">
      <CardContent className="p-4 space-y-3">
        {/* Header progress */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">
                Setup azienda — {status.completedCount}/{status.totalCount} completati
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Configura questi 4 elementi per iniziare a creare preventivi professionali.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 -mt-1 -mr-1 text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
            title="Nascondi (configurerai più tardi)"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Steps */}
        <ul className="space-y-1.5">
          {steps.map((step, idx) => (
            <li
              key={idx}
              className={`flex items-start gap-2 p-2 rounded-md border transition-colors ${
                step.done
                  ? "border-emerald-200 bg-emerald-50/40"
                  : "border-slate-200 bg-white hover:border-orange-300"
              }`}
            >
              {/* Check */}
              <div
                className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  step.done
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-100 text-slate-400 text-[10px] font-bold"
                }`}
              >
                {step.done ? <Check className="h-3 w-3" strokeWidth={3} /> : idx + 1}
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-xs font-medium leading-tight ${
                    step.done ? "text-emerald-700 line-through" : "text-foreground"
                  }`}
                >
                  {step.title}
                </p>
                {!step.done && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                    {step.description}
                  </p>
                )}
              </div>
              {/* CTA */}
              {!step.done && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(step.ctaPath)}
                  className="h-7 text-[10px] gap-0.5 border-orange-300 text-orange-700 hover:bg-orange-50 shrink-0"
                >
                  {step.ctaLabel}
                  <ChevronRight className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
