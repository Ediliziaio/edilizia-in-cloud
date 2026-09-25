import { useState } from "react";
import { Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface InterventionCopyChoice {
  id: string;
  section: string;
  label: string;
  preview: string;
  patch: Record<string, unknown>;
}

/** Apply one reviewed section, never an entire generic area over a custom module. */
export function InterventionTextPicker({ title, choices, onApply }: {
  title: string; choices: InterventionCopyChoice[]; onApply: (patch: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(choices[0]?.id ?? "");
  const choice = choices.find(item => item.id === selected) ?? choices[0];
  const sections = [...new Set(choices.map(item => item.section))];
  return <>
    <Button type="button" variant="outline" onClick={() => setOpen(true)}><Library className="mr-2 h-4 w-4" />Testi per questo modulo</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Testi pronti · {title}</DialogTitle><DialogDescription>Scegli e leggi una variante. Verrà sostituita solo la sezione indicata, senza salvare il modulo e senza modificare le altre pagine.</DialogDescription></DialogHeader>
        <label className="space-y-2 text-sm font-medium">Sezione e variante
          <select className="mt-2 h-10 w-full rounded-md border bg-background px-3" value={choice?.id ?? ""} onChange={e => setSelected(e.target.value)}>
            {sections.map(section => <optgroup key={section} label={section}>{choices.filter(item => item.section === section).map(item => <option key={item.id} value={item.id}>{section} · {item.label}</option>)}</optgroup>)}
          </select>
        </label>
        <div className="max-h-[45vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed" aria-label="Anteprima del testo">{choice?.preview}</div>
        <p className="text-xs text-muted-foreground">Il testo è una base da adattare alle lavorazioni effettivamente offerte. Le tue modifiche alla sezione scelta verranno sostituite; le altre restano invariate.</p>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button><Button disabled={!choice} onClick={() => { if (choice) onApply(structuredClone(choice.patch)); setOpen(false); }}>Applica a {choice?.section.toLowerCase()}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
