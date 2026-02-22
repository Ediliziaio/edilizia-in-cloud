

# Stabilizzazione e pulizia del progetto

## Analisi completata

Ho esaminato l'intero codebase: routing (App.tsx), autenticazione (AuthContext), pagine principali, componenti marketing, hooks, configurazione sidebar, ErrorBoundary, e la struttura generale. Il progetto e complessivamente ben organizzato. Ecco le aree con interventi necessari.

---

## 1. Pulizia codice - Elementi da rimuovere

### a) Variabile di stato inutilizzata in MarketingContactDetail.tsx
- **Riga 210**: `const [docFilter, setDocFilter] = useState("all")` -- dichiarata ma mai usata nel componente. Da rimuovere.

### b) Import inutili in MarketingContactDetail.tsx
- Dopo la rimozione di `docFilter`, verificare che non ci siano import orfani connessi (es. `Filter` icon se usata solo per quello -- ma in questo caso `Filter` e usata anche nella search box, quindi resta).

---

## 2. Fix funzionali

### a) Nessun bug critico rilevato
- Le query con join `profiles:created_by(...)` ora funzionano grazie alle FK aggiunte nella migrazione precedente
- ErrorBoundary copre tutte le aree principali
- Le rotte sono tutte collegate correttamente
- AuthContext gestisce correttamente loading/redirect/impersonation

### b) Miglioramento: gestione errore nel caricamento contatto
- In MarketingContactDetail, se la query fallisce (errore di rete), l'utente vede solo "Caricamento..." all'infinito. Aggiungere gestione dello stato `isError` con messaggio e pulsante "Riprova".

### c) Miglioramento: empty state per timeline attivita
- Il messaggio "Nessuna attivita registrata" nella timeline centrale e corretto ma potrebbe essere piu informativo, con una CTA suggerendo di aggiungere una nota o un'azione.

---

## 3. UX miglioramenti

### a) Loading state migliorato nel dettaglio contatto
- Sostituire il testo "Caricamento..." con uno skeleton/spinner centrato per feedback visivo migliore.

### b) Empty state arricchito per timeline
- Aggiungere icona e suggerimento all'empty state della timeline centrale ("Aggiungi una nota o modifica i dati del contatto per vedere la cronologia").

### c) Feedback visivo su salvataggio campi inline
- I campi InlineField attualmente salvano silenziosamente al blur. Aggiungere un brevissimo feedback (es. un check icon transitorio) per confermare il salvataggio.

---

## 4. Dettaglio tecnico delle modifiche

### File: `src/pages/azienda/marketing/MarketingContactDetail.tsx`

| Modifica | Riga | Dettaglio |
|----------|------|-----------|
| Rimuovere `docFilter` | 210 | Eliminare `const [docFilter, setDocFilter] = useState("all")` |
| Error state | ~416-418 | Aggiungere check `isError` con messaggio e pulsante "Riprova" |
| Loading migliorato | ~416-418 | Usare Loader2 icon animato invece di testo semplice |
| Empty state timeline | ~743-744 | Arricchire con icona Activity e testo suggerimento |
| Feedback InlineField | ~47-49 | Mostrare brevemente un check icon dopo il salvataggio |

### Nessun file da eliminare
L'analisi non ha trovato file completamente inutilizzati. Tutti i componenti e le pagine sono referenziati nelle rotte o importati da altri componenti.

---

## 5. Cosa NON viene toccato (vincolo rispettato)
- Nessun cambiamento al comportamento funzionale
- Nessuna modifica a routing, autenticazione, o logica di business
- Nessuna modifica ai file auto-generati (client.ts, types.ts, config.toml, .env)

