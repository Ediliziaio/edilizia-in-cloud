

# Stabilizzazione e Pulizia - MarketingAppointmentDialog e Modulo Calendario

## Problemi identificati

### 1. Console Warning: "Function components cannot be given refs"
- **Causa**: Il componente `Select` di Radix UI nella sezione "Seleziona Contatto" del `MarketingAppointmentDialog` riceve un ref internamente dal `DialogContent`. Questo e un warning noto di Radix UI quando `Select` viene usato direttamente dentro un `Dialog`.
- **Fix**: Wrappare il `Select` del contatto con `React.forwardRef` o usare un div intermedio per assorbire il ref.

### 2. Nessun altro bug funzionale critico
Dopo analisi del codice:
- Le query `useQuery` sono tutte correttamente configurate con `enabled`, `staleTime`, e gestione errori
- Il salvataggio funziona con validazioni pre-save
- Il sync indirizzo verso contatto e operativo
- Le distanze inter-appuntamento sono calcolate correttamente con `Promise.all`
- Il dialog ha dimensioni `sm:max-w-4xl` (gia corretto nell'ultimo edit)

### 3. UX miglioramenti minori
- La sezione "Altri appuntamenti del giorno" potrebbe avere un loading state quando le distanze sono in calcolo
- Aggiungere `Loader2` spinner accanto alle pill mentre `interDistances` sta caricando

---

## Modifiche pianificate

### File: `src/components/marketing/MarketingAppointmentDialog.tsx`

| Modifica | Dettaglio |
|----------|-----------|
| Fix ref warning | Wrappare il `Select` del contatto con un div per evitare il forward ref issue |
| Loading state distanze | Mostrare un micro-spinner accanto a ogni appuntamento same-day mentre `interDistances` e in loading (`isFetching`) |
| Pulizia `any` types | Tipizzare correttamente `sameDayAppointments` e `geocodedSameDay` per rimuovere i cast `as any` |

### Nessun file da rimuovere
Non ci sono file/componenti/funzioni morte nel perimetro analizzato. Tutti gli import sono utilizzati.

### Sequenza
1. Fix ref warning sul Select contatto
2. Aggiungere loading state per distanze inter-appuntamento
3. Pulizia tipi

