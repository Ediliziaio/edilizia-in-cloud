# Piattaforma agenti — piano generale

> Documento guida. Ogni fase ha (o avrà) un piano di dettaglio a parte in `docs/superpowers/plans/`. La fase 1 è `2026-09-25-fase1-agente-whatsapp-lead.md`.

**Obiettivo:** gli agenti di Edilizia in Cloud fanno tutto quello che fa GoHighLevel (Conversation AI + Workflows) e in più lavorano su commesse, cantieri, preventivi, fatture, magazzino e personale, con un solo motore, un solo registro di strumenti e un solo credito.

**Punto di partenza (mappato il 25/09/2026 su `origin/main`):**
- 12 sistemi di agenti separati, 5 prompt scritti nel codice, 4 registri di strumenti, 2 motori LLM con crediti diversi (più un terzo per la voce).
- Nessun agente permette a un'azienda di scrivere il suo prompt per chattare con i lead su WhatsApp: gli agenti configurabili (`ai_agents_v2`) oggi girano solo in voce (ElevenLabs).
- Il bot lead WhatsApp (`lead-ai-processor`) è rotto: legge colonne che non esistono (`nome`, `cognome`, `telefono`) e risponde 404. Stesso difetto nel bot assistenza.
- La storia della chat è a metà: i bot leggono solo i messaggi del cliente, non le proprie risposte.
- Gli orari liberi di un calendario li calcola solo il browser (`PublicBooking.tsx`); lato server non c'è una funzione. `public-booking-crea` confronta gli impegni esterni con l'ora sbagliata (fuso) e non impedisce la doppia prenotazione.
- Il motore delle automazioni ha ~70 trigger e ~40 azioni che funzionano, ma: 4 passi di logica esistono e non si vedono nel builder; il promemoria «N ore prima» gira una volta al giorno; quasi tutte le azioni funzionano solo sui contatti; nessun passo affida una conversazione a un agente e ne aspetta l'esito; il motore parallelo `internal_automation_*` è spento ma i suoi trigger scattano ancora.

---

## Fase 1 — Il Bagno Group: agente WhatsApp dei lead al livello GHL
Piano di dettaglio: `2026-09-25-fase1-agente-whatsapp-lead.md`.

Risultato: chi scrive al numero di Il Bagno parla con l'assistente di Giusy (prompt dell'azienda), che fa le 4 domande, legge gli orari veri del «Calendario Katia», fissa la telefonata, sposta l'opportunità DVS nella fase giusta, riconosce il fuori zona, passa la mano a una persona quando serve, e si ferma se un operatore prende la conversazione.

Pezzi riusabili che nascono qui (servono a tutte le fasi dopo):
1. **Motore calendario lato server** (`_shared/calendarioSlot.ts` puro + `_shared/calendarioPrenotazione.ts`): orari liberi e prenotazione con disponibilità, margini, preavviso, tetto giornaliero, impegni Google/Apple/Outlook, fuso corretto, controllo della doppia prenotazione.
2. **Agente WhatsApp configurabile** (`ai_agents_v2` tipo `whatsapp` + `ai_whatsapp_numbers.agent_id`): prompt, calendario, pipeline e fasi scelte dall'azienda.
3. **Storia completa della conversazione** (entrambi i versi, per contatto).
4. **Pausa del bot per conversazione** (`conversazioni.bot_in_pausa`) e passaggio a operatore.

## Fase 2 — Un solo motore per tutti gli agenti
- Un runtime unico (`agente-runtime`) con canali: WhatsApp lead, WhatsApp clienti, WhatsApp assistenza, chat del sito, risposte email, voce (gli strumenti ElevenLabs puntano allo stesso registro).
- Tutti i prompt dell'azienda in `ai_agents_v2` (niente più prompt nel codice): i 5 prompt attuali diventano modelli di partenza in `ai_agent_templates` (oggi inutilizzata).
- Un registro strumenti unico per dominio — CRM, calendari, preventivi, commesse, cantieri, magazzino, fatture, ticket, personale — con permessi per agente e conferma obbligatoria per le azioni rischiose (riuso dei ~250 strumenti di Silvio e degli strumenti clienti).
- Un solo router LLM e un solo credito (unificare `aiRouter` e `_shared/ai-provider`; `wa_ai_daily_budget` come tetto per agente).
- Memoria del contatto: risposte di qualificazione, preferenze, ultimo esito, visibili nella scheda.
- Vocali: download dei media Meta + trascrizione, così l'agente capisce anche gli audio (oggi `media_storage_path` non si riempie mai).

