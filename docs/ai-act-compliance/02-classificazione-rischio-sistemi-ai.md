# Classificazione Rischio — Sistemi AI di EiC

Classificazione formale di ogni edge function AI di EiC secondo le 4 categorie dell'AI Act:
- **Inaccettabile** (vietato)
- **Alto rischio** (obblighi pesanti)
- **Rischio limitato** (obblighi di trasparenza)
- **Rischio minimo** (no obblighi specifici)

Nessuno dei sistemi EiC ricade in "inaccettabile" (sono pratiche vietate come social scoring di massa, ecc., non rilevanti per il settore edile).

## Tabella di classificazione

| # | Edge Function | Scopo | Categoria AI Act | Motivazione | Obblighi |
|---|---|---|---|---|---|
| 1 | silvio-chat | Chatbot principale | **Limitato** | Chatbot interagisce con utenti, deve dichiararsi AI | Trasparenza |
| 2 | silvio-daily-briefing | Briefing giornaliero | **Limitato** | Genera contenuti per utenti | Etichetta "generato AI" |
| 3 | silvio-execute-action | Esegue azioni confermate | **Limitato** | Esegue solo dopo HIL, non decide | Audit log |
| 4 | silvio-memory-extract | Estrae fatti da chat | **Limitato** | Profilazione leggera, no decisioni | Trasparenza + GDPR |
| 5 | silvio-transcribe-audio | Speech-to-text | **Minimo** | Trascrizione, no decisioni | Nessuno specifico |
| 6 | genera-contratto-ai | Genera contratti | **Limitato** | Bozza, sempre revisionata da umano | Trasparenza + etichetta |
| 7 | ai-contratto-review | Compliance review contratti | **Limitato** | Suggerimenti, non decide | Trasparenza |
| 8 | genera-pos | Genera POS sicurezza | **Limitato** | Bozza, sempre revisionata; nota: tema sicurezza è delicato ma il sistema non sostituisce RSPP | Trasparenza + disclaimer "rivedi con RSPP" |
| 9 | suggerisci-sal-ai | Suggerimenti SAL | **Limitato** | Suggerimenti, decisione umana | Trasparenza |
| 10 | ddt-ocr-extract | OCR DDT | **Minimo** | Estrazione dati, no decisioni | Nessuno |
| 11 | ai-fattura-classify | Classifica fatture passive | **Limitato** | Classificazione automatica con review umana possibile | Trasparenza |
| 12 | ai-lead-score | Score lead commerciali | **Limitato** | Suggerimento commerciale, decisione umana | Trasparenza |
| 13 | ai-customer-ltv | Predizione LTV | **Limitato** | Statistico, suggerimento | Trasparenza |
| 14 | ai-allocazione-operai | Suggerisce team | **⚠️ Borderline / da configurare** | Se fosse autonomo nelle assegnazioni HR potrebbe essere alto rischio. Configurazione attuale: suggerisce, decide umano → limitato | Trasparenza + HIL obbligatorio + no decisioni autonome HR |
| 15 | ai-pricing-suggest | Suggerisce prezzo | **Limitato** | Suggerimento commerciale | Trasparenza |
| 16 | ai-foto-cantiere-quality | Vision check qualità | **Limitato** | Analisi suggerimento, decisione umana | Trasparenza |
| 17 | ai-biz-card-ocr | OCR biglietto da visita | **Minimo** | Estrazione dati | Nessuno specifico |
| 18 | ai-summarize | Riassume testo | **Limitato** | Generazione contenuti | Etichetta |
| 19 | ai-executive-briefing | Briefing C-level | **Limitato** | Generazione report, decisione umana | Trasparenza |
| 20 | ai-fraud-review | Review anomalie | **⚠️ Borderline / da configurare** | Se classificasse autonomamente come "frode" un soggetto, potrebbe avvicinarsi all'alto rischio. Configurazione attuale: suggerisce e segnala, decide umano | Trasparenza + HIL + no etichette automatiche di "frode" |
| 21 | ai-briefing-per-ruolo | Briefing personalizzato | **Limitato** | Contenuti generati per utente | Etichetta |
| 22 | ai-genera-preventivo-v2 | Genera preventivi | **Limitato** | Bozza, revisionata | Trasparenza |
| 23 | computo-ai-extract | OCR computi | **Minimo** | Estrazione | Nessuno |
| 24 | ai-tabella-finanziamento-extract | OCR finanziamenti | **Minimo** | Estrazione | Nessuno |
| 25 | parse-rapportino-ai | Parse rapportini | **Limitato** | Auto-detect safety alert (delicato per sicurezza) | Trasparenza + escalation umana su alert sicurezza |

