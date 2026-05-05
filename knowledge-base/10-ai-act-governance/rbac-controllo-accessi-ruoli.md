---
area: 10-ai-act-governance
titolo: RBAC — controllo degli accessi per ruolo
tags: [rbac, ruoli, permessi, autorizzazione, least-privilege]
livello: intermedio
applicabile_a: [architettura-cervello, configurazione-utenti]
kpi_correlati: [violazioni-accesso, principle-least-privilege]
versione: 1.0
aggiornato_il: 2026-05-05
---

# RBAC — chi può chiedere cosa al Cervello

Non tutti gli utenti dentro un'azienda devono poter chiedere ogni cosa al Cervello. Un operaio non chiede informazioni sui margini commessa o sui dati finanziari aziendali. L'amministrativa non vede i dettagli operativi di squadre che non gestisce. Il **Role-Based Access Control (RBAC)** garantisce che ognuno acceda solo a ciò che il suo ruolo prevede.

## Il principio del "least privilege"

Ogni utente riceve **il minimo set di permessi** necessari per svolgere il proprio lavoro. Niente di più.

Vantaggi:
- Riduce rischio di errori (chi non ha accesso, non sbaglia)
- Riduce rischio di abusi interni
- Limita impatto in caso di credenziali compromesse
- Garantisce conformità GDPR (necessità del trattamento)

## I ruoli tipici in un'impresa edile

In un'impresa edile media, lo schema dei ruoli può essere:

**Direzione (CEO/CFO)**:
- Accesso completo a tutti i dati aziendali
- Tutte le funzioni del Cervello
- Visualizzazione e modifica dati strategici

**Direttore Tecnico / Operations Manager**:
- Tutti i dati operativi (cantieri, fornitori, mezzi)
- KPI tecnici e di produzione
- Limitato accesso ai dati finanziari di alto livello (no dettagli bilancio)

**Capocantiere**:
- Dati del/dei cantiere/i assegnato/i
- Operai della propria squadra
- Materiali e fornitori del cantiere
- No dati finanziari aziendali, no altri cantieri

**Responsabile Amministrativo**:
- Anagrafiche, contabilità, fatturazione
- Scadenzari, banca
- Dati finanziari completi
- No dati operativi specifici di cantiere se non rilevanti

**Responsabile Commerciale**:
- Pipeline, lead, clienti, contratti
- KPI commerciali
- Limitato a dati finanziari aziendali (margini di vendita ok, dettagli costi/cassa no)

**Operaio / personale operativo**:
- Solo dati che riguardano direttamente il proprio lavoro
- Timbratura, ore lavorate, busta paga personale
- Documenti di sicurezza, formazione, DPI
- **Nessun accesso** a dati finanziari, contratti, altri operai

**Tecnico esterno (architetto/progettista)** se invitato:
- Accesso solo al cantiere su cui collabora
- Nessun dato finanziario o aziendale generale

## Cosa l'AI deve filtrare

Quando un utente fa una domanda al Cervello, il sistema:

1. **Verifica l'identità** dell'utente (autenticazione)
2. **Carica il ruolo** dell'utente (autorizzazione)
3. **Filtra il contesto** per quel ruolo
4. **Genera la risposta** solo sulla base del contesto autorizzato
5. **Logga l'interazione** con ruolo e dati acceduti

Esempio: un operaio chiede "quanto guadagna l'azienda?". Il Cervello risponde:

> "Mi dispiace, le informazioni finanziarie aziendali non rientrano nelle informazioni che posso condividere con il tuo ruolo. Posso parlartene con il responsabile amministrativo o con la direzione."

Niente "imbarazzo" tecnico, risposta professionale e chiara.

## Tipologie di permessi

Schema tipico di permessi su risorse:

| Ruolo | Cantieri | Finanza | HR | Clienti | Fornitori | Strategia |
|---|---|---|---|---|---|---|
| CEO | RW | RW | RW | RW | RW | RW |
| CFO | R | RW | R | R | R | R |
| Direttore Tecnico | RW | R | R | - | RW | R |
| Capocantiere | RW (solo propri) | - | R (squadra propria) | - | R | - |
| Responsabile Amministrativo | R | RW | RW | RW | RW | - |
| Responsabile Commerciale | R | - | - | RW | - | R |
| Operaio | R (solo proprio) | - | R (solo proprio) | - | - | - |

R = Read, W = Write, RW = Read+Write.

## Permessi su azioni dell'AI

Oltre alla lettura dati, anche le **azioni** dell'AI hanno permessi:

