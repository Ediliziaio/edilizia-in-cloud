# 📜 EiC — Registry Masterprompts

Sistema di **35 masterprompt** che Claude Code esegue autonomamente per
trasformare EiC da "SaaS gestionale per edili" all'**Operating System
dell'edilizia italiana**.

## 📁 Struttura

```
masterprompts/
├── README.md          (questo file: indice + stato)
├── _template.md       (template universale per nuovi MP)
├── backlog/           (MP scritti, non ancora iniziati)
├── in_progress/       (MP in lavorazione, branch attivo)
└── completed/         (MP mergeati: link al PR finale dentro)
```

## 🎫 Convenzione naming

```
MP-[AREA]-[NN]
```
| Sigla | Area |
|---|---|
| AIE | AI Engine (foundation, personas, tools) |
| FAT | Fatturazione & Finance |
| OPS | Operations cantiere |
| VERT | Verticalizzazione |
| AEDIX | Brain AEDIX (cross-tenant) |
| PRICE | Pricing AI variabile |
| SALES | Sales & Lead |
| MKT | Marketing |
| HR | HR & People |
| COMP | Compliance & Sicurezza |
| CX | Customer Experience |
| PROC | Procurement & Subappalti |
| PRED | Predittiva & Analytics |
| META | Meta-automazioni |

## 📋 Indice priorità (35 MP)

### 🔥 SPRINT 0 — Foundation AI (sblocca tutto)

| MP | Titolo | Effort | Dipendenze | ROI | Stato |
|---|---|---|---|---|---|
| **MP-AIE-01** | Tool registry unificato + dispatcher | 2 sett | nessuna | 🔥🔥🔥🔥🔥 | ✅ completed |
| **MP-AIE-02** | Wire 18 personas con tool calling in ai-orchestrator | 1 sett | MP-AIE-01 | 🔥🔥🔥🔥🔥 | ✅ completed |
| **MP-AIE-03** | Action proposals UI completa + apply engine | 1 sett | MP-AIE-02 | 🔥🔥🔥🔥 | ✅ completed |

### 💼 SPRINT 1 — Quick Wins ad alto impatto

| MP | Titolo | Effort | Dipendenze | ROI | Stato |
|---|---|---|---|---|---|
| **MP-OPS-01** | Reportino settimanale committente PDF + invio | 1 sett | MP-AIE-02 | 🔥🔥🔥🔥 | 📋 backlog |
| **MP-OPS-02** | Briefing capomastro mattutino WhatsApp | 1 sett | MP-AIE-02 | 🔥🔥🔥🔥 | 📋 backlog |
| **MP-COMP-01** | DURC monitoring + auto-rinnovo | 1 sett | MP-AIE-02 | 🔥🔥🔥🔥 | 📋 backlog |
| **MP-FAT-01** | Dunning intelligente adattivo | 1 sett | MP-AIE-02 | 🔥🔥🔥🔥 | 📋 backlog |
| **MP-CX-01** | Recensioni Google auto-recall | 3 gg | MP-AIE-02 | 🔥🔥🔥 | 📋 backlog |

### 🏗️ SPRINT 2 — Operations chiusura loop

| MP | Titolo | Effort | Dipendenze | ROI | Stato |
|---|---|---|---|---|---|
| **MP-OPS-03** | Giornale di cantiere auto-generato | 2 sett | MP-OPS-01 | 🔥🔥🔥🔥🔥 | 📋 backlog |
| **MP-OPS-04** | SAL automatico da rapportini | 2 sett | MP-OPS-03 | 🔥🔥🔥🔥 | 📋 backlog |
| **MP-OPS-05** | Materiale just-in-time + reorder predittivo | 2 sett | MP-AIE-02 | 🔥🔥🔥 | 📋 backlog |
| **MP-OPS-06** | Quality check foto cantiere AI | 1 sett | MP-AIE-02 | 🔥🔥🔥🔥 | 📋 backlog |

### 💰 SPRINT 3 — Finance closing

| MP | Titolo | Effort | Dipendenze | ROI | Stato |
|---|---|---|---|---|---|
| **MP-FAT-02** | Fattura zero-touch SAL→SDI→reminder | 3 sett | MP-AIE-02 | 🔥🔥🔥🔥🔥 | 📋 backlog |
| **MP-FAT-03** | Prima nota auto-reconciliation | 2 sett | MP-FAT-02 | 🔥🔥🔥🔥 | 📋 backlog |
| **MP-FAT-04** | Cash flow forecast AI a 90gg | 2 sett | MP-AIE-02 | 🔥🔥🔥🔥🔥 | 📋 backlog |
| **MP-FAT-05** | Report CFO settimanale automatico | 1 sett | MP-FAT-04 | 🔥🔥🔥🔥🔥 | 📋 backlog |
| **MP-FAT-06** | Pricing dinamico preventivi | 1 sett | MP-AIE-02 | 🔥🔥🔥🔥 | 📋 backlog |

### 💼 SPRINT 4 — Sales & Marketing

