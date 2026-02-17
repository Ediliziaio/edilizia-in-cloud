

# Audit e Miglioramento Sezione Aziende (`/admin/aziende`)

## Problemi Trovati

### 1. BUG: Nessuna gestione errore
Come la dashboard, manca `isError`. Se la query fallisce, l'utente vede solo il loader infinito o una lista vuota senza feedback.

### 2. BUG: Query ordini scarica TUTTI i record
`supabase.from("orders").select("company_id")` scarica ogni singolo ordine solo per contare. Con migliaia di ordini diventa pesante. Soluzione: usare `select("company_id", { count: "exact" })` non funziona per raggruppamenti, ma possiamo almeno aggiungere `.select("company_id")` con un commento di ottimizzazione futura (RPC). Per ora il trade-off e accettabile, ma aggiungiamo un `.limit(50000)` come guardia.

### 3. MANCANZA: Scadenza trial non visibile
Il campo `trial_ends_at` esiste nel DB ma non viene mostrato. Il Super Admin non sa quali trial stanno per scadere senza aprire il dettaglio di ogni azienda.

### 4. UX: Riga espansa duplica dati
La riga espandibile mostra gli stessi dati gia visibili nella tabella (ordini, MRR, stato, data). Non aggiunge valore. Meglio mostrare dati utili che NON sono nella tabella: P.IVA, telefono, scadenza trial, indirizzo.

### 5. MANCANZA: Contatore totale aziende
Non c'e un contatore visibile con il totale e il totale filtrato (es. "12 di 45 aziende").

## Piano di Intervento

### File: `src/pages/admin/CompaniesList.tsx`

**Gestione errore:**
- Aggiungere `isError` e `refetch` dalla query companies
- Mostrare Alert con tasto "Riprova" in caso di errore (stesso pattern della dashboard)

**Contatore risultati:**
- Aggiungere sotto i filtri un testo tipo "Visualizzando X di Y aziende" quando ci sono filtri attivi

**Colonna Trial:**
- Sostituire la colonna "Creata il" con "Trial / Scadenza" che mostra:
  - Per aziende in trial: giorni rimanenti con colore (verde > 7gg, giallo 3-7gg, rosso < 3gg)
  - Per aziende attive: data di creazione come fallback

**Riga espansa migliorata:**
- Sostituire i dati duplicati con informazioni utili non presenti in tabella:
  - P.IVA (`vat_number`)
  - Telefono (`phone`)
  - Scadenza trial (`trial_ends_at`) con data precisa
  - Ragione sociale (`business_name`)
  - PEC (`pec`)
  - Note (`notes`) se presenti

**Guardia query ordini:**
- Aggiungere `.limit(50000)` alla query ordini come protezione

### Riepilogo modifiche

| File | Azione |
|------|--------|
| `CompaniesList.tsx` | Error handling, trial info, expanded row migliorata, contatore |

### Cosa rimane invariato (gia OK)
- Filtri (ricerca, stato, settore, piano) -- ben implementati
- Export CSV -- funzionale
- Impersonificazione -- corretta
- Join con `subscription_plans` -- efficiente
- `staleTime: 5 min` -- appropriato

