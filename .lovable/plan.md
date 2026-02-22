

# Fix: Attivita non visibili - Foreign key mancanti

## Causa

Le query per attivita e note usano un join PostgREST:
```
.select("*, profiles:created_by(first_name, last_name)")
```

Ma le tabelle `marketing_contact_activities` e `marketing_contact_notes` non hanno una foreign key da `created_by` verso `profiles(id)`. PostgREST restituisce errore 400 e le attivita non vengono caricate.

## Soluzione

### 1. Aggiungere le foreign key mancanti (migrazione DB)

```sql
ALTER TABLE marketing_contact_activities
  ADD CONSTRAINT fk_activities_created_by
  FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE marketing_contact_notes
  ADD CONSTRAINT fk_notes_created_by
  FOREIGN KEY (created_by) REFERENCES profiles(id);
```

Questo permette a PostgREST di risolvere il join `profiles:created_by(...)` correttamente.

### 2. Nessuna modifica al codice frontend

Le query in `MarketingContactDetail.tsx` (righe 315 e 331) sono gia corrette. Una volta aggiunte le FK, il join funzionera e:
- Le attivita verranno caricate nella timeline centrale
- I nomi utente saranno visibili accanto a ogni attivita e nota

## Riepilogo

| Azione | Dettaglio |
|--------|-----------|
| Migrazione DB | Aggiungere FK `created_by -> profiles(id)` su entrambe le tabelle |
| Frontend | Nessuna modifica necessaria |
| Risultato | Timeline attivita visibile + nomi utente mostrati |
