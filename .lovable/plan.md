

## Piano: Verifica e Fix V4 — Gap residui

Ho analizzato a fondo la spec V4 rispetto all'implementazione attuale. La copertura è al ~95%. Restano 3 fix puntuali:

### Gap trovati

**1. `form-render` non filtra per `is_active`**
La query (riga 73) filtra solo `.eq("is_published", true)` ma non `.eq("is_active", true)`. Un form disattivato ma pubblicato rimane accessibile.

**2. `form-render` submit non invia tutti i click ID**
Lo script inline invia solo `gclid` e `fbclid` nel payload di submit (righe 217-218). Mancano `ttclid`, `msclkid`, `li_fat_id` che sono però catturati dal tracking snippet.

**3. Filtri `attr_source`/`attr_campaign` nella lista contatti**
La spec chiede dropdown filtro per Sorgente e Campagna nella lista contatti marketing + colonne opzionali nella tabella. Non implementato.

### Tutto il resto è allineato

| Area | Stato |
|---|---|
| DB schema `attribution_sessions` | ✓ Tutte le colonne presenti |
| DB schema `contact_attributions` | ✓ Colonne ft_*/lt_* presenti |
| DB schema `form_submissions` | ✓ fbclid, gclid, user_agent, device_type presenti |
| DB schema `lead_forms.is_active` | ✓ Presente |
| RPC `get_attribution_report` | ✓ Con filtro source per drill-down |
| RPC `trigger_form_automations` | ✓ Presente |
| Edge `attribution-capture` | ✓ Verifica company, tutti click ID |
| Edge `form-submit` | ✓ is_active check, opportunity, automations |
| Tracking snippet | ✓ localStorage, tutti click ID, window._attrSessionId |
| ContactAttributionTab | ✓ TouchCard ricche con click ID |
| AttributionReport | ✓ Drill-down, SourceBadge, breadcrumb |
| Form Builder UI | ✓ Tutti i tipi campo, pannello condivisione |
| FormSettingsPanel | ✓ success_title, success_message |

### Piano fix (2 step)

**Step 1 — Fix `form-render`**
- Aggiungere `.eq("is_active", true)` alla query del form
- Aggiungere `ttclid`, `msclkid`, `li_fat_id` nel payload di submit inline

**Step 2 — Filtri contatti per sorgente/campagna**
- Nella lista contatti marketing, aggiungere dropdown per filtrare per `attr_source` e input per `attr_campaign`
- Aggiungere colonne opzionali `Sorgente` e `Campagna` nella tabella contatti

### File da modificare

| File | Modifica |
|---|---|
| `supabase/functions/form-render/index.ts` | Aggiungere is_active check + click ID nel submit |
| Componente lista contatti marketing | Aggiungere filtri attr_source/attr_campaign + colonne |

