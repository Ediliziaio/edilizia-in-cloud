import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar as CalendarIcon, Clock, User as UserIcon, Lock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

/**
 * Dettaglio di un evento esterno (busy slot) sincronizzato da Google/Apple
 * Calendar e mostrato in sovrapposizione sul calendario marketing.
 *
 * Per privacy memorizziamo solo l'occupazione (titolo opzionale, orario, fonte):
 * i dettagli completi (partecipanti, luogo, descrizione) restano sul calendario
 * di origine. Questa dialog mostra tutto ciò che abbiamo + un avviso quando il
 * titolo non è condiviso (busy-only).
 */
export interface BusySlotDetail {
  id: string;
  start_at: string;
  end_at: string;
  summary: string | null;
  is_all_day: boolean;
  provider?: "google" | "apple" | "outlook";
  ownerName?: string | null;
}

interface BusySlotDetailsDialogProps {
  slot: BusySlotDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function BusySlotDetailsDialog({ slot, open, onOpenChange }: BusySlotDetailsDialogProps) {
  if (!slot) return null;

  const isApple = slot.provider === "apple";
  const isOutlook = slot.provider === "outlook";
  const sourceLabel = isApple ? "Apple Calendar" : isOutlook ? "Outlook Calendar" : "Google Calendar";
  const start = parseISO(slot.start_at);
  const end = parseISO(slot.end_at);
  const dateLabel = format(start, "EEEE d MMMM yyyy", { locale: it });
  const timeLabel = slot.is_all_day
    ? "Tutto il giorno"
    : `${format(start, "HH:mm")} – ${format(end, "HH:mm")}`;
  const hasTitle = !!slot.summary && slot.summary.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-left">
            <CalendarIcon className={cn("h-4 w-4 shrink-0", isApple ? "text-zinc-600" : isOutlook ? "text-indigo-600" : "text-blue-600")} />
            <span className="truncate">{hasTitle ? slot.summary : "Occupato"}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span className="capitalize">{dateLabel}</span>
          </div>
          <div className="pl-6 font-medium">{timeLabel}</div>

          {slot.ownerName && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <UserIcon className="h-4 w-4 shrink-0" />
              <span>Calendario di {slot.ownerName}</span>
            </div>
          )}

          <div className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-xs",
            isApple ? "bg-zinc-100/80 text-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300"
              : isOutlook ? "bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200"
              : "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
          )}>
            <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
            <span>Evento sincronizzato da <strong>{sourceLabel}</strong></span>
          </div>

          {!hasTitle && (
            <div className="flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                I dettagli completi (titolo, partecipanti, luogo) sono visibili solo su {sourceLabel}.
                Qui mostriamo l'occupazione per evitare sovrapposizioni di appuntamenti.
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
