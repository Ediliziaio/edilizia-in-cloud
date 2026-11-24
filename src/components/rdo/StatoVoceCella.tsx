import { UniformSelect } from "@/components/ui/uniform-select";
// Il comando piccolo di una cella del confronto offerte: di norma la voce è
// disponibile e non si vede niente; le eccezioni si scelgono qui e restano
// scritte nella cella. Un menu condiviso sotto l'icona, uguale a quello delle altre pagine: apre la
// scelta di sistema, con la tastiera si raggiunge come un campo.
import { MoreVertical } from "lucide-react";
import {
  ETICHETTA_CELLA,
  STATI_VOCE_OFFERTA,
  type StatoVoceOfferta,
} from "@/lib/acquisti/statoVoceOfferta";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const COLORE: Partial<Record<StatoVoceOfferta, string>> = {
  non_disponibile: "bg-red-50 text-red-700 border-red-200",
  parziale: "bg-amber-50 text-amber-800 border-amber-200",
  alternativa: "bg-violet-50 text-violet-700 border-violet-200",
};

export function StatoVoceCella({
  stato,
  etichettaAccessibile,
  disabled,
  onChange,
}: {
  stato: StatoVoceOfferta;
  etichettaAccessibile: string;
  disabled?: boolean;
  onChange: (stato: Exclude<StatoVoceOfferta, "da_quotare">) => void;
}) {
  const t = useT();
  return (
    <span
      className={cn(
        "relative inline-flex h-8 w-5 shrink-0 items-center justify-center rounded text-slate-400",
        !disabled && "hover:bg-slate-100 hover:text-slate-700",
      )}
      title={t("Disponibilità della voce")}
    >
      <MoreVertical className="h-3.5 w-3.5" aria-hidden />
      <UniformSelect
        aria-label={etichettaAccessibile}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
        disabled={disabled}
        value={stato === "da_quotare" ? "" : stato}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value as Exclude<StatoVoceOfferta, "da_quotare">);
        }}
      >
        {stato === "da_quotare" && (
          <option value="" disabled>
            {t("Da quotare")}
          </option>
        )}
        {STATI_VOCE_OFFERTA.map((s) => (
          <option key={s.valore} value={s.valore}>
            {t(s.etichetta)}
          </option>
        ))}
      </UniformSelect>
    </span>
  );
}

/** L'etichetta nella cella: solo per le eccezioni. */
export function EtichettaStatoVoce({ stato }: { stato: StatoVoceOfferta }) {
  const t = useT();
  if (stato === "disponibile" || stato === "da_quotare") return null;
  return (
    <span className={cn("mt-0.5 inline-block rounded border px-1 text-[10px] font-medium", COLORE[stato])}>
      {t(ETICHETTA_CELLA[stato])}
    </span>
  );
}
