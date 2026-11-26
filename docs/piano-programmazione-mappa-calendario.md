# Programmazione: mappa del giorno e Calendario (piano, 26/11/2026)

Richiesta di Florin: «nella programmazione la vista dalla mappa, così vedo oggi
chi deve fare, dove deve andare, cosa deve fare, con i viaggi»; e la
programmazione «si integra con il calendario, quello generale delle commesse».

## Cosa c'è già

- **Programmazione** (Commesse → Programmazione): interventi del giorno con
  persone, mezzi, orari; salvata nel database (`programmazione_*`, migrazione
  `20290613150000`). La vista Mappa oggi mostra i punti numerati e, per UNA
  persona alla volta, il giro in linea d'aria.
- **Mappa operativa del Calendario** (`components/calendar/mappa/`): sfondo
  OpenFreeMap, sede operativa (`companies.operational_lat/lng`,
  `useCompanyBase`), timbrature GPS del giorno (`mappa_timbrature_gps`),
  percorsi stradali solo se OSRM è configurato (oggi no).
- **Calendario** (`pages/azienda/Calendar.tsx`): eventi di ogni giorno da una
  funzione sola, `buildCalendarEvents` (posa, merce, lavoro, appuntamenti,
  ferie, interventi, manutenzioni); il dettaglio del giorno
  (`CalendarDayDetailsDialog`) è condiviso da mese, settimana, giorno, Gantt e
  Pianificazione team.

## Fase A — La mappa del giorno nella Programmazione

1. **Tutti i giri insieme**, un colore per persona, con partenza e rientro
   dalla sede operativa; la legenda accende e spegne le persone.
2. **I viaggi**: per ogni tappa km e minuti di strada stimati (linea d'aria ×
   1,3, a 45 km/h), l'ora a cui partire per arrivare puntuali, i totali di km e
   guida per persona, e un avviso quando fra due tappe non c'è il tempo di
   arrivare.
3. **Cosa deve fare**: un clic su un punto apre la scheda dell'intervento
   (orario, lavorazione, persone, mezzi, note, merce in arrivo) con «Apri».
4. **Oggi, dove sono davvero**: le timbrature GPS del giorno
   (`mappa_timbrature_gps`) come punti «posizione reale», e per ogni persona
   arrivato / in viaggio / non ha timbrato.
5. Mappa più alta e lista per persona affiancata.

Tutto lato pagina: nessuna migrazione.

## Fase B — Integrazione col Calendario

1. **Nel dettaglio del giorno** del Calendario (tutte le viste): la sezione
   «Programmazione del giorno» — per intervento chi va, a che ora, con cosa;
   stato bozza / pubblicata; «Apri la programmazione».
2. **Nel mese/settimana**: un segno per i giorni già programmati (pubblicati o
   in bozza). Serve leggere molti giorni in una volta: una funzione di sola
   lettura `programmazione_riepilogo(azienda, dal, al)` (piccola migrazione).
   Senza, il segno resta solo nel dettaglio del giorno.
3. **Ponti**: dalla Programmazione «Vedi nel calendario» (apre il Calendario
   su quel giorno); dal Calendario «Programma la giornata» (apre la
   Programmazione sul giorno scelto, `?giorno=`).
4. Le date dei lavori restano del Calendario: la Programmazione le legge (la
   proposta del giorno parte dai lavori in calendario) e non le cambia.

## Fuori da questo giro

- Percorsi stradali veri e tempi reali: richiedono un server OSRM (decisione di
  Florin, vedi `docs/calendari-mappa-operativa.md`).
- Spostare un lavoro di giorno dal Calendario trascinando dentro la
  Programmazione (oggi si fa nel Calendario).
