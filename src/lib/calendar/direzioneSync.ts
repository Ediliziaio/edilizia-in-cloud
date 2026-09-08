/**
 * Direzione della sincronizzazione con il calendario esterno.
 *
 * Fino al 08/09/2026 la stessa scelta viveva in due tabelle e in due schede
 * diverse: `google_calendar_settings.sync_mode` (Mio profilo → Preferenze sync)
 * e `user_calendar_preferences.sync_direction` (Utenti → Calendari). La seconda
 * non la leggeva nessuno: si sceglieva "Solo → Google" e non cambiava niente.
 *
 * Ora la direzione ha un vocabolario solo, e chi la salva scrive entrambe le
 * colonne — `sync_direction` e' quella che comanda lato server, `sync_mode`
 * resta il riflesso per le schede che la mostrano.
 */

export type DirezioneSync = "both" | "to_google" | "from_google";

export const DIREZIONI_SYNC: Array<{
  value: DirezioneSync;
  label: string;
  descrizione: string;
}> = [
  {
    value: "both",
    label: "Bidirezionale",
    descrizione:
      "Gli appuntamenti del gestionale finiscono sul tuo calendario e gli eventi del calendario entrano nel gestionale.",
  },
  {
    value: "to_google",
    label: "Solo verso il calendario",
    descrizione:
      "Gli appuntamenti del gestionale finiscono sul tuo calendario. I tuoi eventi personali restano fuori dal gestionale (ma continuano a bloccare gli orari, se il blocco fasce è attivo).",
  },
  {
    value: "from_google",
    label: "Solo dal calendario",
    descrizione:
      "Gli eventi del tuo calendario entrano nel gestionale. Il gestionale non scrive niente sul tuo calendario.",
  },
];

/** Il riflesso di `sync_direction` sulla vecchia colonna a due valori. */
export function modoDaDirezione(direzione: DirezioneSync): "one_way" | "two_way" {
  return direzione === "both" ? "two_way" : "one_way";
}

/** Cosa vale per chi non ha ancora una riga di preferenze. */
export function direzioneDaModo(syncMode?: string | null): DirezioneSync {
  return syncMode === "two_way" ? "both" : "to_google";
}

export function etichettaDirezione(direzione: DirezioneSync): string {
  return DIREZIONI_SYNC.find((d) => d.value === direzione)?.label ?? "Bidirezionale";
}
