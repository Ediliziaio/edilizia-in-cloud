---
area: 10-ai-act-governance
titolo: Anti-hallucination — l'AI risponde su dati reali
tags: [hallucination, grounding, accuratezza, rag, citazioni]
livello: intermedio
applicabile_a: [architettura-cervello, qualita-risposte]
kpi_correlati: [tasso-hallucination, accuratezza-risposte]
versione: 1.0
aggiornato_il: 2026-05-05
---

# Anti-hallucination — il Cervello deve rispondere su dati reali

I modelli linguistici di intelligenza artificiale (LLM) hanno una caratteristica problematica: possono **inventare** informazioni che sembrano plausibili ma non lo sono. Si chiama "hallucination" (allucinazione). In un sistema come il Cervello Supremo, dove le risposte guidano decisioni di business, l'hallucination è inaccettabile.

Il Cervello deve **rispondere su informazioni reali** e, quando non sa, **dichiararlo apertamente**.

## Cos'è una hallucination

Esempi tipici:
- L'AI cita un articolo di legge che non esiste
- L'AI dà un numero ("il margine medio del settore è 18%") che non è verificato
- L'AI inventa un caso studio o una procedura che sembra reale
- L'AI riporta un dato del Company Brain che in realtà non c'è
- L'AI cita una fonte (es. "secondo l'ANCE") quando non ha controllato

Le allucinazioni sono particolarmente pericolose perché **suonano credibili**. L'utente che si fida può prendere decisioni errate.

## Perché succedono

Gli LLM sono addestrati per generare testo plausibile. Quando non hanno informazioni precise, **completano il pattern** in modo statisticamente verosimile, non necessariamente vero.

Cause:
- Dati di training incompleti o non aggiornati
- Domanda fuori dal dominio di competenza
- Pressione a "dare una risposta" anche quando non si sa
- Confusione tra fatti e congetture

## Le 5 strategie tecniche per mitigare le hallucinations

**1. Grounding nei dati reali (RAG)**
Il Cervello, prima di rispondere, **recupera informazioni dai database aziendali e dal Knowledge Base** rilevante per la domanda. La risposta è basata su quel contesto, non su "memoria interna" del modello.

Esempio: domanda "qual è il fatturato di settembre?". Il Cervello:
1. Recupera dato dal sistema contabile
2. Lo include nel contesto
3. Risponde basato sul dato concreto

Senza RAG, il modello potrebbe inventare un numero.

**2. Citazione delle fonti**
Ogni risposta significativa cita la fonte:
- "Secondo il Knowledge Base [doc X]: ..."
- "Dal tuo Company Brain (cantiere Y, registrato il [data]): ..."
- "Secondo il Decreto Legislativo 81/08, art. 96: ..."

L'utente può verificare. Se la risposta non ha fonti, è meno affidabile.

**3. Confidence scores**
Quando il sistema non è sicuro, lo dice esplicitamente:
- "Non sono sicuro al 100%, verifica con il commercialista"
- "Questa informazione non è nel mio KB aggiornato, potrebbe essere obsoleta"

**4. Refusal quando manca contesto**
Se la domanda richiede dati che non sono nel sistema, il Cervello rifiuta cordialmente:
- "Non ho i dati necessari per rispondere accuratamente. Puoi caricare [X] o consultare [Y]."

Meglio "non lo so" che inventare.

**5. Verifica fattuale per dati critici**
Per numeri specifici (importi, date, dati legali), il sistema controlla incrocio con fonti autoritative:
- Importi → da database
- Date → da calendario sistema
- Riferimenti normativi → da KB normativo aggiornato

Discrepanze → segnalazione all'utente.

## La regola d'oro per il Cervello

Quando il Cervello risponde:

✓ **Se ha il dato**: lo cita con fonte
✓ **Se non ha il dato**: dichiara di non averlo
✓ **Se può fare un'inferenza ragionevole**: la fa esplicitando che è inferenza, non fatto certo
✗ **Mai inventare** dati specifici (numeri, date, articoli di legge, casi studio)
✗ **Mai presentare ipotesi come fatti**

## Esempi di risposte corrette

**Domanda**: "Quanto fatturiamo questo mese?"

**Risposta scorretta** (hallucination):
> "Stai fatturando circa 285.000 € questo mese."

**Risposta corretta** (con grounding):
> "Dal sistema contabile EiC, il fatturato registrato a oggi (15 maggio) è di 187.000 €. Hai 3 SAL ancora da fatturare per un totale stimato di 95.000 €. Proiezione fine mese: ~280-290k €."

---

**Domanda**: "Posso usare il sismabonus per questo intervento?"

**Risposta scorretta** (hallucination):
> "Certo, il sismabonus al 70% è applicabile per qualsiasi miglioramento sismico residenziale."

