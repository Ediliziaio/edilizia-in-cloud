/**
 * «Indirizzo dei lavori», nel passo Contatto dei serramenti e nel passo Cliente degli edili: la spunta «Lavori allo stesso indirizzo del cliente» e, solo se i
 * lavori sono altrove, i quattro campi. Le regole (cosa si copia, quando) stanno in `useIndirizzoLavori` (serramenti)
 * e `useIndirizzoLavoriEdile` (edili, dove l'indirizzo da copiare è quello del contatto del CRM): qui c'è solo
 * quello che si vede. Senza spunta (`conSpunta={false}`: non c'è un indirizzo da copiare) restano i quattro campi.
 */
import { useId } from "react";
import { HardHat } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CampoIndirizzo, Indirizzo } from "@/lib/preventivatore/indirizzoLavori";

interface Props {
  /** I lavori sono in un altro posto: si vedono i campi. */
  altrove: boolean;
  /** Scelta dalla spunta: true = altrove. */
  onAltrove: (altrove: boolean) => void;
  /** L'indirizzo dei lavori com'è oggi nel preventivo. */
  lavori: Indirizzo;
  /** Il testo dell'indirizzo del cliente, mostrato mentre i lavori sono «uguale». */
  riassunto: string;
  /** Si scrive in un campo dei lavori. */
  onScrivi: (campo: CampoIndirizzo, valore: string) => void;
  /** Con false non c'è la spunta: non c'è un indirizzo del cliente da copiare, si scrive e basta. */
  conSpunta?: boolean;
  /** Il testo della spunta: «cliente» nei serramenti, «contatto» negli edili. */
  etichettaUguale?: string;
  /** Sotto la spunta accesa, quando non c'è ancora un indirizzo da mostrare. */
  suggerimentoVuoto?: string;
  className?: string;
}

export function IndirizzoDeiLavori({
  altrove, onAltrove, lavori, riassunto, onScrivi, className,
  conSpunta = true,
  etichettaUguale = "Lavori allo stesso indirizzo del cliente",
  suggerimentoVuoto = "Scrivi qui sopra l'indirizzo del cliente.",
}: Props) {
  const id = useId();
  return (
    <div className={cn("border-t border-slate-100 pt-3 max-sm:pt-2", className)}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
        <HardHat className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" /> Indirizzo dei lavori
      </p>
      {conSpunta && (
        <label htmlFor={`${id}-uguale`} className="mt-1 flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md py-2">
          <Checkbox
            id={`${id}-uguale`}
            checked={!altrove}
            onCheckedChange={(v) => onAltrove(v !== true)}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="block text-sm text-slate-900">{etichettaUguale}</span>
            {!altrove && (
              <span className="block break-words text-xs text-slate-500">
                {riassunto || suggerimentoVuoto}
              </span>
            )}
          </span>
        </label>
      )}

      {(altrove || !conSpunta) && (
        <div role="group" aria-label="Indirizzo dei lavori" className={cn("grid grid-cols-12 gap-3 max-sm:gap-2", conSpunta ? "mt-1" : "mt-2")}>
          <div className="col-span-12">
            <Label htmlFor={`${id}-via`} className="text-xs">Via e numero</Label>
            <Input
              id={`${id}-via`}
              value={lavori.indirizzo ?? ""}
              onChange={(e) => onScrivi("indirizzo", e.target.value)}
              placeholder="Via Roma 12"
              autoComplete="off"
              className="h-9"
            />
          </div>
          <div className="col-span-6 max-sm:col-span-5">
            <Label htmlFor={`${id}-citta`} className="text-xs">Città</Label>
            <Input
              id={`${id}-citta`}
              value={lavori.citta ?? ""}
              onChange={(e) => onScrivi("citta", e.target.value)}
              placeholder="Torino"
              autoComplete="off"
              className="h-9"
            />
          </div>
          <div className="col-span-3">
            <Label htmlFor={`${id}-cap`} className="text-xs">CAP</Label>
            <Input
              id={`${id}-cap`}
              value={lavori.cap ?? ""}
              onChange={(e) => onScrivi("cap", e.target.value)}
              placeholder="10121"
              inputMode="numeric"
              autoComplete="off"
              className="h-9 max-sm:px-2"
            />
          </div>
          <div className="col-span-3 max-sm:col-span-4">
            <Label htmlFor={`${id}-provincia`} className="text-xs">Provincia</Label>
            <Input
              id={`${id}-provincia`}
              value={lavori.provincia ?? ""}
              onChange={(e) => onScrivi("provincia", e.target.value)}
              placeholder="TO"
              maxLength={2}
              autoComplete="off"
              className="h-9 uppercase"
            />
          </div>
        </div>
      )}
    </div>
  );
}
