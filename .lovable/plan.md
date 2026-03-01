

# Analisi Strategica — Sezione Super Admin: Gap vs. Standard SaaS Enterprise

## Stato Attuale

La sezione Super Admin copre le basi operative:

| Modulo | Cosa fa |
|--------|---------|
| Dashboard | MRR, trial, churn rate, attività recenti |
| Aziende | CRUD, filtri, impersonazione, export CSV |
| Assistenza | Chat supporto multi-tenant |
| Piani Tariffari | Gestione subscription plans + Stripe |
| Referral | Affiliati, commissioni, payout |
| Implementazioni | Feature flags per moduli beta |
| Sync Logs | Log sincronizzazione Google Calendar |
| Impostazioni | Profilo, admin users, API keys, audit log |

## Cosa Manca — Prospettiva CEO/SaaS Founder

### TIER 1 — Revenue Intelligence (impatto diretto su fatturato)

**1. Revenue Analytics Dashboard**
Oggi la dashboard mostra solo MRR e churn. Un CEO ha bisogno di:
- **ARR** (Annual Recurring Revenue) proiettato
- **LTV medio** per piano e per settore
- **Net Revenue Retention** (NRR) — quanto crescono i clienti esistenti
- **MRR Movements** — new, expansion, contraction, churn, reactivation
- **Revenue per settore** — quale vertical genera di più
- Grafici comparativi mese-su-mese con delta percentuali

**2. Conversion Funnel & Trial Intelligence**
Il trial funnel attuale mostra solo conteggi. Serve:
- **Trial-to-Paid conversion rate** con trend storico
- **Time-to-activation** — quanto ci mette un trial a fare il primo ordine
- **Activation milestones** — % trial che hanno creato almeno 1 ordine, 1 cliente, 1 utente staff
- **Trial scoring** — quali trial sono "caldi" (alta attività) vs "freddi" (nessun uso)
- **Alert automatici** — notifica quando un trial ad alto engagement sta per scadere

**3. Dunning & Payment Health**
Oggi non c'è visibilità sui pagamenti falliti:
- **Failed payments dashboard** con retry status
- **Involuntary churn tracking** — clienti persi per carta scaduta vs scelta
- **Payment recovery rate**
- **Revenue at risk** — MRR dei clienti con pagamento in ritardo

### TIER 2 — Customer Success & Retention (riduzione churn)

**4. Health Score per Tenant**
Un punteggio calcolato automaticamente basato su:
- Frequenza login (ultimi 7/30 giorni)
- Numero ordini creati (trend)
- Moduli attivi utilizzati vs disponibili
- Ticket di supporto aperti (segnale positivo o negativo)
- Ultimo accesso dell'admin aziendale
- Output: badge "Healthy / At Risk / Critical" sulla lista aziende e sulla dashboard

**5. Company Lifecycle Management**
Gestione proattiva del ciclo di vita:
- **Onboarding checklist** per ogni azienda — ha completato setup profilo? Ha invitato utenti? Ha creato il primo ordine?
- **Trial extension** con un click (oggi va fatto manualmente nel DB)
- **Win-back campaigns** — lista aziende churned con possibilità di riattivazione
- **Upgrade suggestions** — aziende che superano i limiti del piano attuale

**6. Announcements & Changelog**
Comunicare con i tenant dall'admin:
- **Banner in-app** visibili a tutte le aziende o a segmenti specifici
- **Changelog** con versioning (nuove features, fix, miglioramenti)
- **Notifiche push** per manutenzione programmata o downtime

### TIER 3 — Operational Intelligence (scalabilità)

**7. Feature Usage Analytics**
Capire come i tenant usano il prodotto:
- Heatmap dei moduli più usati (ordini, calendario, magazzino...)
- Moduli attivati ma mai usati (opportunità di formazione)
- Comparativa utilizzo per piano/settore
- Trend di adozione nuove feature nel tempo

**8. System Health & Observability**
Oggi non c'è una vista sullo stato del sistema:
- Edge function error rate e latenza media
- Query lente (dai sync logs, estendibile)
- Storage usage per tenant vs limite del piano
- API rate e picchi di utilizzo
- Stato integrazioni esterne (Google, Meta, WhatsApp)

**9. Broadcast & Communication Center**
Oltre ai ticket di supporto:
- **Email broadcast** a tutti i tenant o segmenti (per settore, piano, stato)
- **Template email** predefiniti (welcome, scadenza trial, renewal reminder)
- Log di tutte le comunicazioni inviate

**10. Scheduled Executive Reports**
Report automatici via email per il CEO/team:
- KPI settimanali (MRR, new trials, conversions, churn)
- Alert su anomalie (spike churn, calo attivazioni)
- Summary mensile con confronto periodo precedente

## Piano di Implementazione Suggerito

```text
FASE 1 (impatto immediato, 2-3 sessioni)
├── Revenue Analytics Dashboard (ARR, NRR, MRR movements)
├── Health Score per tenant (calcolo + badge)
└── Trial Intelligence (conversion rate, activation milestones)

FASE 2 (retention, 2-3 sessioni)
├── Company Lifecycle (onboarding checklist, trial extension UI)
├── Dunning dashboard (failed payments, revenue at risk)
└── Announcements/Changelog system

FASE 3 (scalabilità, 2-3 sessioni)
├── Feature Usage Analytics
├── System Health dashboard
└── Broadcast email + scheduled reports
```

## Riepilogo Priorità

| Feature | Impatto Revenue | Effort | Priorità |
|---------|----------------|--------|----------|
| Revenue Analytics | Altissimo | Medio | P0 |
| Health Score | Alto | Medio | P0 |
| Trial Intelligence | Alto | Basso | P0 |
| Company Lifecycle | Alto | Medio | P1 |
| Dunning Dashboard | Alto | Medio | P1 |
| Announcements | Medio | Basso | P1 |
| Feature Usage | Medio | Medio | P2 |
| System Health | Medio | Alto | P2 |
| Broadcast Email | Basso | Alto | P2 |
| Scheduled Reports | Basso | Alto | P2 |

Quale fase vuoi implementare per prima?

