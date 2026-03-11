

# Piano: UserAvailabilityTab — Disponibilità Settimanale Utente

## Panoramica
Implementare la gestione completa della disponibilità utente: orari settimanali con slot multipli per giorno, preset rapidi, eccezioni (giorni liberi/orari custom), e selezione timezone. Attualmente il tab è uno stub "Coming Soon".

## Modifiche

### 1. Migrazione DB — 3 tabelle
- **`user_availability`**: riga principale per utente (timezone, company_id, UNIQUE su user_id)
- **`user_availability_slots`**: slot orari per giorno (day_of_week 1-7, start_time/end_time)
- **`user_availability_exceptions`**: eccezioni per date specifiche (giorno libero o orari custom, con motivo)
- RLS: accesso basato su company_id tramite join con profiles
- Indici su user_id, availability_id, exception_date

### 2. Hook — `src/hooks/useUserAvailability.ts`
- `useUserAvailability(userId)`: carica availability + slots + exceptions; se non esiste restituisce default Lun-Ven 9-13/14-18
- `useSaveUserAvailability(userId, companyId)`: upsert availability, delete+re-insert slots ed exceptions

### 3. Componente — `src/components/users/UserAvailabilityTab.tsx`
Sostituisce lo stub. Sezioni:
- **Timezone**: Select con fusi orari comuni (default Europe/Rome)
- **Preset rapidi**: Lun-Ven 9-18, Lun-Sab 9-18, Lun-Ven 8-17, 24/7
- **Orari settimanali**: per ogni giorno toggle on/off + slot con input time + "Aggiungi pausa" + rimozione slot
- **Eccezioni**: lista con data, toggle giorno libero/orari custom, motivo opzionale
- **Bottone Salva**

### 4. SettingsUserDetail.tsx
Nessuna modifica necessaria — il tab è già montato a riga 336 senza props. Il componente legge `userId` da `useParams()` e `companyId` da `useAuth().effectiveCompany`.

## Note tecniche
- CHECK constraint `end_time > start_time` è immutabile e sicuro (non usa `now()`)
- Le eccezioni usano un CHECK condizionale: se `is_day_off=true` allora start/end devono essere NULL
- Il salvataggio usa delete+re-insert per semplicità (evita diffing complesso)
- I tipi DB si rigenerano automaticamente dopo la migrazione

