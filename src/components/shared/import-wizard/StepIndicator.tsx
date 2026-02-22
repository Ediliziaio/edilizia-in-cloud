import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Avvia", desc: "Seleziona gli oggetti e ulteriori informazioni" },
  { label: "Carica", desc: "Carica il file e configura" },
  { label: "Mappa", desc: "Mappa le colonne ai campi" },
  { label: "Verifica", desc: "Conferma e finalizza la selezione" },
];

interface StepIndicatorProps {
  currentStep: number; // 0-indexed
}

export const StepIndicator = React.forwardRef<HTMLDivElement, StepIndicatorProps>(
  ({ currentStep }, ref) => {
    return (
      <div ref={ref} className="flex items-start justify-center gap-0 w-full max-w-2xl mx-auto py-6">
        {STEPS.map((step, i) => {
          const isCompleted = i < currentStep;
          const isCurrent = i === currentStep;
          const isFuture = i > currentStep;

          return (
            <div key={i} className="flex items-start flex-1">
              <div className="flex flex-col items-center flex-1">
                {/* Circle */}
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors",
                    isCompleted && "bg-primary border-primary text-primary-foreground",
                    isCurrent && "bg-primary border-primary text-primary-foreground",
                    isFuture && "bg-muted border-border text-muted-foreground"
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                {/* Label */}
                <p className={cn(
                  "text-xs font-medium mt-1.5 text-center",
                  (isCompleted || isCurrent) ? "text-foreground" : "text-muted-foreground"
                )}>
                  {step.label}
                </p>
                <p className="text-[10px] text-muted-foreground text-center leading-tight">
                  {step.desc}
                </p>
              </div>
              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div className="flex-shrink-0 w-16 mt-[18px]">
                  <div className={cn(
                    "h-0.5 w-full",
                    i < currentStep ? "bg-primary" : "bg-border"
                  )} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
);

StepIndicator.displayName = "StepIndicator";
