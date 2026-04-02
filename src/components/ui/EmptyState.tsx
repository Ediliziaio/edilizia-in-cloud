/**
 * EmptyState — reusable empty/zero-data state component.
 *
 * Features:
 *  - Icon slot (any Lucide icon or custom SVG)
 *  - Title + optional description
 *  - Optional primary CTA button
 *  - Optional secondary CTA button
 *  - Compact variant for table rows / small containers
 *  - aria-label on the container for screen readers
 */

import { type ReactNode, type ElementType } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  variant?: "default" | "outline" | "ghost" | "secondary";
  disabled?: boolean;
}

interface EmptyStateProps {
  /** Lucide icon component or any React element */
  icon?: ElementType<{ className?: string }> | ReactNode;
  title: string;
  description?: string;
  /** Primary action (e.g. "Aggiungi il primo elemento") */
  action?: EmptyStateAction;
  /** Secondary action (e.g. "Importa da file") */
  secondaryAction?: EmptyStateAction;
  /** Compact: smaller padding and text, for inline use */
  compact?: boolean;
  /** Extra class names */
  className?: string;
  /** aria-label for the container */
  ariaLabel?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  className,
  ariaLabel,
}: EmptyStateProps) {
  const renderIcon = () => {
    if (!Icon) return null;
    // If it's a React element (JSX), render directly
    if (typeof Icon !== "function") return Icon as ReactNode;
    // Lucide icon component
    const IconComponent = Icon as ElementType<{ className?: string }>;
    return (
      <IconComponent
        className={cn(
          "text-muted-foreground/40",
          compact ? "h-8 w-8" : "h-12 w-12"
        )}
        aria-hidden="true"
      />
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-6 px-4" : "py-12 px-6",
        className
      )}
      role="status"
      aria-label={ariaLabel || title}
    >
      {Icon && (
        <div className={cn("mb-3", compact ? "mb-2" : "mb-4")}>
          {renderIcon()}
        </div>
      )}

      <p
        className={cn(
          "font-medium text-muted-foreground",
          compact ? "text-sm" : "text-base"
        )}
      >
        {title}
      </p>

      {description && (
        <p
          className={cn(
            "text-muted-foreground/70 mt-1",
            compact ? "text-xs" : "text-sm"
          )}
        >
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className={cn("flex gap-2 flex-wrap justify-center", compact ? "mt-3" : "mt-5")}>
          {action && (
            <Button
              size={compact ? "sm" : "default"}
              variant={action.variant ?? "default"}
              onClick={action.onClick}
              disabled={action.disabled}
              aria-label={action.label}
            >
              {action.icon && <span className="mr-1.5" aria-hidden="true">{action.icon}</span>}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              size={compact ? "sm" : "default"}
              variant={secondaryAction.variant ?? "outline"}
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
              aria-label={secondaryAction.label}
            >
              {secondaryAction.icon && <span className="mr-1.5" aria-hidden="true">{secondaryAction.icon}</span>}
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
