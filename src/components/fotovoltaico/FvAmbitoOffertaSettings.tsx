import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { AmbitoOffertaFv } from "../../../supabase/functions/_shared/fvAmbitoOfferta";

export function FvAmbitoOffertaSettings({ value, onChange }: { value: AmbitoOffertaFv; onChange: (v: AmbitoOffertaFv) => void }) {
  return <div className="space-y-4">
    <label className="flex items-center gap-3 text-sm"><Switch checked={value.attivo} onCheckedChange={attivo => onChange({ ...value, attivo })} />Mostra inclusioni, esclusioni e verifiche nel PDF</label>
    <p className="text-xs text-muted-foreground">Una voce per riga. Indica soltanto attività e responsabilità confermate; i campi vuoti non aggiungono impegni alla proposta.</p>
    {([['inclusioni', 'Cosa è incluso'], ['esclusioni', 'Cosa è escluso'], ['verifiche', 'Verifiche e condizioni da confermare']] as const).map(([campo, titolo]) => <div key={campo} className="space-y-1">
      <Label htmlFor={`fv-ambito-${campo}`}>{titolo}</Label>
      <Textarea id={`fv-ambito-${campo}`} rows={4} value={value[campo].join('\n')} onChange={e => onChange({ ...value, [campo]: e.target.value.split('\n') })} />
    </div>)}
  </div>;
}
