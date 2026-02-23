

# Fix Colonna Orario Vista Settimana

## Problema

Quando si riduce la finestra, la colonna degli orari (prima colonna) si comprime insieme alle altre. Il `min-w-[700px]` attuale e troppo basso: 700px meno 60px di colonna orario lascia solo ~91px per ogni giorno, insufficiente per mostrare gli appuntamenti con le travel pill.

## Soluzione

### File: `src/components/marketing/MarketingCalendarWeekView.tsx`

- Aumentare `min-w-[700px]` a `min-w-[900px]` sia nel container che nel grid, cosi le colonne dei giorni mantengono sempre una larghezza adeguata (circa 120px ciascuna)
- Questo forza lo scroll orizzontale prima che le colonne si comprimano troppo, mantenendo il layout come nel secondo screenshot

| Modifica | Dettaglio |
|----------|-----------|
| Riga 90 | `min-w-[700px]` diventa `min-w-[900px]` |

Nessun altro file modificato. Il resto della vista e gia corretto come confermato dall'utente.

