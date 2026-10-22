/**
 * Bottoni delle azioni dirette della regia operativa: spostare una data e
 * segnare finita una commessa. Piccoli e solo a icona: la regia è da
 * scrivania e le righe devono restare righe.
 */
import { useState } from "react";
import { format, parseISO, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarClock, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function SpostaData({ etichetta, attuale, inCorso, onScegli }: {
  etichetta: string;
  /** data di adesso, yyyy-MM-dd */
  attuale: string | null;
  inCorso: boolean;
  onScegli: (giorno: string) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const oggi = startOfDay(new Date());
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-slate-500" aria-label={etichetta} title={etichetta} disabled={inCorso}>
          {inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <p className="border-b px-3 py-2 text-xs font-medium text-slate-600">
          {etichetta}{attuale ? ` · ora ${format(parseISO(attuale), "d MMM", { locale: it })}` : ""}
        </p>
        <Calendar
          mode="single"
          locale={it}
          defaultMonth={oggi}
          disabled={{ before: oggi }}
          onSelect={(d) => {
            if (!d) return;
            setAperto(false);
            onScegli(format(d, "yyyy-MM-dd"));
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function SegnaFinita({ codice, fase, inCorso, onConferma }: {
  codice: string;
  /** nome della fase che chiude il lavoro */
  fase: string;
  inCorso: boolean;
  onConferma: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-slate-500" aria-label="Segna finita" title="Segna finita" disabled={inCorso}>
          {inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Segnare finita {codice}?</AlertDialogTitle>
          <AlertDialogDescription>
            La commessa passa alla fase «{fase}», come quando cambi la fase dalla commessa: il cliente
            riceve l'avviso del cambio di fase (se è attivo) e partono le automazioni collegate.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction onClick={onConferma}>Segna finita</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
