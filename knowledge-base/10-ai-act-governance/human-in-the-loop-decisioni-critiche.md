---
area: 10-ai-act-governance
titolo: Human-in-the-Loop per decisioni critiche
tags: [hil, supervisione-umana, ai-act-art-14, decisioni-critiche]
livello: intermedio
applicabile_a: [progettazione-workflow-ai, decisioni-aziendali]
kpi_correlati: [decisioni-supervisionate, errori-prevenuti]
versione: 1.0
aggiornato_il: 2026-05-05
---

# Human-in-the-Loop — l'AI non decide mai da sola le cose importanti

L'AI può suggerire, analizzare, redigere, accelerare. Ma per le **decisioni rilevanti**, l'umano deve essere nel loop: validare, approvare, eventualmente correggere prima dell'esecuzione. È principio etico, di buon senso aziendale, e — per molte categorie — **obbligo legale dell'AI Act** (art. 14).

## Quali decisioni richiedono HIL

Per il Cervello Supremo in un'impresa edile, **HIL obbligatorio** per:

**Decisioni HR rilevanti**:
- Assunzione o licenziamento di un dipendente
- Promozioni, demansionamenti
- Decisioni disciplinari
- Valutazioni di performance ufficiali
- Gestione di controversie con i lavoratori

**Decisioni finanziarie sopra soglia**:
- Bonifici sopra una soglia (es. 10.000 €)
- Apertura o chiusura di linee di credito
- Modifica di condizioni contrattuali con banche
- Investimenti significativi

**Decisioni contrattuali**:
- Firma di contratti d'appalto
- Risoluzione di contratti
- Diffide formali a clienti/fornitori
- Avvio di azioni legali

**Decisioni operative ad alto impatto**:
- Sospensione di un cantiere
- Variazioni significative del cronoprogramma
- Riserve formali in cantiere
- Recesso da un sub-contratto

**Decisioni che modificano dati strutturali**:
- Cancellazione di anagrafiche o records
- Modifiche alle configurazioni di sistema
- Modifiche ai ruoli e permessi degli utenti

**Comunicazioni esterne ufficiali**:
- Email/PEC a clienti su questioni delicate
- Risposte a contestazioni
- Comunicazioni alla PA
- Pubblicazioni su social/web aziendali

## Quali decisioni l'AI può prendere autonomamente

L'AI può eseguire autonomamente:

