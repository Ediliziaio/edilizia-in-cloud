---
area: 10-ai-act-governance
titolo: GDPR e privacy nell'uso dell'AI
tags: [gdpr, privacy, dpo, dpia, dati-personali]
livello: avanzato
applicabile_a: [imprese-che-usano-ai, dpo, compliance]
kpi_correlati: [dpia-effettuate, segnalazioni-violazioni]
versione: 1.0
aggiornato_il: 2026-05-05
---

# GDPR e AI Act — l'intersezione

Il GDPR (Regolamento UE 679/2016) regola il trattamento dei dati personali. L'AI Act regola i sistemi di intelligenza artificiale. Quando un sistema AI tratta dati personali (quasi sempre), si applicano **entrambi** i regolamenti.

Il Cervello Supremo, che processa dati di lavoratori, clienti, fornitori, è soggetto pienamente al GDPR. Ogni scelta architetturale e operativa deve essere conforme.

## I 6 principi GDPR applicati all'AI

**1. Liceità, correttezza e trasparenza**
- Base giuridica chiara per ogni trattamento (consenso, contratto, obbligo di legge, interesse legittimo)
- Informativa privacy chiara per chi interagisce con il sistema AI
- Trasparenza sui dati raccolti e usati

**2. Limitazione delle finalità**
- I dati raccolti per scopo X non si usano per scopo Y senza nuova base giuridica
- Esempio: dati di un dipendente raccolti per gestione paghe non si usano per profilazione marketing

**3. Minimizzazione**
- Solo dati strettamente necessari per la finalità
- Il Cervello accede solo ai dati che servono per rispondere, non "tutti i dati per ogni evenienza"

**4. Esattezza**
- Dati aggiornati e corretti
- Procedure per rettifica
- Vedi anche `anti-hallucination-grounding.md`

**5. Limitazione della conservazione**
- Dati conservati solo per il tempo necessario
- Cancellazione automatica al termine
- Conservazione differenziata per tipo (es. fatture 10 anni, log AI 12-24 mesi)

**6. Integrità e riservatezza**
- Misure di sicurezza adeguate (cifratura, accessi, backup)
- Vedi anche `multi-tenancy-isolamento-dati.md`

## DPIA — Data Protection Impact Assessment

