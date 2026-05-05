---
area: 10-ai-act-governance
titolo: AI Act — quadro normativo UE e italiano
tags: [ai-act, regolamento-ue-2024-1689, legge-132-2025, compliance]
livello: base
applicabile_a: [tutte-imprese-che-usano-ai, fornitori-ai, dpo]
kpi_correlati: [conformita-ai-act, scadenze-rispettate]
versione: 1.0
aggiornato_il: 2026-05-05
---

# AI Act — il quadro normativo europeo e italiano

L'**AI Act** (Regolamento UE 2024/1689) è la prima legge organica al mondo sull'intelligenza artificiale. Entrato in vigore il 1° agosto 2024, si applica direttamente in tutti i 27 Stati UE senza necessità di recepimento. Definisce regole per chi sviluppa, fornisce o usa sistemi di AI nel territorio europeo.

In Italia, la **Legge 132/2025** (in vigore dal 10 ottobre 2025) integra il regolamento europeo designando le autorità di vigilanza nazionali e introducendo sanzioni penali per usi fraudolenti dell'AI.

## Cosa stabilisce l'AI Act

Quattro pilastri principali:

1. **Classificazione dei sistemi AI per livello di rischio** (vedi `classificazione-rischio-sistemi-ai.md`)
2. **Pratiche vietate** assolutamente (manipolazione cognitiva, social scoring di massa, identificazione biometrica indiscriminata, ecc.)
3. **Obblighi proporzionali al rischio** per fornitori e utilizzatori
4. **Governance e supervisione** con autorità nazionali e europee

## Calendario di applicazione

| Data | Cosa entra in vigore |
|---|---|
| 1 agosto 2024 | Entrata in vigore del regolamento |
| 2 febbraio 2025 | Pratiche vietate + obbligo di AI literacy |
| 2 agosto 2025 | Regole sui modelli di AI di uso generale (GPAI) e governance |
| 2 agosto 2026 | Obblighi sui sistemi ad alto rischio (Allegato III) + sanzioni |
| 2 agosto 2027 | Obblighi sui sistemi ad alto rischio integrati in prodotti regolati |

Nel 2026 scattano le **sanzioni economiche** per la non conformità ai sistemi ad alto rischio. Le imprese che usano AI in funzioni critiche (HR, gestione lavoratori, decisioni creditizie, ecc.) devono essere conformi.

## Chi è chi nell'ecosistema

L'AI Act distingue ruoli con responsabilità diverse:

- **Provider** (fornitore): chi sviluppa o immette in commercio il sistema AI. Esempio: chi crea il Cervello Supremo.
- **Deployer** (utilizzatore professionale): chi usa il sistema AI nell'attività economica. Esempio: l'impresa edile che adotta EiC con il Cervello AI integrato.
- **Importatore / distributore**: chi distribuisce sistemi AI sviluppati da terzi UE/extra-UE.
- **Soggetto interessato**: la persona fisica i cui dati sono trattati dal sistema AI.

L'imprenditore edile che adotta il Cervello Supremo è prevalentemente un **deployer**: ha obblighi più leggeri del provider, ma non zero.

## Le pratiche vietate (rischio inaccettabile)

Sono operative dal 2 febbraio 2025. Sintesi:

- AI che manipola in modo subliminale o sfrutta vulnerabilità (età, disabilità) per causare danno
- Social scoring generalizzato da parte di autorità pubbliche
- Identificazione biometrica in tempo reale in spazi pubblici (con eccezioni di sicurezza)
- Categorizzazione biometrica per dedurre opinioni politiche, religione, orientamento sessuale
- Polizia predittiva basata solo su profilazione
- Riconoscimento delle emozioni in luoghi di lavoro e istituti scolastici (con eccezioni mediche/sicurezza)
- Scraping non mirato di immagini facciali per costruire database

Per un'impresa edile, queste pratiche sono **fuori scope**: non si fanno e basta.

## Sistemi ad alto rischio (Allegato III)

Per le imprese edili, due aree dell'Allegato III possono essere rilevanti:

**Lavoro e gestione del personale (HR)**:
- AI per selezione e reclutamento
- AI per assegnazione di compiti e valutazione delle performance
- AI per decisioni di assunzione, promozione, licenziamento

Se il Cervello Supremo viene usato per **decidere assunzioni o licenziamenti** in autonomia, ricade nei sistemi ad alto rischio.

**Accesso a servizi essenziali e benefici**:
- AI per valutazione del merito creditizio (rare in edilizia, ma rilevanti se si fanno valutazioni interne fornitori)

