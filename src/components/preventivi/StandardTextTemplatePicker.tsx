/**
 * Libreria locale di testi standard per i PDF preventivo.
 *
 * La libreria è intenzionalmente indipendente dal database: applicare una base
 * riempie solo il form locale e lascia all'utente l'ultima parola prima del
 * salvataggio. Tutti i moduli ricevono la stessa copertura editoriale.
 */
import { useMemo, useState } from "react";
import { Check, Library, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { AiTemplateDraft } from "@/components/preventivi/AiTemplateReviewDialog";
import { standardTemplateAreaStatus } from "@/lib/preventivi/standardTemplateAreas";
import {
  buildStandardTextTemplate,
  type StandardCopyStyle,
  type StandardTemplateModule,
} from "@/lib/preventivi/standardTextTemplates";

const STYLE_META: Record<StandardCopyStyle, { label: string; description: string }> = {
  chiara: { label: "Proposta chiara", description: "Semplice da capire e orientata alla decisione." },
  premium: { label: "Premium consulenziale", description: "Più emozionale, con attenzione a design e valore." },
  tecnica: { label: "Tecnica e trasparente", description: "Dettagli, metodo, controlli e limiti esplicitati." },
  essenziale: { label: "Essenziale", description: "Testi più brevi per preventivi compatti e veloci." },
};

interface Props {
  module: StandardTemplateModule;
  onApply: (draft: AiTemplateDraft) => void;
  snapshot?: Record<string, unknown>;
  className?: string;
}

export function StandardTextTemplatePicker({ module, onApply, snapshot, className }: Props) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<StandardCopyStyle>("chiara");
  const words = { serramenti: "Serramenti", fotovoltaico: "Fotovoltaico", ristrutturazione: "Ristrutturazione", bagni: "Bagni", tetti: "Tetti", climatizzazione: "Climatizzazione", elettrico: "Elettrico / Domotica", termoidraulico: "Termoidraulico", pavimenti: "Pavimenti & Resine", piscine: "Piscine" }[module];
  const subject = { serramenti: "serramenti", fotovoltaico: "impianto fotovoltaico", ristrutturazione: "ristrutturazione", bagni: "bagno", tetti: "copertura", climatizzazione: "impianto di climatizzazione", elettrico: "impianto elettrico", termoidraulico: "impianto termoidraulico", pavimenti: "pavimento e rivestimento", piscine: "piscina" }[module];
  const draft = useMemo(() => buildStandardTextTemplate(module, style), [module, style]);
  const areas = useMemo(() => standardTemplateAreaStatus(snapshot), [snapshot]);
  const readyAreas = areas.filter((area) => area.ready).length;

  const apply = () => {
    onApply(draft);
    setOpen(false);
    toast.success("Base testi applicata", { description: "Le sezioni sono state compilate localmente: rivedi e salva quando vuoi." });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className={cn("gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50", className)}
      >
        <Library className="h-4 w-4" />
        Testi standard
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Library className="h-5 w-5 text-orange-500" />Libreria testi standard · {words}</DialogTitle>
            <DialogDescription>
              Scegli una base completa per {subject}. L&apos;applicazione è locale e non salva nulla: potrai personalizzare ogni sezione prima dell&apos;anteprima.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(STYLE_META) as StandardCopyStyle[]).map((key) => {
              const meta = STYLE_META[key];
              const selected = style === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStyle(key)}
                  aria-pressed={selected}
                  className={cn("rounded-lg border p-3 text-left transition-colors hover:border-orange-300 hover:bg-orange-50", selected && "border-orange-400 bg-orange-50 ring-2 ring-orange-200")}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-semibold"><span>{meta.label}</span>{selected ? <Check className="h-4 w-4 text-orange-600" /> : null}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{meta.description}</span>
                </button>
              );
            })}
          </div>
          <div className="rounded-lg border bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-slate-800">
              <span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-orange-500" />Controllo standardizzazione</span>
              <span className={cn("rounded-full px-2 py-1 text-[11px]", readyAreas === areas.length ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800")}>{readyAreas}/{areas.length} aree valorizzate</span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {areas.map((area) => (
                <div key={area.id} className="flex items-start gap-2 rounded border bg-white px-2 py-1.5 text-[11px]">
                  <span className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", area.ready ? "bg-emerald-500" : "bg-amber-400")} />
                  <span className="min-w-0"><strong>{area.label}</strong><span className="ml-1 text-slate-500">· {area.ready ? "presente" : "da completare"}</span></span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Il kit precompila i testi comuni. Foto, blocchi tecnici, recensioni reali, dati aziendali e condizioni legali restano modificabili nelle rispettive aree dell&apos;editor.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
            <Button type="button" onClick={apply} className="gap-1.5 bg-orange-500 hover:bg-orange-600"><Check className="h-4 w-4" />Applica questa base</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default StandardTextTemplatePicker;
