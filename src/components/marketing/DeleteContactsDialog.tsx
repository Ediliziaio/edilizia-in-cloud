/**
 * Conferma di eliminazione contatti, con digitazione della parola CONFERMA
 * quando ci sono record collegati.
 *
 * Perche' esiste: prima l'eliminazione di un contatto collegato a
 * un'opportunita' veniva semplicemente BLOCCATA, con un messaggio che diceva
 * "rimuovi prima i collegamenti". Nella pratica non c'era modo di rimuoverli
 * dall'interfaccia, quindi quel contatto restava li' per sempre.
 *
 * Ora si puo' procedere, ma solo vedendo prima cosa succede a ogni tipo di
 * record collegato — perche' NON succede la stessa cosa a tutti:
 *
 *   - Opportunita' → vengono ELIMINATE. La colonna contact_id e' NOT NULL:
 *     un'opportunita' non puo' esistere senza il suo contatto, quindi non e'
 *     possibile scollegarla. O si elimina, o si tiene il contatto.
 *   - Appuntamenti, preventivi e task → vengono SCOLLEGATI. Il contact_id e'
 *     nullable, quindi il documento resta nello storico e perde solo il
 *     riferimento al contatto. Un preventivo e' un documento commerciale:
 *     cancellarlo perche' si e' cancellata un'anagrafica sarebbe sbagliato.
 *
 * La distinzione e' scritta in chiaro nel dialog: chi conferma deve sapere
 * che sta perdendo delle opportunita' e non solo un'anagrafica.
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, Trash2, Unlink } from "lucide-react";

/** Conteggi dei record collegati ai contatti selezionati. */
export interface ContactLinks {
  opportunities: number;
  appointments: number;
  quotes: number;
  tasks: number;
}

const PAROLA_CONFERMA = "CONFERMA";

function totaleCollegamenti(l: ContactLinks): number {
  return l.opportunities + l.appointments + l.quotes + l.tasks;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quanti contatti si stanno eliminando. */
  count: number;
  /** Nome del contatto, mostrato quando se ne elimina uno solo. */
  nome?: string;
  links: ContactLinks | null;
  loading?: boolean;
  onConfirm: () => void;
}

export function DeleteContactsDialog({
  open,
  onOpenChange,
  count,
  nome,
  links,
  loading = false,
  onConfirm,
}: Props) {
  // Nessun useEffect per svuotare il campo a ogni apertura: il chiamante
  // passa una `key` che cambia a ogni richiesta di eliminazione, quindi il
  // componente si rimonta gia' pulito. Resettare con un effetto sarebbe un
  // render in piu' e, se il dialog venisse chiuso dal genitore invece che
  // dall'utente, non scatterebbe affatto lasciando la conferma gia' valida
  // per l'eliminazione successiva.
  const [testo, setTesto] = useState("");

  const totale = links ? totaleCollegamenti(links) : 0;
  const serveConferma = totale > 0;
  const confermaValida = !serveConferma || testo.trim().toUpperCase() === PAROLA_CONFERMA;
  const soggetto = count === 1 ? (nome ? `"${nome}"` : "il contatto") : `${count} contatti`;

  const daEliminare: string[] = [];
  const daScollegare: string[] = [];
  if (links) {
    if (links.opportunities > 0)
      daEliminare.push(`${links.opportunities} opportunità`);
    if (links.appointments > 0)
      daScollegare.push(`${links.appointments} appuntament${links.appointments === 1 ? "o" : "i"}`);
    if (links.quotes > 0)
      daScollegare.push(`${links.quotes} preventiv${links.quotes === 1 ? "o" : "i"}`);
    if (links.tasks > 0) daScollegare.push(`${links.tasks} task`);
  }

  return (
    <Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            Eliminare {soggetto}?
          </DialogTitle>
          <DialogDescription>
            {serveConferma
              ? "Ci sono record collegati. Leggi cosa succede a ciascuno prima di procedere: l'operazione non è reversibile."
              : "L'operazione non è reversibile."}
          </DialogDescription>
        </DialogHeader>

        {links === null ? (
          <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Controllo i collegamenti…
          </div>
        ) : (
          <div className="space-y-3">
            {daEliminare.length > 0 && (
              <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                <div className="text-sm leading-relaxed text-red-900">
                  <p className="font-semibold">Verranno eliminate: {daEliminare.join(", ")}</p>
                  <p className="mt-1">
                    Un&apos;opportunità non può esistere senza il suo contatto, quindi non è
                    possibile scollegarla. Se ti serve conservarla, annulla e sposta prima
                    l&apos;opportunità su un altro contatto.
                  </p>
                </div>
              </div>
            )}

            {daScollegare.length > 0 && (
              <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <Unlink className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                <div className="text-sm leading-relaxed text-amber-900">
                  <p className="font-semibold">Verranno scollegati: {daScollegare.join(", ")}</p>
                  <p className="mt-1">
                    Restano nello storico con tutti i loro dati, perdono solo il riferimento a
                    questo contatto.
                  </p>
                </div>
              </div>
            )}

            {!serveConferma && (
              <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                Nessun record collegato: si elimina solo l&apos;anagrafica.
              </p>
            )}

            {serveConferma && (
              <div className="pt-1">
                <Label htmlFor="conferma-eliminazione" className="text-sm font-medium">
                  Per procedere scrivi <span className="font-bold">{PAROLA_CONFERMA}</span>
                </Label>
                <Input
                  id="conferma-eliminazione"
                  value={testo}
                  onChange={(e) => setTesto(e.target.value)}
                  placeholder={PAROLA_CONFERMA}
                  autoComplete="off"
                  autoFocus
                  disabled={loading}
                  className="mt-1.5"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && confermaValida && !loading) onConfirm();
                  }}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Annulla
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!confermaValida || loading || links === null}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Eliminazione…
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Elimina definitivamente
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
