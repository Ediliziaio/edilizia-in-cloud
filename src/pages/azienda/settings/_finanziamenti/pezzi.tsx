/**
 * Pezzi di schermo in comune alle pagine dei finanziamenti: la scheda di chi non può vedere,
 * l'avviso di chi può solo consultare, il titolo di un avviso.
 */
import type { HTMLAttributes } from "react";
import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FRASE_ACCESSO_NEGATO, FRASE_SOLA_LETTURA, ID_AVVISO_SOLA_LETTURA } from "./comuni";

/** Al posto della pagina, per chi non ha il permesso di vedere i finanziamenti. */
export function AccessoNegato() {
  return (
    <Card className="max-w-xl mx-auto mt-8">
      <CardContent className="py-10 flex flex-col items-center gap-4 text-center" role="alert" aria-live="polite">
        <ShieldAlert className="h-12 w-12 text-amber-500" aria-hidden="true" />
        <p className="font-medium">{FRASE_ACCESSO_NEGATO}</p>
      </CardContent>
    </Card>
  );
}

/**
 * In testa alla pagina, per chi può vedere ma non modificare. I comandi spenti lo citano con
 * `aria-describedby` (vedi `proprietaComandoSpento`): la stessa frase arriva anche al lettore di schermo.
 */
export function AvvisoSolaLettura() {
  return (
    <Alert id={ID_AVVISO_SOLA_LETTURA}>
      <AlertDescription>{FRASE_SOLA_LETTURA}</AlertDescription>
    </Alert>
  );
}

/**
 * Il titolo di un avviso. `AlertTitle` è un `<h5>`: sotto il titolo della tabella (un `<h2>`) salterebbe
 * tre livelli. Qui è un paragrafo con lo stesso aspetto.
 */
export function TitoloAvviso({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mb-1 font-medium leading-none tracking-tight", className)} {...props} />;
}
