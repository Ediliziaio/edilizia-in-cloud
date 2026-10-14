import { Link } from "react-router-dom";

/**
 * Editor, riepilogo e tabella condividono la soglia di Approvazioni.
 * La modifica descrittiva di una voce esistente può mantenere importi a margine zero o in perdita.
 */
export function NotaMargine({ soglia, puoCambiare }: { soglia: number; puoCambiare: boolean }) {
  const sogliaTesto = soglia.toLocaleString("it-IT");
  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
      <p>
        Il margine è (vendita − costo) / vendita. Editor, riepilogo e tabella usano il «Margine minimo delle commesse» di
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
        <span>Colori del margine:</span>
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
        Quando vendita e costo sono positivi, le modifiche agli importi richiedono un margine maggiore di zero. Puoi correggere i dati descrittivi di una voce già presente mantenendo gli importi. Il filtro «Redditività» isola le voci da rivedere. Le voci archiviate sono escluse dai riepiloghi e dai nuovi preventivi; si possono riattivare.
      </p>
    </div>
  );
}