In edilizia ordinaria, l'uso del Cervello come "assistente consultivo" (suggerisce, non decide) tipicamente non lo classifica come alto rischio.

## Obblighi per i deployer di sistemi ad alto rischio

Se l'uso del Cervello rientra nell'alto rischio, l'impresa edile (deployer) deve:

- Usare il sistema secondo le istruzioni del provider
- Garantire **supervisione umana** effettiva (non solo formale)
- Monitorare il funzionamento e segnalare anomalie
- Conservare i **log** generati dal sistema (se la supervisione è in capo all'azienda)
- Effettuare **valutazione di impatto sui diritti fondamentali** (FRIA) se richiesto
- Informare i lavoratori dell'uso di AI che li riguarda
- Cooperare con le autorità di vigilanza in caso di richieste

## Obblighi di trasparenza (rischio limitato)

Per molti usi del Cervello in edilizia, gli obblighi sono di **rischio limitato**:

- Comunicare all'utente che sta interagendo con un'AI (chatbot)
- Etichettare contenuti generati artificialmente (deepfake)
- Garantire che le decisioni assunte dall'AI possano essere comprese e motivate

## Sistema sanzionatorio

Sanzioni differenziate per tipologia di violazione:

| Violazione | Sanzione massima |
|---|---|
| Pratiche vietate | Fino a € 35M o 7% del fatturato mondiale annuo (il maggiore) |
| Non conformità sistemi alto rischio | Fino a € 15M o 3% del fatturato (il maggiore) |
| Informazioni scorrette ad autorità | Fino a € 7,5M o 1% del fatturato (il maggiore) |

**Per PMI e startup**: si applica la **sanzione minore** tra l'importo assoluto e la percentuale, secondo il principio di proporzionalità.

## Le autorità in Italia (Legge 132/2025)

- **ACN (Agenzia per la Cybersicurezza Nazionale)**: autorità di vigilanza per i sistemi AI critici
- **AgID (Agenzia per l'Italia Digitale)**: gestione delle notifiche e organismi notificati
- **Garante Privacy**: per profili di protezione dati personali
- **Banca d'Italia, IVASS, CONSOB**: per AI in ambiti finanziari, assicurativi, mercati
- **Magistratura ordinaria**: per i nuovi reati di uso fraudolento

## La logica "by design"

Il regolamento spinge a integrare conformità sin dalla progettazione del sistema:

- **Privacy by design** (eredità GDPR): minimizzazione dati, scopi limitati, conservazione limitata
- **AI ethics by design**: valutazione bias, fairness, non discriminazione
- **Human oversight by design**: sistemi progettati per consentire intervento umano efficace
- **Security by design**: cybersecurity integrata sin dall'architettura

Per il Cervello Supremo questi principi sono già parte dell'architettura (vedi i documenti specifici di quest'area).

## Cosa fare in pratica — checklist per impresa edile

✓ Inventariare i sistemi AI usati in azienda (Cervello, BI, app cantiere con AI, ecc.)
✓ Verificare per ognuno la classificazione di rischio
✓ Per i sistemi ad alto rischio (se presenti): adempiere agli obblighi specifici
✓ Comunicare ai lavoratori l'uso di AI
✓ Formare il team (AI literacy obbligatorio dal 2025)
✓ Predisporre policy aziendale (vedi `policy-aziendale-uso-ai.md`)
✓ Verificare contratti con fornitori AI (responsabilità, audit, diritti)
✓ Preparare documentazione per eventuali controlli

## Quando coinvolgere il professionista

- **DPO (Data Protection Officer)** o consulente privacy per intersezione GDPR-AI Act
- **Avvocato specializzato** in regolamentazione tecnologica per sistemi alto rischio
- **Cybersecurity advisor** per misure tecniche
- **Provider AI affidabile** (come EiC) che già strutturi il sistema in conformità

## Riferimenti normativi

- **Regolamento UE 2024/1689** — testo ufficiale su EUR-Lex
- **Legge 132/2025** — recepimento italiano
- **Linee guida Commissione UE** — pubblicate progressivamente
- **Accordi stato-regioni** in fase di adozione su specifici aspetti

Sources:
- [Regolamento (UE) 2024/1689 - EUR-Lex](https://eur-lex.europa.eu/eli/reg/2024/1689/oj?locale=it)
- [AI Act 2026 PMI - AscenSys](https://www.ascensys.it/blog/ai-act-pmi-agosto-2026)
- [AI Act FAQ per PMI - Kinetikon](https://www.kinetikon.com/ai-act-faq-pmi-startup/)
- [Commission AI Act overview](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
