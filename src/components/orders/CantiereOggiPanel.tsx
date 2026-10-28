import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Loader2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  presenzeLabel,
  nextOggiAction,
  type OggiItem,
  type OggiPanelView,
} from "@/lib/orders/cantieriOggi";
import { cn } from "@/lib/utils";

const Approvals = lazy(() =>
  import("./DaApprovareCommessa").then((m) => ({
    default: m.DaApprovareCommessa,
  })),
);
const Reports = lazy(() =>
  import("./OrdineRapportiniCampo").then((m) => ({
    default: m.OrdineRapportiniCampo,
  })),
);
const tabs: { value: OggiPanelView; label: string }[] = [
  { value: "riepilogo", label: "Giornata" },
  { value: "lavorazioni", label: "Lavorazioni" },
  { value: "ufficio", label: "Ufficio" },
  { value: "approvazioni", label: "Da approvare" },
];
const dayLabel = (day: string | null) =>
  day
    ? new Date(`${day.slice(0, 10)}T12:00:00Z`).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
        timeZone: "Europe/Rome",
      })
    : "Data da definire";

export function CantiereOggiPanel({
  item,
  view,
  onViewChange,
  onClose,
  canApprove,
  dataReady,
}: {
  item: OggiItem | undefined;
  view: OggiPanelView;
  onViewChange: (view: OggiPanelView) => void;
  onClose: () => void;
  canApprove: boolean;
  dataReady: boolean;
}) {
  const orderLink = item ? `/azienda/ordini/${item.row.id}` : "";
  const action = item ? nextOggiAction(item) : null;
  return (
    <Sheet
      open={!!item}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl sm:rounded-l-3xl">
        <SheetHeader className="shrink-0 border-b px-5 pb-4 pt-6 pr-12 text-left">
          <p className="text-xs font-medium text-blue-600">
            Cantiere · {item?.row.codice || "Commessa"}
          </p>
          <SheetTitle className="text-lg leading-snug">
            {item?.title || "Giornata del cantiere"}
          </SheetTitle>
          <SheetDescription>
            {item?.row.indirizzo || "Indirizzo non indicato"} · {item?.owner}
          </SheetDescription>
        </SheetHeader>
        <div
          role="tablist"
          aria-label="Dettaglio giornata"
          className="flex shrink-0 gap-1 overflow-x-auto border-b px-4 py-3"
        >
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={view === tab.value}
              aria-controls="cantiere-oggi-panel-content"
              id={`oggi-panel-${tab.value}`}
              onClick={() => onViewChange(tab.value)}
              className={cn(
                "shrink-0 rounded-xl px-3 py-2 text-sm transition-colors",
                view === tab.value
                  ? "bg-blue-50 font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {tab.label}
              {tab.value === "approvazioni" && !!item?.pending && (
                <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-xs text-orange-800">
                  {item.pending}
                </span>
              )}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id="cantiere-oggi-panel-content"
          aria-labelledby={`oggi-panel-${view}`}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5"
        >
          {item && (
            <>
              {!dataReady && (
                <p
                  role="status"
                  className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900"
                >
                  Pianificazione e attività non sono ancora disponibili. Non
                  vengono considerate pari a zero.
                </p>
              )}
              {view === "riepilogo" && (
                <>
                  <div className="rounded-2xl border bg-muted/20 p-4">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Prossimo controllo suggerito
                    </p>
                    <p className="text-sm font-semibold">{action?.detail}</p>
                    {action?.view !== "riepilogo" && (
                      <Button
                        variant="outline"
                        className="mt-3 rounded-xl"
                        onClick={() => onViewChange(action!.view)}
                      >
                        {action?.text}
                      </Button>
                    )}
                  </div>
                  <div className="space-y-4 text-sm">
                    <div className="flex gap-3">
                      <Users className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      <div>
                        <p className="font-medium">{presenzeLabel(item.row)}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Persone con una timbratura o riportate in un
                          rapportino inviato/approvato oggi. Non è la presenza
                          in tempo reale; il confronto dei totali non certifica
                          la copertura nominativa della squadra.
                        </p>
                        <Link
                          className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                          to={`${orderLink}?tab=cantiere&vista_cantiere=squadra`}
                        >
                          Verifica ore e persone ↗
                        </Link>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      <div>
                        <p className="font-medium">
                          Lavorazioni della giornata
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {!dataReady
                            ? "Pianificazione non disponibile"
                            : item.todayPhases.length
                              ? item.todayPhases.map((p) => p.name).join(" · ")
                              : "Nessuna lavorazione con date che comprendono oggi"}
                        </p>
                        <Link
                          className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                          to={`${orderLink}?tab=cantiere&vista_cantiere=cronoprogramma`}
                        >
                          Apri cronoprogramma ↗
                        </Link>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                      <div>
                        <p className="font-medium">
                          Ultimo aggiornamento dal campo
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {item.row.ultimo_segnale &&
                          Number.isFinite(
                            new Date(item.row.ultimo_segnale).getTime(),
                          )
                            ? new Date(item.row.ultimo_segnale).toLocaleString(
                                "it-IT",
                                {
                                  timeZone: "Europe/Rome",
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                },
                              )
                            : "Nessun segnale disponibile"}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Un segnale vecchio non dimostra che il cantiere sia
                          fermo. Verifica pianificazione, calendario e
                          aggiornamenti.
                        </p>
                        <Link
                          className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                          to={`${orderLink}?tab=cantiere&vista_cantiere=diario`}
                        >
                          Apri diario ↗
                        </Link>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {view === "lavorazioni" && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">Lavorazioni aperte</h3>
                    <Link
                      className="text-xs font-medium text-primary hover:underline"
                      to={`${orderLink}?tab=cantiere&vista_cantiere=lavorazioni`}
                    >
                      Gestisci ↗
                    </Link>
                  </div>
                  {dataReady &&
                    (item.phases.length ? (
                      <ul className="divide-y rounded-2xl border">
                        {item.phases.map((p) => (
                          <li key={p.id} className="p-3">
                            <p className="text-sm font-medium">{p.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {dayLabel(p.start_date)} → {dayLabel(p.end_date)}{" "}
                              · {p.status.replaceAll("_", " ")}
                            </p>
                            {item.latePhases.some(
                              (late) => late.id === p.id,
                            ) && (
                              <p className="mt-1 text-xs text-orange-700">
                                Data prevista superata: verifica l’avanzamento
                                reale.
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                        Nessuna lavorazione aperta registrata.
                      </p>
                    ))}
                </>
              )}
              {view === "ufficio" && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">Attività d’ufficio aperte</h3>
                    <Link
                      className="text-xs font-medium text-primary hover:underline"
                      to={`${orderLink}?tab=cantiere&vista_cantiere=ufficio`}
                    >
                      Gestisci attività ↗
                    </Link>
                  </div>
                  {dataReady &&
                    (item.tasks.length ? (
                      <ul className="divide-y rounded-2xl border">
                        {item.tasks.map((task) => (
                          <li key={task.id} className="p-3">
                            <p className="text-sm font-medium">{task.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {task.status === "in_attesa"
                                ? "In attesa di un prerequisito"
                                : dayLabel(task.due_date)}{" "}
                              ·{" "}
                              {task.assigned_to || task.ufficio_id
                                ? "Assegnata"
                                : "Da assegnare"}
                            </p>
                            {item.lateTasks.some(
                              (late) => late.id === task.id,
                            ) && (
                              <p className="mt-1 text-xs text-orange-700">
                                Scadenza superata
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                        Nessuna attività d’ufficio aperta.
                      </p>
                    ))}
                </>
              )}
              {view === "approvazioni" && (
                <>
                  <div className="rounded-2xl border bg-orange-50/50 p-4">
                    <h3 className="flex items-center gap-2 font-semibold">
                      <ClipboardCheck className="h-4 w-4 text-orange-600" />
                      Elementi da verificare
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {item.row.rapportini_da_approvare ?? "—"} rapportini ·{" "}
                      {item.row.correzioni ?? "—"} correzioni timbrature ·{" "}
                      {item.row.bolle ?? "—"} bolle/acquisti
                    </p>
                  </div>
                  {canApprove ? (
                    <Suspense
                      fallback={
                        <p
                          role="status"
                          className="text-sm text-muted-foreground"
                        >
                          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                          Carico le verifiche…
                        </p>
                      }
                    >
                      {(item.row.correzioni !== 0 || item.row.bolle !== 0) && (
                        <Approvals
                          orderId={item.row.id}
                          onApriRapportini={() =>
                            document
                              .getElementById("oggi-panel-rapportini")
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              })
                          }
                        />
                      )}
                      <div id="oggi-panel-rapportini">
                        <Reports
                          orderId={item.row.id}
                          azioniInRiga
                          soloDaApprovare
                        />
                      </div>
                    </Suspense>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Puoi consultare il riepilogo. Per approvare serve un
                      utente autorizzato.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 justify-between gap-2 border-t bg-background p-4">
          <Button variant="outline" className="rounded-xl" onClick={onClose}>
            Chiudi
          </Button>
          {item && (
            <Button asChild className="rounded-xl">
              <Link to={orderLink}>
                Apri commessa <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
