

## Piano: UNIF-AGE-05 — Campagne, Crediti & Utilizzo, Statistiche, Impostazioni

### Stato attuale

| Elemento | Stato |
|---|---|
| `ai_campaigns_v2` | Esiste (schema base da UNIF-AGE-01) — mancano: schedulazione, target contatti, stats dettagliate |
| `ai_credit_transactions` | Non esiste |
| `ai_campaign_contacts` | Non esiste |
| Colonne AI su `companies` | Non esistono (`ai_piano`, `ai_crediti`, ecc.) |
| `consume_ai_credits` RPC | Non esiste |
| `get_ai_analytics` RPC | Non esiste |
| `recharts` | Già installato (usato in 41+ file) |
| Tab Campagne | Lazy-load di `InternalCampaignsPage` (legacy) |
| Tab Crediti | Lazy-load di `AgentCreditsPage` (legacy) |
| Tab Impostazioni | Lazy-load di `PlatformSettingsPage` (legacy) |

### Adattamenti dal documento

1. Il documento usa `ai_campaigns` / `ai_agents` — noi usiamo `ai_campaigns_v2` / `ai_agents_v2`. ALTER la tabella esistente invece di ricrearla.
2. Il documento usa `get_current_company_id()` — noi usiamo `get_my_company_id()`.
3. CHECK constraints → validation triggers.
4. `ai_conversations` nel RPC analytics → `ai_conversations_v2`.
5. Aggiungere tab "Statistiche" (non presente nella lista TABS attuale).

---

### Fase 1 — Migrazione SQL

Una singola migrazione che:

1. **ALTER `ai_campaigns_v2`**: aggiunge colonne schedulazione (`data_inizio`, `data_fine`, `orario_inizio`, `orario_fine`, `giorni_settimana`, `fuso_orario`), target (`contatti_falliti`, `contatti_no_risposta`), impostazioni (`tentativi_max`, `intervallo_tentativi_minuti`, `messaggio_iniziale`), stats (`durata_media_secondi`, `tasso_risposta`, `crediti_utilizzati`), metadata (`descrizione`, `tag`, `metadata`)
2. **Crea `ai_campaign_contacts`** con RLS via campaign join + indici
3. **Crea `ai_credit_transactions`** con RLS su company_id + indice
4. **ALTER `companies`**: aggiunge `ai_piano`, `ai_crediti`, `ai_crediti_bonus`, `ai_crediti_soglia_allerta`, `ai_rinnovo_at`
5. **Crea RPC `consume_ai_credits`** (atomico con FOR UPDATE, scala prima bonus)
6. **Crea RPC `get_ai_analytics`** (queries aggregate su `ai_conversations_v2`, `ai_chat_sessions`, `ai_agents_v2`, `ai_credit_transactions` con serie temporali)
7. **Trigger `updated_at`** per `ai_campaigns_v2`

### Fase 2 — Componenti Frontend

| File | Descrizione |
|---|---|
| `src/components/agenti/CampagneTab.tsx` | Griglia campagne, wizard creazione 3-step, card con progress bar e azioni stato |
| `src/components/agenti/CreditiTab.tsx` | Saldo con progress bar, riepilogo periodo, tabella prezzi, storico transazioni |
| `src/components/agenti/StatisticheTab.tsx` | KPI cards + BarChart chiamate + LineChart chat + PieChart distribuzione (recharts) |
| `src/components/agenti/ImpostazioniTab.tsx` | ElevenLabs API key, test connessione, webhook URL, soglia allerta crediti |

### Fase 3 — Integrazione AgentiAIPage

1. Aggiungere tab "Statistiche" (`BarChart2` icon) alla lista TABS
2. Sostituire i 3 lazy-load legacy con i nuovi componenti diretti
3. Rimuovere import di `InternalCampaignsPage`, `AgentCreditsPage`, `PlatformSettingsPage`
4. Aggiornare il type `MainTab` per includere `"statistiche"`

### File da creare/modificare

| File | Azione |
|---|---|
| Migrazione SQL | ALTER campaigns_v2, crea campaign_contacts, credit_transactions, alter companies, 2 RPC |
| `src/components/agenti/CampagneTab.tsx` | Creare |
| `src/components/agenti/CreditiTab.tsx` | Creare |
| `src/components/agenti/StatisticheTab.tsx` | Creare |
| `src/components/agenti/ImpostazioniTab.tsx` | Creare |
| `src/pages/azienda/AgentiAIPage.tsx` | Aggiornare — sostituire lazy-load legacy, aggiungere tab Statistiche |

