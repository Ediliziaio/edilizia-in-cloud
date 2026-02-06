

# Piano di Implementazione - Fase 1.2-1.4

## Panoramica

Questo piano copre la creazione dell'utente super admin di test, la pagina di creazione azienda con template stati ordine, il progress tracker visivo e la pagina impostazioni con drag-and-drop per gli stati ordine.

---

## 1. Creazione Utente Super Admin di Test

### Configurazione Backend
Creeremo una Edge Function per la creazione dell'utente super admin poiche l'inserimento in auth.users e nelle tabelle correlate richiede privilegi speciali (service role key).

La funzione:
- Crea l'utente in auth.users con email `flo.andriciuc@gmail.com` e password `Tekno2026!`
- Crea il profilo nella tabella `profiles`
- Assegna il ruolo `super_admin` nella tabella `user_roles`

---

## 2. Pagina Creazione Azienda (Super Admin)

### Interfaccia
Creeremo la pagina `/admin/aziende/nuova` con un form contenente:
- Nome azienda
- Email azienda
- Password per admin azienda
- Settore (dropdown con i valori dell'enum: serramenti, infissi, bagni, tetti, fotovoltaico, pittura, ristrutturazioni, altro)
- Upload logo (opzionale)

### Template Stati Ordine per Settore

Ogni settore avra un set predefinito di stati ordine che verranno creati automaticamente:

**Serramenti/Infissi:**
1. Contratto Firmato
2. Acconto Pagato
3. Rilievo Tecnico
4. In Produzione
5. Produzione Finita
6. Merce in Magazzino
7. Posa Programmata
8. Posa Completata

**Fotovoltaico:**
1. Contratto Firmato
2. Acconto Pagato
3. Sopralluogo Tecnico
4. Progettazione
5. Pratica GSE
6. Materiale Ordinato
7. Installazione Programmata
8. Installazione Completata
9. Collaudo
10. Allaccio Rete

**Bagni/Ristrutturazioni:**
1. Contratto Firmato
2. Acconto Pagato
3. Rilievo Tecnico
4. Progettazione
5. Ordine Materiali
6. Demolizioni
7. Impianti
8. Posa
9. Finiture
10. Consegna

**Altro (default):**
1. Contratto Firmato
2. In Lavorazione
3. Completato

### Logica Backend
Edge Function che:
1. Crea la company nella tabella `companies`
2. Crea l'utente admin in auth.users
3. Crea il profilo in `profiles` con company_id
4. Assegna ruolo `company_admin` in `user_roles`
5. Crea gli stati ordine basati sul template del settore in `order_statuses`

---

## 3. Progress Tracker Visivo

### Componente OrderProgressTracker
Componente React riutilizzabile che visualizza lo stato dell'ordine come stepper orizzontale stile Amazon:

**Design:**
- Pallini collegati da linee
- Icone personalizzate per ogni step
- Colori dinamici: completato (verde), corrente (blu), futuro (grigio)
- Linea di progresso che si colora progressivamente
- Responsive: su mobile diventa verticale

**Props:**
```text
- statuses: array degli stati ordine dell'azienda (ordinati per position)
- currentStatusId: ID dello stato corrente dell'ordine
- statusHistory: storico dei cambi stato (opzionale, per mostrare date)
- onStatusChange: callback per cambio stato (solo per admin, opzionale)
- interactive: boolean per abilitare il click sugli step
```

### Visualizzazione
- Step completati: pallino pieno verde con icona check
- Step corrente: pallino blu con icona dello stato, pulsante
- Step futuri: pallino grigio chiaro con icona sbiadita
- Linea di connessione: verde fino allo step corrente, grigia dopo

---

## 4. Pagina Impostazioni Azienda

### Struttura Pagina
La pagina `/azienda/impostazioni` avra diverse sezioni in tab:
- **Profilo Azienda**: modifica nome, email, logo
- **Stati Ordine**: configurazione drag-and-drop degli step

### Sezione Stati Ordine

**Interfaccia Drag-and-Drop:**
- Lista ordinabile degli stati con:
  - Handle per trascinamento
  - Nome stato (editabile inline)
  - Selettore icona (da set predefinito Lucide)
  - Selettore colore
  - Pulsante elimina
- Pulsante "Aggiungi Stato" in fondo
- Anteprima live del progress tracker in tempo reale

**Set Icone Disponibili:**
FileText, CheckCircle, Clipboard, Ruler, Factory, Package, Truck, Wrench, Home, Zap, Sun, Hammer, PaintBucket, Settings, Clock, Calendar, Shield, Star, Award, Flag

**Palette Colori Predefiniti:**
#2563EB (blu), #16A34A (verde), #CA8A04 (ambra), #DC2626 (rosso), #7C3AED (viola), #0891B2 (ciano), #EA580C (arancione), #DB2777 (rosa)

**Logica:**
- Drag-and-drop aggiorna il campo `position` di ogni stato
- Modifiche salvate automaticamente con debounce
- Validazione: almeno 2 stati richiesti
- Lo stato non puo essere eliminato se e usato in ordini esistenti

---

## 5. File da Creare/Modificare

### Nuovi File:
```text
supabase/functions/create-super-admin/index.ts     - Edge function per creare super admin
supabase/functions/create-company/index.ts         - Edge function per creare azienda
src/pages/admin/CreateCompany.tsx                  - Pagina creazione azienda
src/pages/admin/CompaniesList.tsx                  - Lista aziende (placeholder)
src/pages/azienda/Settings.tsx                     - Pagina impostazioni azienda
src/components/orders/OrderProgressTracker.tsx     - Componente progress tracker
src/components/settings/OrderStatusConfig.tsx      - Componente configurazione stati
src/components/settings/StatusItem.tsx             - Singolo item stato draggable
src/components/settings/IconPicker.tsx             - Selettore icone
src/components/settings/ColorPicker.tsx            - Selettore colori
src/lib/orderStatusTemplates.ts                    - Template stati per settore
```

### File da Modificare:
```text
src/App.tsx                                        - Aggiungere nuove route
```

---

## 6. Dipendenze

Per il drag-and-drop utilizzeremo `@dnd-kit` che e leggero e ben supportato:
- @dnd-kit/core
- @dnd-kit/sortable
- @dnd-kit/utilities

---

## 7. Flusso di Test

Dopo l'implementazione:
1. Chiamare l'edge function per creare il super admin
2. Effettuare login con le credenziali fornite
3. Accedere alla dashboard super admin
4. Creare una nuova azienda selezionando un settore
5. Verificare che gli stati ordine siano stati creati correttamente
6. Accedere come admin azienda
7. Testare la configurazione stati nella pagina impostazioni
8. Verificare il progress tracker nell'anteprima

