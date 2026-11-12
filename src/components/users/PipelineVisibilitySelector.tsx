import { useId } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function PipelineVisibilitySelector({pipelines, selected, disabled, onChange}: {
  pipelines: {id:string;name:string}[];
  selected: string[];
  disabled?: boolean;
  onChange:(ids:string[])=>void;
}) {
  const id=useId();
  const restricted=selected.length>0;
  const available=selected.filter(value=>pipelines.some(p=>p.id===value));
  return <section aria-label="Pipeline CRM visibili" className="rounded-lg border bg-muted/20 p-3 space-y-3">
    <h3 className="text-sm font-medium">Pipeline CRM visibili</h3>
    <RadioGroup aria-label="Accesso alle pipeline" value={restricted ? "selected" : "all"} disabled={disabled} onValueChange={value=>onChange(value==="all" ? [] : pipelines.map(p=>p.id))}>
      <div className="flex items-center gap-2"><RadioGroupItem id={`${id}-all`} value="all"/><Label htmlFor={`${id}-all`}>Tutte le pipeline, anche quelle future</Label></div>
      <div className="flex items-center gap-2"><RadioGroupItem id={`${id}-selected`} value="selected" disabled={disabled || pipelines.length===0}/><Label htmlFor={`${id}-selected`}>Solo le pipeline selezionate</Label></div>
    </RadioGroup>
    {restricted ? <>
      <div className="grid gap-2 sm:grid-cols-2">{pipelines.map(p=><label key={p.id} className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-sm">
        <Checkbox checked={available.includes(p.id)} disabled={disabled || (available.length===1 && available[0]===p.id)} onCheckedChange={checked=>onChange(checked ? [...available,p.id] : available.filter(value=>value!==p.id))}/><span className="min-w-0 break-words">{p.name}</span>
      </label>)}</div>
      <p className="text-xs text-muted-foreground">Mantieni almeno una pipeline. Per togliere tutto l’accesso alle opportunità, disattiva il relativo permesso nel CRM.</p>
      {available.length===0 && <p role="status" className="text-xs text-amber-800 dark:text-amber-300">Le pipeline salvate non sono più disponibili. Scegli una pipeline esistente oppure “Tutte le pipeline”.</p>}
    </> : <p className="text-xs text-muted-foreground">Non ci sono restrizioni sulle pipeline. Il limite ai contatti e alle opportunità assegnati resta indipendente.</p>}
  </section>;
}
