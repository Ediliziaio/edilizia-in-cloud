# Calendari lavori: squadre di posa e calendari Google

Data: 8 settembre 2026 · Stato: approvato a voce dal founder, pezzo per pezzo.

## Perché

Un'azienda EiC — serramenti, ristrutturazioni, fotovoltaico — lavora con più
squadre di posa. Oggi la squadra esiste in due forme che non si parlano:
`external_teams` (etichetta con colore sulla commessa, colora il calendario) e
`subappaltatori` (ditta con login che entra in `/campo`). L'integrazione Google
Calendar serve solo il marketing: sincronizza gli appuntamenti, una persona =
un account = una destinazione. Le pose non escono mai da EiC.

Il caso concreto: Ke Bei Serramenti ha una sola Gmail con un calendario per
squadra, ognuno col suo colore. Ma la funzione è di piattaforma: vale per tutte
le aziende, nessun interruttore per singolo cliente.

Il modello voluto, uguale a come si crea un calendario marketing e gli si
associa il commerciale: nella sezione dei calendari lavori si creano le
squadre e a ognuna si associa il suo calendario Google. Due strade per la
squadra: condivide il suo calendario Google con l'account aziendale (o lo
collega lei stessa), oppure non usa Google e lavora dentro EiC dal suo accesso.

## Decisioni prese

- **Squadra = ditta o gruppo, interno o esterno.** Una sola entità: evolve
  `external_teams` (già con colore e 25 pose assegnate). Scartate: tabella
  nuova con migrazione (tocca dieci file per lo stesso risultato) e tenere due
  entità (lascerebbe fuori le squadre interne).
- **Direzione: EiC comanda, Google riceve, e ritorno bidirezionale sulle
  date.** Se la squadra sposta l'evento su Google, in EiC si spostano inizio e
  fine lavori. L'«occupato» di Google si vede.
- **L'evento è inizio–fine lavori, con orari.** Si aggiungono le ore a
  `work_start_date`/`work_end_date`; la Data Posa (`expected_date`) resta il
  traguardo promesso al cliente e non si muove da sola.
- **Avvisare, non bloccare.** La disponibilità della squadra è un aiuto alla
  scelta delle date, non un cancello.

## Pezzo 1 — Squadre uniche e pagina «Calendari lavori»

### Dati

`external_teams` (nome UI: «Squadre») guadagna:

| campo | tipo | significato |
|---|---|---|
| `kind` | text, `interna`/`esterna`, default `esterna` | chi è la squadra |
| `subappaltatore_id` | uuid → `subappaltatori`, null | il login della squadra, se ce l'ha |
| `leader_user_id` | uuid → `auth.users`, null | il capocantiere, per le interne |
| `google_connection_id` | uuid → `google_calendar_connections`, null | da quale account Google |
| `google_calendar_id` | text, null | in quale calendario di quell'account |
| `google_sync_enabled` | bool, default false | interruttore |
| `google_last_sync_at`, `google_last_error` | timestamptz, text | stato |

Vincolo: `(google_connection_id, google_calendar_id)` unico → un calendario
Google appartiene a una sola squadra.

Nuova `company_calendar_links` (`company_id`, `kind`, `google_connection_id`,
`google_calendar_id`, `enabled`, `last_sync_at`, `last_error`; unico su
`company_id, kind`). In questo pezzo l'unico `kind` è `posa`: il calendario
aziendale dove finiscono tutte le pose. Merce e Interventi arrivano quando
avranno il loro invio, non prima.

RLS: come `external_teams` oggi (lettura azienda, scrittura admin/permesso
calendario). Le connessioni Google restano per utente; l'admin sceglie tra
quelle dell'azienda (già leggibili in Integrazioni).

### Pagina `/azienda/impostazioni/calendari-lavori`

Voce «Calendari lavori» accanto a «Calendari marketing» in menu impostazioni,
hub mobile e ricerca impostazioni. Tre tab, stessa faccia della pagina
marketing (`MarketingCalendarsConfig`):

- **Squadre** — tabella *Nome · Tipo · Colore · Accesso · Calendario Google ·
  Stato sync* + «Nuova squadra». Il calendario si sceglie da un menu che
  elenca i calendari dell'account scelto (lista già letta da
  `google-calendar-auth`, azione `list-calendars`). Il CRUD di
  `SubappaltatoriTab` si sposta qui; là resta un rimando.
- **Calendari standard** — la riga Posa con il suo calendario Google.
- **Collegamenti** — le connessioni Google dell'azienda (riuso di
  `GoogleCalendarConnectionTab` + elenco aziendale), con l'avviso di collegare
  l'account con l'utente titolare, non con chi domani potrebbe non esserci.

### La squadra senza Google

Se ha `subappaltatore_id`, in `/campo` (`CampoCalendario`) vede anche le pose
delle commesse assegnate alla sua squadra via `order_external_teams` — oggi
vede solo quelle con un contratto di subappalto attivo.

## Pezzo 2 — Le pose viaggiano

### Orari

