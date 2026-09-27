/**
 * Assistenza e Manutenzione, stessa casa (27/09/2026, richiesta del founder).
 *
 * In cima due schede grandi — Assistenza | Manutenzioni — e sotto la pagina di
 * quella scheda, con la stessa struttura (filtri veloci · pochi numeri · lista).
 * La scheda si sceglie con ?vista=assistenza|manutenzioni, così i collegamenti
 * dalle notifiche e dai vecchi indirizzi aprono quella giusta. Chi vede solo una
 * delle due non ha le schede: va dritto alla sua, con la sua testata.
 */
import { lazy, Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LifeBuoy, Wrench } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TicketsList = lazy(() => import("@/pages/azienda/TicketsList"));
const ManutenzioneList = lazy(() => import("@/pages/azienda/ManutenzioneList"));

export default function AssistenzaPage() {
  const perms = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  // Slot a destra della riga delle schede: ogni pagina ci "teletrasporta" i
  // suoi pulsanti (Esporta, Nuovo…) così stanno sulla stessa riga delle schede,
  // allineati a destra, senza una riga vuota sotto.
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null);

  const puoAssistenza = perms.canViewTickets === true;
  const puoManutenzione = perms.canViewManutenzione === true;
  const dueSchede = puoAssistenza && puoManutenzione;

  const richiesta = searchParams.get("vista");
  const attiva: "assistenza" | "manutenzioni" =
    richiesta === "manutenzioni" && puoManutenzione ? "manutenzioni"
    : richiesta === "assistenza" && puoAssistenza ? "assistenza"
    : puoAssistenza ? "assistenza" : "manutenzioni";

  const vaiA = (v: "assistenza" | "manutenzioni") => {
    const next = new URLSearchParams(searchParams);
    next.set("vista", v);
    next.delete("tipo"); // cambiando mondo si azzera il filtro tipo dei ticket
    setSearchParams(next);
  };

  // Solo una delle due: niente schede, la pagina con la sua testata.
  if (!dueSchede) {
    return (
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        {puoManutenzione && !puoAssistenza ? <ManutenzioneList /> : <TicketsList />}
      </Suspense>
    );
  }

  return (
    <div className="space-y-4 max-sm:space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="tablist" aria-label="Assistenza e Manutenzione">
          {[
            { key: "assistenza" as const, label: "Assistenza", icon: LifeBuoy },
            { key: "manutenzioni" as const, label: "Manutenzioni", icon: Wrench },
          ].map((s) => {
            const on = s.key === attiva;
            const Icona = s.icon;
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => vaiA(s.key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-base font-semibold transition-colors max-sm:px-3 max-sm:py-2 max-sm:text-sm",
                  on
                    ? "border-orange-300 bg-orange-50 text-orange-800 shadow-sm dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200"
                    : "border-border bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                <Icona className="h-4 w-4" aria-hidden="true" />
                {s.label}
              </button>
            );
          })}
        </div>
        {/* Qui atterrano i pulsanti della pagina attiva (portal dal figlio). */}
        <div ref={setActionsSlot} className="flex items-center gap-2" />
      </div>

      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        {attiva === "manutenzioni"
          ? <ManutenzioneList incorporata actionsSlot={actionsSlot} />
          : <TicketsList incorporata actionsSlot={actionsSlot} />}
      </Suspense>
    </div>
  );
}
