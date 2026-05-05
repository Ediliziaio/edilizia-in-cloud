---
area: 10-ai-act-governance
titolo: Policy aziendale per l'uso dell'AI
tags: [policy, regolamento-interno, governance, ai-acceptable-use]
livello: intermedio
applicabile_a: [tutte-imprese-che-usano-ai, hr, compliance]
kpi_correlati: [adozione-policy, violazioni-rilevate]
versione: 1.0
aggiornato_il: 2026-05-05
---

# Policy aziendale sull'uso dell'AI — il "regolamento interno"

L'introduzione del Cervello Supremo (e di altri sistemi AI) in azienda richiede una **policy formale**: documento scritto che stabilisce regole, ruoli, limiti, procedure. È il "regolamento di sicurezza" applicato al digitale.

Una policy AI ben fatta protegge:
- L'azienda da rischi legali e reputazionali
- I dipendenti da incertezze su cosa possono e non possono fare
- I clienti dai rischi di trattamento improprio dei dati

## Quando la policy è obbligatoria

**Obblighi normativi**:
- AI Act art. 26: obblighi dei deployer di sistemi alto rischio
- GDPR art. 24: misure tecniche e organizzative
- Statuto dei Lavoratori art. 4: monitoraggio dei lavoratori (se rilevante)
- Eventuale accordo con RSA/RSU

**Obblighi pratici**:
- Quando l'AI gestisce dati di dipendenti
- Quando l'AI è usata in funzioni HR
- Quando l'AI comunica con clienti finali
- Quando l'AI ha accesso a dati finanziari
- Quando l'AI interagisce con la PA

In pratica, **se usi seriamente l'AI in azienda, la policy serve**.

## Struttura tipica della policy (10-20 pagine)

**1. Scopo e ambito**
- A chi si applica (tutti i dipendenti? esterni?)
- Quali sistemi AI sono coperti
- Quali finalità d'uso

**2. Definizioni**
- Cosa intendiamo per "AI", "decisione automatizzata", "dato personale", ecc.

**3. Principi guida**
- I 7 principi fondamentali (vedi `_README.md` di area 10)
- Approccio etico
- Conformità AI Act e GDPR

**4. Sistemi AI in uso**
- Inventario dei sistemi (Cervello Supremo, BI, app cantiere AI, ecc.)
- Classificazione di rischio per ogni sistema
- Provider, contratti, responsabili interni

**5. Ruoli e responsabilità**
- Chi può usare quali sistemi
- Approvazioni necessarie
- DPO/responsabile AI compliance
- Procedure di escalation

**6. Acceptable use**
- Cosa è permesso fare con l'AI
- Cosa NON è permesso
- Esempi concreti

**7. Procedure operative**
- Workflow per decisioni HIL
- Procedure di approvazione comunicazioni esterne
- Gestione dati sensibili

**8. Sicurezza**
- Credenziali e password
- Riservatezza dei dati
- Cosa fare in caso di incident

**9. Privacy**
- Trattamento dati personali via AI
- Diritti degli interessati
- Notifica violazioni

**10. Formazione (AI literacy)**
- Obbligo formazione AI Act
- Frequenza, contenuti
- Aggiornamenti

**11. Monitoraggio e audit**
- Cosa viene loggato
- Audit periodici
- Sanzioni per violazioni

**12. Aggiornamenti della policy**
- Frequenza di revisione
- Procedura di modifica
- Comunicazione modifiche

## Esempi concreti di "acceptable use"

### Cosa è permesso

✓ Chiedere al Cervello informazioni operative legate al proprio ruolo
✓ Far preparare bozze di documenti che poi si revisionano
✓ Usare l'AI per analizzare dati per cui si ha accesso
✓ Far suggerire miglioramenti ai processi
✓ Far generare contenuti per comunicazioni interne

### Cosa NON è permesso

✗ Usare credenziali di altri per accedere all'AI
✗ Tentare di bypassare le restrizioni del sistema
✗ Inserire dati personali altrui senza necessità o consenso
✗ Caricare dati riservati su sistemi AI esterni non autorizzati (es. ChatGPT pubblico)
✗ Usare l'AI per scopi personali in modo significativo
✗ Generare contenuti discriminatori, illegali o offensivi
✗ Far prendere decisioni autonome all'AI in casi che richiedono HIL
✗ Inviare comunicazioni esterne non revisionate

## Il problema "shadow AI"

Capita che i dipendenti usino sistemi AI **non autorizzati** dall'azienda (es. ChatGPT pubblico per scrivere email). È "shadow AI" e crea rischi:

- Dati riservati esposti a sistemi esterni
- Dati personali trattati senza base giuridica
- Mancata conformità GDPR/AI Act
- Inconsistenza nei processi aziendali

La policy deve trattare esplicitamente:
- Quali sistemi sono autorizzati
- Cosa fare prima di usare un nuovo strumento AI
- Procedure di approvazione

