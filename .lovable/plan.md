

# Audit Enterprise — Sezione Appuntamenti Marketing & Vendita

## A) Stato attuale (AS-IS)

### Componenti coinvolti (10 file)

| File | Righe | Responsabilità |
|------|-------|----------------|
| `MarketingCalendar.tsx` | 673 | Orchestratore principale (state, fetch, handlers) |
| `MarketingCalendarWeekView.tsx` | 300 | Vista settimanale con DnD |
| `MarketingCalendarDayView.tsx` | 269 | Vista giornaliera con DnD |
| `MarketingCalendarMonthView.tsx` | 174 | Vista mensile con DnD |
| `MarketingAppointmentDialog.tsx` | 757 | Form creazione/modifica appuntamento |
| `MarketingAppointmentsList.tsx` | 229 | Vista elenco con tabella paginata |
| `MarketingCalendarFilters.tsx` | 124 | Pannello filtri laterale |
| `DraggableAppointment.tsx` | 147 | Wrapper draggable + resize |
| `DroppableSlot.tsx` | 23 | Wrapper droppable |
| `CalendarSuggestions.tsx` | 202 | Suggerimenti calendario intelligenti |
| `DailyRoutePanel.tsx` | 60 | Visualizzazione percorso giornaliero |
| `marketingCalendarConstants.ts` | 33 | Utilità condivise (slot, colori) |

### Database

- Tabella `appointments`: 29 colonne, RLS attiva, 7 indici
- Policy RLS: corrette per company_admin, company_staff (con visibilità), super_admin
- Indice composito mancante: `(company_id, appointment_date)` — la query principale filtra per entrambi

---

## B) Problemi identificati e interventi proposti

### P0 — Performance (impatto alto)

| # | Problema | Impatto | Intervento |
|---|----------|---------|------------|
| 1 | **Indice composito mancante** su `(company_id, appointment_date)` | Query principale fa seq-scan su entrambi i filtri separatamente | Creare indice composito `idx_appointments_company_date ON appointments (company_id, appointment_date)` |
| 2 | **Contacts lookup senza limite intelligente** | `MarketingCalendar.tsx` riga 184: fetch di 1000 contatti per arricchire nomi. Su aziende grandi, payload enorme solo per fare join di nomi | Spostare l'arricchimento lato DB con una sub-select o join nella query appuntamenti, oppure fetch solo i contatti referenziati |
| 3 | **Users fetch fa 2 query sequenziali** (profiles + user_roles) | Riga 104-130: prima carica tutti i profili, poi filtra per ruolo. Su aziende con molti utenti, lento | Unificare in una singola query con join o RPC |
| 4 | **Travel legs sequenziali nella week view** | Riga 331: `for...of` sequenziale per ogni giorno → fino a 7 chiamate seriali alla edge function `maps-proxy` | Parallelizzare con `Promise.all` (con rate limit opzionale) |
| 5 | **Inter-distances nella dialog: N chiamate parallele** | `MarketingAppointmentDialog.tsx` riga 254: `Promise.all` di N chiamate maps-proxy per ogni appuntamento dello stesso giorno | Raggruppare in una singola chiamata `directions` multi-waypoint |

### P1 — Pulizia codice e duplicazioni

| # | Problema | Intervento |
|---|----------|------------|
| 6 | **`timeToMin` / `timeToMinutes` duplicata** in 4 file (MarketingCalendar, WeekView, DayView, DraggableAppointment) | Centralizzare in `marketingCalendarConstants.ts` |
| 7 | **`addMinutesToTime` / `addMinutesToTimeStr` duplicata** in 2 file | Centralizzare in `marketingCalendarConstants.ts` |
| 8 | **`minutesToTimeStr` duplicata** in DraggableAppointment e potenzialmente MarketingCalendar | Centralizzare |
| 9 | **`getHeightPx` e `getTopOffsetPx` identiche** in WeekView e DayView | Estrarre in utility condivisa o hook |
| 10 | **`handleDragStart`/`handleDragEnd` quasi identici** in WeekView, DayView, MonthView | Pattern ripetuto ma con piccole differenze (regex), accettabile — documentare |
| 11 | **DayView `getHeightPx` ha codice morto** alla riga 93: `if (durationMin > slotDurationMinutes) return height; return height;` — entrambi i rami ritornano lo stesso valore | Rimuovere la condizione inutile |
| 12 | **`HALF_HOURS` esportato ma non usato** in `marketingCalendarConstants.ts` | Verificare se usato altrove, rimuovere se dead code |

