import { useId } from "react";
import {
  CircleAlert,
  CircleCheck,
  Clock3,
  Loader2,
  XCircle,
} from "lucide-react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export type FishVoiceAction = {
  id: number;
  name: string;
} & (
  | { phase: "pending" | "unconfirmed" | "failed" }
  | { phase: "result"; result: unknown }
);

const actionLabels: Record<string, string> = {
  info_cliente: "Verifica cliente",
  memoria_pratica: "Consulta le pratiche",
  stato_consegna: "Controlla la commessa",
  stato_preventivo: "Controlla il preventivo",
  info_prodotto: "Consulta il catalogo",
  disponibilita: "Controlla l’agenda",
  fissa_appuntamento: "Prenota l’appuntamento",
  crea_ticket: "Apri la segnalazione",
  aggiorna_ticket: "Aggiorna la segnalazione",
  aggiorna_opportunita: "Salva la nota commerciale",
  passa_a_operatore: "Passa a un operatore",
  richiesta_richiamo: "Registra il richiamo",
  non_richiamare: "Registra la richiesta di non richiamare",
};

const results: Record<
  string,
  { field: string; success: string; blocked: string }
> = {
  info_cliente: {
    field: "verificato",
    success: "Cliente verificato",
    blocked: "Identità da verificare",
  },
  memoria_pratica: {
    field: "verificato",
    success: "Consultazione completata",
    blocked: "Verifica prima il cliente",
  },
  stato_consegna: {
    field: "trovato",
    success: "Commessa trovata",
    blocked: "Commessa da verificare",
  },
  stato_preventivo: {
    field: "trovato",
    success: "Preventivo trovato",
    blocked: "Preventivo da verificare",
  },
  info_prodotto: {
    field: "trovato",
    success: "Prodotto trovato",
    blocked: "Prodotto da verificare",
  },
  disponibilita: {
    field: "trovato",
    success: "Orari disponibili",
    blocked: "Nessun orario disponibile",
  },
  fissa_appuntamento: {
    field: "creato",
    success: "Appuntamento confermato",
    blocked: "Appuntamento non confermato",
  },
  crea_ticket: {
    field: "creato",
    success: "Segnalazione salvata",
    blocked: "Segnalazione non salvata",
  },
  aggiorna_ticket: {
    field: "aggiornato",
    success: "Segnalazione aggiornata",
    blocked: "Aggiornamento non confermato",
  },
  aggiorna_opportunita: {
    field: "aggiornata",
    success: "Nota registrata",
    blocked: "Nota non salvata",
  },
  richiesta_richiamo: {
    field: "creato",
    success: "Richiamo registrato",
    blocked: "Richiamo non registrato",
  },
  non_richiamare: {
    field: "registrato",
    success: "Richiesta registrata",
    blocked: "Richiesta non registrata",
  },
};

function actionOutcome(action: FishVoiceAction): {
  icon: typeof Loader2;
  state: keyof typeof outcomeStyles;
  label: string;
} {
  if (action.phase === "pending")
    return { icon: Loader2, state: "pending", label: "In corso" };
  if (action.phase === "failed")
    return { icon: XCircle, state: "error", label: "Operazione non riuscita" };

  const review = (label = "Esito da verificare") => ({
    icon: CircleAlert,
    state: "review" as const,
    label,
  });
  const success = (label: string) => ({
    icon: CircleCheck,
    state: "success" as const,
    label,
  });
  if (
    action.phase !== "result" ||
    !action.result ||
    typeof action.result !== "object"
  )
    return review();

  const value = action.result as Record<string, unknown>;
  if (value.outcome_unknown === true) return review();
  if (value.ok === false) return review("Conferma da raccogliere");
  if (action.name === "passa_a_operatore") {
    if (value.esito === "cancelled") return review("Passaggio interrotto");
    if (value.collegato === true) return success("Passaggio accettato");
    if (value.esito === "no_answer")
      return review("Nessuna risposta · torna all’AI");
    if (value.trovato === true)
      return { icon: Clock3, state: "review", label: "Operatore individuato" };
    return review(
      value.trovato === false ? "Passaggio non completato" : undefined,
    );
  }
  if (
    action.name === "info_cliente" &&
    value.verificato === undefined &&
    value.trovato === true
  ) {
    return success("Scheda trovata");
  }
  if (action.name === "crea_ticket" && value.aggiornato === true)
    return success("Segnalazione aggiornata");

  const result = results[action.name];
  if (!result) return review();
  if (value[result.field] === true) return success(result.success);
  if (value[result.field] === false) return review(result.blocked);
  return review();
}

const outcomeStyles = {
  pending: "bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  success:
    "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  review:
    "bg-orange-50 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  error: "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200",
};

export function FishVoiceActions({
  actions,
  crmTrial,
}: {
  actions: FishVoiceAction[];
  crmTrial: boolean;
}) {
  const t = useT();
  const titleId = useId();
  if (!actions.length) return null;
  return (
    <section
      aria-labelledby={titleId}
      className="rounded-lg border bg-background"
    >
      <h3 id={titleId} className="border-b px-2.5 py-2 text-xs font-semibold">
        {crmTrial ? t("Azioni nel gestionale") : t("Azioni dimostrative")}
      </h3>
      <ol
        aria-live="polite"
        className="max-h-44 divide-y overflow-y-auto px-2.5"
      >
        {actions.map((action) => {
          const { icon: Icon, state, label } = actionOutcome(action);
          return (
            <li
              key={action.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2 text-xs"
            >
              <span className="font-medium">
                {actionLabels[action.name] ? t(actionLabels[action.name]) : t("Azione dell’agente")}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 ${outcomeStyles[state]}`}
              >
                <Icon
                  aria-hidden="true"
                  className={`size-3.5 ${state === "pending" ? "motion-safe:animate-spin" : ""}`}
                />
                {t(label)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
