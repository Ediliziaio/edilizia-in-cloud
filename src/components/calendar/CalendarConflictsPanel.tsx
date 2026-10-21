import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { AlertTriangle, ExternalLink } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { calendarWorkLocation } from "@/lib/calendar/navigation";
import type { CalendarConflictGroup } from "@/lib/calendar/conflicts";
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CalendarConflictGroup[];
  onAppointment: (id: string) => void;
}
export function CalendarConflictsPanel({
  open,
  onOpenChange,
  groups,
  onAppointment,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            Assegnazioni da verificare ({groups.length})
          </SheetTitle>
          <SheetDescription>
            Giorni consecutivi con la stessa sovrapposizione sono raggruppati.
            Apri gli eventi per verificare date, persone e orari.
          </SheetDescription>
          {/* Cosa conta come conflitto (21/10/2026): la parola da sola non diceva niente. */}
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">Stessa persona o squadra</strong> su più lavori o
              appuntamenti nello stesso giorno, con orari che si accavallano.
            </li>
            <li>
              <strong className="font-medium text-foreground">Orari mancanti</strong>: due impegni nello stesso
              giorno senza ora non si possono confrontare. Basta mettere gli orari.
            </li>
            <li>
              <strong className="font-medium text-foreground">Fuori squadra</strong>: un appuntamento di lavoro
              (inizio lavori, posa, collaudo…) assegnato a chi non è nella squadra della commessa. È un avviso.
            </li>
          </ul>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {groups.map((group, i) => (
            <article
              key={i}
              className={cn(
                "space-y-2 rounded-lg border p-3",
                group.severity === "warning"
                  ? "border-amber-200 bg-amber-50/50"
                  : "border-destructive/20 bg-destructive/5",
              )}
            >
              <h3 className="text-sm font-semibold">{group.resourceName}</h3>
              <p className="text-xs text-muted-foreground">
                {format(parseISO(group.date), "d MMM", { locale: it })}
                {group.to !== group.date &&
                  ` — ${format(parseISO(group.to), "d MMM", { locale: it })}`}{" "}
                · {group.days} {group.days === 1 ? "giorno" : "giorni"}
              </p>
              <p className="text-xs">{group.reason}</p>
              <div className="space-y-1">
                {group.events.map((event, j) =>
                  event.type === "order" ? (
                    <Link
                      key={j}
                      to={calendarWorkLocation(event.orderId || event.id)}
                      onClick={() => onOpenChange(false)}
                      className="flex items-start justify-between gap-2 rounded bg-background p-2 text-xs text-primary hover:underline"
                    >
                      <span>
                        {event.label}
                        {event.start && (
                          <span className="block text-muted-foreground">
                            {event.start.slice(0, 5)}
                            {event.end && `–${event.end.slice(0, 5)}`}
                          </span>
                        )}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </Link>
                  ) : (
                    <Button
                      key={j}
                      variant="ghost"
                      size="sm"
                      className="h-auto w-full justify-between whitespace-normal bg-background px-2 py-2 text-left text-xs text-primary"
                      onClick={() => {
                        onOpenChange(false);
                        onAppointment(event.id);
                      }}
                    >
                      <span>
                        {event.label}
                        {event.start && (
                          <span className="block text-muted-foreground">
                            {event.start.slice(0, 5)}
                            {event.end && `–${event.end.slice(0, 5)}`}
                          </span>
                        )}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </Button>
                  ),
                )}
              </div>
            </article>
          ))}
          {!groups.length && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nessuna sovrapposizione da verificare nel periodo.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
