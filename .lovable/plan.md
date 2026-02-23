

# Fix Vista Settimana: Allineamento Colonne + Travel Pill Inline

## Problemi identificati dallo screenshot

1. **Colonne header disallineate dal body**: L'header e il body usano lo stesso grid ma il body ha lo scrollbar verticale che sposta le colonne. Fix: aggiungere `overflow-y: scroll` anche all'header oppure usare un layout table-like.
2. **Travel pill su riga separata**: Attualmente la pill "9 min" e sopra l'appuntamento su una riga a parte. L'utente vuole tutto su una riga: `12:00 appuntamento prova 2 🚗 9 min`
3. **Tooltip mancante sull'appuntamento**: Al passaggio del mouse si deve vedere il titolo completo + dettagli travel

## Modifiche

### File: `src/components/marketing/MarketingCalendarWeekView.tsx`

**1. Fix allineamento colonne**
- Rimuovere la separazione header/body in due div con grid separati
- Usare un singolo container con `overflow-auto` che contiene sia header che body
- L'header resta `sticky top-0` dentro lo stesso container scrollabile
- Aggiungere `min-w-[700px]` per evitare compressione eccessiva su schermi piccoli

**2. Travel pill inline nell'appuntamento**
- Rimuovere il blocco separato della travel pill (righe 144-169)
- Integrare l'icona auto + durata DENTRO il blocco dell'appuntamento, sulla stessa riga
- Layout: `12:00 titolo... [🚗 9 min]` tutto in una singola riga con `flex` e `truncate`
- La pill travel e un `span` inline a destra con `ml-auto shrink-0`

**3. Tooltip completo al hover**
- Wrappare ogni blocco appuntamento in un `Tooltip`
- Il tooltip mostra: titolo completo, orario, indirizzo (se presente), e dettagli travel (durata + distanza + eventuale ritardo)
- Rimuovere l'attributo `title` nativo e usare il Radix `Tooltip` per consistenza

**4. Badge indirizzo mancante inline**
- Spostare anche il badge `MapPinOff` dentro la riga dell'appuntamento (come icona piccola prima del titolo)

### Risultato visivo atteso

```
| 12:00 | [12:00 appuntamento prova 2  🚗 9 min] |
| 14:00 | [14:00 appuntamento prova 3  🚗 41 min] |
```

Hover su qualsiasi appuntamento mostra tooltip con:
- Titolo completo
- Indirizzo
- Durata viaggio + distanza
- Eventuale ritardo

