---
area: 10-ai-act-governance
tipo: indice-area
versione: 1.0
aggiornato_il: 2026-05-05
---

# Area 10 — AI Act, Governance e Sicurezza dell'AI

## Cosa copre

Questa è l'area trasversale più importante per chi sviluppa, fornisce o usa sistemi di intelligenza artificiale come il Cervello Supremo di EiC. Tratta le **regole, i limiti, i controlli e le responsabilità** che governano l'AI in azienda.

Non è un'area "tecnica opzionale": è il quadro **obbligatorio** dentro cui ogni funzionalità AI deve essere progettata. Il Regolamento UE 2024/1689 (AI Act) è già in vigore e gli obblighi sui sistemi ad alto rischio diventano applicabili dal 2 agosto 2026. La Legge italiana 132/2025 (in vigore dal 10 ottobre 2025) integra il regolamento europeo a livello nazionale.

## Perché è critico per il Cervello Supremo

Il Cervello Supremo:
- Processa dati di **molte aziende clienti** (multi-tenancy)
- Risponde a domande con **conseguenze operative** (decisioni di cantiere, fiscali, finanziarie)
- Comunica eventualmente con **clienti finali** delle imprese
- Ha potenziale accesso a **azioni che modificano dati** (database, fatture, scadenze)

Senza una governance solida, l'AI si trasforma da asset a passività: un singolo errore può cancellare dati di clienti, esporre informazioni riservate, generare risposte inventate ("hallucinations") che portano a decisioni sbagliate.

## I 7 principi non negoziabili dell'AI in EiC

1. **Isolamento dei dati**: i dati di un'azienda non escono mai da quell'azienda
2. **Controllo accessi per ruolo**: ognuno vede e chiede solo ciò che il suo ruolo prevede
3. **Niente invenzioni**: l'AI risponde su dati reali, dichiara apertamente quando non sa
4. **Niente azioni distruttive autonome**: nessuna eliminazione di database, fatture, dati senza conferma umana
5. **Human-in-the-loop su decisioni critiche**: scelte rilevanti richiedono validazione umana
6. **Trasparenza**: l'utente sa di parlare con un'AI, capisce perché ha risposto così
7. **Tracciabilità totale**: ogni azione AI è loggata e auditabile

## Indice documenti

1. `ai-act-quadro-normativo.md` — Regolamento UE 2024/1689 e Legge IT 132/2025
2. `classificazione-rischio-sistemi-ai.md` — I 4 livelli di rischio dell'AI Act
3. `multi-tenancy-isolamento-dati.md` — Separazione dei dati per azienda
4. `rbac-controllo-accessi-ruoli.md` — Chi può chiedere cosa al Cervello
5. `anti-hallucination-grounding.md` — L'AI risponde su fatti reali, non inventa
6. `human-in-the-loop-decisioni-critiche.md` — HIL per decisioni rilevanti
7. `azioni-irreversibili-bloccate.md` — Niente eliminazioni o modifiche distruttive
8. `trasparenza-explainability.md` — L'utente sa che è AI, capisce le risposte
9. `gdpr-privacy-ai.md` — GDPR + AI Act, intersezione e best practice
10. `audit-trail-logging-ai.md` — Log delle azioni dell'AI per audit
11. `prompt-injection-security.md` — Protezione contro attacchi al sistema AI
12. `comunicazioni-esterne-regole.md` — Regole per messaggi a clienti finali
13. `responsabilita-legale-ai.md` — Responsabilità civile, penale, contrattuale
14. `policy-aziendale-uso-ai.md` — Policy interna per imprese che usano AI
15. `ai-literacy-formazione-team.md` — Obbligo formazione team sull'AI Act
