import { Link } from "react-router-dom";
import type { RegolePrezzo } from "@/hooks/useRegolePrezzo";
import { formatRicarico, prezzoDaRicarico, ricaricoDaMargine } from "@/lib/tariffe/prezzoDalCosto";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const pct = (n: number) => `${n.toLocaleString(intlCampo(), { maximumFractionDigits: 1 })}%`;
const euro = (n: number) => n.toLocaleString(intlCampo(), { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

/**
 * Come si legge il prezzo di una voce, con i numeri dell'azienda (da «Prezzo e
 * margini»): costo pieno, ricarico e margine, e l'esempio di 100 € di costo.
 * Da telefono no: è una spiegazione da scrivania.
 */
export function NotaMargine({ regole, puoCambiare }: { regole: RegolePrezzo; puoCambiare: boolean }) {
  const t = useT();
  const sg = regole.speseGeneraliPct;
  const costoEsempio = 100 * (1 + sg / 100);
  const prezzoEsempio = prezzoDaRicarico(costoEsempio, regole.ricaricoObiettivoPct) ?? 0;
  const ricaricoMinimo = ricaricoDaMargine(regole.margineMinimoPct);
  return (
    <div className="space-y-1.5 rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground max-sm:hidden">
      <p>
        <span className="font-medium text-foreground">{t("Costo pieno")}</span> {t("= costo + spese generali ({sg}).", { sg: pct(sg) })}{" "}
        <span className="font-medium text-foreground">{t("Ricarico")}</span> {t("= quanto aggiungi al costo pieno;")}{" "}
        <span className="font-medium text-foreground">{t("margine")}</span> {t("= quanto resta del prezzo. Non sono lo stesso numero: un ricarico del 20% è un margine del 16,7%.")}
      </p>
      <p>
        {t("Esempio con 100 € di costo: costo pieno {costo}, obiettivo {obiettivo} di margine → ricarico {ricarico} → prezzo {prezzo}.", { costo: euro(costoEsempio), obiettivo: pct(regole.margineObiettivoPct), ricarico: formatRicarico(regole.ricaricoObiettivoPct), prezzo: euro(prezzoEsempio) })}{" "}
        {ricaricoMinimo != null
          ? t("Sotto il {minimo} di margine (ricarico {ricaricoMinimo}) la voce diventa gialla, sotto lo 0% rossa.", { minimo: pct(regole.margineMinimoPct), ricaricoMinimo: formatRicarico(ricaricoMinimo) })
          : t("Sotto il {minimo} di margine la voce diventa gialla, sotto lo 0% rossa.", { minimo: pct(regole.margineMinimoPct) })}
        {" "}{t("Le voci «dal costo» seguono il costo e le spese generali: se cambiano, «Ricalcola dai costi» le riallinea. Il costo orario di un dipendente entra nella voce quando la salvi: se cambia in anagrafica, riapri e salva le voci della sua squadra.")}
      </p>
      <p>
        {t("Quando vendita e costo sono positivi, le modifiche agli importi richiedono un margine maggiore di zero. Puoi correggere i dati descrittivi di una voce già presente mantenendo gli importi. Il filtro «Redditività» isola le voci da rivedere.")}
      </p>
      <p>
        {regole.impostate ? t("Questi numeri sono quelli di «Prezzo e margini».") : t("Sono i valori predefiniti: l'azienda non li ha ancora impostati.")}
        {puoCambiare && (
          <>
            {" "}
            <Link to="/azienda/impostazioni/margini" className="font-medium text-primary underline-offset-2 hover:underline">
              {regole.impostate ? t("Cambia") : t("Imposta")}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
