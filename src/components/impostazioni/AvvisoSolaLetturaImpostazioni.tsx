import { AvvisoSolaLettura } from "@/components/common/AvvisoSolaLettura";

/**
 * La frase di chi apre una pagina di impostazioni che può vedere ma non cambiare: è la stessa in tutte le pagine
 * (prima ognuna diceva la sua, o niente) e nomina il permesso che serve, così si sa a chi chiedere.
 * I comandi della pagina restano spenti o nascosti: questa riga dice perché.
 */
export function AvvisoSolaLetturaImpostazioni({ permesso }: { permesso: string }) {
  return (
    <AvvisoSolaLettura>
      Stai consultando queste impostazioni: le cambia chi ha «{permesso}» in modifica.
    </AvvisoSolaLettura>
  );
}
