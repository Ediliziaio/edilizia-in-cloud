# Cervello Supremo — Knowledge Base universale di Edilizia in Cloud

**Versione**: 1.0
**Data rilascio**: 2026-05-04
**Owner**: Florin Andriciuc — Edilizia in Cloud (AEDIX)
**Scopo**: insegnare all'AI di EiC come funziona il business edile e l'imprenditoria, in modo che ogni Company Brain (cervello specifico per azienda cliente) abbia una base di conoscenza universale da cui ragionare.

---

## Architettura concettuale

EiC ha due livelli di intelligenza artificiale:

1. **Cervello Supremo (questo KB)** — la conoscenza universale del settore: normativa, finanza, vendita, fiscale, HR, strategia. Non cambia da un'azienda all'altra. È il "manuale" che l'AI ha letto prima di essere assegnata a un cliente.
2. **Company Brain** — la memoria specifica di una singola azienda cliente: cantieri, fornitori, dipendenti, scadenze, listini, KPI, decisioni passate. Cresce nel tempo con l'uso.

Quando l'utente fa una domanda, l'AI combina i due livelli: parte dal Cervello Supremo per sapere "come funziona il mondo", poi consulta il Company Brain per sapere "come funziona qui". La risposta finale è personalizzata sulla singola azienda ma fondata su principi universali.

---

## Struttura della Knowledge Base

```
knowledge-base/
├── 00-meta/                          # Istruzioni per l'AI
│   ├── system-prompt-cervello.md     # Prompt di sistema base
│   ├── voice-and-tone.md             # Tono di voce di EiC
│   ├── decision-framework.md         # Come scegliere la risposta giusta
│   └── ingestion-guide.md            # Come caricare la KB nel sistema
│
├── 01-normativa-edilizia/            # Diritto e norme tecniche
├── 02-finanza-cashflow/              # Bilancio, liquidità, KPI economici
├── 03-controllo-gestione/            # SAL, commesse, scostamenti
├── 04-vendita-consulenziale/         # Tecniche commerciali B2B edile
├── 05-fiscale-compliance/            # Bonus, IVA, fatturazione SDI
├── 06-hr-edile/                      # CCNL, paghe, sicurezza lavoratori
├── 07-strategia-imprenditoriale/     # Scaling, leadership, organizzazione
│
├── manifest.json                     # Indice macchina-leggibile per RAG
└── README.md                         # Questo file
```

Ogni cartella contiene un `_README.md` che spiega l'area, gli obiettivi formativi, e indicizza i documenti.

Ogni documento ha frontmatter YAML con:
- `area` — l'area tematica
- `tags` — parole chiave per recupero
- `livello` — base / intermedio / avanzato
- `applicabile_a` — fasi di vita dell'impresa edile in cui il documento è pertinente
- `kpi_correlati` — metriche misurabili a cui il contenuto è collegato

---

## Principi editoriali

**Lingua**: italiano professionale, vocabolario del cantiere e dell'amministrazione edile.

**Tono**: imprenditore-a-imprenditore. Diretto, concreto, senza sociologismi. Logica DOLORE → SOLUZIONE → RISULTATO.

**Audience implicita**: titolare di impresa edile italiana da 5 a 100 dipendenti, fatturato 500k-30M, che ha imparato il mestiere in cantiere e sta cercando di trasformare la sua attività in un'azienda strutturata.

**Cosa il KB NON fa**:
- Non sostituisce il commercialista, l'avvocato, il consulente del lavoro o l'ingegnere strutturista. Fornisce contesto e prima diagnosi, ma quando c'è una decisione legale/fiscale specifica indica sempre di verificare con il professionista.
- Non sostituisce la normativa ufficiale. I riferimenti di legge sono indicativi e vanno verificati nella versione vigente.
- Non sostituisce l'esperienza umana. Aiuta a strutturare il pensiero, non a saltare il giudizio dell'imprenditore.

---

## Convenzioni di scrittura

