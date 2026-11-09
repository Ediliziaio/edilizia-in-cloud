import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { opzioniUnita, unitaNormalizzata } from "@/lib/orders/rigaAcquisto";

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

  // L'unità si sceglie, non si scrive: a mano erano usciti «ml» e «ML» nello
  // stesso archivio, e il fornitore legge due cose diverse (09/11/2026).
  if (campo === "unita_misura") {
    const scelta = unitaNormalizzata(String(valore)) || "pz";
    return <OfficeSelect
      label={label}
      value={scelta}
      disabled={disabled || busy}
      className="h-10 w-24 px-2 [&_.spiega]:hidden"
      options={opzioniUnita(scelta).map((o) => ({
        value: o.value,
        label: <>{o.breve}{o.nota && <span className="spiega"> — {o.nota}</span>}</>,
      }))}
      onValueChange={async (v) => {
        if (saving.current || disabled || v === scelta) return;
        saving.current = true;
        setBusy(true);
        try {
          await onSave(v);
        } catch {
          toast.error("Voce non salvata. Ho ripristinato il valore precedente: riprova.");
        } finally {
          saving.current = false;
          setBusy(false);
        }
      }}
    />;
  }

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
