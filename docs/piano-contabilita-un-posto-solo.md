# Piano: la contabilità in un posto solo

10/11/2026. La partita doppia (Contabilità generale) stava dentro Fatture → Fiscalità. La Prima
nota e il resto della contabilità operativa stavano invece nella barra laterale, sotto
«Contabilità». Due posti per lo stesso argomento, e a chi non tiene la contabilità in casa la
pagina mostrava «piano dei conti vuoto».

## Cosa resta com'è

- **Prima nota**: il quaderno di cassa e banca, dove l'ufficio registra incassi e pagamenti. È
  la fonte dei movimenti per la partita doppia, non un doppione.
- **Fiscalità**: Registro IVA, Liquidazione IVA e F24, Ritenute, Archivio. Sono gli adempimenti,
  che servono anche a chi non tiene la partita doppia.

## Lotto 1 — un interruttore per azienda

- `companies.contabilita_generale_attiva` (boolean, falso per tutti) si accende dalle
  impostazioni: Impostazioni → Fatturazione → «Contabilità generale in casa». Lo cambia chi può
  già cambiare l'azienda, con le regole che ci sono.
- Si accende per chi ha già il piano dei conti (oggi un'azienda sola).

## Lotto 2 — la voce nel menu

- Barra laterale → Contabilità: Prima nota · Tesoreria · Costi · **Contabilità generale** ·
  Analisi acquisti · Previsionale. La voce si vede solo con l'interruttore acceso, con lo stesso
  permesso e la stessa funzione del piano di prima (`canViewPrimaNota`, `contabilita_fiscale`).
  Anche nella griglia del telefono e nella ricerca rapida.
- Pagina nuova `/azienda/contabilita-generale` con la stessa schermata.
- Fiscalità non ha più la scheda; il vecchio indirizzo (`?sezione=generale`) porta alla pagina
  nuova con anno e vista.
- Ad interruttore spento la pagina non mostra il piano vuoto: spiega cos'è e, a chi può, offre
  di accenderla.

## Lotto 3 — le scritture si fanno da sole

- `contabilita_genera_automatica()`, ogni 15 minuti da `pg_cron`, solo SQL (nessuna funzione
  edge, nessun segreto). Per ogni azienda con l'interruttore acceso e il piano dei conti, genera
  l'esercizio in corso e quello prima finché non è chiuso. La generazione è la stessa del
  pulsante: registra solo quello che manca e non tocca gli esercizi chiusi né i periodi stampati.
- Esito per esercizio in `contabilita_esercizi` (`generato_il`, `generato_esito`). Un'azienda che
  dà errore non ferma le altre.
- La pagina dice «Aggiornata alle 10:15». Il pulsante diventa «Aggiorna adesso», per chi non
  vuole aspettare.

## Dopo, se serve

- Da una riga di Prima nota «vedi la scrittura», e dal mastrino «apri il documento».
- Rinominare «Tesoreria» in «Banca»: va cambiato anche nelle pagine, non solo nel menu.