## Fase 3 — Automazioni al livello GHL e oltre
- **Passi di logica visibili nel builder**: vai a, fine, aspetta evento, sequenza (categoria `logica` mancante in `ActionCatalogList.tsx`).
- **Promemoria all'ora giusta**: scheduler per appuntamento (non il giro delle 07:02), che segue anche gli spostamenti.
- **Passo «Affida all'agente e aspetta l'esito»** con rami: prenotato / non prenotato / fuori zona / operatore / nessuna risposta entro X.
- **Trigger mancanti**: risposta del cliente su qualsiasi canale, SMS in arrivo, stato chiamata, preventivo inviato o visto, fattura pagata e stato SDI, commessa completata, ticket con risposta del cliente o SLA superato, ferie approvate, pagamento fallito, webhook in ingresso, link cliccato, «tag specifico aggiunto», valore/owner/stato opportunità cambiato.
- **Azioni su tutte le entità**: le azioni leggono l'entità del trigger (commessa, preventivo, fattura, ticket), non solo il contatto; le variabili `{{fattura.*}}`, `{{preventivo.*}}` si compilano in email, WhatsApp e SMS; le uscite di un passo passano ai passi dopo.
- **Azioni nuove**: valore/owner/stato opportunità, round-robin per opportunità/ticket/task, notifica interna su WhatsApp all'utente assegnato, passo manuale che aspetta un utente, valori personalizzati e formattatori data/numero, cambio stato commessa, crea DDT/ODA, invia il PDF di preventivo o fattura, chiedi recensione, sposta/annulla appuntamento.
- **Affidabilità**: `wait_for_event` che funziona anche per preventivi e pagamenti; condizioni su tutte le entità e con operatori di data; un flusso messo in pausa ferma le iscrizioni in corso; versioni dei flussi; stato `canceled`/`cancelled` unico; togliere il motore `internal_automation_*`.

## Fase 4 — Agenti operativi
Ogni agente è un tipo in `ai_agents_v2`, con trigger, strumenti e permessi propri; le azioni rischiose passano dalle proposte da approvare di Silvio.
- **Commesse e ordini**: risponde al cliente sullo stato dei lavori, avanzamento, DDT e SAL; avvisa di ritardi.
- **Cantiere** (esiste per gli operai): rapportini, foto, presenze, segnalazioni — portato sul runtime unico.
- **Amministrazione**: fatture, scadenze, solleciti, pagamenti ricevuti.
- **Preventivi**: follow-up, firma, scadenza, domande sul preventivo.
- **Assistenza**: ticket, garanzie, merce, richiami.
- **Magazzino**: scorte, riordini, arrivi merce.

## Fase 5 — Controllo e qualità
- Registro conversazioni con esito e costo per agente; cruscotto (lead → risposte → appuntamenti).
- Simulatore di conversazione con casi di prova ripetibili (fuori zona, vocale, chiede il prezzo, cambia orario, chiede una persona) prima di attivare un prompt.
- AI Act (art. 50, in vigore dal 2 agosto 2026): l'assistente dice di essere un sistema automatico se glielo chiedono; registro delle conversazioni.
- Limiti anti-abuso e tetti di spesa per agente.

---

## Ordine e dipendenze
1 → 2 → 3 → 4, con la 5 che cresce insieme. La fase 1 costruisce i mattoni (calendario, storia, pausa, agente configurabile) che la fase 2 generalizza; la fase 3 ne ha bisogno per il passo «affida all'agente».

## Regole che valgono per tutte le fasi
- Nessun push su `main` senza l'ok esplicito del founder (auto-deploy).
- Migrazioni: SQL idempotente, `apply_migration` via MCP e riallineamento della versione (vedi `CLAUDE.md`); `lock_timeout`/`statement_timeout` sulle migrazioni che scrivono dati.
- Funzioni nuove: `REVOKE ALL … FROM PUBLIC, anon` e grant espliciti.
- Prima di dire «pronto»: `node scripts/typecheck-ratchet.mjs`, i test toccati, e la build.