### P1 — Stabilità e edge case

| # | Problema | Intervento |
|---|----------|------------|
| 13 | **`TODAY_STR` calcolato una sola volta** (riga 30 di MarketingAppointmentsList) | Se l'app resta aperta oltre mezzanotte, il filtro "prossimo" mostra dati stantii. Usare computed value nel filtro |
| 14 | **`filtersInitialized` set inside queryFn** (righe 94-97 e 124-126 di MarketingCalendar) | Settare stato React dentro queryFn è un anti-pattern: causa re-render durante il commit di react-query. Spostare in `onSuccess` / `useEffect` |
| 15 | **Delete senza conferma** | `handleDelete` nel dialog non mostra conferma prima di eliminare un appuntamento. Aggiungere `window.confirm` |
| 16 | **Drag & Drop nella MonthView non ha guard `justDragged`** | Dopo un drag nella vista mese, il click su `onClickDay` potrebbe scattare. Aggiungere lo stesso pattern di WeekView/DayView |

### P1 — Sicurezza

| # | Problema | Intervento |
|---|----------|------------|
| 17 | **Update/delete senza filtro `company_id`** | `handleDropAppointment` (riga 456) e `handleResizeAppointment` (riga 504) fanno `.update().eq("id", id)` senza `.eq("company_id", companyId)`. La RLS protegge, ma è best practice aggiungere il filtro esplicito come defense-in-depth |
| 18 | **`handleStatusChange` in MarketingAppointmentsList** (riga 67): stesso problema, update senza `company_id` | Aggiungere filtro |
| 19 | **Cast `as any` estensivo** | `rawAppointments` cast a `any[]` (riga 171), payload insert cast `as any` (riga 379). Tipizzare correttamente usando i tipi generati da Supabase |

### P2 — UX / Minor

| # | Problema | Intervento |
|---|----------|------------|
| 20 | **`window.confirm` per drag/resize** ha stile nativo del browser | Sostituire con dialog modale custom (AlertDialog di Radix) per coerenza UI — intervento opzionale, bassa priorità |
| 21 | **Contacts select nel dialog mostra solo 200 contatti** senza ricerca | Per aziende con 1000+ contatti, l'utente non trova il contatto. Implementare ricerca server-side con debounce |

---

## C) Riepilogo interventi per area

### Performance (stima miglioramento)

- Indice composito: -40% tempo query principale su tabelle > 5000 righe
- Contacts lookup ottimizzato: -80% payload su aziende con > 500 contatti
- Travel legs parallelizzati: -70% tempo calcolo percorsi settimanali (da 7× seriale a 1× parallelo)

### Sicurezza

- RLS: gia corretta e ben configurata
- Defense-in-depth: aggiungere `company_id` filter su tutte le mutazioni
- Nessuna chiave API esposta lato client
- Nessun dato sensibile nel frontend

### Database

- Indici esistenti: 7 (buona copertura)
- Indice mancante: 1 (composito company_id + appointment_date)
- Integrità referenziale: corretta (FK su calendar, company, contact, order)
- RLS: 4 policy, tutte tenant-scoped

### Backup

- Gestito automaticamente da Lovable Cloud (backup giornalieri con point-in-time recovery incluso nel piano)
- Nessun intervento necessario

### Monitoraggio

- Console pulita (zero errori)
- Query react-query con `staleTime` configurato correttamente
- Nessun memory leak identificato

---

## D) Piano di implementazione ordinato

1. **Migrazione DB**: creare indice composito `(company_id, appointment_date)`
2. **Centralizzare utility**: spostare `timeToMin`, `addMinutesToTimeStr`, `minutesToTimeStr` in `marketingCalendarConstants.ts`
3. **Rimuovere dead code**: condizione inutile in DayView, verificare `HALF_HOURS`
4. **Fix anti-pattern**: spostare `filtersInitialized` fuori da queryFn
5. **Fix `TODAY_STR` statico** in MarketingAppointmentsList
6. **Defense-in-depth**: aggiungere `.eq("company_id", companyId)` su tutte le mutazioni
7. **Conferma delete** nel dialog
8. **Guard `justDragged` nella MonthView**
9. **Ottimizzare contacts lookup**: fetch solo contatti referenziati dagli appuntamenti
10. **Parallelizzare travel legs** nella week view

I punti 1-8 sono interventi sicuri senza rischio di regressione. I punti 9-10 sono ottimizzazioni che richiedono test accurati.

