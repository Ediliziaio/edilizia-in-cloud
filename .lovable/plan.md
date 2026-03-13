

## Piano: Tab "Performance Venditori" in Reportistica + DB Functions

### Schema reale trovato

| Placeholder | Valore reale |
|---|---|
| Opportunita | `marketing_opportunities` — `assigned_to` (agent), `value` (valore), `status` (open/won/lost), `company_id` |
| Contatti | `marketing_contacts` — `assigned_to`, `company_id`, `created_at` |
| Appuntamenti | `appointments` — `assigned_to`, `company_id`, `appointment_date`, `status` (confermato), `is_completed` |
| Attivita | `marketing_contact_activities` — `created_by`, `company_id`, `activity_type` |
| Profili utente | `profiles` — `id`, `company_id`, `first_name`, `last_name`, `email` |
| Stages | `marketing_pipeline_stages` — `name`, `auto_status` |

Note: `appointments` non ha un campo "showed/no_show" esplicito. Usa `is_completed = true` come proxy per "showed up" e `is_completed = false AND appointment_date < NOW()` per no-show. Lo status "won" e "lost" (+ "open") sono i valori reali di `marketing_opportunities.status`.

---

### Cosa viene creato

**1. Migration SQL** — Funzione RPC `get_vendor_kpi_per_agent`
- Aggrega dati da `marketing_opportunities`, `appointments`, `marketing_contacts` per agente
- KPI: opp totali/vinte/perse/aperte, fatturato, pipeline, tasso chiusura, appuntamenti fissati/completati, show rate, avg giorni chiusura, nuovi contatti
- Filtro per `company_id`, range date, agent_id opzionale
- `SECURITY DEFINER`, `STABLE`, `SET search_path = public`

**2. Migration SQL** — Funzione RPC `get_vendor_trend_mensile`
- Trend mese per mese: opp vinte/perse, fatturato, appuntamenti, tasso chiusura, nuovi contatti
- Stessi filtri di sopra

**3. Migration SQL** — Funzione RPC `get_vendor_funnel_stages`
- Distribuzione opportunita per stage (JOIN con `marketing_pipeline_stages`)
- Count + valore + percentuale

**4. Hook `src/hooks/useVendorReport.ts`**
- `useVendorKPI(periodo, agentId?)` — chiama RPC `get_vendor_kpi_per_agent`
- `useVendorTrend(anno?, agentId?)` — chiama RPC `get_vendor_trend_mensile`
- `useVendorFunnel(periodo, agentId?)` — chiama RPC `get_vendor_funnel_stages`
- Usa `useEffectiveCompanyId()` per il company_id
- Tipo `PeriodoVendor = 'mese' | 'mese_prec' | 'trimestre' | 'semestre' | 'anno'`

**5. Tab in ReportisticaPage**
- Aggiungere `{ key: "venditori", label: "Performance Venditori" }` alla lista TABS
- Aggiungere `"venditori"` a `IMPLEMENTED_TABS`
- Placeholder component `VenditoriPerformanceReport` (stub che mostra "In costruzione — hooks e DB pronti")
- Il componente completo con grafici e tabelle sara in VENDOR-REP-02

### File da modificare/creare

| File | Azione |
|---|---|
| Nuova migration SQL | 3 funzioni RPC |
| `src/hooks/useVendorReport.ts` | Nuovo — hook + tipi |
| `src/pages/azienda/ReportisticaPage.tsx` | Aggiungere tab + import |
| `src/components/reporting/venditori/VenditoriPerformanceReport.tsx` | Nuovo — stub component |

### Dettaglio tecnico RPC

La funzione `get_vendor_kpi_per_agent` usa `profiles` (non `auth.users`) per i nomi agenti, JOINando su `assigned_to = profiles.id`. Per gli appuntamenti, `is_completed = true` = showed up, `is_completed = false AND appointment_date < CURRENT_DATE` = no-show. I valori di status opportunita sono `'won'`, `'lost'`, `'open'`.