## Sistemi a rischio "borderline" — gestione

Due edge function meritano attenzione particolare:

### ai-allocazione-operai

**Rischio**: se usato per **decidere autonomamente** assunzioni o assegnazioni che impattano significativamente i lavoratori (es. premi, sanzioni, turni), potrebbe ricadere in **alto rischio** (Allegato III area "lavoro e gestione lavoratori").

**Configurazione corretta**:
- Solo **suggerimenti**, mai decisioni autonome
- Decisione finale del responsabile umano
- Lavoratore informato che AI è coinvolta nelle proposte
- Possibilità di contestare la proposta AI

**Ulteriori salvaguardie**:
- Audit trimestrale per identificare bias (es. AI sistematicamente assegna meno ore a certi profili)
- Report demografico delle assegnazioni proposte vs effettive
- DPIA estesa con focus su discriminazione algoritmica

### ai-fraud-review

**Rischio**: classificare un soggetto come "frodante" in autonomia avrebbe implicazioni legali serie.

**Configurazione corretta**:
- Etichette uitilizzate: "anomalia rilevata" (non "frode confermata")
- Suggerimento di indagine umana, mai conclusione automatica
- Output in linguaggio cauto: "potrebbe essere", "merita verifica"
- Audit umano per ogni alert prima di azioni conseguenti

## Modello AI di uso generale (GPAI) integrato

EiC integra modelli GPAI di terze parti (Claude, GPT, ecc.) tramite AI Router. EiC come **deployer** di GPAI ha obblighi minimi (i provider GPAI hanno gli obblighi pesanti).

Per i casi in cui EiC fa **modifica significativa** del modello (es. fine-tuning su dati EiC), EiC potrebbe diventare provider GPAI con obblighi rafforzati.

**Status attuale**: EiC NON fa fine-tuning. Usa modelli "as-is" tramite API. Resta deployer.

## Documentazione minima per ogni sistema

Per ogni edge function elencata, EiC dovrebbe avere documento (1-3 pagine) con:

1. **Scopo del sistema**
2. **Categoria di rischio** assegnata e motivazione
3. **Input/Output**
4. **Modello AI usato**
5. **Tabelle DB lette/scritte**
6. **Misure di trasparenza** implementate
7. **Misure di supervisione umana**
8. **Limitazioni e disclaimer**
9. **Procedure incident response**
10. **Owner tecnico e business**

Template della documentazione:

```markdown
# Sistema AI: [nome]

## Identificazione
- Nome: [es. ai-pricing-suggest]
- Versione: 1.0
- Data classificazione: 2026-XX-XX
- Owner business: [persona]
- Owner tecnico: [persona]

## Classificazione rischio
- Categoria: rischio limitato
- Motivazione: [perché]
- Obblighi applicabili: [lista]

## Funzionamento
[descrizione tecnica + use cases tipici]

## Misure di trasparenza
[come l'utente sa che è AI]

## Misure di supervisione umana
[HIL workflow]

## Limitazioni note
[bias, incertezze, scope]

## Disclaimer
[testo standard mostrato all'utente]

## Audit
[link a log e KPI]
```

## Aggiornamento periodico

La classificazione va rivista:
- Ad ogni modifica significativa del sistema
- Ogni 12 mesi anche senza modifiche
- Ad ogni aggiornamento normativo (linee guida Commissione UE, prassi giurisprudenziale)
- Su richiesta di audit

## Sign-off

Documento approvato da:
- [ ] CTO EiC
- [ ] DPO EiC
- [ ] Compliance officer

Data: 2026-XX-XX
Versione: 1.0
