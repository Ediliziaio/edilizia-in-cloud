---
area: 10-ai-act-governance
titolo: Responsabilità legale dell'AI — chi paga se sbaglia
tags: [responsabilita, civile, penale, contrattuale, ai-liability]
livello: avanzato
applicabile_a: [direzione-aziendale, dpo, legali]
kpi_correlati: [contestazioni-ai, polizze-coverage]
versione: 1.0
aggiornato_il: 2026-05-05
---

# Responsabilità legale — chi paga se l'AI sbaglia

Quando il Cervello commette un errore — risponde sbagliato, suggerisce decisione errata, espone dati — chi è responsabile? La risposta è multifattoriale e dipende dalle circostanze. Conoscerla è cruciale per chi sviluppa, fornisce e usa AI.

## Le tre categorie di responsabilità

**1. Civile**
Risarcimento del danno causato. Compensa la vittima.

**2. Penale**
Sanzione per atto illecito intenzionale o gravemente colposo. Punisce il responsabile.

**3. Contrattuale / amministrativa**
Conseguenze previste da contratto o regolamenti settoriali.

## Gli attori della filiera AI

**Provider** (sviluppatore del sistema): chi crea il Cervello.
**Deployer** (utilizzatore professionale): l'impresa edile che adotta il sistema.
**Utente finale**: il dipendente o cliente che interagisce.
**Soggetto interessato**: la persona i cui dati sono trattati.

Ognuno ha responsabilità proprie e potenziali esposizioni a rischio.

## Responsabilità civile — i 4 scenari

**Scenario A: errore del sistema AI causa danno economico**

Esempio: il Cervello dà informazione fiscale sbagliata, il cliente la usa, l'AdE contesta.

Responsabilità:
- **Provider**: se il sistema è progettato male o non comunica i suoi limiti → responsabilità da prodotto difettoso (D.Lgs 224/1988 e nuova direttiva UE)
- **Deployer**: se ha usato il sistema fuori dalle istruzioni o senza supervisione adeguata
- **Utente professionale**: se ha agito sulla risposta AI per decisioni critiche senza verifica

**Scenario B: AI prende decisione autonoma errata**

Esempio: Cervello modifica configurazione e blocca il cantiere.

Responsabilità:
- Configurazione del Cervello che permette decisioni autonome → deployer (per setup) + provider (per design)
- HIL non rispettato → deployer

**Scenario C: data breach causato da AI**

Esempio: AI esfiltra dati di un cliente per prompt injection riuscita.

Responsabilità:
- Provider per vulnerabilità del sistema
- Deployer per setup di sicurezza inadeguato

**Scenario D: AI discrimina (es. in selezione personale)**

Esempio: AI scarta sistematicamente CV con certi profili.

Responsabilità:
- Provider per bias nei dati di training
- Deployer per uso senza verifica di bias

## Il quadro normativo italiano ed europeo

**Direttiva UE Product Liability** (in fase di revisione 2024):
- Estende responsabilità da prodotto difettoso ai sistemi AI
- Prova facilitata per il danneggiato
- Provider deve dimostrare che il prodotto era conforme allo "stato dell'arte" al momento

**Direttiva UE AI Liability** (proposta):
- Specifica responsabilità per danni causati da AI
- Inversione dell'onere probatorio in alcuni casi

**Codice Civile italiano**:
- Art. 1218: responsabilità per inadempimento contrattuale
- Art. 2043: fatto illecito
- Art. 2049: responsabilità del committente
- Art. 2050: attività pericolose
- Art. 2059: danno non patrimoniale

**AI Act**: stabilisce regole di sicurezza e conformità, la cui violazione può fondare responsabilità

## Responsabilità penale

In Italia, alcuni reati possono coinvolgere l'uso di AI:

- **Truffa aggravata** se AI usata per ingannare in modo sistematico
- **Falso** in scritture private/pubbliche se AI genera documenti falsi
- **Trattamento illecito di dati** (art. 167 D.Lgs 196/2003)
- **Diffamazione** se AI genera contenuti diffamatori
- **Reati informatici** se AI è strumento di accesso abusivo

La **Legge 132/2025** ha introdotto nuove fattispecie specifiche per uso fraudolento di sistemi AI.

**Responsabilità del datore di lavoro**: chi adotta AI in azienda risponde di eventuali reati commessi tramite AI sotto il suo controllo, sia direttamente sia per culpa in vigilando.

**Responsabilità ex 231**: imprese organizzate possono rispondere ex D.Lgs 231/2001 per reati commessi nell'interesse o vantaggio dell'ente. Modello 231 deve includere prevenzione di reati AI-correlati.

## Responsabilità contrattuale

L'impresa che usa il Cervello ha contratti con clienti. Errori AI possono violarne le clausole:

- Tempi di consegna mancati a causa di errori AI
- Qualità non conforme a causa di suggerimenti AI sbagliati
- Risposte automatiche al cliente che impegnano l'azienda oltre il dovuto

