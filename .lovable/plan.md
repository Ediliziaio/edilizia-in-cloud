

# Allineare visivamente il Calendario Lavori al Calendario Marketing

## Differenze attuali

Il **Calendario Marketing** ha un layout moderno con:
- Header compatto: titolo + tab (calendario/elenco) + bottone "Nuovo" sulla stessa riga
- Barra di navigazione inline: "Oggi" | frecce prev/next | data cliccabile con date picker | selettore vista (Giorno/Settimana/Mese)
- Il calendario occupa `h-[calc(100vh-200px)]` con pannello filtri laterale
- Vista settimanale con griglia oraria, drag & drop, slot temporali
- Vista mese con drag & drop tra giorni

Il **Calendario Lavori** ha un layout più tradizionale:
- Header separato con titolo, toggle group per le viste, bottoni azione
- Filtri in pannello collapsible sotto l'header
- Ogni sotto-vista (MonthView, WeekView) ha la propria Card con navigazione prev/next interna
- La vista settimanale mostra colonne-giorno con card impilate (no griglia oraria)
- Nessun drag & drop

## Piano di intervento

### 1. Ristrutturare il layout della pagina `Calendar.tsx`

Allineare la struttura della pagina al marketing:
- Header: titolo "Calendario Lavori" + selettore vista (Giorno/Settimana/Mese/Carico/Gantt) come `<Select>` + bottone "Appuntamento"
- Barra navigazione sotto: "Oggi" | frecce | data cliccabile con Popover date picker | (filtri restano come collapsible o pannello laterale)
- Contenuto calendario a tutta altezza `h-[calc(100vh-200px)]`

### 2. Rifattorizzare `CalendarMonthView` nello stile Marketing

Attualmente usa una `<Card>` con navigazione prev/next integrata. Modificare per:
- Rimuovere la navigazione interna (gestita dalla pagina padre)
- Usare la stessa struttura griglia del `MarketingCalendarMonthView`: border rounded-lg, celle con `min-h-[100px]`, no Card wrapper
- Mantenere gli eventi ordine (posa/merce) e appuntamenti lavoro come badge colorati
- La legenda resta in basso

### 3. Rifattorizzare `CalendarWeekView` nello stile Marketing

Attualmente mostra colonne con card impilate e badge carico. Modificare per:
- Rimuovere la navigazione interna
- Usare una griglia oraria come `MarketingCalendarWeekView`: colonna ore a sinistra, 7 colonne giorno, slot temporali
- Gli eventi ordine e appuntamenti lavoro vengono posizionati nello slot corrispondente
- Mantenere il layout mobile collapsible esistente come fallback

### 4. Propagare `currentDate` e navigazione

Le sotto-viste non gestiranno più la navigazione. La pagina `Calendar.tsx` gestirà tutto con la stessa logica del marketing: prev/next in base alla vista attiva (giorno/settimana/mese).

## Riepilogo file da modificare

| File | Modifica |
|------|----------|
| `Calendar.tsx` | Nuovo header e navigazione stile marketing, date picker, layout full-height |
| `CalendarMonthView.tsx` | Rimuovere Card/navigazione interna, griglia stile marketing |
| `CalendarWeekView.tsx` | Rimuovere Card/navigazione, aggiungere griglia oraria |

Nessuna modifica al database. Le viste Carico e Gantt restano invariate.

