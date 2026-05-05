---
area: 10-ai-act-governance
titolo: Audit trail e logging dell'AI
tags: [audit, log, tracciabilita, compliance, ai-act-art-12]
livello: intermedio
applicabile_a: [architettura-cervello, amministratori]
kpi_correlati: [completezza-log, tempo-consultazione]
versione: 1.0
aggiornato_il: 2026-05-05
---

# Audit trail e logging — ogni azione dell'AI è tracciabile

Il principio: **se l'AI fa qualcosa, deve esserci un log che lo dimostri**. Senza log, non c'è responsabilità, non c'è audit, non c'è conformità.

L'AI Act art. 12 richiede ai sistemi ad alto rischio capacità di logging automatico per consentire tracciabilità del funzionamento. Anche per sistemi a rischio limitato, è best practice imprescindibile.

## Cosa loggare

Per ogni interazione con il Cervello:

**Identificazione**:
- ID univoco interazione
- Timestamp con secondi
- Tenant (azienda)
- Utente (chi ha fatto la richiesta)
- Ruolo dell'utente
- Sessione

**Input**:
- Domanda/richiesta dell'utente (testo completo)
- Eventuali allegati
- Parametri di contesto

**Processing**:
- Modello AI usato (es. Claude Sonnet 4.6)
- Versione del system prompt
- Versione del KB consultato
- Chunk del KB recuperati (con score)
- Dati Company Brain consultati
- Tool/function call eseguite
- Tempo di elaborazione

**Output**:
- Risposta generata (testo completo)
- Eventuali azioni eseguite
- Citazioni fonti
- Eventuali HIL richiesti

**Sicurezza**:
- Tentativi di accesso non autorizzato
- Refusal (perché è stato rifiutato)
- Anomalie rilevate

## Per quanto tempo conservare i log

Conservazione differenziata:

| Tipo log | Durata |
|---|---|
| Log operativi standard | 12-24 mesi |
| Log audit GDPR | Almeno 5 anni |
| Log decisioni HIL su decisioni rilevanti | 10 anni |
| Log incidenti di sicurezza | 10+ anni |
| Log fiscale-correlato | 10 anni (allineato a obblighi fiscali) |
| Log cambi configurazione | Permanente (con archiviazione) |

L'AI Act art. 19 richiede ai provider di sistemi alto rischio di conservare log per **almeno 6 mesi** (più, secondo legge nazionale).

## Sicurezza dei log

I log devono essere:

**Immutabili**: append-only, non modificabili né eliminabili (anche da admin)

**Cifrati**: at-rest e in-transit

**Backup**: copie multiple, con redundancy geografica

**Access controlled**: solo ruoli specifici (admin, DPO, auditor) accedono

**Time-stamped**: con timestamp validati e non manipolabili

**Integrity-checked**: hash cryptografici per detect manipolazioni

Tecnologie usate:
- Database append-only (es. PostgreSQL con triggers anti-modifica)
- Blockchain per log critici (raramente, costoso)
- WORM storage (Write Once Read Many)
- Cloud audit log services (AWS CloudTrail, Azure Audit Log, Google Audit Log)

## Cosa fare con i log

I log non sono "scaffale": vanno usati attivamente.

**1. Audit periodico**
Mensile/trimestrale, review da parte di admin/DPO:
- Ci sono pattern anomali?
- Ci sono utenti con comportamenti sospetti?
- Il sistema funziona come previsto?

**2. Indagine post-incident**
Quando succede un problema (errore AI, contestazione utente, sospetta violazione):
- Ricostruzione esatta dei fatti
- Identificazione cause radice
- Determinazione responsabilità
- Prevenzione recidive

**3. Compliance e audit esterni**
Auditor (privati o autorità) possono richiedere:
- Log specifici
- Prova di funzionamento corretto del sistema
- Tracciabilità di decisioni controverse

**4. Esercizio diritti GDPR**
Quando un interessato chiede accesso ai propri dati:
- Lista delle interazioni che lo riguardano
- Dati personali contenuti
- Decisioni automatizzate prese

**5. Miglioramento continuo**
Analisi statistica dei log per:
- Identificare hallucinations frequenti
- Migliorare il KB
- Ottimizzare il sistema
- Identificare bias

