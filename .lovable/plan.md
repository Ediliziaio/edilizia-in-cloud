

## Piano: Allineamento alla Spec V2 — UTM Attribution + Form Builder

La spec V2 è più dettagliata della V1. L'implementazione attuale copre la struttura base ma ha diverse lacune rispetto alla spec. Ecco le differenze e le correzioni necessarie.

### Differenze identificate

#### A. Database (attribution_sessions)
| Spec V2 | Implementato | Gap |
|---|---|---|
| `landing_url` | `landing_page` | Nome colonna diverso |
| `converted_at` | `ended_at` | Nome colonna diverso |
| `ttclid`, `msclkid`, `li_fat_id` | Solo `gclid`, `fbclid` | Mancano 3 click ID |
| `user_agent` TEXT | Presente | OK |
| CHECK su `device_type` | Nessun CHECK | Mancante |
| `UNIQUE(company_id, session_id)` | Non presente (upsert tramite session_id TEXT) | Mancante |

#### B. Database (contact_attributions)
| Spec V2 | Implementato | Gap |
|---|---|---|
| `ft_source`, `ft_medium`, `ft_campaign`, `ft_content`, `ft_term` | `first_source`, `first_medium`, `first_campaign` | Mancano ft_content, ft_term |
| `ft_fbclid`, `ft_gclid`, `ft_ttclid` | Non presenti | Mancanti |
| `ft_landing_url`, `ft_session_id`, `ft_at` | `first_touch_at`, `first_touch_session_id` | ft_landing_url mancante |
| Stessi campi per `lt_*` | Stessa situazione | Mancanti |
| `touchpoint_count` | `total_sessions` | Nome diverso |

#### C. RPC `get_attribution_report`
| Spec V2 | Implementato | Gap |
|---|---|---|
| Ritorna `total_sessions`, `total_leads`, `conversion_rate`, `sources[]` | Ritorna `sessions`, `unique_visitors`, `contacts_created`, `conversions` | Schema diverso |
| `conversion_rate` calcolata nel DB | Calcolata nel frontend | OK funzionalmente |
| `sources TEXT[]` aggregato | Non presente | Mancante |

#### D. Edge Function `attribution-capture`
| Spec V2 | Implementato | Gap |
|---|---|---|
| Accetta `ttclid`, `msclkid`, `li_fat_id` | Solo `gclid`, `fbclid` | Mancanti |
| `landing_url` nel body | `landing_page` | Nome diverso |
| Verifica che company_id esista | Non presente | Mancante |

#### E. Edge Function `form-submit`
| Spec V2 | Implementato | Gap |
|---|---|---|
| Validazione campi required con label | Validazione con `field.name` | Usa `field.name` anziché `field.id` |
| Mapping campi da config (`field.mapping`) | Hardcoded per nome campo | Mancante |
| `trigger_form_automations` call | Non presente | Mancante |
| Settings: assignedUserId, defaultTags, defaultPipelineId | Non presenti | Mancanti |
| Redirect URL dal settings | Non presente | Mancante |

#### F. Edge Function `form-render`
- Implementazione esistente è funzionante ma non include il tracking snippet nell'HTML come da spec
- Non include la logica di submit con `window._attrSessionId`

#### G. ContactAttributionTab
- Implementazione attuale è minimale (badge + lista sessioni)
- Spec V2 vuole card dettagliate per First/Last Touch con click ID, landing URL, keyword
- Spec vuole `TouchCard` component ricco

#### H. AttributionReport
- Manca il **drill-down** (click su source → mostra campaigns filtrate per quella source, con breadcrumb)
- Manca la "Sorgente principale" come 4° KPI card
- Manca `SourceBadge` colorato nella tabella

#### I. Form Builder UI
- L'implementazione attuale è funzionante con 3 colonne
- Manca la validazione dei campi con `field.id` (usa `field.name`)
- Mancano le opzioni di condivisione (snippet iframe, snippet JS embed)

### Piano di correzione (4 step)

**Step 1 — Migrazione DB: allineamento schema**
- ADD colonne mancanti a `attribution_sessions`: `ttclid`, `msclkid`, `li_fat_id`, rinomina `landing_page` → aggiungere `landing_url` e migrare i dati, aggiungere `converted_at`, aggiungere UNIQUE constraint
- ADD colonne mancanti a `contact_attributions`: `ft_content`, `ft_term`, `ft_fbclid`, `ft_gclid`, `ft_ttclid`, `ft_landing_url`, e tutti i corrispondenti `lt_*`
- Aggiornare la funzione `attach_attribution_to_contact` per popolare i nuovi campi
- Aggiornare la RPC `get_attribution_report` per ritornare lo schema V2 (`total_sessions`, `total_leads`, `conversion_rate`, `sources[]`)

**Step 2 — Edge Functions: allineamento**
- `attribution-capture`: accettare `ttclid`, `msclkid`, `li_fat_id`, `landing_url`; aggiungere verifica company_id
- `form-submit`: usare `field.id` per validazione, implementare mapping campi, aggiungere `trigger_form_automations`, supportare `redirectUrl`, `assignedUserId`, `defaultTags`
- `form-render`: inserire tracking snippet nell'HTML, inviare `session_id` nella submit

**Step 3 — ContactAttributionTab: riscrittura**
- Implementare le `TouchCard` ricche della spec con click ID, landing URL, keyword, icone device
- Aggiornare `useContactAttribution` per leggere i nuovi campi `ft_*`/`lt_*`
- Aggiornare il componente per mostrare `SourceBadge` colorati e `DeviceIcon`

**Step 4 — AttributionReport: drill-down + miglioramenti**
- Aggiungere stato `drillSource` per drill-down: click su riga source → filtra per `utm_source` e switch a `groupBy=campaign`
- Aggiungere breadcrumb navigazione ("Tutte le sorgenti → Facebook → Campagne")
- Aggiornare hook per accettare filtro source opzionale
- 4° KPI card: "Sorgente principale"
- `SourceBadge` nella tabella quando `groupBy === 'source'`

### File coinvolti

| File | Azione |
|---|---|
| Nuova migrazione SQL | Aggiungere colonne, aggiornare funzioni |
| `supabase/functions/attribution-capture/index.ts` | Aggiungere click ID, company check |
| `supabase/functions/form-submit/index.ts` | Mapping campi, automazioni, redirect |
| `supabase/functions/form-render/index.ts` | Tracking snippet, submit con session_id |
| `src/hooks/useContactAttribution.ts` | Leggere nuovi campi ft_*/lt_* |
| `src/components/contacts/ContactAttributionTab.tsx` | Riscrivere con TouchCard ricche |
| `src/hooks/useAttributionReport.ts` | Nuovo schema ritorno, filtro source |
| `src/components/reporting/attribution/AttributionReport.tsx` | Drill-down, SourceBadge, breadcrumb |

