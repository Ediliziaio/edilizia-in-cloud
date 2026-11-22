import { useId } from "react";
import { CalendarClock, PhoneOutgoing } from "lucide-react";
import "@/components/ui/fish-agent-pipeline.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FishCallback } from "@/lib/fishCallbacks";
import type { ReactNode } from "react";

const statuses: Record<string, string> = {
  da_fare: "Da fare",
  in_corso: "In corso",
  completata: "Completato",
  completato: "Completato",
  annullata: "Annullato",
};

export function FishCallbackCard({ callback, statusLabel, open, onToggle, primaryActions, links, followUp, children }: {
  callback: FishCallback;
  statusLabel?: string;
  open: boolean;
  onToggle: () => void;
  primaryActions?: ReactNode;
  links?: ReactNode;
  followUp?: ReactNode;
  children?: ReactNode;
}) {
  const detailId = useId();
  const due = callback.due_date
    ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" })
        .format(new Date(callback.due_date.slice(0, 10) + "T12:00:00Z"))
    : null;
  const notes = callback.notes?.replace(/(?:^|\r?\n)Richiesta raccolta dall'assistente AI\.\r?$/m, "").trim();
  return (
    <article className="eic-workspace-card space-y-3 rounded-xl border bg-card p-3 sm:p-4" data-tone="orange">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="eic-workspace-icon !size-9"><PhoneOutgoing aria-hidden="true" className="size-4" /></span>
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold">{callback.title}</h3>
            {due && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock aria-hidden="true" className="size-3" /> Entro il {due}
            </p>}
          </div>
        </div>
        <Badge variant="outline" className={callback.status === "da_fare" ? "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-200" : ""}>
          {statusLabel || statuses[callback.status] || callback.status}
        </Badge>
      </div>
      {notes && <p className="whitespace-pre-line break-words text-sm">{notes}</p>}
      <div className="flex flex-wrap items-center gap-2 border-t pt-2">
        {primaryActions}
        <Button size="sm" variant="outline" aria-expanded={open} aria-controls={detailId} onClick={onToggle}>
          {open ? "Chiudi trascrizione" : "Apri trascrizione"}
        </Button>
        {links}
      </div>
      {followUp}
      <div id={detailId} hidden={!open} className={open ? "eic-motion-enter" : undefined}>{open && children}</div>
    </article>
  );
}
