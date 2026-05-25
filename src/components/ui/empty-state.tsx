/**
 * EmptyState — componente riusabile per liste/dashboard senza dati.
 *
 * Pattern unificato in admin/azienda: icona + titolo + descrizione + CTA.
 *
 * v2 (2026-05-25) — backward-compatible:
 *   - aggiunto prop `tone` (neutral/warning/error/success) → colora l'icona
 *   - aggiunto prop `size` (sm/md/lg) → variante più granulare di `inline`
 *   - `action.icon` per icona dentro al bottone
 *   - `action.primary` come alias di `variant="default"` (DX migliore)
 *   - `className` extra per estendere lo style esterno
 *   - aria-live="polite" → screen reader annuncia stato vuoto
 */
import type { LucideIcon } from "lucide-react";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost";
  /** Alias DX: primary=true → variant="default". */
  primary?: boolean;
  /** Icona opzionale a sinistra del label. */
  icon?: LucideIcon;
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  /** Inline = padding ridotto, per usare dentro a una Card già contenuta. Deprecated: usa `size="sm"`. */
  inline?: boolean;
  /**
   * Variante dimensionale.
   *   - "sm" → inline compatto (sostituisce `inline=true`)
   *   - "md" → default
   *   - "lg" → page-level con padding generoso
   */
  size?: "sm" | "md" | "lg";
  /** Tono visivo dell'icona. */
  tone?: "neutral" | "warning" | "error" | "success";
  className?: string;
}

const TONE_BG: Record<NonNullable<EmptyStateProps["tone"]>, string> = {
  neutral: "bg-muted text-muted-foreground",
  warning: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  error: "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
  success: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
};

export function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  action,
  secondaryAction,
  inline = false,
  size,
  tone = "neutral",
  className,
}: EmptyStateProps) {
  // Risolvi size: `size` prop esplicita ha precedenza, altrimenti deriva da `inline`.
  const resolvedSize: "sm" | "md" | "lg" = size ?? (inline ? "sm" : "md");
  const isSm = resolvedSize === "sm";
  const isLg = resolvedSize === "lg";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        isSm ? "py-6 px-4" : isLg ? "py-16 px-6" : "py-12 px-6",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "mb-3 rounded-full",
          isSm ? "p-2" : isLg ? "p-5" : "p-4",
          TONE_BG[tone],
        )}
      >
        <Icon
          className={isSm ? "h-6 w-6" : isLg ? "h-12 w-12" : "h-10 w-10"}
          aria-hidden="true"
        />
      </div>
      <h3
        className={cn(
          "font-semibold",
          isSm ? "text-base" : isLg ? "text-xl" : "text-lg",
        )}
      >
        {title}
      </h3>
      {description ? (
        <p
          className={cn(
            "text-muted-foreground mt-1 max-w-md",
            isSm ? "text-xs" : "text-sm",
          )}
        >
          {description}
        </p>
      ) : null}
      {action || secondaryAction ? (
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          {action ? <EmptyActionButton {...action} size={isSm ? "sm" : "default"} /> : null}
          {secondaryAction ? (
            <EmptyActionButton {...secondaryAction} size={isSm ? "sm" : "default"} variant="ghost" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EmptyActionButton({
  label,
  onClick,
  variant,
  primary,
  icon: Icon,
  size,
}: EmptyStateAction & { size: "sm" | "default" }) {
  const resolvedVariant = variant ?? (primary ? "default" : "default");
  return (
    <Button onClick={onClick} variant={resolvedVariant} size={size} className="gap-1.5">
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {label}
    </Button>
  );
}
