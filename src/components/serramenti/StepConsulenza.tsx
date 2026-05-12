/**
 * StepConsulenza — Step 7 wizard: appuntamento + consulente + prossimi passi.
 *
 * Note: il cronoprogramma (timeline produzione/posa/collaudo) è stato rimosso
 * dal wizard e dal PDF. La narrazione del workflow al cliente avviene tramite
 * la pagina "Il tuo percorso" del template, configurabile in Impostazioni.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar, MapPin, ListChecks } from "lucide-react";
import type { SrProgettoRow, SrProgettoDetail } from "@/types/serramenti";
import { SrCard } from "@/lib/serramenti/wizardUI";

interface Props {
  form: Partial<SrProgettoRow>;
  onChange: <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => void;
  detail: SrProgettoDetail;
}

export function StepConsulenza({ form, onChange, detail }: Props) {
  const _numSerramenti = detail.serramenti.reduce((acc, s) => acc + (s.quantita ?? 1), 0);
  void _numSerramenti;

  // Prossimi passi (default + custom)
  const prossimiPassi = (form.prossimi_passi ?? [
    "Ci vediamo per la consulenza tecnica",
    "Ascoltiamo le tue esigenze e troviamo la soluzione migliore",
    "Sviluppiamo il Piano dei Lavori e definiamo i dettagli",
    "Firmi e procediamo insieme",
  ]) as string[];

  const updatePasso = (idx: number, value: string) => {
    const next = [...prossimiPassi];
    while (next.length <= idx) next.push("");
    next[idx] = value;
    onChange("prossimi_passi", next);
  };

  return (
    <div className="space-y-3">
      {/* Appuntamento */}
      <SrCard
        title="Appuntamento di consulenza"
        description="Data, ora e luogo dell'incontro con il consulente. Compariranno nella pagina 3 del PDF."
        icon={<Calendar className="h-4 w-4" />}
      >
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-6">
            <Label className="text-xs">Data e ora</Label>
            <Input
              type="datetime-local"
              defaultValue={form.consulenza_at ? new Date(form.consulenza_at).toISOString().slice(0, 16) : ""}
              onBlur={(e) => onChange("consulenza_at", e.target.value ? new Date(e.target.value).toISOString() : null)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-12 md:col-span-6">
            <Label className="text-xs">Luogo</Label>
            <Select
              value={form.consulenza_luogo ?? ""}
              onValueChange={(v) => onChange("consulenza_luogo", v)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Scegli..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A casa tua">A casa tua</SelectItem>
                <SelectItem value="In showroom">In showroom</SelectItem>
                <SelectItem value="Video-call">Video-call</SelectItem>
                <SelectItem value="In cantiere">In cantiere</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SrCard>

      {/* Cronoprogramma rimosso — sostituito dalla pagina dedicata "Il tuo percorso"
          configurabile dal template. La timeline lineare non aggiungeva valore
          rispetto alle 4 fasi narrative del percorso cliente. */}

      {/* Prossimi passi */}
      <SrCard
        title="Prossimi passi"
        description="I 4 step che il cliente vedrà in fondo al PDF (pagina 3)."
        icon={<ListChecks className="h-4 w-4" />}
      >
        <div className="space-y-2">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                {idx + 1}
              </span>
              <Input
                value={prossimiPassi[idx] ?? ""}
                onChange={(e) => updatePasso(idx, e.target.value)}
                placeholder="Es. Ci vediamo per la consulenza tecnica"
                className="h-9 text-xs flex-1"
              />
            </div>
          ))}
        </div>
      </SrCard>

      {/* Note interne (non in PDF) */}
      <SrCard
        title="Note interne"
        description="Solo per il backoffice — non compaiono nel PDF cliente."
        icon={<MapPin className="h-4 w-4" />}
        variant="muted"
      >
        <Textarea
          defaultValue={form.note_interne ?? ""}
          onBlur={(e) => onChange("note_interne", e.target.value || null)}
          placeholder="Vincoli, ferie cliente, urgenze, eccezioni..."
          rows={3}
        />
      </SrCard>
    </div>
  );
}

// Gantt SVG rimosso: il cronoprogramma non viene più mostrato al cliente.
// Per la timeline visiva si usa la pagina "Il tuo percorso" del PDF.
