import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuotePrimaryButton } from "@/components/marketing/preventivi/ui/builderUI";

interface Props {
  pending: boolean;
  created: boolean;
  onCancel: () => void;
  onOpenCreated: () => void;
  /** Il totale con l'IVA, accanto al pulsante. */
  totale?: string;
}

/**
 * Dal computer resta sempre in vista in basso a destra, lasciando posto al pulsante di Silvio:
 * stava a 3.400 px dall'inizio. Fixed e non sticky, perché <main> ha overflow e sticky lì non si
 * ferma mai. Dal telefono resta nel flusso: non copre campi, tastiera e menu dell'app.
 */
export function CreateOrderActions({ pending, created, onCancel, onOpenCreated, totale }: Props) {
  return (
    <div
      data-testid="create-order-actions"
      aria-busy={pending}
      className="static z-20 flex w-full min-w-0 items-center gap-2 md:fixed md:bottom-4 md:right-24 md:w-auto md:max-w-[calc(100vw-22rem)] md:shadow-lg rounded-xl border border-slate-200 bg-white p-3 md:justify-end md:gap-3 md:bg-white md:px-3 md:py-2"
    >
      {totale && !created && (
        <p className="mr-auto min-w-0 text-sm text-muted-foreground max-md:hidden">
          Totale con IVA <span className="font-semibold tabular-nums text-foreground">{totale}</span>
        </p>
      )}
      {!created && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="h-11 shrink-0 border-slate-200 px-3 text-sm text-slate-600 shadow-none md:h-10"
          onClick={onCancel}
        >
          Annulla
        </Button>
      )}
      <QuotePrimaryButton
        type={created ? "button" : "submit"}
        disabled={pending}
        onClick={created ? onOpenCreated : undefined}
        className="h-11 min-w-0 flex-1 justify-center gap-1.5 px-3 text-sm leading-tight hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 md:h-10 md:flex-none md:px-4"
      >
        {pending && <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />}
        <span role={pending ? "status" : undefined}>
          {pending ? (created ? "Completo la commessa…" : "Creazione…") : (created ? "Vai alla commessa" : "Crea commessa")}
        </span>
      </QuotePrimaryButton>
    </div>
  );
}