- **Generazione documenti**: chi può chiedere all'AI di generare bozze (contratti, lettere)?
- **Modifiche dati**: chi può chiedere all'AI di modificare anagrafiche o configurazioni?
- **Comunicazioni esterne**: chi può chiedere all'AI di inviare email a clienti/fornitori?
- **Decisioni operative**: chi può chiedere all'AI di prendere decisioni che impattano cantieri?

Solo ruoli specifici possono autorizzare queste azioni. Il Cervello rifiuta richieste fuori autorizzazione.

## Configurazione dei ruoli — best practice

**1. Inventario delle risorse**: cosa esiste nel sistema (cantieri, contratti, fatture, clienti, ecc.)

**2. Mappa dei ruoli**: chi sono le persone in azienda (per ruolo, non per nome)

**3. Matrice permessi**: per ogni ruolo, quali permessi su quali risorse

**4. Validazione con management**: la matrice è approvata da direzione + DPO

**5. Implementazione tecnica**: configurazione nel sistema EiC

**6. Comunicazione agli utenti**: ognuno sa cosa può fare e cosa no

**7. Revisione periodica**: la matrice si aggiorna almeno annualmente, e quando cambiano persone/ruoli

## Casi d'uso e risposte tipiche del Cervello

**Caso 1**: operaio chiede a EiC quanto fattura l'azienda
> "Per le informazioni finanziarie aziendali, ti rimando al responsabile amministrativo o alla direzione."

**Caso 2**: capocantiere chiede dettagli di un altro cantiere
> "Posso aiutarti sui cantieri che hai in carico. Per il cantiere [X] ti consiglio di chiedere al collega [Y] che lo segue."

**Caso 3**: amministrativa chiede di firmare un documento legale
> "Posso preparare la bozza, ma la firma del documento richiede l'autorizzazione della direzione, non del responsabile amministrativo."

**Caso 4**: persona esterna invitata in cantiere chiede dati dell'organizzazione
> "Sono autorizzato a parlare solo del cantiere [Y] dove collabori. Per altre informazioni, rivolgiti al referente aziendale."

## Audit del RBAC

Periodicamente:
- Lista degli utenti attivi e dei loro ruoli
- Verifica che ognuno abbia ancora il ruolo corretto (es. ex dipendenti)
- Lista dei permessi per ruolo (verifica nessun "creep" di permessi)
- Log degli accessi con eventuali anomalie
- Valutazione di permessi non più necessari (riduzione)

Frequenza: almeno semestrale per imprese strutturate.

## Errori comuni

1. **"Admin per tutti"**: per pigrizia, si dà accesso completo a molti utenti. Disastro in caso di compromissione.
2. **"Creep dei permessi"**: nel tempo si aggiungono permessi e mai si tolgono. Risultato: tutti hanno troppi permessi.
3. **Niente revoca al cambio ruolo**: la persona promossa mantiene anche i vecchi permessi. Conflitti di interesse.
4. **Niente revoca alla cessazione**: ex dipendenti che mantengono accesso. Rischio sicurezza.
5. **Ruoli troppo granulari**: 50 ruoli diversi rendono il sistema ingestibile.
6. **Ruoli troppo grossolani**: 3 ruoli per 30 funzioni diverse, frustrazione utenti.

## Eccezioni gestite

A volte serve "alzare il livello" temporaneamente. Esempio: capocantiere che sostituisce un collega in ferie e deve gestire un altro cantiere.

Soluzioni:
- **Delega temporanea**: permessi aggiuntivi con scadenza automatica
- **Approvazione superiore**: alcune azioni richiedono approvazione del manager
- **Just-in-time access**: permessi rilasciati solo quando servono e revocati subito dopo

EiC implementa le tre opzioni a seconda del livello di sensibilità dell'operazione.

## Conformità GDPR

Il principio di RBAC è anche **obbligo GDPR**:
- Art. 5: trattamento dei dati per finalità specifiche e necessarie
- Art. 32: sicurezza del trattamento (minimizzazione accessi)
- Art. 25: privacy by design

Senza RBAC adeguato, l'azienda è esposta a sanzioni Garante Privacy.

## RBAC + AI Act

Il sistema RBAC è la base anche per la conformità AI Act:
- Solo utenti autorizzati possono interagire con sistemi AI ad alto rischio
- Solo ruoli specifici possono modificare configurazioni
- Audit dell'uso dell'AI per ruolo

## Implementazione in EiC

Il Cervello Supremo EiC implementa RBAC nativo:
- Schema ruoli predefinito + personalizzabile per impresa
- Filtri automatici al contesto AI in base a ruolo
- Risposte appropriate quando l'utente chiede fuori scope
- Audit log per ruolo e azione
- Configurazione gestita dall'amministratore aziendale

Per l'imprenditore: configurare bene i ruoli all'avvio è un investimento di 2-4 ore che paga in tranquillità per anni.
