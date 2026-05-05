---
area: 10-ai-act-governance
titolo: Multi-tenancy e isolamento dei dati
tags: [multi-tenancy, isolamento, separazione-dati, sicurezza, gdpr]
livello: avanzato
applicabile_a: [architettura-cervello-supremo, sicurezza-dati]
kpi_correlati: [zero-data-leak, audit-conformi]
versione: 1.0
aggiornato_il: 2026-05-05
---

# Multi-tenancy e isolamento dei dati — il principio numero uno

Il **Cervello Supremo** serve molte aziende clienti contemporaneamente. Ogni azienda ha i suoi dati, le sue persone, i suoi cantieri, i suoi clienti. **I dati di un'azienda non devono mai uscire dai confini di quell'azienda**, né essere visibili al Cervello quando risponde a un'altra azienda.

Questo è il principio architetturale più importante. Senza, l'intero sistema è inutilizzabile: nessun cliente affiderebbe i propri dati a un'AI che potrebbe esporli ad altri.

## Cos'è la multi-tenancy

Una piattaforma è "multi-tenant" quando serve più clienti (tenant) sulla stessa infrastruttura. Vantaggi: economie di scala, manutenzione centralizzata, aggiornamenti rapidi. Sfida: garantire che i dati di ogni tenant siano completamente isolati.

Il modello opposto è "single-tenant": un'istanza dedicata per cliente. Più costoso, più semplice da isolare. Adatto solo a clienti molto grandi o con requisiti regolatori estremi.

EiC e il Cervello Supremo operano in **multi-tenancy con isolamento rigoroso**.

## I 4 livelli di isolamento

**1. Isolamento applicativo**
Codice che, ad ogni query, filtra i dati per tenant. L'utente A non vede mai dati dell'utente B. Implementato a livello di query database, API, e prompt all'AI.

**2. Isolamento del database**
- Tenant in tabelle separate (schema-per-tenant)
- Tenant separati per riga con `tenant_id` (row-level security)
- Tenant in database separati per clienti enterprise

EiC adotta tipicamente **row-level security** con politiche di accesso enforced a livello DB (es. PostgreSQL Row Level Security).

**3. Isolamento del modello AI**
Quando il Cervello accede al **Company Brain** (la memoria della specifica azienda), accede SOLO ai dati di quel tenant. Il prompt al modello è composto con dati esclusivamente del tenant corrente.

Il **Knowledge Base universale** (questo KB) è invece condiviso tra tutti i tenant: contiene conoscenza generica del settore, non dati di nessuna azienda specifica.

**4. Isolamento dei log e degli audit**
Anche i log delle interazioni AI sono segregati per tenant. L'amministratore di EiC può accedere ai log per supporto/debug, ma con processo controllato e auditabile.

## Come l'AI rispetta l'isolamento — l'architettura

Quando l'utente di un'azienda fa una domanda al Cervello:

```
1. Autenticazione utente → ID tenant + ID utente + ruolo
2. Domanda dell'utente
3. Sistema recupera contesto SOLO dal Company Brain del tenant corrente
   + Knowledge Base universale (condivisa)
4. Prompt al modello LLM include:
   - Domanda utente
   - System prompt con istruzioni
   - Dati Company Brain del tenant
   - Chunk pertinenti dal KB universale
   - NESSUN dato di altri tenant
5. Risposta generata
6. Log: registrazione dell'interazione nel database del tenant
7. Risposta restituita all'utente
```

Ogni passaggio è instrumented per **bloccare** automaticamente qualsiasi accesso cross-tenant.

## I rischi tipici e come si mitigano

**Rischio: query SQL malformata che bypassa filtri tenant**
Mitigazione: row-level security a livello database, non solo applicativo. Anche un bug applicativo non può bypassare il DB.

**Rischio: cache condivisa**
Se due richieste di tenant diversi condividono la cache, possibile leak. Mitigazione: chiavi di cache che includono sempre tenant_id.

**Rischio: log condivisi**
Mitigazione: log separati per tenant o con isolamento granulare per accesso.