## Anonymization e pseudonymization

I log contengono dati personali. Per uso analitico:

- **Pseudonymization**: sostituire identificativi con pseudonimi (utente_001 invece di Mario Rossi). Reversibile in caso di necessità.
- **Anonymization**: rimuovere/aggregare dati a tal punto che non si può più risalire all'individuo. Irreversibile.

I log "operativi" (per support e audit) sono pseudonimizzati. I log "analitici" (per miglioramento prodotto) sono spesso anonimizzati.

## Log e privacy

I log contengono dati personali, quindi soggetti a GDPR. Implicazioni:

- Base giuridica per il logging (interesse legittimo + obblighi di legge)
- Informativa all'utente che le interazioni sono loggate
- Conservazione limitata (cancellazione dopo periodo definito)
- Sicurezza adeguata
- Diritti dell'interessato applicabili anche ai log

Eccezione: log per **adempimento obblighi di legge** (es. audit fiscale) hanno base giuridica più forte e possono superare alcuni diritti dell'interessato (es. cancellazione).

## Dashboard di audit

Per amministratori aziendali e DPO:

**Vista 1: salute del sistema**
- Volume interazioni/giorno
- Tempi di risposta
- Tasso errori
- Anomalie

**Vista 2: per utente**
- Chi ha interagito
- Frequenza, tipologie domande
- Eventuali tentativi di accesso fuori scope

**Vista 3: per decisione critica**
- Lista HIL richiesti
- Approvati/rifiutati/modificati
- Tempo medio di approvazione

**Vista 4: per incident**
- Refusal automatici
- Tentativi di prompt injection
- Anomalie comportamentali

**Vista 5: GDPR**
- Esercizio diritti pendenti
- Comunicazioni a interessati
- Eventuale data breach

## Filtri e ricerche

Capacità essenziali:
- Ricerca per utente
- Ricerca per data
- Ricerca per testo nelle interazioni
- Ricerca per tipo di azione
- Filtro per esito (successo/refusal/errore)
- Export per audit esterno (CSV, PDF firmato)

## Errori comuni

1. **Logging troppo dettagliato**: dati sensibili nei log che diventano vulnerabilità
2. **Logging insufficiente**: in caso di incident non si ricostruisce nulla
3. **Log non cifrati**: leak diventa data breach
4. **Log accessibili a troppi**: ogni admin che accede è rischio
5. **Conservazione indefinita**: ogni dato vecchio è un rischio in più
6. **Niente review periodica**: log esistono ma non si guardano

## Test di completezza

Periodicamente, simulare scenari per verificare i log:

- "Se oggi ricevessi richiesta GDPR di accesso da [Nome], potrei generare il report dei suoi dati nei log?"
- "Se ricevessi denuncia di un dipendente per discriminazione algoritmica, potrei dimostrare cosa è successo?"
- "Se l'auditor mi chiedesse 'come ha funzionato il sistema il 15 marzo?', potrei mostrarlo?"

Se la risposta è "no" o "ci proviamo", il sistema di logging va potenziato.

## EiC — l'implementazione

Il Cervello Supremo:
- ✅ **Logging automatico** completo di ogni interazione
- ✅ **Storage immutabile** (append-only su Supabase con policy RLS)
- ✅ **Cifratura** at-rest (AES-256) e in-transit (TLS 1.3)
- ✅ **Conservazione differenziata** per tipologia
- ✅ **Backup multi-region** per disaster recovery
- ✅ **Dashboard admin** dedicata per consultazione
- ✅ **Export** per audit esterni
- ✅ **Anonymization** per analytics di prodotto
- ✅ **Cancellazione automatica** dopo retention period

Per l'imprenditore edile cliente, i log sono accessibili dall'admin aziendale. Per esercizio diritti GDPR, supporto EiC è disponibile.

## Riferimenti

- **AI Act art. 12** — Capacità di logging automatico
- **AI Act art. 19** — Conservazione log da provider
- **GDPR art. 5, 30, 32** — Principi, registro trattamenti, sicurezza
- **ISO/IEC 27001** — Sistema gestione sicurezza informazioni
- **NIST SP 800-92** — Guide to Computer Security Log Management
