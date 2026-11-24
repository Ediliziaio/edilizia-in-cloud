import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function PermessiDistintiToggle({ id, checked, disabled, onCheckedChange }: { id: string; checked: boolean; disabled?: boolean; onCheckedChange: (checked: boolean) => void }) {
  const t = useT();
  return <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
    <div><Label htmlFor={id}>{t("Distingui visualizzazione e modifica")}</Label><p className="text-xs text-muted-foreground mt-1">{checked ? t("Può consultare alcune aree e lavorare soltanto in quelle con «Modifica» attiva. La sola lettura blocca sempre ogni modifica.") : t("Nelle aree operative chi vede può anche modificare. Attiva questa opzione per scegliere le modifiche una per una.")}</p></div>
    <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
  </div>;
}
