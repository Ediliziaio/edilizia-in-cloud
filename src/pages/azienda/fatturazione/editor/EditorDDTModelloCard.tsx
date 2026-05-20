/**
 * EditorDDTModelloCard — selettore "Modello grafico" mostrato sul layout
 * DDT (replica di Fatture in Cloud). Per ora abbiamo un unico template
 * ufficiale (DPR 472/96 senza prezzi), quindi lo mostriamo readonly per
 * indicare all'utente quale template verrà usato — futuro: multi-template.
 */
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function EditorDDTModelloCard() {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        Modello grafico
      </Label>
      <Select value="ddt_dpr_472" disabled>
        <SelectTrigger className="h-8 text-xs mt-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ddt_dpr_472">DDT senza prezzi — DPR 472/96</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
