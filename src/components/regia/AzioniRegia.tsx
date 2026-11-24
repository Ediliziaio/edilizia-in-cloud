/**
 * Bottoni delle azioni dirette della regia operativa: spostare una data e
 * segnare finita una commessa. Piccoli e solo a icona: la regia è da
 * scrivania e le righe devono restare righe.
 */
import { useState } from "react";
import { format, parseISO, startOfDay } from "date-fns";
import { CalendarClock, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

export function SpostaData({ etichetta, attuale, inCorso, onScegli }: {
  etichetta: string;
  /** data di adesso, yyyy-MM-dd */
  attuale: string | null;
  inCorso: boolean;
  onScegli: (giorno: string) => void;
}) {
  const t = useT();
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
          {etichetta}{attuale ? ` · ${t("ora {valore}", { valore: format(parseISO(attuale), "d MMM", { locale: dateFnsCampo() }) })}` : ""}
        </p>
        <Calendar
          mode="single"
          locale={dateFnsCampo()}
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
  const t = useT();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-slate-500" aria-label={t("Segna finita")} title={t("Segna finita")} disabled={inCorso}>
          {inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Segnare finita {codice}?", { codice })}</AlertDialogTitle>
          <AlertDialogDescription>{t("La commessa passa alla fase «{fase}», come quando cambi la fase dalla commessa: il cliente riceve l'avviso del cambio di fase (se è attivo) e partono le automazioni collegate.", { fase })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConferma}>{t("Segna finita")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
