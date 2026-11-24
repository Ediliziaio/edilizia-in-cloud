
import { useT } from "@/lib/campo/lingua/LinguaCampo";/** Explain number ownership before an administrator chooses to purchase a line. */
export function NumberConnectionGuide() {
  const t = useT();
  return (
    <details className="rounded-lg border bg-muted/20 px-2.5 py-2">
      <summary className="cursor-pointer text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        {t("Come usare il tuo numero aziendale")}
      </summary>
      <div className="mt-2 grid gap-2.5 text-xs leading-5 md:grid-cols-3">
        <div>
          <h3 className="font-medium">{t("Collega il centralino via SIP")}</h3>
          <p className="mt-1 text-muted-foreground">
            {t("Se la linea è compatibile, l’operatore o il centralino passa le chiamate all’assistente. Puoi scegliere quando farlo, ad esempio fuori orario o quando l’ufficio non risponde. Il numero resta presso il tuo operatore.")}
          </p>
        </div>
        <div>
          <h3 className="font-medium">{t("Inoltra le chiamate")}</h3>
          <p className="mt-1 text-muted-foreground">
            {t("Se puoi attivare una deviazione, i clienti continuano a chiamare il numero abituale e il tuo operatore inoltra la chiamata a una linea dell’assistente. Verifica costi e trasmissione del numero del chiamante.")}
          </p>
        </div>
        <div>
          <h3 className="font-medium">{t("Usa lo stesso numero in uscita")}</h3>
          <p className="mt-1 text-muted-foreground">
            {t("Serve abilitare l’uscita sul collegamento SIP e avere il permesso di presentare quel numero. Se l’operatore attuale non lo supporta, puoi valutare la portabilità verso un operatore compatibile.")}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("Puoi chiedere la verifica anche se non conosci l’operatore o il tipo di centralino.")}
      </p>
    </details>
  );
}
