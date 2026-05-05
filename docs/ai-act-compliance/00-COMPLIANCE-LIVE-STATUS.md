# 🛡️ AI Act Compliance — Live Status

Documento di riferimento per lo stato di compliance del sistema EiC vs Regolamento UE 2024/1689 (AI Act) + Legge 132/2025 IT.

**⚠️ I dati live sono in DB**, non in questo file. Questo file documenta solo come accederli.

---

## Come ottenere il report di compliance live

### SQL diretto

```sql
SELECT silvio_compliance_status_export();
```

Ritorna JSON con:
- `compliance_summary`: totale requisiti, implementati, partial, missing, compliance_rate_pct
- `systems_summary`: sistemi AI attivi, borderline, alto rischio
- `dpia_active`: ultima DPIA approvata + sign-off
- `literacy_summary`: tracking AI literacy art.4

### Dashboard SuperAdmin (futuro)

Da implementare: pagina `/admin/ai-act-compliance` che renderizza l'output di `silvio_compliance_status_export()` in formato leggibile.

---

## Tabelle DB di compliance

| Tabella | Cosa contiene | RLS |
|---|---|---|
| `ai_system_classification` | 25 sistemi AI EiC con risk_category + obblighi | super_admin write, all read |
| `ai_act_compliance_status` | 53 requisiti checklist vs status | super_admin write, all read |
| `ai_dpia_documents` | DPIA versionate con sign-off DPO+CEO+CTO | super_admin write, admin read |
| `ai_literacy_training` | Tracking corsi formazione AI per utente | self or admin read |

## RPC operative

| RPC | Scopo |
|---|---|
| `silvio_compliance_status_export()` | Report JSON completo per audit |
| `silvio_get_system_classification(system_id)` | Dettaglio classificazione di un sistema (per citazione in chat) |
| `literacy_set_completion(user_id, course_id, score, ...)` | Marca completion corso |

---

## Riferimenti documentali (in questa cartella)

| File | Scopo |
|---|---|
| `_README.md` | Roadmap compliance + obblighi chiave |
| `01-checklist-stato-vs-target.md` | Checklist completa con stato + azioni residue |
| `02-classificazione-rischio-sistemi-ai.md` | Classificazione rischio dei 25 sistemi |
| `03-dpia-template-cervello.md` | Template DPIA da compilare e firmare |
| `00-COMPLIANCE-LIVE-STATUS.md` | Questo file (puntatore al DB) |

---

## Compliance rate corrente (2026-05-05)

Baseline pre-Track 1-6: ~25%

Post Track 1-6 (codice + DB):
- 31/53 requirements implementati (58%)
- 13/53 partial (24%)
- 7/53 missing (13%)
- 1/53 documental (formalizzazione mancante)
- 1/53 not_applicable

**Rate calcolato**: implemented + partial × 0.5 = **~70%**

Per arrivare al **target 90%** serve il lavoro **governance & legal** rimanente:
- DPIA firmata da DPO+CEO+CTO
- Programma AI literacy interno + esterno (art.4 IN VIGORE dal 2/2/2025!)
- Procedura incident response cross-tenant leak
- Penetration test cross-tenant trimestrale
- Disaster recovery test annuale
- Policy formali firmate

Tutto è **strutturato** e pronto in DB: il lavoro residuo è di firma e processo, non di sviluppo.

---

## Sistemi AI borderline (attenzione)

2 sistemi su 25 sono classificati `borderline` (potenziale alto rischio se misurati per uso autonomo):

1. **`ai-allocazione-operai`** — se autonomo nelle assegnazioni HR potrebbe essere alto rischio (Allegato III "lavoro e gestione lavoratori")
   - **Configurazione attuale**: `human_oversight_level=approve_required`, solo suggerimenti
   - **Salvaguardie**: lavoratore informato, possibilità di contestare, audit trimestrale per bias

2. **`ai-fraud-review`** — etichettare un soggetto come "frode" autonomamente avrebbe implicazioni legali serie
   - **Configurazione attuale**: linguaggio cauto ("anomalia rilevata", non "frode")
   - **Salvaguardie**: HIL obbligatorio, no etichette automatiche di frode

Entrambi pienamente conformi nella configurazione corrente. Se l'uso evolvesse verso decisioni autonome, riclassificare e fare DPIA estesa.

---

## Audit period

- Review classificazione: ogni **12 mesi** o ad ogni modifica significativa
- Review compliance status: ogni **6 mesi**
- Review DPIA: ogni **12 mesi** o ad ogni modifica significativa
- Recertificazione AI literacy utenti: ogni **24 mesi**

Tutti i `next_review_due` sono auto-popolati nelle tabelle.

---

Versione: 1.0 | Aggiornato: 2026-05-05
