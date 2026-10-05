/**
 * Le letture del QR di un attrezzo: chi l'ha visto, quando, e cosa ha fatto
 * (preso in carico, lasciato in cantiere, riportato in magazzino, contato in
 * inventario). È la risposta a «dov'è finito il demolitore?».
 */
import { Loader2, ScanLine } from "lucide-react";
import { useMezzoScansioni } from "@/hooks/useMezzi";
import { AZIONI_SCANSIONE, formatData, formatQuantita, giornoItaliano } from "@/types/mezzi";

const ORA = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

export function MezzoScansioniSection({ mezzoId, unita }: { mezzoId: string; unita?: string | null }) {
  const { data: righe = [], isLoading, error, refetch } = useMezzoScansioni(mezzoId);

  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Non riesco a caricare le letture del QR.{" "}
        <button type="button" className="font-semibold underline" onClick={() => refetch()}>Riprova</button>
      </div>
    );
  }
  if (!righe.length) {
    return (
      <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
        Nessuna lettura del QR ancora. Stampa l'etichetta e attaccala: ogni volta che qualcuno la inquadra, qui si vede chi e dove.
      </p>
    );
  }
  return (
    <ul className="divide-y rounded-xl border">
      {righe.map((r) => (
        <li key={r.id} className="flex items-start gap-3 px-3 py-2.5">
          <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <span className="font-medium">{AZIONI_SCANSIONE[r.azione] ?? r.azione}</span>
              {r.quantita != null && <> · {formatQuantita(r.quantita, unita)}</>}
              {r.cantiere && <span className="text-muted-foreground"> · {r.cantiere}</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {r.chi ?? "Qualcuno dell'azienda"} · {formatData(giornoItaliano(r.created_at))} alle {ORA.format(new Date(r.created_at))}
              {r.nota ? ` · ${r.nota}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
