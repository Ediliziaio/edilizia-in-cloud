import React from "react";
import { Users, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export type ObjectType = "contacts" | "opportunities";

interface StepStartProps {
  objectType: ObjectType;
  onObjectTypeChange: (t: ObjectType) => void;
}

const OPTIONS: { type: ObjectType; icon: typeof Users; title: string; desc: string }[] = [
  {
    type: "contacts",
    icon: Users,
    title: "Contatti",
    desc: "Contiene l'elenco di tutti i lead, i loro dettagli e le specifiche",
  },
  {
    type: "opportunities",
    icon: Target,
    title: "Opportunità",
    desc: "Contiene l'elenco di tutte le vendite, le loro fasi, gli stati e l'avanzamento",
  },
];

export const StepStart = React.forwardRef<HTMLDivElement, StepStartProps>(
  function StepStart({ objectType, onObjectTypeChange }, ref) {
    return (
      <div ref={ref} className="max-w-xl mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Cosa vuoi importare?</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Seleziona il tipo di dati che desideri importare nel sistema.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = objectType === opt.type;
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() => onObjectTypeChange(opt.type)}
                className={cn(
                  "flex flex-col items-center text-center gap-3 p-6 rounded-xl border-2 transition-all cursor-pointer",
                  selected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/40 hover:bg-muted/30"
                )}
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold">{opt.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{opt.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);
