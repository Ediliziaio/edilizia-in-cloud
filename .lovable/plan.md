

# Distanza tra appuntamenti nel Dialog + Popup piu grande

## Problema attuale

1. La sezione "Altri appuntamenti del giorno" mostra solo orario e titolo, ma NON la distanza tra ciascun appuntamento e quello che stai creando/modificando
2. Il popup e troppo stretto (`sm:max-w-3xl`) e non si vedono tutti i contenuti

## Modifiche

### 1. Calcolo distanza tra appuntamenti dello stesso giorno

**File**: `src/components/marketing/MarketingAppointmentDialog.tsx`

- Gli appuntamenti dello stesso giorno vengono gia fetchati con `lat`, `lng` (riga 220)
- Aggiungere una `useQuery` che calcola le distanze tra ogni appuntamento dello stesso giorno (che ha coordinate) e l'appuntamento corrente (se ha coordinate)
- Per ogni appuntamento nella lista "Altri appuntamenti del giorno", mostrare:
  - Orario + Titolo (come adesso)
  - Pill compatta con distanza/tempo (es. "18 min - 12 km") calcolata dall'appuntamento corrente
- Se l'appuntamento corrente non ha coordinate, mostrare solo orario e titolo (come adesso)
- Chiamata batch: un singolo request `maps-proxy/directions` con tutti i waypoint dello stesso giorno, poi estrarre le distanze tra ogni coppia

### 2. Popup piu grande

**File**: `src/components/marketing/MarketingAppointmentDialog.tsx`

- Cambiare la classe del `DialogContent` da `sm:max-w-3xl` a `sm:max-w-4xl` per dare piu spazio
- Questo risolve il problema visivo dello screenshot dove i contenuti risultano compressi

---

## Dettaglio tecnico

### Calcolo distanze same-day

Logica:
- Filtrare `sameDayAppointments` che hanno `lat` e `lng` validi
- Per ciascuno, se anche `addressData.lat/lng` sono presenti, fare una chiamata directions (o batch unica)
- Per efficienza: usare una singola `useQuery` che calcola tutte le distanze in parallelo con `Promise.all`
- Ogni risultato viene associato all'`id` dell'appuntamento
- Struttura risultato: `Record<string, { duration_text: string; distance_text: string }>`
- Mostrare la pill accanto a ogni appuntamento nella lista

### File modificati

| File | Azione |
|------|--------|
| `src/components/marketing/MarketingAppointmentDialog.tsx` | Aggiungere useQuery per distanze same-day, pill per ogni appuntamento, DialogContent piu largo |