`orders.work_start_time` e `orders.work_end_time` (`time`, null). Le date
esistenti non cambiano tipo: trenta file le leggono. Nel dialog delle date due
campi ora accanto a inizio e fine, preset «mezza giornata» (8–12 / 13–17).
Senza orari l'evento è tutto-il-giorno. La vista settimana posiziona le pose
con orario all'ora giusta invece che nella riga tutto-il-giorno.

### Uscita: EiC → Google

Trigger su `orders` (cambio di `work_start_date`, `work_end_date`, orari,
`status` annullato) e su `order_external_teams` (assegnazione/rimozione
squadra) → accoda in `google_calendar_sync_queue` (nuova, `entity_type`
`order`, `entity_id`, `reason`, `attempts`, `processed_at`). La funzione edge
`google-calendar-sync` guadagna l'azione `push-order`: crea/aggiorna un evento
nel calendario della squadra (se `google_sync_enabled`) e uno nel calendario
aziendale Posa (se collegato). Il cron dei 15 minuti già esistente svuota la
coda; il frontend può chiamare l'azione subito dopo il salvataggio, come fa
oggi per gli appuntamenti.

Evento: titolo «Posa · <codice> · <cliente>», luogo = indirizzo cantiere,
descrizione con link alla commessa. Il legame sta in
`extendedProperties.private` (`eic_order_id`, `eic_company_id`), non nella
descrizione come per gli appuntamenti, dove basta riscriverla per perderlo.

Mappa: `google_calendar_order_events` (`order_id`, `external_team_id` null per
il calendario aziendale, `google_connection_id`, `google_calendar_id`,
`google_event_id`, `etag`, `last_updated_by` `eic`/`google`, `last_synced_at`).

### Ritorno: Google → EiC

`google_calendar_watches` (`connection_id`, `calendar_id`, `channel_id`,
`resource_id`, `channel_token`, `expiry_at`): un canale per ogni calendario
collegato a una squadra o al link aziendale. Il webhook risolve il canale →
calendario → pull incrementale di quel calendario; il cron delle 6 ore rinnova
i canali in scadenza. Oggi il canale è uno solo per account, sul principale.

Pull su un evento mappato a una commessa con etag cambiato: aggiorna
`work_start_date/time`, `work_end_date/time`; segna `last_updated_by =
google`; riallinea il calendario aziendale Posa; notifica in-app a chi segue
la commessa («Squadra Rossi ha spostato la posa al …»). Regola dei conflitti:
vince l'ultimo che ha toccato, con l'etag. Evento cancellato su Google: la
squadra viene tolta dalla commessa, le date restano — non è una decisione da
click sul telefono.

### Occupato

I calendari delle squadre entrano nella lettura degli slot occupati
(`google_calendar_busy_slots`, già per calendario), così il pezzo 3 ha i dati.

## Pezzo 3 — La disponibilità della squadra

RPC `squadra_impegni(p_team_id, p_dal, p_al, p_commessa_esclusa)` → righe
`(fonte, titolo, inizio, fine, tutto_il_giorno, order_id)`: le altre commesse
della squadra nel periodo (con gli orari) + gli slot occupati del suo
calendario Google.

Nel dialog delle date e nell'assegnazione squadra sul dettaglio commessa:
una striscia per squadra scelta — verde «libera», ambra con l'elenco degli
impegni sovrapposti. Non blocca. Se la RPC fallisce: «disponibilità non
verificabile», il salvataggio prosegue.

Nel calendario operativo: gli impegni Google delle squadre come layer, col
colore della squadra.

## Errori e limiti

- Token Google scaduto/revocato: la connessione va in `error`, la squadra
  mostra «errore sync» con il messaggio, la coda ritenta 3 volte e poi lascia
  la riga con `last_error`. Niente si blocca in EiC.
- Calendario Google cancellato: il push fallisce con 404 → `google_last_error`
  «calendario non trovato», sync disattivata per quella squadra.
- Una squadra su due account diversi non è ammessa (un calendario, una
  squadra).
- Nessun invio per commesse annullate o senza date.

## Test

- Migrazioni idempotenti, applicate sul live via Management API con
  `lock_timeout`, poi `migration repair`.
- Funzioni pure testate: sovrapposizione di intervalli con orari; costruzione
  del payload evento; parsing dell'evento Google in date/ore.
- Prova dal vivo su Demo Azienda 2 con un calendario Google di prova: crea
  squadra → collega → assegna a commessa con orari → evento appare → sposta su
  Google → date cambiano in EiC → striscia disponibilità sull'altra commessa.
- `node scripts/typecheck-ratchet.mjs` verde (è il controllo vero; `tsc` sulla
  radice non compila niente).

## Ordine e consegna

1 → 2 → 3. Ogni pezzo è utile da solo. Tutto in locale, mostrato al founder
prima di qualunque push.

## Fuori perimetro

Invio di merce e interventi sui calendari standard; sync degli appuntamenti
marketing (resta com'è); calendari Apple/Outlook per le squadre; app mobile
nativa.
