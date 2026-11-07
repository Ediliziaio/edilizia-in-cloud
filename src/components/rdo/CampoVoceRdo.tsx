import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Props = {
  campo: "descrizione" | "quantita" | "unita_misura";
  valore: string | number;
  disabled: boolean;
  onSave: (value: string | number) => Promise<unknown>;
};

/** Una cella fallita torna al dato salvato; non deve sembrare già salvata. */
export function CampoVoceRdo(props: Props) {
  // Solo un nuovo valore realmente salvato rimonta la cella, anche dopo refetch.
  return <Cella key={String(props.valore)} {...props} />;
}
function Cella({ campo, valore, disabled, onSave }: Props) {
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const numerico = campo === "quantita";
  const label = numerico ? "Quantità richiesta" : campo === "descrizione" ? "Descrizione voce richiesta" : "Unità di misura richiesta";
  return <Input
    aria-label={label}
    aria-busy={busy}
    type={numerico ? "number" : "text"}
    min={numerico ? "0.01" : undefined}
    step={numerico ? "any" : undefined}
    defaultValue={valore}
    disabled={disabled || busy}
    className={numerico ? "w-20 text-right" : campo === "descrizione" ? "min-w-0 flex-1" : "w-16"}
    onBlur={async e => {
      if (saving.current || disabled) return;
      const input = e.currentTarget;
      const raw = input.value.trim();
      const next = numerico ? Number(raw) : raw;
      if ((numerico && (!raw || !Number.isFinite(next) || Number(next) <= 0)) || (!numerico && !raw)) {
        input.value = String(valore);
        toast.error(numerico ? "Indica una quantità maggiore di zero." : campo === "descrizione" ? "Inserisci la descrizione dell’articolo." : "Inserisci l’unità di misura.");
        return;
      }
      if (String(next) === String(valore)) { input.value = String(valore); return; }
      saving.current = true;
      setBusy(true);
      try {
        await onSave(next);
        input.value = String(next);
      } catch {
        input.value = String(valore);
        toast.error("Voce non salvata. Ho ripristinato il valore precedente: riprova.");
      } finally {
        saving.current = false;
        setBusy(false);
      }
    }}
  />;
}
