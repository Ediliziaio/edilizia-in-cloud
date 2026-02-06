

# EdiliziaInCloud — Piano di Implementazione Fase 1

## Panoramica
Portale SaaS per la gestione ordini nel settore edilizia, con focus iniziale su Super Admin e un flusso completo per una singola azienda, evidenziando il progress tracker personalizzabile come differenziatore chiave.

---

## Fase 1.1 — Fondamenta e Autenticazione

### Database Multi-Tenant
- Configurazione Supabase con Row Level Security
- Tabelle: `companies`, `users` (con ruoli), `user_roles` (separata per sicurezza)
- Politiche RLS per separazione dati tra aziende

### Sistema di Login
- Pagina login unificata con redirect basato sul ruolo
- Autenticazione Supabase Auth con email/password
- Gestione sessioni e protezione route

---

## Fase 1.2 — Pannello Super Admin

### Dashboard Globale
- Panoramica con statistiche: aziende attive, ordini totali, clienti totali
- Lista aziende con ricerca e filtri

### Gestione Aziende
- Creazione nuova azienda: nome, email, password, logo, settore
- Selezione settore che precarica template stati ordine appropriato
- Modifica e visualizzazione dettagli azienda

---

## Fase 1.3 — Pannello Admin Azienda

### Layout Brandizzato
- Sidebar navigazione con icone (Dashboard, Ordini, Clienti, Assistenza, Impostazioni)
- Header con logo e nome azienda personalizzati
- Design responsive mobile-first

### Dashboard Azienda
- Ordini recenti, ticket aperti, statistiche rapide
- Quick actions per creare ordine o cliente

### Gestione Clienti
- Lista clienti con ricerca
- Creazione cliente: nome, cognome, email, telefono, indirizzo
- Generazione automatica credenziali (mock email per ora)

---

## Fase 1.4 — Sistema Ordini con Progress Tracker ⭐

### Configurazione Stati Ordine
- Interfaccia drag-and-drop per riordinare gli step
- Creazione/modifica/eliminazione stati personalizzati
- Selezione icona da set predefinito + colore
- Anteprima live dello stepper come lo vedranno i clienti
- Stati default precaricati dal template settore

### Gestione Ordini
- Lista ordini con filtri e badge stato colorati
- Creazione ordine: cliente, descrizione, importi, data prevista, note
- Dettaglio ordine con stepper visivo orizzontale

### Progress Tracker Visivo
- Stepper orizzontale stile Amazon con pallini, icone e linea progresso
- Si adatta dinamicamente al numero e nomi degli step dell'azienda
- Aggiornamento stato con un click
- Storico cambi stato con timestamp

---

## Fase 1.5 — Portale Cliente

### Interfaccia Semplificata
- Navigazione: I Miei Ordini, Assistenza, Profilo
- Design pulito ottimizzato per smartphone

### I Miei Ordini
- Lista cards con stato visibile tramite badge
- Dettaglio ordine con progress tracker dinamico
- Visualizzazione: descrizione, importi, data prevista

### Sistema Ticket (Base)
- Apertura nuovo ticket: selezione ordine, oggetto, descrizione
- Lista ticket con stati (Aperto, In Lavorazione, Risolto)
- Chat semplice con risposte azienda

---

## Fase 1.6 — Dashboard Previsionale di Cassa

### Vista Finanziaria
- Tabella riepilogativa mensile: acconti, saldi, fatturato previsto
- Grafici a barre per visualizzazione trend
- Filtri per periodo (mese, trimestre, anno)

---

## Design System

### Palette Colori
- Sfondo: bianco, grigio chiaro (#F5F5F5)
- Primario: blu (#2563EB)
- Testi: scuro (#1A1A1A)
- Successo: verde — Stati completati
- Warning: ambra — Stati in corso

### Stile UI
- Minimal e pulito, niente elementi superflui
- Font Inter o equivalente sans-serif
- Cards con bordi sottili e ombre leggere
- Empty states con illustrazioni e testo guida
- Brand "EdiliziaInCloud" sempre visibile nell'header

---

## Note Tecniche

- **Multi-tenancy**: Ogni query filtrata per `company_id`
- **Ruoli separati**: Tabella `user_roles` dedicata (sicurezza)
- **Email mock**: Toast di conferma + log in console, integrazione Resend in fase successiva
- **Storage**: Supabase Storage per loghi e allegati ticket
- **Lingua**: Tutta l'interfaccia in italiano

