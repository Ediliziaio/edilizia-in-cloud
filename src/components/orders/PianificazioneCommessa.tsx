import { useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calcolaFineLavori, dataValida, type SettimanaLavorativa } from "@/lib/orders/pianificazioneAvvio";

export type CampoDataPiano = "work_start_date" | "work_end_date" | "expected_date" | "warehouse_arrival_date";
interface Props {
  date: Partial<Record<CampoDataPiano, Date>>;
  onData: (campo: CampoDataPiano, valore: Date | undefined) => void;
  durata: string;
  onDurata: (valore: string) => void;
  settimana: SettimanaLavorativa;
  onSettimana: (valore: SettimanaLavorativa) => void;
  erroreFine?: string;
}

export function PianificazioneCommessa({ date, onData, durata, onDurata, settimana, onSettimana, erroreFine }: Props) {
  const [dettagli, setDettagli] = useState(!!(date.expected_date || date.warehouse_arrival_date));
  const fineCalcolata = calcolaFineLavori(date.work_start_date, Number(durata), settimana);
  const finePrima = dataValida(date.work_end_date) && dataValida(date.work_start_date) && date.work_end_date < date.work_start_date;
  const materialiTardi = dataValida(date.warehouse_arrival_date) && dataValida(date.work_start_date) && date.warehouse_arrival_date > date.work_start_date;
  const aggiornaData = (nome: CampoDataPiano, valore: string) => {
    const nuova = valore ? new Date(`${valore}T00:00:00`) : undefined;
    onData(nome, dataValida(nuova) ? nuova : undefined);
  };
  const campo = (nome: CampoDataPiano, titolo: string) => (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={`piano-${nome}`} className="text-xs sm:text-sm">{titolo}</Label>
      <Input id={`piano-${nome}`} type="date" className="h-10 min-w-0 w-full bg-white text-sm"
        value={dataValida(date[nome]) ? format(date[nome]!, "yyyy-MM-dd") : ""}
        aria-invalid={nome === "work_end_date" && !!(finePrima || erroreFine)}
        aria-describedby={nome === "work_end_date" && (finePrima || erroreFine) ? "errore-fine-piano" : undefined}
        onInput={(e) => aggiornaData(nome, e.currentTarget.value)}
        onChange={(e) => aggiornaData(nome, e.target.value)} />
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        {campo("work_start_date", "Inizio lavori")}
        {campo("work_end_date", "Fine lavori prevista")}
      </div>
      {(finePrima || erroreFine) && <p id="errore-fine-piano" role="alert" className="text-xs text-red-600">{erroreFine || "La fine lavori non può precedere l’inizio."}</p>}
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
        <div className="grid grid-cols-2 items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="piano-durata" className="text-xs">Durata stimata · giorni lavorativi</Label>
            <Input id="piano-durata" type="number" min={1} max={3660} step={1} inputMode="numeric" className="h-10 bg-white" placeholder="Es. 40" value={durata} onChange={(e) => onDurata(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="piano-settimana" className="text-xs">Settimana di lavoro</Label>
            <select id="piano-settimana" value={settimana} onChange={(e) => onSettimana(Number(e.target.value) as SettimanaLavorativa)} className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm">
              <option value={5}>Lun – ven</option><option value={6}>Lun – sab</option>
            </select>
          </div>
          <Button type="button" variant="outline" className="col-span-2 h-10 border-blue-200 bg-white text-blue-900" disabled={!fineCalcolata} onClick={() => onData("work_end_date", fineCalcolata)}>
            <CalendarDays className="mr-2 h-4 w-4" />Calcola fine
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-600" aria-live="polite">
          {fineCalcolata ? `Fine stimata: ${format(fineCalcolata, "d MMM yyyy", { locale: it })}. ` : "Indica inizio e durata per stimare la fine. "}
          Festività e attese tecniche escluse.<span className="max-sm:hidden"> La data cambia solo premendo «Calcola fine».</span>
        </p>
      </div>
      <div className="border-t border-slate-100 pt-3">
        <Button type="button" variant="ghost" className="h-9 w-full justify-between px-0 text-sm text-slate-600 hover:bg-transparent" aria-expanded={dettagli} aria-controls="date-secondarie-piano" onClick={() => setDettagli(!dettagli)}>
          Date cliente e materiali <ChevronDown className={`h-4 w-4 transition-transform ${dettagli ? "rotate-180" : ""}`} />
        </Button>
        {!dettagli && (date.expected_date || date.warehouse_arrival_date) && <p className="text-xs text-slate-500">Date aggiuntive impostate</p>}
        {dettagli && <div id="date-secondarie-piano" className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>{campo("expected_date", "Data prevista per il cliente")}<p className="mt-1 text-[11px] text-slate-500">Riferimento cliente, distinto dalle date di lavoro.</p></div>
          <div>{campo("warehouse_arrival_date", "Arrivo merce in magazzino")}<p className="mt-1 text-[11px] text-slate-500">Facoltativa: non tutti i lavori prevedono un passaggio in magazzino.</p></div>
        </div>}
      </div>
      {materialiTardi && <p role="status" className="rounded-lg bg-orange-50 p-2.5 text-xs text-orange-800">La merce arriva dopo l’inizio lavori: verifica quali fasi possono partire senza quei materiali.</p>}
    </div>
  );
}
