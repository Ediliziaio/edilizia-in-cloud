

# Correzione Label Audit Log + Filtri Data e Ricerca

## Analisi stato attuale

**AuditLogTab.tsx** (Super Admin):
- Manca la label `update_platform_settings` nel dizionario `actionLabels` — quando l'azione viene registrata, appare il testo raw
- Nessun filtro per intervallo date
- Nessuna ricerca testuale (per admin o dettaglio)
- Stesse lacune nel **CompanyActivityLogTab.tsx** (lato azienda) per coerenza

**Componente riutilizzabile disponibile**: `DateRangeFilter` gia' esiste in `src/components/orders/DateRangeFilter.tsx` con filtri rapidi (oggi, settimana, mese) e doppio calendario.

## Modifiche

### 1. `AuditLogTab.tsx` — Label + filtri data + ricerca

**Label mancanti da aggiungere**:
```
update_platform_settings → "Modifica Impostazioni"  (color: "outline")
update_settings          → "Modifica Impostazioni"  (color: "outline")
```

**Nuovi state**:
- `searchQuery: string` — ricerca libera su nome admin o dettaglio
- `dateRange: { from: Date | undefined, to: Date | undefined }` — intervallo date

**Query**: aggiungere filtri condizionali:
- `dateRange.from` → `.gte("created_at", dateRange.from.toISOString())`
- `dateRange.to` → `.lte("created_at", dateRange.to.toISOString())`
- La ricerca testuale viene applicata client-side (filtra `profiles[log.user_id]` e `details` sui risultati della pagina), poiche' il campo admin e' risolto post-query. In alternativa, se le performance lo richiedono, si puo' usare `.ilike()` sulla colonna `details` come filtro parziale server-side.

**UI**: barra filtri sotto l'header con:
- `Input` con icona `Search` per la ricerca
- `DateRangeFilter` (riutilizzato da orders) per l'intervallo date
- Il `Select` azione gia' esistente resta invariato

**queryKey** aggiornata per includere `searchQuery` e `dateRange`.

### 2. `CompanyActivityLogTab.tsx` — Stesse migliorie per coerenza

Applicare le stesse modifiche:
- Aggiungere eventuali label mancanti
- Aggiungere ricerca testuale e filtro date
- Riutilizzare `DateRangeFilter`

### 3. Nessuna migrazione DB necessaria

La tabella `admin_audit_log` ha gia' la colonna `created_at` con indice implicito (PK + order). Le query con `.gte`/`.lte` su `created_at` sono efficienti.

---

## Riepilogo file da modificare

| File | Modifica |
|------|----------|
| `src/components/admin/settings/AuditLogTab.tsx` | Aggiungere label `update_platform_settings`, filtro date con `DateRangeFilter`, input ricerca |
| `src/components/settings/CompanyActivityLogTab.tsx` | Stesse migliorie per coerenza |

## Sicurezza e retrocompatibilita'
- Nessuna nuova superficie di attacco
- I filtri sono additivi: senza valori, il comportamento e' identico a prima
- La ricerca client-side non espone dati aggiuntivi (opera sui risultati gia' paginati)