**Numeri e KPI**: sempre con unità di misura esplicita. "DSO di 90 giorni", non "DSO di 90".
**Esempi numerici**: usano valori realistici per impresa edile italiana media. Non importi astratti.
**Formule**: scritte sia in linguaggio naturale che in forma matematica.
**Riferimenti normativi**: nome esteso + decreto/articolo. Es. "D.Lgs 9 aprile 2008 n. 81 art. 96" non "81/08".
**Acronimi**: alla prima occorrenza in ogni documento, scioglierli. Es. "POS (Piano Operativo di Sicurezza)".

---

## Come ampliare il KB

Per aggiungere un documento:

1. Identificare l'area corretta (1-7).
2. Creare il file con nome `kebab-case.md` nella cartella dell'area.
3. Compilare il frontmatter (vedi schema in `00-meta/ingestion-guide.md`).
4. Scrivere seguendo le linee guida di `00-meta/voice-and-tone.md`.
5. Aggiungere la riga corrispondente al `_README.md` dell'area e al `manifest.json` radice.

Per modificare un documento esistente: aggiornare il campo `aggiornato_il` nel frontmatter e lasciare nota in calce con data e cosa è cambiato.

---

## Stato V2.3 (2026-05-05)

- **14 aree** (00-meta + 10 aree tematiche + advisor-strategico + casi-studio + integrazioni-prezziari)
- **164 documenti** totali (4 meta + 156 contenuto + 4 stub strutturali)
- **~147.000 parole** totali (~1.4 MB)
- **~895 parole/doc** in media (range 500-3.000 parole)
- **6 docs aggiunti in V2.3** da approfondimenti su contabilità, controllo direzionale, negoziazione, self-leadership, processi decisionali, supply chain
- Sistema di tagging coerente per recupero RAG
- Frontmatter YAML standardizzato
- `manifest.json` con indice macchina-leggibile pronto per ingestion
- Pronto per ingestion in vector DB (pgvector / Supabase)

## Composizione per area

| Area | Docs | Focus |
|---|---|---|
| 00-meta | 4 | System prompt, voice, decision framework, ingestion guide |
| 01-normativa-edilizia | 15 | D.Lgs 81/08, NTC 2018, CCNL, prezziari, contratti |
| 02-finanza-cashflow | 15 | Bilancio, DSO/DPO, KPI, fido, factoring, capitale circolante |
| 03-controllo-gestione | 15 | SAL, computi, scostamenti, budget, riserve, varianti |
| 04-vendita-consulenziale | 15 | SPIN, BANT, sopralluogo, preventivo, closing, CRM |
| 05-fiscale-compliance | 15 | Reverse charge, bonus fiscali, fatturazione SDI, TD17-19 |
| 06-hr-edile | 15 | Livelli CCNL, busta paga, formazione, infortuni, leadership |
| 07-strategia-imprenditoriale | 15 | Scaling, delega, M&A, successione, crisi, internazionalizzazione |
| 08-marketing-edile | 15 | Strategia, brand, sito, SEO, ads, social, lead, eventi, ROI |
| 09-tecnologie-digitalizzazione | 15 | EiC come ERP di riferimento, app cantiere, BIM, AI, IoT, BI |
| 10-ai-act-governance | 15 | AI Act EU + Legge 132/25 IT, multi-tenancy, RBAC, HIL, anti-hallucination, GDPR-AI, audit, prompt injection, responsabilità, policy, AI literacy |
| **11-advisor-strategico** | **2 (stub V0.1)** | **🆕 Vision advisor proattivo, 5 livelli di advisory, framework architetturale, template playbook tattici. Popolamento V3.x+** |
| casi-studio | 1+ | Template + casi reali da Company Brain (popolamento V2.x+) |
| integrazioni-prezziari | 1+ | Specifica tecnica integrazione programmatica prezziari |

Roadmap V2 (post rilascio):
- Espansione casi studio e protocolli operativi
- Integrazione con dataset reale Company Brain pilota
- Aggiunta area 08 — Marketing edile e generazione lead
- Aggiunta area 09 — Tecnologie e digitalizzazione cantiere
