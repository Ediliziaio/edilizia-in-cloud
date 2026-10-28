# Presenze: revisione locale di pagina e registro ore

## Problemi rilevati

La pagina `personale?tab=presenze` montava due registri con fonti e periodi
indipendenti uno sotto l'altro. In Demo Azienda 2, 119 righe di rapportini con
note estese precedevano il calendario HR: consultarlo richiedeva una lunga
scansione. Non c'erano ricerca o paginazione delle ore; gli stati HR non
elencati venivano rappresentati con `?`, i decimali delle ore erano arrotondati
nel riepilogo e gli errori della query potevano sembrare un mese vuoto.

## Modifiche

- Due viste distinte, **Calendario HR** di default e **Ore per cantiere**.
  Solo la vista aperta viene montata, senza le query dell'altro registro.
- Un unico mese condiviso, indirizzo ricaricabile/condivisibile con `mese` e
  `vista_presenze`; parametri preesistenti conservati. Controlli mese precedente,
  successivo e ritorno al mese corrente; validazione del parametro.
- Calendario aggregato per stato, tutti i 15 stati HR con etichette leggibili,
  ricerca persona/mansione, reparto, stato e sole anomalie. Riepiloghi coerenti
  con i filtri, ore decimali conservate e dettaglio giornaliero con nomi e orari.
- Assenza non dedotta da un record mancante, da un giorno non lavorativo o da
  uno stato sconosciuto. Errori e caricamento distinti dal mese vuoto.
- Registro ore in tabella adattabile, 15 righe per pagina; ricerca anche nelle
  note, filtri dipendente/cantiere/stato, azzeramento e paginazione anche in alto.
  Note complete disponibili in dettagli espandibili, non eliminate o alterate.
- Permessi di visualizzazione costi e di modifica invariati. Moduli e conferme
  di registrazione/annullamento restano quelli esistenti.
- `useGiornate`: lettura in pagine da 500, ordine data/id e cancellazione tramite
  AbortSignal. Ogni pagina mantiene azienda e intervallo; un errore intermedio
  non restituisce un risultato parziale come completo. Nessuna migrazione.
- Eliminata la query ai profili HR che veniva eseguita ma non utilizzata.

Le modifiche condivise a DailyHoursPanel conservano il comportamento standalone,
la preselezione della commessa e i controlli di autorizzazione. Il comportamento
mobile di PersonalePage (Oggi, Richieste, Persone) non viene alterato.

## Verifiche

- **192 test in 16 file superati**, con 22 test nuovi: calendario, filtri,
  cambio vista/mese, URL, errori, loading, dettagli, paginazione e permessi;
  lettura di 1.001 record e fallimento su una pagina successiva.
- Regressioni esistenti su registrazione ore, retry/idempotenza, presenze
  mobile, costi personale, riconciliazione e commesse superate.
- `npm run build:fast`: riuscita, anche sulla versione finale.
- ESLint sui nove file interessati: zero errori e zero warning.
- `git diff --check`: nessun errore.
- `npm run typecheck:ci`: riuscito, 655 errori preesistenti contro baseline di
  703, nessun incremento per file e nessuna modifica della baseline.

## Prova reale, senza scritture

Demo Azienda 2 nel browser locale:

- Ottobre HR: 357 giornate/38 persone; ricerca Florin → 9 giornate/1 persona;
  apertura dettaglio con nome e orari; azzeramento filtri.
- Ottobre cantieri: 119 registrazioni/952 ore, 8 pagine. Pagina successiva
  dall'alto → righe 16–30; ricerca Antonio Bello → 7 righe/56 ore, pagina 1.
  Apertura/chiusura note e modulo ore, senza confermare alcuna operazione.
- Settembre: 410 registrazioni cantieri; cambio vista mantiene settembre.
  Calendario HR: **1.061 giornate/41 persone**, oltre il vecchio limite di
  lettura. Filtro Direzione → 30 giornate/1 persona; sole anomalie → nessun
  risultato esplicito, non una falsa assenza.
- Alla fine ripristinati ottobre e calendario HR senza filtri.

Nessun inserimento, annullamento, approvazione, invio, push o deploy eseguito.
Anteprime locali in `output/presenze-20261026/`.
