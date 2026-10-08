import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuotePrimaryButton } from "@/components/marketing/preventivi/ui/builderUI";

interface Props {
  pending: boolean;
  created: boolean;
  onCancel: () => void;
  onOpenCreated: () => void;
}

/** Sempre nel flusso, anche su tablet: non copre campi, tastiera o menu dell'app. */
export function CreateOrderActions({ pending, created, onCancel, onOpenCreated }: Props) {
  return (
    <div
      data-testid="create-order-actions"
      aria-busy={pending}
      className="static flex w-full min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 md:justify-end md:gap-3 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:pb-2 md:pt-4"
    >
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