**Rischio: AI che "ricorda" dati tra conversazioni di tenant diversi**
Mitigazione: il modello non deve essere fine-tuned su dati specifici dei tenant. La "memoria" tenant-specifica è in database, non nel modello stesso.

**Rischio: errore umano (es. backup di un tenant ripristinato sul tenant sbagliato)**
Mitigazione: procedure operative formali, audit, doppio controllo.

**Rischio: accesso amministrativo abusivo**
Mitigazione: principle of least privilege, audit log degli accessi admin, separation of duties.

## Cosa il Cervello NON deve mai fare

- **Non rispondere mai con dati di un'altra azienda** quando interroga il tenant A
- **Non confondere clienti** ("ah sì, anche [Cliente di altro tenant] ha avuto questo problema")
- **Non aggregare dati** tra tenant senza esplicito consenso e anonimizzazione
- **Non condividere insight** specifici tra tenant ("il tenant X ha questi numeri")

L'unica eccezione sono **insight aggregati e completamente anonimizzati** (es. "il margine medio del settore è 12%") che derivano da fonti pubbliche o dati aggregati con consenso esplicito + anonimizzazione tecnica robusta.

## Il caso dei "consigli da casi simili"

L'utente potrebbe chiedere: "abbiamo lo stesso problema di altri clienti EiC?". Risposta corretta del Cervello:

> "Posso dirti che il problema X è ricorrente nel settore (basandomi sul Knowledge Base generico), e tipicamente si risolve con Y. Non posso però condividere informazioni specifiche di altre imprese clienti — sarebbe violazione della loro riservatezza."

Aggregati pubblicabili (es. "il 60% delle imprese edili ha DSO sopra 90 giorni") sono possibili **se e solo se**:
- Tecnicamente anonimizzati (k-anonymity, differential privacy)
- Con consenso esplicito dei tenant
- Pubblicati come dato aggregato, non riconducibile

## Test di isolamento

Per validare il funzionamento, si fanno test periodici:

1. **Penetration test cross-tenant**: tester autenticato come tenant A prova ad accedere dati di tenant B
2. **SQL injection test**: tentativi di bypass dei filtri tenant
3. **AI red team**: prompt manipolativi che cercano di far "trapelare" dati di altri tenant
4. **Audit log verification**: verifica che log siano completi e segregati
5. **Backup/restore test**: verifica che procedure di backup non causino confusione

Frequenza: trimestrale per audit interno, annuale per audit esterno.

## Casi giuridici reali

Violazioni dell'isolamento tenant hanno portato a:
- Sanzioni Garante Privacy (in Italia, multe fino a milioni di €)
- Cause civili dei clienti danneggiati
- Perdita di clienti (effetto reputazionale)
- Obblighi di notifica violazione (entro 72 ore al Garante e ai clienti)

In casi gravi, la responsabilità penale può estendersi a dirigenti.

## Compliance legale

Multi-tenancy mal gestita = violazione di:
- **GDPR** (art. 5, 32, 33): integrità, sicurezza, notifica violazioni
- **AI Act**: obblighi di sicurezza dei sistemi AI
- **Codice del Consumo**: aspettative legittime del cliente
- **Contratti SLA** con i clienti

## EiC — l'approccio

Il Cervello Supremo EiC è progettato con isolamento by-design:

- **Database**: row-level security PostgreSQL su Supabase, ogni query filtra automaticamente per `tenant_id`
- **API**: middleware che verifica autenticazione + autorizzazione tenant ad ogni richiesta
- **AI**: contesto del tenant separato, mai mescolato con altri
- **Log**: schema separato per audit per tenant
- **Backup**: snapshots per tenant, restore controllato
- **Audit**: log accessi admin con motivazione obbligatoria

Una violazione dell'isolamento è considerata "incident di livello 0" — massima priorità di response.

## Riferimenti tecnici

- **GDPR art. 32** — Sicurezza del trattamento
- **AI Act art. 15** — Accuratezza, robustezza, cybersecurity
- **ISO/IEC 27001** — Sistema di gestione sicurezza informazioni
- **ISO/IEC 27017** — Sicurezza in cloud
- **PostgreSQL Row Level Security** documentation
- **Supabase RLS** documentation
