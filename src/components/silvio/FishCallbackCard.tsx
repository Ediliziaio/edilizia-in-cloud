import { useId } from "react";
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

export function FishCallbackCard({ callback, open, onToggle, links, children }: {
  callback: FishCallback;
  open: boolean;
  onToggle: () => void;
  links?: ReactNode;
  children?: ReactNode;
}) {
  const detailId = useId();
  const due = callback.due_date
    ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" })
        .format(new Date(callback.due_date.slice(0, 10) + "T12:00:00Z"))
    : null;
  return (
    <article className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="min-w-0 break-words text-sm font-semibold">{callback.title}</h3>
        <Badge variant="outline">{statuses[callback.status] || callback.status}</Badge>
      </div>
      {due && <p className="text-xs text-muted-foreground">Entro il {due}</p>}
      {callback.notes && <p className="whitespace-pre-line break-words text-sm">{callback.notes}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" aria-expanded={open} aria-controls={detailId} onClick={onToggle}>
          {open ? "Chiudi trascrizione" : "Apri trascrizione"}
        </Button>
        {links}
      </div>
      <div id={detailId} hidden={!open}>{open && children}</div>
    </article>
  );
}