In genere, l'impresa risponde verso il cliente, e poi può rivalersi sul provider AI in base al contratto.

## Le clausole contrattuali deployer-provider

Quando un'impresa adotta il Cervello (o altro sistema AI), il contratto con il provider dovrebbe includere:

- **Responsabilità per malfunzionamento**: cosa copre il provider
- **Limitazioni di responsabilità**: spesso limitate al canone annuo o multipli
- **SLA**: livelli di servizio garantiti
- **Sicurezza**: certificazioni e impegni
- **Audit rights**: diritto di verifica del cliente
- **Data processing**: ruoli GDPR (controller/processor)
- **Indennizzi**: chi paga in caso di sanzioni di terzi
- **Esclusioni**: cosa il provider NON copre

Un contratto SaaS standard senza queste clausole espone il deployer.

## Polizze assicurative

**Polizza RC professionale** può coprire:
- Errori dell'azienda in attività AI-assistita
- Costi legali in caso di contestazioni
- Risarcimenti dovuti a clienti

**Polizza cyber** copre:
- Incidenti di sicurezza
- Data breach
- Costi di response e recovery

**Polizza AI specifica** (in fase di sviluppo nel mercato):
- Specifica per rischi da AI
- Copertura per allucinazioni, decisioni errate

Costi indicativi per impresa edile media:
- RC professionale: 1.500-5.000 €/anno
- Cyber: 1.000-5.000 €/anno
- AI specifica: emergente, prezzi variabili

## L'umano nel mezzo

Il principio "human in the loop" (vedi `human-in-the-loop-decisioni-critiche.md`) protegge legalmente sia provider sia deployer:

- Decisione presa dall'umano = responsabilità dell'umano
- AI come supporto = AI fornisce input, umano valuta e decide

Senza HIL, le responsabilità si concentrano su provider e deployer in modo difficilmente sostenibile.

## Quando l'imprenditore edile è personalmente responsabile

Casi in cui il titolare può essere personalmente esposto:

- **Reati personali**: truffa, falso, ecc. (no scudo societario)
- **Responsabilità ex 231**: se mancante o inadeguato
- **Garanzie personali fornite** in contratti
- **Lesioni colpose o omicidio colposo** in cantiere se AI ha contribuito
- **Reati da decreto 81/2008** in caso di infortuni

Il velo societario si solleva in casi di mala gestio o reati personali.

## Best practice per limitare l'esposizione

**1. Selezionare provider AI affidabili**
- Documentazione di conformità
- Storia di sicurezza
- Capitale sociale solido
- Reputazione

**2. Setup conforme**
- Configurare HIL per tutte le decisioni critiche
- Definire ruoli e permessi (RBAC)
- Attivare audit logging
- Formare il team

**3. Documentazione**
- Procedure scritte per uso AI
- Tracciamento decisioni
- Log delle interazioni
- DPIA per il sistema

**4. Polizze adeguate**
- RC + cyber + (eventualmente) AI specifica
- Massimali adeguati al fatturato

**5. Aggiornamento continuo**
- AI Act in evoluzione (linee guida, casi giurisprudenziali)
- Adeguamento procedure
- Formazione periodica

## Quando coinvolgere chi

- **DPO**: per profili privacy
- **Avvocato d'impresa**: per contratti con provider
- **Avvocato penalista**: in caso di indagine
- **Consulente compliance AI**: per audit e conformità AI Act
- **Consulente assicurativo**: per polizze adeguate

## Esempio di gestione rischio

Impresa edile da 5M che adotta Cervello Supremo:

**Setup**:
- Contratto con provider che chiarisce responsabilità
- DPIA effettuata
- Modello 231 aggiornato
- RBAC configurato
- HIL su decisioni critiche
- Polizza RC + Cyber attive
- Team formato sull'AI Act

**Operatività**:
- Audit trimestrale
- Aggiornamento policy annuale
- Test di sicurezza periodici
- Confronto con DPO e avvocato

**Costo annuo per gestione rischio AI**: 8-25k € (tutto compreso).

**Beneficio**: protezione da rischi che possono valere centinaia di migliaia di euro.

## EiC — la struttura

Il Cervello Supremo include nativamente:
- ✅ **Contratto SaaS** con clausole AI Act-compliant
- ✅ **Documentazione di conformità** disponibile per il cliente
- ✅ **Sistema HIL** integrato
- ✅ **RBAC e audit log** by design
- ✅ **Supporto compliance** del team EiC
- ✅ **Aggiornamenti regolari** in base a evoluzione normativa

L'imprenditore edile cliente parte da una base di conformità solida e deve solo configurare e operare correttamente.

## Riferimenti

- **AI Act 2024/1689**: regole di sicurezza e conformità
- **Direttiva UE Product Liability** (in revisione)
- **Direttiva UE AI Liability** (proposta)
- **Codice Civile** artt. 1218, 2043, 2049, 2050
- **D.Lgs 231/2001**: responsabilità amministrativa enti
- **GDPR**: profili privacy
- **Legge 132/2025**: nuove fattispecie penali AI