| MP | Titolo | Effort | Dipendenze | ROI | Stato |
|---|---|---|---|---|---|
| **MP-SALES-01** | Lead first-touch < 60s | 2 sett | MP-AIE-02 | 🔥🔥🔥🔥 | 📋 backlog |
| **MP-SALES-02** | Preventivo da foto/disegno | 3 sett | MP-AIE-02 | 🔥🔥🔥🔥🔥 | 📋 backlog |
| **MP-SALES-03** | Win-back clienti dormienti | 1 sett | MP-AIE-02 | 🔥🔥🔥 | 📋 backlog |
| **MP-MKT-01** | Content engine continuo multi-brand | 2 sett | MP-AIE-02 | 🔥🔥🔥 | 📋 backlog |
| **MP-MKT-02** | NPS sentiment + escalation | 1 sett | MP-AIE-02 | 🔥🔥🔥 | 📋 backlog |

### 🛡️ SPRINT 5 — HR & Compliance

| MP | Titolo | Effort | Dipendenze | ROI | Stato |
|---|---|---|---|---|---|
| **MP-HR-01** | Onboarding dipendente automatico | 2 sett | MP-AIE-02 | 🔥🔥🔥🔥 | 📋 backlog |
| **MP-HR-02** | Cedolini AI da presenze + GPS | 2 sett | MP-AIE-02 | 🔥🔥🔥🔥 | 📋 backlog |
| **MP-COMP-02** | Aggiornamento normativo continuo (Gazzetta UE) | 2 sett | MP-AIE-02 | 🔥🔥🔥🔥🔥 | ✅ completed |
| **MP-COMP-03** | Subappaltatore compliance auto | 1 sett | MP-COMP-01 | 🔥🔥🔥🔥 | 📋 backlog |

### 🧬 SPRINT 6 — Verticalizzazione

| MP | Titolo | Effort | Dipendenze | ROI | Stato |
|---|---|---|---|---|---|
| **MP-VERT-01** | Schema `business_verticals` + onboarding | 1 sett | nessuna | 🔥🔥🔥🔥 | 🟡 in_progress |
| **MP-VERT-02** | Espansione 12 verticali (oltre serramenti) | 4 sett | MP-VERT-01 | 🔥🔥🔥🔥 | 📋 backlog |
| **MP-VERT-03** | Vertical persona overrides + RAG vertical | 2 sett | MP-VERT-01, MP-AIE-02 | 🔥🔥🔥🔥 | 📋 backlog |

### 🧠 SPRINT 7 — Brain AEDIX (cross-tenant)

| MP | Titolo | Effort | Dipendenze | ROI | Stato |
|---|---|---|---|---|---|
| **MP-AEDIX-01** | Schema brain + pipeline aggregazione + opt-in | 3 sett | MP-VERT-01 | 🔥🔥🔥🔥🔥 | 🟡 in_progress |
| **MP-AEDIX-02** | Persona `aedix_brain` + 5 query tool | 2 sett | MP-AEDIX-01 | 🔥🔥🔥🔥🔥 | 📋 backlog |
| **MP-AEDIX-03** | ML predittive (churn, trend, outlier) | 4 sett | MP-AEDIX-02 | 🔥🔥🔥🔥 | 📋 backlog |

### 💸 SPRINT 8 — Pricing AI variabile

| MP | Titolo | Effort | Dipendenze | ROI | Stato |
|---|---|---|---|---|---|
| **MP-PRICE-01** | `plan_ai_budgets` + view consumo + alert | 1 sett | nessuna | 🔥🔥🔥🔥 | 🟡 in_progress |
| **MP-PRICE-02** | Routing dinamico soft/hard cap nel router | 1 sett | MP-PRICE-01 | 🔥🔥🔥🔥 | ✅ completed |
| **MP-PRICE-03** | UI dashboard consumo + PAYG checkout | 2 sett | MP-PRICE-02 | 🔥🔥🔥🔥 | 📋 backlog |

### 🔮 SPRINT 9 — Predittiva & Meta

| MP | Titolo | Effort | Dipendenze | ROI | Stato |
|---|---|---|---|---|---|
| **MP-PRED-01** | Customer churn prediction | 2 sett | MP-AEDIX-03 | 🔥🔥🔥🔥 | 📋 backlog |
| **MP-PRED-02** | Ritardo cantiere predittivo | 2 sett | MP-OPS-04 | 🔥🔥🔥🔥 | 📋 backlog |
| **MP-META-01** | Self-improving prompts + KB writer auto | 2 sett | MP-AIE-02 | 🔥🔥🔥 | 📋 backlog |

## 🔄 Workflow

1. Pick MP da `backlog/` → spostalo in `in_progress/`
2. Crea branch `feat/mp-xxx-nn-slug` da `main`
3. Implementa step-by-step seguendo l'MP file
4. PR con title `feat(MP-XXX-NN): titolo`
5. Merge → sposta MP file in `completed/` con link al PR finale + data
6. Aggiorna stato in questo README

## 🎯 Roadmap consigliata (12-16 settimane)

| Settimana | MP | Note |
|---|---|---|
| 1-2 | MP-AIE-01 | 🔴 BLOCCANTE per quasi tutto |
| 3 | MP-AIE-02 | 🔴 BLOCCANTE per Sprint 1+ |
| 4 | MP-AIE-03 | UI action proposals |
| 5-6 | MP-OPS-01, MP-OPS-02, MP-COMP-01 | ⚡ Quick wins paralleli |
| 7-8 | MP-FAT-01, MP-CX-01 | |
| 9-11 | MP-FAT-02, MP-FAT-03 | |
| 12 | MP-VERT-01 | |
| 13-15 | MP-AEDIX-01, MP-AEDIX-02 | |
| 16 | MP-PRICE-01, MP-PRICE-02, MP-PRICE-03 | |
