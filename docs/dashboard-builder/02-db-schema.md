# 02 — Schema DB Dashboard Builder

Nuove tabelle isolate in namespace `public` (no schema dedicato per semplicità
RLS e per coerenza col resto del progetto). Tutte con RLS attiva.

---

## Tabelle

### 1. `metric_catalog`
Catalogo definito dai dev (non modificabile dall'utente). Contiene le metriche
invocabili via RPC.

```sql
CREATE TABLE public.metric_catalog (
  id TEXT PRIMARY KEY,                 -- es. 'revenue_total'
  name TEXT NOT NULL,                  -- label utente
  description TEXT,
  category TEXT NOT NULL,              -- 'finanza', 'ordini', 'clienti', ...
  value_type TEXT NOT NULL,            -- 'currency' | 'count' | 'percent' | 'duration'
  default_aggregation TEXT NOT NULL DEFAULT 'sum',
  allowed_aggregations TEXT[] NOT NULL DEFAULT ARRAY['sum'],
  allowed_dimensions TEXT[] NOT NULL DEFAULT ARRAY['none'],
  sql_template TEXT NOT NULL,          -- template parametrico
  requires_role TEXT,                  -- NULL = tutti; 'company_admin' per sensibili
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Accesso:** lettura pubblica a utenti autenticati (il catalogo non è sensibile: dice solo
"quali metriche esistono"). Modifica: solo service_role.

---

### 2. `dashboards`
Metadati di una dashboard (una company può averne N).

```sql
CREATE TABLE public.dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  scope TEXT NOT NULL DEFAULT 'personal',  -- 'personal' | 'company' | 'role:<role>'
  is_default BOOLEAN NOT NULL DEFAULT false,
  icon TEXT,                               -- lucide icon name opzionale
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON public.dashboards(company_id);
CREATE INDEX ON public.dashboards(owner_id);
```

**Scope semantics:**
- `personal` → visibile solo a `owner_id`
- `company` → visibile a tutti i membri della company
- `role:<role>` → visibile a membri con quel ruolo (`company_admin`, `operaio`, ecc.)

---

### 3. `dashboard_versions`
Ogni save = nuova versione. `is_current = true` su esattamente una riga per dashboard.

```sql
CREATE TABLE public.dashboard_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  version INT NOT NULL,                   -- autoincrement logico per dashboard_id
  layout JSONB NOT NULL,                  -- { widgets: [...], globalFilters: {...} }
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,                              -- commento dell'utente "aggiunto KPI margine"
  UNIQUE (dashboard_id, version)
);

-- Solo 1 versione corrente per dashboard
CREATE UNIQUE INDEX dashboard_versions_current_unique
  ON public.dashboard_versions(dashboard_id) WHERE is_current = true;

CREATE INDEX ON public.dashboard_versions(dashboard_id, created_at DESC);
```

**Layout JSON shape:** (validato server-side con `jsonb_schema` o funzione custom)
```jsonc
{
  "widgets": [
    {
      "id": "w1",
      "type": "kpi_card",
      "x": 0, "y": 0, "w": 3, "h": 2,
      "config": {
        "metric": "revenue_real",
        "aggregation": "sum",
        "filter": { "period": "this_month" },
        "compare_to": "prev_month",
        "format": { "currency": "EUR" },
        "color_rules": [
          { "if": "value < 0", "color": "red" }
        ]
      }
    }
  ],
  "globalFilters": { "period": "this_month", "status": null }
}
```

---

### 4. `dashboard_user_prefs`
Quale dashboard l'utente ha aperta per ultima (per "riapri dove eri").

```sql
CREATE TABLE public.dashboard_user_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_dashboard_id UUID REFERENCES public.dashboards(id) ON DELETE SET NULL,
  last_opened_at TIMESTAMPTZ
);
```

---

### 5. `company_features`
Feature flag per abilitare/disabilitare moduli per company.

```sql
CREATE TABLE public.company_features (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  enabled_at TIMESTAMPTZ,
  enabled_by UUID REFERENCES auth.users(id),
  PRIMARY KEY (company_id, feature_key)
);
```

**Feature key iniziale:** `dashboard_builder_v1`

**Controllo frontend:** hook `useFeatureFlag('dashboard_builder_v1')` → boolean.

---

## 🔐 Policy RLS (summary)

| Tabella | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `metric_catalog` | autenticati | ❌ | ❌ | ❌ |
| `dashboards` | company match + scope | company member | owner o admin | owner o admin |
| `dashboard_versions` | via dashboard policy | dashboard visibile | ❌ (immutabile) | ❌ |
| `dashboard_user_prefs` | self only | self only | self only | self only |
| `company_features` | company match | ❌ | ❌ (via RPC) | ❌ |

Dettaglio SQL nella migration (`20260416000000_dashboard_builder_schema.sql`).

---

## 🧪 Test di integrità previsti (Sprint 1.17)

1. **Cross-company read** — utente di company A non vede dashboards di company B → 0 rows
2. **Scope personal** — utente B non vede dashboard personal di utente A stessa company → 0 rows
3. **Scope company** — tutti i membri company vedono dashboard con scope='company'
4. **Role scope** — dashboard scope='role:operaio' visibile solo a ruoli operaio
5. **Version immutability** — UPDATE su dashboard_versions fallisce
6. **Only 1 current** — tentare di mettere is_current=true su 2 versioni della stessa dashboard fallisce (unique index)
7. **Metric cross-company** — `get_metric(revenue_total, company_X)` chiamato da utente company Y → 403
8. **Metric role gating** — `get_metric(margin_total)` da utente operaio (non admin) → 403

---

## 📦 Volumi attesi

- **dashboards**: 3-20 per company (pochi, letti spesso)
- **dashboard_versions**: ~100 per dashboard attiva (versioning frequente)
- **metric_catalog**: 20 iniziali, fino a ~100 long-term
- **company_features**: ~10 feature × N company

Nessun hot-path in scrittura → niente partitioning/sharding necessario.

---

## 🔄 Cleanup policy (futuro, non Sprint 1)

- Dashboard versions più vecchie di 90 giorni e non `is_current` → archiviate in tabella `dashboard_versions_archive`
- Job periodico (pg_cron) a bassa priorità
