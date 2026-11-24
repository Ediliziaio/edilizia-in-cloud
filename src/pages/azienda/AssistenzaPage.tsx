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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const TicketsList = lazy(() => import("@/pages/azienda/TicketsList"));
const ManutenzioneList = lazy(() => import("@/pages/azienda/ManutenzioneList"));

export default function AssistenzaPage() {
  const t = useT();
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
    <Tabs value={attiva} onValueChange={(value) => vaiA(value as "assistenza" | "manutenzioni")} className="space-y-4 max-sm:space-y-3">
      <h1 className="sr-only">{t("Assistenza e manutenzioni")}</h1>
      <div className="flex flex-wrap items-center justify-between gap-2 max-sm:flex-nowrap">
        <TabsList className="h-auto gap-2 bg-transparent p-0 max-sm:gap-1.5" aria-label={t("Assistenza e Manutenzione")}>
          {[
            { key: "assistenza" as const, label: t("Assistenza"), icon: LifeBuoy },
            { key: "manutenzioni" as const, label: t("Manutenzioni"), icon: Wrench },
          ].map((s) => {
            const on = s.key === attiva;
            const Icona = s.icon;
            return (
              <TabsTrigger
                key={s.key}
                value={s.key}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-base font-semibold transition-colors max-sm:h-9 max-sm:rounded-full max-sm:px-3.5 max-sm:py-0 max-sm:text-sm max-sm:font-medium max-sm:shadow-none",
                  on
                    ? "border-orange-300 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-800 shadow-sm dark:border-orange-800 dark:data-[state=active]:bg-orange-950/40 dark:data-[state=active]:text-orange-200"
                    : "border-border bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                <Icona className="h-4 w-4 max-sm:hidden" aria-hidden="true" />
                {s.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {/* Qui atterrano i pulsanti della pagina attiva (portal dal figlio). Telefono: sulla
            stessa riga delle schede, tondi, invece della barra arancio a tutta larghezza
            (decisione del founder, 23/11/2026: un solo disegno, tondo). */}
        <div
          ref={setActionsSlot}
          className="flex shrink-0 items-center gap-2"
        />
      </div>

      <TabsContent key={attiva} value={attiva} className="mt-0">
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        {attiva === "manutenzioni"
          ? <ManutenzioneList incorporata actionsSlot={actionsSlot} />
          : <TicketsList incorporata actionsSlot={actionsSlot} />}
      </Suspense>
      </TabsContent>
    </Tabs>
  );
}