**Risposta corretta** (con grounding e cautela):
> "Dal KB sul sismabonus (doc `05-fiscale-compliance/sismabonus.md`): l'agevolazione si applica per riduzione di rischio sismico in zone classificate. La percentuale dipende dalla riduzione di classi (1 classe = 70%, 2 classi = 80%, condomini al 75-85%). Per il tuo caso specifico, serve asseverazione di un tecnico abilitato. Verifica vigenza con il commercialista — la materia evolve con le leggi di bilancio."

## Cosa fa il Cervello in casi limite

**Caso 1: domanda su evento futuro**
"Il bonus 50% sarà rinnovato l'anno prossimo?"

Risposta:
> "Non posso prevedere decisioni politiche future. La legge di bilancio è in genere approvata a dicembre dell'anno precedente. Per pianificazioni serie, considera che la legge attuale è valida fino a [data], oltre serve verifica con il commercialista."

**Caso 2: domanda fuori scope**
"Qual è la migliore strategia di investimento immobiliare a Roma?"

Risposta:
> "Sono specializzato sul business edile dal lato impresa, non sull'investimento immobiliare. Per consigli di investimento, è meglio rivolgersi a consulente finanziario e valutatore immobiliare."

**Caso 3: domanda su dati non presenti**
"Quanti dipendenti ha l'impresa Rossi srl?"

Risposta:
> "Non ho informazioni su 'Rossi srl' nel tuo Company Brain. Se è un cliente o fornitore con cui lavorate, posso aiutarti a cercare in anagrafica. Se è un'azienda esterna, prova una visura camerale."

## Il danno di una hallucination

Esempi reali documentati:
- AI che cita giurisprudenza inesistente in atti legali → causa persa, sanzioni
- AI che inventa istruzioni mediche → rischio salute paziente
- AI che genera dati finanziari falsi → decisioni errate, danno economico
- AI che inventa procedure di sicurezza → infortuni potenziali

Un singolo episodio può distruggere la fiducia nell'AI per anni.

## Test e monitoraggio

Per validare l'affidabilità del Cervello:

**1. Test set di domande con risposte note**
Suite di 100-500 domande con risposte verificate. Si verifica che il Cervello dia la risposta corretta.

**2. Red teaming continuo**
Test attivi con domande "trappola" che inducono hallucination. Si misura il tasso di errore.

**3. User feedback loop**
Utenti possono segnalare risposte sbagliate. Sistema impara e migliora.

**4. Audit periodico**
Campione casuale di interazioni rivisto da esperti. Verifica accuratezza.

KPI target:
- Accuratezza fattuale > 95% su domande nel dominio
- Tasso hallucination su numeri critici < 1%
- Tasso refusal corretto su domande fuori scope > 90%

## La cultura "I don't know"

Per costruire un'AI affidabile, è cruciale che il sistema **possa dire "non lo so"** senza essere percepito come "stupido". Anzi: un'AI che dichiara i suoi limiti è più affidabile di una che risponde sempre con sicurezza.

Il system prompt del Cervello (vedi `00-meta/system-prompt-cervello.md`) include istruzioni esplicite:

> "Se non hai le informazioni necessarie per rispondere accuratamente, dichiaralo apertamente. È meglio una risposta breve e onesta di una lunga e inventata."

## Responsabilità legale

Una risposta AI che induce a decisioni errate può generare responsabilità:
- **Provider AI**: se il sistema è stato progettato male o non comunica i suoi limiti
- **Deployer**: se ha usato l'AI fuori dalle istruzioni del provider
- **Utente**: se ha agito su una risposta AI senza verifica per decisioni critiche

L'AI Act (art. 13 e 14) richiede che i sistemi AI siano accurati e che gli utenti sappiano interpretarli. Hallucinations non controllate = potenziale violazione.

## EiC — l'approccio

Il Cervello Supremo EiC adotta:
- **RAG** per grounding su KB universale + Company Brain
- **Citazione fonti** sistematica nelle risposte
- **Refusal** strutturato per domande fuori scope o dati mancanti
- **Verifica numeri** automatica con database
- **User feedback** integrato (pulsante "questa risposta è corretta?")
- **Audit periodico** delle interazioni
- **Disclaimer** automatici su decisioni critiche ("verifica con il professionista")

Una hallucination su decisione critica è classificata come incident grave: investigation, fix, comunicazione utenti.

## Riferimenti tecnici

- **AI Act art. 13** — Trasparenza
- **AI Act art. 15** — Accuratezza, robustezza, cybersecurity
- **GDPR art. 22** — Decisioni automatizzate
- **Letteratura su Retrieval-Augmented Generation (RAG)**
- **Studi su hallucination mitigation in LLM**
