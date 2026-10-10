import { Link } from "react-router-dom";

/**
 * Come si legge il margine, in poche righe in fondo all'elenco. Dice la verità di oggi: il semaforo della TABELLA usa il
 * «Margine minimo delle commesse» di Approvazioni (`governance.marginalita.sogliaMinimaPerc`, anche se in Approvazioni
 * l'interruttore del giallo è spento). Il dialogo della voce e la riga dei numeri usano ancora 15 e 25 fissi: per questo
 * la frase parla solo della tabella. Una soglia sola per tutti è una decisione aperta.
 *
 * Il blocco al salvataggio scatta quando il costo è uguale o più alto del prezzo di vendita (anche a margine 0%): vedi
 * `blockReason` in `TariffaDialog`.
 */
export function NotaMargine({ soglia, puoCambiare }: { soglia: number; puoCambiare: boolean }) {
  const sogliaTesto = soglia.toLocaleString("it-IT");
  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
      <p>
        Il margine è (vendita − costo) / vendita. Il semaforo della tabella usa il «Margine minimo delle commesse» di
        Approvazioni: ora {sogliaTesto}%.
        {puoCambiare && (
          <>
            {" "}
            <Link to="/azienda/impostazioni/approvazioni" className="font-medium text-primary underline-offset-2 hover:underline">
              Cambia
            </Link>
          </>
        )}
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Nella tabella:</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          verde, {sogliaTesto}% o più
        </span>
        {soglia > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
            giallo, tra 0% e {sogliaTesto}%
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-rose-500" aria-hidden />
          rosso, sotto lo 0%
        </span>
      </p>
      <p>
        Se il costo è uguale o più alto del prezzo di vendita, la voce non si salva. Il filtro «Redditività» isola le voci
        da rivedere. Le voci archiviate non compaiono nei preventivi, ma si possono riattivare.
      </p>
    </div>
  );
}
