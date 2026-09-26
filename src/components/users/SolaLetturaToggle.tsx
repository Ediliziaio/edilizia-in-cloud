import { Lock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { SOLA_LETTURA_HELP, SOLA_LETTURA_LABEL } from "@/components/users/permissionsDefaults";

interface SolaLetturaToggleProps {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Interruttore «Sola lettura» condiviso da tutte le finestre permessi: un solo
 * testo e un solo aspetto, così creazione, modifica e import dicono la stessa
 * cosa. Il resto (modifica che segue la visibilità) lo derivano
 * applyEditFollowsView e il trigger in DB.
 */
export function SolaLetturaToggle({ id, checked, onCheckedChange, disabled, className }: SolaLetturaToggleProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 p-3 rounded-lg border max-sm:py-2",
        checked ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900/50" : "bg-muted/30",
        className,
      )}
    >
      <div className="space-y-0.5 min-w-0">
        <Label htmlFor={id} className="font-medium flex items-center gap-2 text-sm cursor-pointer">
          <Lock className="h-4 w-4" />
          {SOLA_LETTURA_LABEL}
        </Label>
        {/* Mobile: basta l'etichetta, la spiegazione occupava tre righe. */}
        <p className="text-xs text-muted-foreground max-sm:hidden">{SOLA_LETTURA_HELP}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
