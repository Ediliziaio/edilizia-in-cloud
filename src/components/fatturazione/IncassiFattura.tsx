import { useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Landmark, Loader2, Undo2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { METODI_INCASSO, residuoDaIncassare } from "@/lib/fatturazione/incassi";
import {
  descriviPagamentoBanca,
  giornoMese,
  incassiSenzaBonifico,
  type IncassoFattura,
} from "@/lib/fatturazione/abbinaBanca";
import { useAnnullaIncasso, useIncassiFattura } from "@/hooks/useIncassiFattura";
import { SegnaPagataDialog } from "@/components/fatturazione/SegnaPagataDialog";
import { AbbinaBonificoDialog } from "@/components/fatturazione/AbbinaBonificoDialog";
import type { DocumentoFiscale } from "@/types/fatturazione";

// Gli incassi della fattura, dalla fattura (30/10/2026): lo storico, «Annulla»
// su ciascuno (storna_incasso_atomico: la fattura torna da incassare o in
// parte), «Segna pagata» e «Abbina al bonifico». Vale anche dopo l'invio allo
// SDI: lo stato del pagamento non è un dato fiscale.

const etichettaMetodo = (m: string | null) =>
  METODI_INCASSO.find((x) => x.value === m)?.label ?? (m ? m.charAt(0).toUpperCase() + m.slice(1) : "");

interface Props {
  doc: DocumentoFiscale;
  /** Si può ancora registrare un incasso (tipo e stato giusti, residuo > 0). */
  pagabile: boolean;
}

export function IncassiFattura({ doc, pagabile }: Props) {
  const incassi = useIncassiFattura(doc.id);
  const annulla = useAnnullaIncasso();
  const [pagaAperto, setPagaAperto] = useState(false);
  const [abbinaAperto, setAbbinaAperto] = useState(false);
  const [daAnnullare, setDaAnnullare] = useState<IncassoFattura | null>(null);

  const elenco = incassi.data ?? [];
  const statoBanca = descriviPagamentoBanca(doc.stato, elenco);
  const residuo = residuoDaIncassare(doc);
  // Il bonifico si abbina se resta da incassare, o se c'è un incasso fatto a mano ancora senza bonifico.
  const abbinabile = pagabile || (residuo <= 0 && incassiSenzaBonifico(elenco).length > 0
    && !["annullata", "stornata", "bozza"].includes(doc.stato));

  return (
    <div className="space-y-3">
      {statoBanca && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <Landmark className="h-3.5 w-3.5" /> {statoBanca}
        </p>
      )}

      {incassi.isLoading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : incassi.isError ? (
        <p className="text-xs text-muted-foreground">{(incassi.error as Error).message}</p>
      ) : elenco.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nessun incasso registrato.</p>
      ) : (
        <ul className="divide-y rounded-md border text-sm" aria-label="Incassi registrati">
          {elenco.map((i) => (
            <li key={i.id} className="flex items-start justify-between gap-2 p-2.5">
              <div className="min-w-0">
                <p className="font-medium tabular-nums">
                  {formatCurrency(i.importo)}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {formatDateShort(i.data_movimento)}
                    {i.metodo ? ` · ${etichettaMetodo(i.metodo)}` : ""}
                  </span>
                </p>
                {i.bonifico_id ? (
                  <p className="truncate text-xs text-emerald-700" title={i.bonifico_descrizione ?? undefined}>
                    Abbinato al bonifico del {giornoMese(i.bonifico_data)}
                    {i.abbinamento === "auto" ? " (automatico)" : ""}
                  </p>
                ) : i.parlante ? (
                  <p className="text-xs text-muted-foreground">Bonifico con ritenuta</p>
                ) : null}
              </div>
              {i.parlante ? (
                <Button asChild variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs">
                  <Link to="/azienda/documenti?tab=incassi">Registro</Link>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={() => setDaAnnullare(i)}
                  disabled={annulla.isPending}
                  aria-label={`Annulla incasso di ${formatCurrency(i.importo)}`}
                >
                  <Undo2 className="mr-1 h-3.5 w-3.5" /> Annulla
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {(pagabile || abbinabile) && (
        <div className="flex gap-2">
          {pagabile && (
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setPagaAperto(true)}>
              <CreditCard className="mr-1 h-4 w-4" /> Segna pagata
            </Button>
          )}
          {abbinabile && (
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setAbbinaAperto(true)}>
              <Landmark className="mr-1 h-4 w-4" /> Abbina al bonifico
            </Button>
          )}
        </div>
      )}

      <SegnaPagataDialog open={pagaAperto} onOpenChange={setPagaAperto} fatture={[doc]} />
      <AbbinaBonificoDialog open={abbinaAperto} onOpenChange={setAbbinaAperto} doc={doc} incassi={elenco} />

      <AlertDialog open={!!daAnnullare} onOpenChange={(o) => !o && setDaAnnullare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annullare l'incasso?</AlertDialogTitle>
            <AlertDialogDescription>
              {daAnnullare &&
                `L'incasso di ${formatCurrency(daAnnullare.importo)} del ${formatDateShort(daAnnullare.data_movimento)} esce da registro incassi, prima nota e scadenzario, e la fattura torna da incassare per questa cifra.`}
              {daAnnullare?.bonifico_id && " Il bonifico torna da abbinare in Tesoreria."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Lascia com'è</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (daAnnullare) annulla.mutate(daAnnullare.id);
                setDaAnnullare(null);
              }}
            >
              Annulla incasso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Dal menu «⋯» dell'elenco: lo stesso pannello in una finestra. */
export function IncassiFatturaDialog({
  doc,
  pagabile,
  onOpenChange,
}: {
  doc: DocumentoFiscale | null;
  pagabile: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!doc} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {doc && (
          <>
            <DialogHeader>
              <DialogTitle>Incassi · fattura n. {doc.numero}</DialogTitle>
              <DialogDescription>
                Incassato {formatCurrency(doc.importo_pagato ?? 0)} di {formatCurrency(doc.totale_da_pagare ?? 0)}
              </DialogDescription>
            </DialogHeader>
            <IncassiFattura doc={doc} pagabile={pagabile} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
