# Upsell Signals — Tommaso Insight KB

> Catalogo signals che identificano clienti pronti per upgrade. Tommaso
> scansiona settimanalmente e chiama LLM per analisi narrative + suggerimento.

## Signal catalog

### 1. Near plan limit
**Trigger**: usage > 80% del cap mensile del piano
- Es. piano Starter = 100 commesse/mese, cliente ne crea 90 → upsell Pro
- MRR uplift atteso: differenza piani

### 2. Team growth
**Trigger**: team_size cresciuto > 50% in 60gg
- Es. signup con 3 utenti, ora 8 → probabilmente piano Pro multi-user
- MRR uplift: per-seat pricing

### 3. Power user feature missing
**Trigger**: cliente usa 15+ features distinte ma è su piano Starter
- È un cliente engaged ma sotto-monetizzato
- MRR uplift: passaggio al piano superiore

### 4. Feature unused → expansion candidate
**Trigger**: cliente usa heavy moduli A+B ma mai modulo C (incluso nel piano)
- NON è upsell, è EDUCATION
- Manda email "lo sapevi che hai anche C?"

### 5. Multi-company
**Trigger**: titolare ha registrato 2+ aziende
- Piano Multi-Company / Enterprise
- MRR uplift: pacchetto

### 6. Integration heavy user
**Trigger**: ha collegato 3+ integrazioni esterne (banca, calendario, email)
- È un "completista" — pronto per Premium con SLA

### 7. NPS promoter ricorrente
**Trigger**: NPS ≥ 9 in due survey consecutivi
- Non upsell diretto, ma → referral program

### 8. Cliente referral source
**Trigger**: ha portato 1+ cliente (tag referral_source)
- Sconto fedeltà invece di prezzo full

## Soglie cost-aware

Tommaso NON chiama LLM per OGNI cliente — solo se almeno 1 signal triggera.

| Signal | Auto-action | LLM call? |
|--------|-------------|-----------|
| Near plan limit > 80% | Tag candidate | Sì (genera proposta upgrade) |
| Team growth > 50% | Tag candidate | Sì |
| Power user su piano basso | Tag candidate | Sì |
| Feature unused | Manda email "lo sapevi?" | No (template) |
| Multi-company | Notif Florin | No (manuale) |
| NPS promoter | Tag for referral | No (workflow separato) |

## MRR uplift table (referenza pricing)

| Da → A | Uplift atteso |
|--------|---------------|
| Starter (200€) → Pro (497€) | +297€ |
| Pro → Enterprise (custom) | +500-1500€ |
| Mono-azienda → Multi (5 aziende) | +800€ |

> ⚠️ Aggiorna se cambia pricing.
