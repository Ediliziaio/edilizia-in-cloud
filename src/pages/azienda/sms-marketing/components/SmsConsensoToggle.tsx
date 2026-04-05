/**
 * Toggle consenso marketing GDPR con etichetta esplicativa.
 *
 * @param value - Stato corrente del consenso
 * @param onChange - Callback al cambio valore
 * @param disabled - Disabilita il toggle
 */
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";

interface SmsConsensoToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export function SmsConsensoToggle({ value, onChange, disabled }: SmsConsensoToggleProps) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3 bg-muted/20">
      <Shield className={`h-4 w-4 mt-0.5 shrink-0 ${value ? "text-emerald-600" : "text-muted-foreground"}`} />
      <div className="flex-1 space-y-0.5">
        <Label className="text-sm font-medium cursor-pointer" htmlFor="consenso-toggle">
          Consenso marketing GDPR
        </Label>
        <p className="text-xs text-muted-foreground">
          Il contatto ha fornito consenso esplicito alla ricezione di comunicazioni promozionali via SMS.
        </p>
      </div>
      <Switch
        id="consenso-toggle"
        checked={value}
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}
