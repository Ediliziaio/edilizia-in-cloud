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
import { Calendar, ListChecks, FileText, EyeOff } from "lucide-react";
import type { SrProgettoRow } from "@/types/serramenti";
import { SrCard } from "@/lib/serramenti/wizardUI";

/**
 * Il campo «datetime-local» mostra e restituisce l'ora locale. Riempirlo con
 * toISOString() gli dava l'ora UTC: l'appuntamento delle 10:30 riappariva alle
 * 08:30 e, uscendo dal campo, veniva salvato di nuovo due ore prima.
 */
function perCampoDataOra(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

interface Props {
  form: Partial<SrProgettoRow>;
  onChange: <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => void;
}

export function StepConsulenza({ form, onChange }: Props) {
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
    // Filtra stringhe vuote in coda così non finiscono nel PDF: se l'utente
    // edita lo step 4 senza compilare 1-3, gli step vuoti precedenti restano
    // ma non viene salvato un trailing di vuoti inutili.
    let lastNonEmpty = next.length - 1;
    while (lastNonEmpty >= 0 && next[lastNonEmpty].trim() === "") lastNonEmpty--;
    onChange("prossimi_passi", next.slice(0, lastNonEmpty + 1));
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
          <div className="col-span-7 md:col-span-6">
            <Label className="text-xs">Data e ora</Label>
            <Input
              type="datetime-local"
              defaultValue={perCampoDataOra(form.consulenza_at)}
              onBlur={(e) => onChange("consulenza_at", e.target.value ? new Date(e.target.value).toISOString() : null)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-5 md:col-span-6">
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
      {/* Testo del modello, che dal telefono non si ritocca. */}
      <SrCard
        title="Prossimi passi"
        description="I 4 step che il cliente vedrà in fondo al PDF (pagina 3)."
        icon={<ListChecks className="h-4 w-4" />}
        className="max-md:hidden"
      >
        <div className="space-y-2">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold shrink-0">
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

      {/* Note: 2 colonne side-by-side per distinguere visivamente i 2 ambiti
          (cliente vs backoffice). Stack su mobile. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Note per il cliente — visibili nel PDF emesso */}
        <SrCard
          title="Note per il cliente"
          description="Compaiono nel PDF preventivo. Usale per condizioni speciali, tempi consegna, scelte di stile concordate."
          icon={<FileText className="h-4 w-4 text-orange-600" />}
        >
          <Textarea
            defaultValue={form.note_cliente ?? ""}
            onBlur={(e) => onChange("note_cliente", e.target.value || null)}
            placeholder="Es: Consegna entro 30 giorni dall'accettazione. Colore RAL custom su misura, eventuali ritocchi inclusi."
            rows={4}
            // Telefono: il testo scritto resta a 16px (sotto, iOS ingrandisce la pagina al tocco);
            // più piccoli il suggerimento e la casella.
            className="bg-orange-50/30 border-orange-200 focus-visible:ring-orange-300 max-md:h-[88px] max-md:min-h-0 max-md:placeholder:text-[13px]"
          />
          <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1 max-md:hidden">
            <FileText className="h-3 w-3" />
            Questo testo apparirà nel PDF inviato al cliente.
          </p>
        </SrCard>

        {/* Note interne — solo backoffice, mai esposte */}
        <SrCard
          title="Note interne"
          description="Solo per il backoffice — non compaiono nel PDF cliente."
          icon={<EyeOff className="h-4 w-4" />}
          variant="muted"
        >
          <Textarea
            defaultValue={form.note_interne ?? ""}
            onBlur={(e) => onChange("note_interne", e.target.value || null)}
            placeholder="Vincoli, ferie cliente, urgenze, eccezioni, promemoria interni..."
            rows={4}
            className="max-md:h-[72px] max-md:min-h-0 max-md:placeholder:text-[13px]"
          />
          <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1 max-md:hidden">
            <EyeOff className="h-3 w-3" />
            Visibili solo allo staff. <strong>Mai</strong> esposte al cliente.
          </p>
        </SrCard>
      </div>
    </div>
  );
}
