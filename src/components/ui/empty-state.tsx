/**
 * IMPROVEMENT #23 — Empty states migliori
 *
 * Componente riusabile per liste/dashboard senza dati. CTA primario +
 * descrizione + icona invece del solo "Nessun risultato".
 */
import type { LucideIcon } from "lucide-react";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "ghost";
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Inline = padding ridotto, per usare dentro a una Card già contenuta */
  inline?: boolean;
}

export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
  secondaryAction,
  inline = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        inline ? "py-6 px-4" : "py-12 px-6"
      }`}
      role="status"
    >
      <div
        className={`mb-3 rounded-full bg-muted ${
          inline ? "p-2" : "p-4"
        } text-muted-foreground`}
      >
        <Icon className={inline ? "h-6 w-6" : "h-10 w-10"} aria-hidden="true" />
      </div>
      <h3 className={`font-semibold ${inline ? "text-base" : "text-lg"}`}>
        {title}
      </h3>
      {description ? (
        <p
          className={`text-muted-foreground mt-1 max-w-sm ${
            inline ? "text-xs" : "text-sm"
          }`}
        >
          {description}
        </p>
      ) : null}
      {action || secondaryAction ? (
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          {action ? (
            <Button
              onClick={action.onClick}
              variant={action.variant ?? "default"}
              size={inline ? "sm" : "default"}
            >
              {action.label}
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button
              onClick={secondaryAction.onClick}
              variant="ghost"
              size={inline ? "sm" : "default"}
            >
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