Vietare totalmente lo shadow AI è poco realistico e controproducente. Meglio:
- Fornire alternative aziendali (Cervello, Microsoft Copilot enterprise, ecc.)
- Educare sui rischi
- Permettere uso "personale" su task non sensibili (es. aiutarsi a scrivere bozza di propria mail privata)

## Comunicazione ai dipendenti

La policy va:

1. **Comunicata** formalmente a tutti
2. **Discussa** in riunioni (non solo "letta e firmata")
3. **Firmata** da ogni dipendente all'assunzione
4. **Aggiornata** annualmente con re-firma
5. **Disponibile** sempre per consultazione

Il dipendente deve capire **non solo cosa fare**, ma **perché**: la sicurezza dei dati e la conformità sono interesse di tutti.

## Sanzioni per violazioni

La policy deve prevedere conseguenze:

- **Violazioni minori**: richiamo verbale, formazione aggiuntiva
- **Violazioni medie**: richiamo scritto
- **Violazioni gravi**: sospensione, eventualmente licenziamento

Esempi:
- Uso shadow AI per dati riservati → richiamo + formazione
- Tentativo deliberato di bypassare RBAC → richiamo scritto
- Esfiltrazione dati via AI per fini personali → licenziamento + denuncia

Le sanzioni vanno applicate seguendo procedura disciplinare ex art. 7 L. 300/1970.

## La policy "vivente"

Una policy che resta nel cassetto è inutile. Per essere efficace:

✓ **Riunioni periodiche** dove si discutono casi concreti
✓ **Newsletter interne** con aggiornamenti
✓ **Champion AI** in ogni team (referente)
✓ **Q&A regolari** dove i dipendenti possono chiedere
✓ **Aggiornamenti basati su esperienze reali**

## Coordinamento con altri documenti

La policy AI si integra con:

- **Manuale aziendale** generale
- **Codice etico**
- **DVR** (sicurezza lavoro, se l'AI ha implicazioni)
- **Policy privacy / informativa GDPR**
- **Modello 231** (se presente)
- **Regolamento interno**

Coerenza è importante: contraddizioni tra documenti = confusione operativa.

## Adozione progressiva

Per imprese che introducono per la prima volta una policy AI:

**Mese 1**: redazione policy con consulente
**Mese 2**: validazione con direzione + DPO + avvocato
**Mese 3**: comunicazione iniziale e formazione
**Mese 4-6**: implementazione e raccolta feedback
**Mese 7-12**: aggiustamenti, prima review

Da quel momento: revisione annuale strutturata.

## Costi

Per impresa edile media:
- Redazione policy con consulente esperto: 3.000-10.000 €
- Formazione iniziale del team: 1.500-5.000 €
- Aggiornamento annuale: 1.000-3.000 €
- Eventuale software di compliance: 50-300 €/mese

Investimento totale primo anno: 5-15k €. Beneficio: protezione legale + chiarezza operativa.

## Errori comuni

1. **Policy copiata da template**: non riflette la realtà aziendale, dipendenti la ignorano
2. **Policy troppo lunga**: 80 pagine che nessuno legge
3. **Policy troppo vaga**: regole generiche che non guidano comportamento
4. **Niente formazione**: i dipendenti firmano senza capire
5. **Niente aggiornamenti**: la policy invecchia mentre l'AI evolve
6. **Niente sanzioni applicate**: le violazioni passano impunite

## Template pratico

Per la policy aziendale sull'uso del Cervello Supremo, struttura semplificata adatta a impresa edile (10-15 pagine):

```
1. Cos'è il Cervello e a cosa serve
2. Chi può usarlo (per ruolo)
3. Cosa puoi chiedergli (per ruolo)
4. Cosa NON puoi chiedergli
5. Cosa devi sempre fare prima di agire (revisione, approvazione)
6. Decisioni che richiedono Human-in-the-Loop
7. Comunicazioni esterne (sempre da revisionare)
8. Dati personali e privacy
9. Cosa fare se qualcosa va storto
10. Aggiornamenti e formazione
11. Sanzioni
12. Contatti utili (DPO, IT, direzione)
```

Linguaggio: **chiaro e concreto**, non burocratico. Esempi reali. FAQ in calce.

## EiC — il supporto

Il team EiC fornisce ai clienti:
- ✅ **Template policy** pre-redatto adattabile
- ✅ **Materiale formativo** per i team
- ✅ **Quick reference** stampabile da appendere in ufficio
- ✅ **Supporto consulenziale** per personalizzazione
- ✅ **Aggiornamenti periodici** in base a evoluzione normativa
- ✅ **Webinar regolari** sui temi di compliance AI

L'imprenditore non parte da zero: c'è una base solida, da personalizzare in base alla propria realtà.

## Riferimenti

- **AI Act 2024/1689 art. 26** — Obblighi dei deployer
- **GDPR art. 24, 32** — Misure tecniche e organizzative
- **Legge 132/2025** — Disciplina italiana AI
- **Statuto dei Lavoratori art. 4** — Controllo lavoratori
- **D.Lgs 231/2001** — Modello organizzativo
- **Linee guida Garante Privacy** su AI in ambito lavorativo
