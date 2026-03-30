import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskTagBadgeProps {
  name: string;
  color: string;
  onRemove?: () => void;
  size?: "sm" | "xs";
}

// Genera un colore testo contrastante (bianco o nero) dal colore hex del badge
function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#000000" : "#ffffff";
}

export function TaskTagBadge({ name, color, onRemove, size = "sm" }: TaskTagBadgeProps) {
  const textColor = contrastColor(color);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
      )}
      style={{ backgroundColor: color, color: textColor }}
    >
      {name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="rounded-full hover:opacity-70 transition-opacity"
          aria-label={`Rimuovi tag ${name}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}