Per trattamenti che rappresentano "rischio elevato" per i diritti delle persone (e l'uso di AI spesso ricade qui), serve una **DPIA**: valutazione formale dell'impatto sulla privacy.

Quando è obbligatoria:
- Profilazione automatizzata che produce decisioni
- Monitoraggio sistematico di persone
- Trattamento massivo di dati di categorie speciali (salute, biometrici, ecc.)
- Uso di nuove tecnologie con rischi non ancora valutati

Per l'introduzione del Cervello Supremo in azienda, **DPIA raccomandata**.

Contenuto DPIA:
- Descrizione del trattamento
- Necessità e proporzionalità
- Rischi per i diritti
- Misure di mitigazione
- Consultazione DPO

Costo: 3.000-15.000 € se gestita da consulente esterno. Riusabile per anni con aggiornamenti.

## Le basi giuridiche per l'AI nel contesto edile

**Per dati dei dipendenti**:
- Esecuzione contratto di lavoro
- Obblighi legali (paghe, contributi, sicurezza)
- Interesse legittimo (organizzazione del lavoro, sicurezza)
- Consenso esplicito (per usi che vanno oltre)

**Per dati dei clienti**:
- Esecuzione contratto
- Adempimenti legali (fatturazione)
- Interesse legittimo (gestione del rapporto)
- Consenso (per marketing)

**Per dati dei fornitori**:
- Esecuzione contratto
- Adempimenti legali

**Attenzione**: l'uso di dati per **addestrare modelli AI** richiede in genere base giuridica specifica e/o consenso. Il Cervello non addestra modelli sui dati specifici di un'azienda — il modello è generico, i dati specifici alimentano solo il **contesto** di ogni risposta.

## I diritti dell'interessato applicati all'AI

Le persone fisiche (clienti, dipendenti, fornitori) hanno diritti sui propri dati:

**Accesso (art. 15)**: sapere quali loro dati sono trattati
Il Cervello deve poter generare un report dei dati che riguardano una persona specifica.

**Rettifica (art. 16)**: correggere dati inesatti
Procedura formale per correzione, log della modifica.

**Cancellazione / oblio (art. 17)**: chiedere eliminazione
Procedura formale, gestita da DPO, eseguita manualmente da admin (vedi `azioni-irreversibili-bloccate.md`).

**Limitazione (art. 18)**: bloccare il trattamento
Possibilità di "congelare" i dati senza eliminarli.

**Portabilità (art. 20)**: ricevere i dati in formato strutturato
Export JSON/CSV/XML.

**Opposizione (art. 21)**: opporsi al trattamento
Cessazione, salvo motivi imperativi.

**No decisione unicamente automatizzata (art. 22)**: chiedere intervento umano
Vedi `human-in-the-loop-decisioni-critiche.md`.

## Il DPO (Data Protection Officer)

Quando obbligatorio:
- Soggetti pubblici
- Soggetti che trattano dati su larga scala in modo sistematico
- Soggetti che trattano dati di categorie speciali su larga scala

Per impresa edile media, il DPO non è sempre obbligatorio, ma **raccomandato** quando si introduce un sistema AI come il Cervello.

Funzioni:
- Sorvegliare la conformità GDPR
- Fornire consulenza
- Cooperare con il Garante
- Punto di contatto per gli interessati

Costo DPO esterno: 200-1.500 €/mese a seconda della complessità.

## Trasferimenti internazionali di dati

Se il Cervello (o componenti) usa server extra-UE (es. modelli AI ospitati negli USA), si applicano regole sul trasferimento internazionale:

- **Adeguatezza**: Paesi UE + Paesi con decisione di adeguatezza (es. UK, Giappone, Canada commercial)
- **Clausole Contrattuali Standard (SCC)**: per trasferimenti in altri Paesi
- **DPF (Data Privacy Framework)**: per USA con aziende certificate

Verificare per ogni componente AI dove vivono i dati. Preferire Paesi UE quando possibile.

## Notifica violazioni

In caso di "data breach" (violazione dei dati personali):

- **Entro 72 ore**: notifica al Garante Privacy
- **Senza ritardo**: notifica agli interessati se rischio elevato per i loro diritti
- Documentazione interna della violazione

Esempi che richiedono notifica:
- Dati esposti per bug di sistema
- Account compromessi con accesso a dati personali
- Errore umano che espone dati a terzi non autorizzati
- Cyber attack riuscito

## Il consenso "informato" per l'AI

Quando l'AI è introdotta in azienda, è importante:

✓ Comunicare ai dipendenti che cosa fa e cosa non fa
✓ Spiegare quali dati personali tratta
✓ Spiegare i diritti che hanno
✓ Eventuale accordo con RSA/RSU sindacali (se monitoraggio)
✓ Aggiornamento informativa privacy

Non basta "abbiamo informato" generico. Serve documentazione del processo informativo.

## I rischi specifici dell'AI per la privacy

**1. Re-identificazione**: dati anonimizzati che, combinati, permettono di identificare persone.

**2. Inferenza**: l'AI deduce informazioni sensibili da dati apparentemente innocui (es. dedurre stato di salute da pattern di assenze).

**3. Discriminazione algoritmica**: bias nei dati di training portano a trattamenti discriminatori.

**4. Perdita di controllo**: dati che vanno in modelli AI possono essere difficili da "recuperare".

**5. Trasparenza limitata**: l'utente non sempre capisce cosa l'AI sa di lui.

Mitigazioni:
- DPIA approfondita
- Audit periodico
- Controllo bias
- Limitazione dei dati al minimo
- Procedure per esercizio diritti

## Sanzioni GDPR

GDPR prevede sanzioni a due livelli:
- Fino a € 10M o 2% del fatturato (violazioni minori)
- Fino a € 20M o 4% del fatturato (violazioni gravi)

In Italia, il Garante Privacy applica sanzioni significative anche a PMI (50k-500k € sono comuni).

## EiC — l'approccio

Il Cervello Supremo è progettato in conformità GDPR by design:

- ✅ **Multi-tenancy con isolamento** (vedi `multi-tenancy-isolamento-dati.md`)
- ✅ **RBAC granulare** (vedi `rbac-controllo-accessi-ruoli.md`)
- ✅ **No training su dati clienti** (i dati alimentano contesto, non modello)
- ✅ **Server in EU** (Supabase EU region)
- ✅ **Cifratura** at-rest e in-transit
- ✅ **Audit log immutabile** (vedi `audit-trail-logging-ai.md`)
- ✅ **Procedura per esercizio diritti** integrata
- ✅ **DPIA template** disponibile per i clienti
- ✅ **DPO supportato** con report e dashboard

L'impresa edile che adotta EiC eredita gran parte della conformità privacy. Resta da:
- Aggiornare informativa privacy aziendale
- Comunicare ai dipendenti l'uso dell'AI
- Designare un DPO se necessario
- Effettuare DPIA specifica
- Configurare ruoli e accessi

## Documentazione minima

Imprese che usano il Cervello dovrebbero avere:

1. **Registro dei trattamenti** aggiornato (GDPR art. 30)
2. **Informativa privacy** che menziona l'AI
3. **Comunicazione ai dipendenti** sull'uso AI
4. **DPIA** per il sistema Cervello
5. **Accordo con DPO** se nominato
6. **Procedura per esercizio diritti**
7. **Procedura di gestione data breach**
8. **Contratto di trattamento** con EiC come responsabile (art. 28)

## Riferimenti

- **GDPR — Regolamento UE 679/2016**
- **D.Lgs 196/2003** (Codice Privacy Italia)
- **Linee guida EDPB su AI e protezione dati**
- **Provvedimenti Garante Privacy** sui sistemi AI
- **AI Act art. 26** — Obblighi dei deployer
