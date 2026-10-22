import { Link } from "react-router-dom";
import type { RegolePrezzo } from "@/hooks/useRegolePrezzo";
import { formatRicarico, prezzoDaRicarico, ricaricoDaMargine } from "@/lib/tariffe/prezzoDalCosto";

const pct = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
const euro = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

/**
 * Come si legge il prezzo di una voce, con i numeri dell'azienda (da «Prezzo e
 * margini»): costo pieno, ricarico e margine, e l'esempio di 100 € di costo.
 * Da telefono no: è una spiegazione da scrivania.
 */
export function NotaMargine({ regole, puoCambiare }: { regole: RegolePrezzo; puoCambiare: boolean }) {
  const sg = regole.speseGeneraliPct;
  const costoEsempio = 100 * (1 + sg / 100);
  const prezzoEsempio = prezzoDaRicarico(costoEsempio, regole.ricaricoObiettivoPct) ?? 0;
  const ricaricoMinimo = ricaricoDaMargine(regole.margineMinimoPct);
  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground max-sm:hidden">
      <p>
        <span className="font-medium text-foreground">Costo pieno</span> = costo + spese generali ({pct(sg)}).{" "}
        <span className="font-medium text-foreground">Ricarico</span> = quanto aggiungi al costo pieno;{" "}
        <span className="font-medium text-foreground">margine</span> = quanto resta del prezzo. Non sono lo stesso
        numero: un ricarico del 20% è un margine del 16,7%.
      </p>
      <p>
        Esempio con 100 € di costo: costo pieno {euro(costoEsempio)}, obiettivo {pct(regole.margineObiettivoPct)} di margine →
        ricarico {formatRicarico(regole.ricaricoObiettivoPct)} → prezzo {euro(prezzoEsempio)}. Sotto il{" "}
        {pct(regole.margineMinimoPct)} di margine
        {ricaricoMinimo != null ? ` (ricarico ${formatRicarico(ricaricoMinimo)})` : ""} la voce diventa gialla, sotto lo 0% rossa.
        {" "}Le voci «dal costo» seguono il costo e le spese generali: se cambiano, «Ricalcola dai costi» le riallinea. Il costo orario di un dipendente entra nella voce quando la salvi:
        se cambia in anagrafica, riapri e salva le voci della sua squadra.
      </p>
      <p>
        Quando vendita e costo sono positivi, le modifiche agli importi richiedono un margine maggiore di zero. Puoi
        correggere i dati descrittivi di una voce già presente mantenendo gli importi. Il filtro «Redditività» isola le
        voci da rivedere.
      </p>
      <p>
        {regole.impostate ? "Questi numeri sono quelli di «Prezzo e margini»." : "Sono i valori predefiniti: l'azienda non li ha ancora impostati."}
        {puoCambiare && (
          <>
            {" "}
            <Link to="/azienda/impostazioni/margini" className="font-medium text-primary underline-offset-2 hover:underline">
              {regole.impostate ? "Cambia" : "Imposta"}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