- Risposte a domande informative interne
- Generazione di bozze (revisionate prima dell'invio)
- Calcoli e analisi dei dati
- Suggerimenti operativi (la decisione resta umana)
- Categorizzazione e filtering
- Notifiche e promemoria
- Sintesi di documenti

In sintesi: tutto ciò che è **reversibile, a basso impatto, e non comunica con l'esterno** è ok in autonomia.

## Cosa significa "supervisione umana effettiva"

L'AI Act art. 14 richiede supervisione umana **effettiva**, non formale. Questo significa:

✓ L'umano deve **comprendere** quello che il sistema fa
✓ L'umano deve **avere il tempo** di valutare prima di approvare
✓ L'umano deve **avere autorità** per disapprovare o modificare
✓ L'umano deve **ricevere informazioni sufficienti** per decidere
✓ L'umano deve **poter interrompere** il sistema in qualsiasi momento
✓ L'umano deve **non subire pressioni implicite** ad approvare automaticamente

Esempi di supervisione **non effettiva** (insufficiente):
- "Approva tutto" senza leggere
- Tempo di valutazione di 30 secondi per decisione complessa
- Assenza di alternative chiare
- Pressione per produttività che spinge ad accettare suggerimenti AI

## Schema operativo per HIL

Workflow tipico per una decisione che richiede HIL:

```
1. Utente chiede al Cervello una decisione/azione
2. Cervello analizza la richiesta
3. Cervello identifica che è decisione critica → HIL richiesto
4. Cervello prepara una "proposta motivata":
   - Cosa propone di fare
   - Perché (analisi dei dati)
   - Rischi e alternative
   - Riferimenti alle fonti
5. Proposta presentata all'utente autorizzato (per ruolo)
6. Utente:
   - Approva → azione eseguita
   - Modifica → azione eseguita con modifiche
   - Rifiuta → azione non eseguita, eventualmente nota
   - Chiede chiarimenti → loop di approfondimento
7. Log completo dell'interazione
```

## Esempi pratici

**Esempio 1**: Cervello suggerisce di sospendere un cantiere per mancato pagamento

```
Cervello: "Ho rilevato che il cliente [X] non ha pagato il SAL #4 da 45 giorni
(scaduto 15/03/2026, importo 95.000 €). 
La policy aziendale prevede sospensione lavori dopo 30 giorni di ritardo.
PROPOSTA:
- Inviare diffida formale ad adempiere ex art. 1454 c.c. (15 giorni)
- Preparare comunicazione di sospensione lavori se non paga
RISCHI: rottura del rapporto cliente, possibile contestazione del cliente
ALTERNATIVE: 
1) Diffida + apertura negoziazione transattiva
2) Solo solleciti informali per ulteriori 15 giorni
[APPROVA] [MODIFICA] [RIFIUTA] [CHIEDI CHIARIMENTI]"

Utente (ruolo: Direzione): seleziona azione
```

**Esempio 2**: Cervello suggerisce un licenziamento

```
Cervello NON propone direttamente questa decisione.
Risposta: "Per decisioni di licenziamento, devo coinvolgere la direzione.
Posso però aiutarti a:
- Documentare le contestazioni disciplinari pregresse
- Verificare procedura disciplinare ex art. 7 L. 300/1970
- Preparare una bozza di lettera di contestazione
- Indicarti quando coinvolgere il consulente del lavoro
La decisione resta della direzione, supportata da consulente del lavoro."
```

**Esempio 3**: Cervello suggerisce un bonifico
```
Cervello: "Pagamento al fornitore [Y] di 12.500 € scade tra 3 giorni.
PROPOSTA: bonifico oggi
- Cassa attuale: 87.000 €
- Cassa post-bonifico: 74.500 €
- Cassa minima soglia: 60.000 €
- Margine: ok
[APPROVA E PROGRAMMA] [MODIFICA IMPORTO/DATA] [RIFIUTA] [CHIEDI INFO]"

Utente (ruolo: Resp. Amministrativo): approva
Sistema: programma bonifico ma NON lo esegue automaticamente
- Soglie pagamenti automatici e non sono configurate
- Bonifici sopra soglia X richiedono firma in banca dell'utente
```

## Approvazioni multiple per decisioni grandi

Per decisioni di entità rilevante, il sistema può richiedere **approvazione multipla**:

- Un'approvazione: per decisioni standard
- Doppia approvazione: per decisioni sopra soglia (es. > 50k €)
- Tripla approvazione: per decisioni straordinarie (es. > 200k €)

Schema da configurare in fase di setup. Il Cervello applica le regole automaticamente.

## "Override" di emergenza

In casi di emergenza (es. stop immediato di un cantiere per pericolo, intervento urgente per infortunio), HIL può essere **accelerato** ma non saltato:
- Notifica push al manager
- Tempo di risposta richiesto: 5-15 minuti
- Se non risponde: escalation al responsabile superiore
- Se nessuno risponde: applicazione del protocollo di sicurezza predefinito

Mai "AI decide da sola" in autonomia per evitare ritardi. La supervisione si accelera, non si elimina.

## Audit del HIL

Periodicamente:
- Quante decisioni hanno avuto HIL?
- Quante sono state approvate vs modificate vs rifiutate?
- Tempo medio di approvazione?
- Casi di approvazione "automatica" senza vera valutazione?

Se il tasso di approvazione è > 95% e il tempo medio < 30 secondi, c'è il rischio di "automation bias": gli utenti approvano per inerzia. Da intervenire con formazione e processi di rallentamento.

## Bias dell'automazione

L'**automation bias** è la tendenza umana a fidarsi eccessivamente del sistema automatico, anche quando sbaglia. È un rischio reale.

Mitigazione:
- Formare gli utenti a essere critici delle proposte AI
- Mostrare sempre alternative e rischi
- Non incentivare velocità di approvazione
- Evidenziare i casi in cui il sistema è incerto
- Audit dei casi di "approvazione veloce sospetta"

## Conseguenze per l'AI Act

L'AI Act art. 14 è esplicito: i sistemi AI ad alto rischio devono essere progettati per consentire supervisione umana effettiva. Sistemi che bypassano l'umano in modo strutturale sono **non conformi** e sanzionabili.

Anche per sistemi a rischio limitato, HIL su decisioni rilevanti è best practice fortemente raccomandata.

## EiC — l'implementazione

Il Cervello Supremo EiC ha HIL nativo:
- Mappa decisionale con classificazione critica/non critica
- Richieste di approvazione automatiche per decisioni critiche
- UI dedicata per review e approvazione
- Soglie configurabili per impresa
- Audit log completo
- Notifiche multiple (email, push, SMS) per decisioni urgenti
- Dashboard di pending approvals per ogni manager

Il Cervello non "decide" mai per l'azienda — assiste, propone, esegue solo dopo approvazione corretta.

## Riferimenti

- **AI Act art. 14** — Supervisione umana
- **AI Act art. 26** — Obblighi dei deployer di sistemi alto rischio
- **GDPR art. 22** — Decisioni unicamente automatizzate
- **Letteratura su automation bias e human-AI teaming**
