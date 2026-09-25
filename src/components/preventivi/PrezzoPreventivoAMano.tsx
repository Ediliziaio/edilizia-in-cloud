/**
 * Il prezzo del preventivo scritto a mano, nella fase Economia dei moduli edili
 * (ristrutturazione, bagni, tetti…). Nei serramenti ha il suo riquadro in
 * StepEconomia, con la stessa regola.
 *
 * È il prezzo pieno IVA esclusa: prende il posto della somma delle righe del
 * computo, e sopra lavorano sconto e IVA come sempre, così nell'offerta si
 * vedono prezzo, sconto e totale. Serve a chi usa il preventivatore per il
 * documento ma non carica i prezzi: le righe possono restare a 0 €.
 *
 * Compare se l'azienda l'ha acceso (Impostazioni → Margini → «Prezzo del
 * preventivo»), e resta visibile su un preventivo che ha già un prezzo scritto,
 * così lo si può togliere anche dopo che l'opzione è stata spenta.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/formatters";
import { usePrezzoFinaleAMano } from "@/hooks/usePrezzoFinaleAMano";
import { prezzoDaTesto } from "@/lib/preventivi/prezzoAMano";

interface Props {
  id: string;
  /** L'azienda del preventivo: si leggono le sue regole, non quelle dell'utente. */
  companyId: string | null | undefined;
  value: number | null | undefined;
  /** La somma delle righe del computo, prima dello sconto globale. */
  sommaVoci: number;
  /** null = torna alla somma delle righe. */
  onCommit: (valore: number | null) => void;
  /** Nel classico l'opzione deve essere individuabile anche se non abilitata. */
  showDisabledHint?: boolean;
}

export function PrezzoPreventivoAMano({ id, companyId, value, sommaVoci, onCommit, showDisabledHint = false }: Props) {
  const { data: attivo = false, isLoading, isError } = usePrezzoFinaleAMano(companyId);
  const scritto = Number(value ?? 0) > 0;
  // Telefono no: un riquadro che spiega una funzione spenta e manda alle impostazioni.
  if (!attivo && !scritto) return showDisabledHint ? (
    <div className="rounded-lg border border-dashed p-3 text-sm max-sm:hidden">
      <p className="font-medium">Prezzo manuale dell'offerta</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {isLoading ? "Verifica delle impostazioni aziendali…" : isError
          ? "Impossibile verificare l'abilitazione. Riprova prima di impostare un prezzo manuale."
          : "Disponibile quando l'azienda abilita «Prezzo del preventivo» in Impostazioni → Margini e sconti. Per ora il totale segue i prezzi delle righe."}
      </p>
      {!isLoading && !isError && <a href="/azienda/impostazioni/margini" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-medium text-orange-700 underline">Apri impostazioni in nuova scheda</a>}
    </div>
  ) : null;

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-2.5">
      <Label htmlFor={id} className="text-xs font-semibold text-orange-900">
        Prezzo manuale dell'offerta (IVA esclusa)
      </Label>
      <Input
        id={id}
        type="number"
        min={0}
        step={0.01}
        inputMode="decimal"
        // Col key il campo riparte dal valore salvato, anche quando lo si toglie.
        key={`${id}-${value ?? ""}`}
        defaultValue={value ?? ""}
        placeholder={sommaVoci > 0 ? `Somma delle righe: ${formatCurrency(sommaVoci)}` : "Scrivi il prezzo"}
        onBlur={(e) => onCommit(prezzoDaTesto(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="mt-1 h-8 bg-white text-sm tabular-nums"
      />
      {/* Telefono: resta solo «Torna alla somma delle righe», la spiegazione è da scrivania. */}
      <p className={`mt-1 text-xs leading-snug text-orange-900/80 ${scritto ? "" : "max-sm:hidden"}`}>
        <span className="max-sm:hidden">Applica con Invio o uscendo dal campo. {" "}</span>
        {scritto ? (
          <>
            <span className="max-sm:hidden">
            Prende il posto della somma delle righe{sommaVoci > 0 ? ` (${formatCurrency(sommaVoci)})` : ""}.
            Sconto e IVA si calcolano su questo prezzo.{" "}
            </span>
            <button type="button" className="underline hover:no-underline" onClick={() => onCommit(null)}>
              Torna alla somma delle righe
            </button>
          </>
        ) : (
          <>
            Vuoto: il prezzo è la somma delle righe ({formatCurrency(sommaVoci)}). Scrivilo se non usi i prezzi del
            listino: sconto e IVA si calcolano sopra.
          </>
        )}
      </p>
    </div>
  );
}
